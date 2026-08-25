import { useEffect, useState } from 'react';
import type { Transaction } from '@budget/core/src/types.ts';
import {
  analyserLignes, detecterFormat, versTransactions,
  type FormatDetecte, type LigneAnalysee,
} from '../import/parseur.ts';
import { analyserRelevePdf } from '../import/releve.ts';
import { extraireTextePdf, recupererGoogleSheet } from '../import/sources.ts';
import { detecterDoublons, type Suspicion } from '../db/doublons.ts';
import { categoriserLot } from '../import/regles.ts';
import { chargerRegles } from '../db/configuration.ts';
import { db, ecrireMeta, enregistrerTransaction, lireMeta, supprimerTransaction } from '../db/dexie.ts';
import { Carte, Etiquette, Ligne } from '../components/ui.tsx';
import { dateCourte, montant } from '../lib/format.ts';
import { useConfiguration } from '../state/useDonnees.ts';

type Source = 'csv_import' | 'google_sheet_import' | 'pdf_import';

const CLE_DERNIER_IMPORT = 'dernier_import';

interface DernierImport {
  ids: string[];
  nombre: number;
  quand: string;
  source: Source;
}

interface Apercu {
  source: Source;
  /** `null` pour un PDF : la notion de séparateur/entête ne s'y applique pas. */
  format: FormatDetecte | null;
  lignes: LigneAnalysee[];
  /** Lignes non transactionnelles écartées avant l'analyse (PDF uniquement). */
  administratives: number;
  candidates: Transaction[];
  suspicions: Suspicion[];
  categorisees: number;
  nonCategorisees: number;
}

