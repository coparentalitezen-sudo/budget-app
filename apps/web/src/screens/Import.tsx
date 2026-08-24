import { useState } from 'react';
import type { Transaction } from '@budget/core/src/types.ts';
import {
  analyserLignes, detecterFormat, versTransactions,
  type FormatDetecte, type LigneAnalysee,
} from '../import/parseur.ts';
import { extraireTextePdf, recupererGoogleSheet } from '../import/sources.ts';
import { detecterDoublons, type Suspicion } from '../db/doublons.ts';
import { categoriserLot } from '../import/regles.ts';
import { chargerRegles } from '../db/configuration.ts';
import { db, enregistrerTransaction } from '../db/dexie.ts';
import { Carte, Etiquette, Ligne } from '../components/ui.tsx';
import { dateCourte, montant } from '../lib/format.ts';
import { useConfiguration } from '../state/useDonnees.ts';

type Source = 'csv_import' | 'google_sheet_import' | 'pdf_import';

interface Apercu {
  source: Source;
  format: FormatDetecte;
  lignes: LigneAnalysee[];
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

  const compte = config.comptes.find((c) => c.type === 'courant');

  const preparer = async (texte: string, source: Source) => {
    const lignesBrutes = texte.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lignesBrutes.length === 0) throw new Error('Fichier vide.');
    if (!compte) throw new Error('Aucun compte courant configuré.');

    const format = detecterFormat(lignesBrutes);
    const lignes = analyserLignes(texte, format);
    const brutes = versTransactions(lignes, compte.id, source);

    // Catégorisation automatique : les règles PROPOSENT une catégorie,
    // les transactions restent en attente de validation.
    const regles = await chargerRegles();
    const bilan = categoriserLot(brutes, regles);

    const existantes = await db.transactions.toArray();
    const { suspicions } = detecterDoublons(bilan.transactions, existantes);

    setApercu({
      source, format, lignes,
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
      `${apercu.candidates.length} transaction(s) importée(s) en attente de validation, ` +
        `dont ${apercu.categorisees} catégorisée(s) automatiquement et ` +
        `${apercu.suspicions.length} doublon(s) possible(s) signalé(s). ` +
        `${apercu.nonCategorisees} opération(s) sont à renseigner : ` +
        `retrouvez-les sur l’accueil ou dans Opérations.`,
    );
    setApercu(null);
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
      </Carte>

      {apercu && (
        <>
          <Carte titre="Format détecté">
            <Ligne
              libelle="Séparateur"
              valeur={apercu.format.separateur === '\t' ? 'tabulation' : `« ${apercu.format.separateur} »`}
            />
            <Ligne
              libelle="Entête"
              valeur={apercu.format.enteteDetectee ? apercu.format.enteteDetectee.join(' | ') : 'aucune'}
            />
            <Ligne libelle="Lignes lues" valeur={String(apercu.lignes.length)} />
            <Ligne libelle="Transactions exploitables" valeur={String(apercu.candidates.length)} />
            <Ligne libelle="Lignes illisibles" valeur={String(illisibles.length)} />
            <Ligne libelle="Doublons possibles" valeur={String(apercu.suspicions.length)} />
            <Ligne libelle="Catégorisées automatiquement" valeur={String(apercu.categorisees)} />
            <Ligne libelle="Sans catégorie" valeur={String(apercu.nonCategorisees)} />
            <p className="note">
              Le séparateur, la virgule décimale et le format de date sont détectés sur
              le contenu réel, jamais supposés. Vérifiez l’aperçu ci-dessous avant de
              valider.
            </p>
          </Carte>

          {illisibles.length > 0 && (
            <Carte titre={`Lignes écartées (${illisibles.length})`}>
              <p className="note note-attention">
                Ces lignes sont écartées, jamais converties en montant nul.
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