export function Import() {
  const { config } = useConfiguration();
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [urlSheet, setUrlSheet] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);
  const [dernierImport, setDernierImport] = useState<DernierImport | null>(null);
  const [annulationEnCours, setAnnulationEnCours] = useState(false);

  useEffect(() => {
    void lireMeta<DernierImport | null>(CLE_DERNIER_IMPORT, null).then(setDernierImport);
  }, []);

  const compte = config.comptes.find((c) => c.type === 'courant');

  const preparer = async (texte: string, source: Source) => {
    const lignesBrutes = texte.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lignesBrutes.length === 0) throw new Error('Fichier vide.');
    if (!compte) throw new Error('Aucun compte courant configuré.');

    // Un relevé PDF n'est pas un CSV : en-têtes, pieds de page, numéros de
    // page et texte commercial sont écartés AVANT l'analyse, et jamais
    // comptés comme des lignes illisibles. Le CSV et le Google Sheet
    // gardent le chemin tabulaire existant, inchangé.
    let format: FormatDetecte | null;
    let lignes: LigneAnalysee[];
    let administratives = 0;
    if (source === 'pdf_import') {
      format = null;
      const analyse = analyserRelevePdf(texte);
      lignes = analyse.lignes;
      administratives = analyse.administratives;
    } else {
      format = detecterFormat(lignesBrutes);
      lignes = analyserLignes(texte, format);
    }

    const brutes = versTransactions(lignes, compte.id, source);

    // Catégorisation automatique : les règles PROPOSENT une catégorie,
    // les transactions restent en attente de validation.
    const regles = await chargerRegles();
    const bilan = categoriserLot(brutes, regles);

    const existantes = await db.transactions.toArray();
    const { suspicions } = detecterDoublons(bilan.transactions, existantes);

    setApercu({
      source, format, lignes, administratives,
      candidates: bilan.transactions,
      suspicions,
      categorisees: bilan.categorisees,
      nonCategorisees: bilan.nonCategorisees,
    });
  };

  const executer = async (action: () => Promise<void>) => {
    setOccupe(true);
    setErreur(null);
    setResultat(null);
    try {
      await action();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setApercu(null);
    } finally {
      setOccupe(false);
    }
  };

  const valider = async () => {
    if (!apercu) return;
    // Les doublons suspectés sont importés en `pending`, jamais écartés :
    // deux dépenses identiques le même jour sont parfois bien réelles.
    for (const t of apercu.candidates) await enregistrerTransaction(t);
    setResultat(
      `${apercu.candidates.length} opération(s) importée(s) · ` +
        `${apercu.categorisees} classée(s) automatiquement · ` +
        `${apercu.nonCategorisees} à renseigner` +
        (apercu.suspicions.length > 0 ? ` · ${apercu.suspicions.length} doublon(s) possible(s) signalé(s)` : '') +
        `. Toutes restent en attente de validation ; retrouvez celles à renseigner ` +
        `sur l’accueil ou dans Opérations.`,
    );
    // Mémorisé localement (pas de nouvelle table) pour permettre d'annuler
    // tout l'import en un geste, tant qu'aucun autre import n'a eu lieu depuis.
    const enregistrement: DernierImport = {
      ids: apercu.candidates.map((t) => t.id),
      nombre: apercu.candidates.length,
      quand: new Date().toISOString(),
      source: apercu.source,
    };
    await ecrireMeta(CLE_DERNIER_IMPORT, enregistrement);
    setDernierImport(enregistrement);
    setApercu(null);
  };

  /**
   * Annule tout l'import précédent : supprime les opérations une à une
   * (suppression LOGIQUE, voir `supprimerTransaction`), rien n'est perdu
   * côté serveur. Ne fonctionne que pour le DERNIER import — au-delà,
   * les opérations se suppriment individuellement depuis Opérations.
   */
  const annulerDernierImport = async () => {
    if (!dernierImport) return;
    if (
      !window.confirm(
        `Annuler tout le dernier import (${dernierImport.nombre} opération(s)) ? ` +
          `Celles déjà validées ou modifiées seront supprimées aussi.`,
      )
    ) {
      return;
    }
    setAnnulationEnCours(true);
    try {
      for (const id of dernierImport.ids) await supprimerTransaction(id);
      await ecrireMeta(CLE_DERNIER_IMPORT, null);
      setDernierImport(null);
      setResultat(`Import annulé : ${dernierImport.nombre} opération(s) supprimée(s).`);
    } finally {
      setAnnulationEnCours(false);
    }
  };

  const illisibles = apercu?.lignes.filter((l) => l.erreur) ?? [];

  return (
    <div className="ecran">
      <Carte titre="Importer un relevé">
        <p className="note">
          Le CSV est le format le plus fiable. Toute ligne importée arrive en
          <strong> attente de validation</strong> : rien n’entre dans vos comptes sans
          un regard de votre part.
        </p>

        <label className="bouton" style={{ display: 'block', textAlign: 'center' }}>
          Choisir un fichier CSV
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            style={{ display: 'none' }}
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) void executer(async () => preparer(await fichier.text(), 'csv_import'));
            }}
          />
        </label>

        <label className="bouton" style={{ display: 'block', textAlign: 'center' }}>
          Choisir un relevé PDF
          <input
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier)
                void executer(async () => preparer(await extraireTextePdf(fichier), 'pdf_import'));
            }}
          />
        </label>

        <input
          className="champ"
          type="url"
          placeholder="URL du Google Sheet (partagé en lecture)"
          value={urlSheet}
          onChange={(e) => setUrlSheet(e.target.value)}
        />
        <button
          className="bouton"
          disabled={occupe || urlSheet === ''}
          onClick={() =>
            void executer(async () =>
              preparer(await recupererGoogleSheet(urlSheet), 'google_sheet_import'),
            )
          }
        >
          Importer depuis Google Sheet
        </button>
        <p className="note">
          L’accès au Google Sheet est en lecture seule. Rien n’y est écrit ni supprimé :
          il reste votre référence.
        </p>

        {erreur && <p className="note note-attention">{erreur}</p>}
        {resultat && <p className="note">{resultat}</p>}

        {dernierImport && (
          <>
            <p className="note">
              Dernier import : {dernierImport.nombre} opération(s) le{' '}
              {new Date(dernierImport.quand).toLocaleString('fr-FR')}.
            </p>
            <button
              className="bouton"
              disabled={annulationEnCours}
              onClick={() => void annulerDernierImport()}
            >
              {annulationEnCours ? 'Annulation…' : `Annuler cet import (${dernierImport.nombre})`}
            </button>
          </>
        )}
      </Carte>

      {apercu && (
        <>
          <Carte titre="Format détecté">
            {apercu.format ? (
              <>
                <Ligne
                  libelle="Séparateur"
                  valeur={apercu.format.separateur === '\t' ? 'tabulation' : `« ${apercu.format.separateur} »`}
                />
                <Ligne
                  libelle="Entête"
                  valeur={apercu.format.enteteDetectee ? apercu.format.enteteDetectee.join(' | ') : 'aucune'}
                />
              </>
            ) : (
              <Ligne libelle="Format" valeur="Relevé PDF" />
            )}
            <Ligne libelle="Lignes lues" valeur={String(apercu.lignes.length + apercu.administratives)} />
            <Ligne libelle="Transactions exploitables" valeur={String(apercu.candidates.length)} />
            {apercu.administratives > 0 && (
              <Ligne libelle="Lignes administratives ignorées" valeur={String(apercu.administratives)} />
            )}
            <Ligne libelle="Lignes illisibles" valeur={String(illisibles.length)} />
            <Ligne libelle="Doublons possibles" valeur={String(apercu.suspicions.length)} />
            <Ligne libelle="Catégorisées automatiquement" valeur={String(apercu.categorisees)} />
            <Ligne libelle="Sans catégorie" valeur={String(apercu.nonCategorisees)} />
            <p className="note">
              {apercu.format
                ? 'Le séparateur, la virgule décimale et le format de date sont détectés ' +
                  'sur le contenu réel, jamais supposés. '
                : 'En-têtes, pieds de page, numéros de page et texte commercial sont ' +
                  'reconnus et écartés automatiquement, sans compter comme illisibles. '}
              Vérifiez l’aperçu ci-dessous avant de valider.
            </p>
          </Carte>

          {illisibles.length > 0 && (
            <Carte titre={`Lignes réellement illisibles (${illisibles.length})`}>
              <p className="note note-attention">
                Ces lignes ressemblent à des opérations mais n’ont pas pu être
                interprétées ; elles sont écartées, jamais converties en montant nul.
              </p>
              {illisibles.slice(0, 5).map((l) => (
                <div key={l.ligne} className="scenario">
                  <div className="scenario-tete">
                    <span>Ligne {l.ligne}</span>
                    <Etiquette ton="insuffisant">{l.erreur}</Etiquette>
                  </div>
                  <p className="alerte-detail">{l.brut.slice(0, 120)}</p>
                </div>
              ))}
            </Carte>
          )}

          <Carte titre="Aperçu">
            {apercu.candidates.slice(0, 12).map((t) => (
              <div key={t.id} className="transaction">
                <div className="transaction-principal">
                  <span className="transaction-libelle">
                    {dateCourte(t.date)} · {t.commercant?.slice(0, 40)}
                  </span>
                  <span className={`transaction-montant ton-${t.type === 'revenu' ? 'positif' : 'neutre'}`}>
                    {t.type === 'revenu' ? '+' : '−'} {montant(t.montant)}
                  </span>
                </div>
              </div>
            ))}
            {apercu.candidates.length > 12 && (
              <p className="note">… et {apercu.candidates.length - 12} autres.</p>
            )}
            <button className="bouton bouton-principal" onClick={() => void valider()}>
              Importer {apercu.candidates.length} transaction(s) en attente
            </button>
            <button className="bouton" onClick={() => setApercu(null)}>Annuler</button>
          </Carte>
        </>
      )}
    </div>
  );
}
