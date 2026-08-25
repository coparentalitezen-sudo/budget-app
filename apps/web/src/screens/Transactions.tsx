import { useMemo, useState } from 'react';
import { periodeDe } from '@budget/core/src/periode.ts';
import type { SourceTransaction, StatutTransaction, TypeTransaction } from '@budget/core/src/types.ts';
import { empreinte } from '../db/doublons.ts';
import { chargerRegles } from '../db/configuration.ts';
import { enregistrerTransaction, supprimerTransaction } from '../db/dexie.ts';
import { categoriserLot } from '../import/regles.ts';
import { Carte, Etiquette, Vide } from '../components/ui.tsx';
import { OperationARenseigner } from '../components/ARenseigner.tsx';
import { dateCourte, montant } from '../lib/format.ts';
import { useConfiguration, useTransactions } from '../state/useDonnees.ts';

const TYPES: (TypeTransaction | 'tous')[] = [
  'tous', 'depense', 'revenu', 'facture', 'remboursement', 'epargne', 'transfert',
];

const LIBELLE_SOURCE: Record<SourceTransaction, string> = {
  manual: 'Saisie manuelle',
  csv_import: 'Import CSV',
  pdf_import: 'Import PDF',
  bank_api: 'Banque',
  google_sheet_import: 'Google Sheet',
};

/** Une opération importée sans catégorie fiable, en attente de décision. */
export const estARenseigner = (t: { categorieId: string | null; statut: string }) =>
  t.categorieId === null && t.statut === 'pending';

export function Transactions({ vueInitiale }: { vueInitiale?: 'a_renseigner' } = {}) {
  const { config } = useConfiguration();
  const transactions = useTransactions();
  const [vue, setVue] = useState<'toutes' | 'a_renseigner'>(vueInitiale ?? 'toutes');
  const [reportees, setReportees] = useState<string[]>([]);
  const [recherche, setRecherche] = useState('');
  const [type, setType] = useState<TypeTransaction | 'tous'>('tous');
  const [statut, setStatut] = useState<StatutTransaction | 'tous'>('tous');
  const [categorieId, setCategorieId] = useState<string>('toutes');
  const [source, setSource] = useState<SourceTransaction | 'toutes'>('toutes');
  const [enCoursRecat, setEnCoursRecat] = useState(false);
  const [resultatRecat, setResultatRecat] = useState<string | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(null);

  const nomCategorie = (id: string | null) =>
    config.categories.find((c) => c.id === id)?.nom ?? 'Non catégorisé';

  /**
   * Suppression LOGIQUE (voir `supprimerTransaction`) : la ligne disparaît
   * localement, mais reste tracée côté serveur (`deleted_at`). Confirmée
   * explicitement — c'est la seule action destructrice de cet écran.
   */
  const supprimer = async (id: string, libelle: string) => {
    if (!window.confirm(`Supprimer « ${libelle || 'cette opération'} » ?`)) return;
    setSuppressionEnCours(id);
    try {
      await supprimerTransaction(id);
    } finally {
      setSuppressionEnCours(null);
    }
  };

  // Les doublons sont SIGNALÉS, jamais masqués ni supprimés.
  const empreintesMultiples = useMemo(() => {
    const compte = new Map<string, number>();
    for (const t of transactions) {
      const e = empreinte(t);
      compte.set(e, (compte.get(e) ?? 0) + 1);
    }
    return compte;
  }, [transactions]);

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return transactions
      .filter((t) => (type === 'tous' ? true : t.type === type))
      .filter((t) => (statut === 'tous' ? true : t.statut === statut))
      .filter((t) => (categorieId === 'toutes' ? true : t.categorieId === categorieId))
      .filter((t) => (source === 'toutes' ? true : t.source === source))
      .filter((t) =>
        terme === ''
          ? true
          : [t.description, t.commercant, nomCategorie(t.categorieId)]
              .filter(Boolean)
              .some((v) => v!.toLowerCase().includes(terme)),
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [transactions, recherche, type, statut, categorieId, source]);

  const parJour = useMemo(() => {
    const groupes = new Map<string, typeof filtrees>();
    for (const t of filtrees) {
      const liste = groupes.get(t.date) ?? [];
      liste.push(t);
      groupes.set(t.date, liste);
    }
    return [...groupes.entries()];
  }, [filtrees]);

  const aRenseigner = transactions.filter(estARenseigner);
  const aTraiter = aRenseigner.filter((t) => !reportees.includes(t.id));

  /**
   * Réapplique les règles de catégorisation ACTUELLES aux opérations déjà
   * importées mais restées sans catégorie — utile après avoir ajouté une
   * règle (import précédent avec un socle de règles trop restreint, ou
   * nouvelle règle créée depuis Configuration). Une transaction déjà
   * catégorisée n'est jamais touchée : `categoriser` s'y refuse déjà.
   */
  const recategoriser = async () => {
    setEnCoursRecat(true);
    setResultatRecat(null);
    try {
      const regles = await chargerRegles();
      const bilan = categoriserLot(aRenseigner, regles);
      const reclassees = bilan.transactions.filter((t) => t.categorieId !== null);
      for (const t of reclassees) await enregistrerTransaction(t);
      setResultatRecat(
        reclassees.length > 0
          ? `${reclassees.length} opération(s) reclassée(s) automatiquement.`
          : 'Aucune correspondance trouvée avec les règles actuelles.',
      );
    } finally {
      setEnCoursRecat(false);
    }
  };

  if (vue === 'a_renseigner') {
    return (
      <div className="ecran">
        <Carte titre={`${aRenseigner.length} opération(s) à renseigner`}>
          <p className="note">
            Ces opérations ont été importées sans catégorie fiable. Classez-les
            pour qu’elles entrent dans votre budget. « Plus tard » les laisse ici.
          </p>
          {aRenseigner.length > 0 && (
            <button className="bouton" onClick={() => void recategoriser()} disabled={enCoursRecat}>
              {enCoursRecat ? 'Reclassement…' : 'Recatégoriser avec les règles actuelles'}
            </button>
          )}
          {resultatRecat && <p className="note">{resultatRecat}</p>}
          <button className="bouton" onClick={() => setVue('toutes')}>
            Revenir à toutes les opérations
          </button>
        </Carte>

        {aTraiter.length === 0 && (
          <Vide
            message={
              aRenseigner.length === 0
                ? 'Rien à renseigner. Toutes vos opérations sont classées.'
                : 'Toutes les opérations restantes ont été reportées à plus tard.'
            }
          />
        )}

        {aTraiter.map((t) => (
          <OperationARenseigner
            key={t.id}
            transaction={t}
            categories={config.categories}
            onTraitee={() => setReportees((r) => [...r, t.id])}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="ecran">
      {aRenseigner.length > 0 && (
        <button className="bandeau-alerte" onClick={() => setVue('a_renseigner')}>
          ⚠️ {aRenseigner.length} opération(s) à renseigner
        </button>
      )}

      <input
        className="champ"
        type="search"
        placeholder="Rechercher un commerçant, une description…"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
      />

      <div className="filtres">
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>{t === 'tous' ? 'Tous les types' : t}</option>
          ))}
        </select>
        <select value={statut} onChange={(e) => setStatut(e.target.value as typeof statut)}>
          <option value="tous">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="validated">Validées</option>
        </select>
        <select value={categorieId} onChange={(e) => setCategorieId(e.target.value)}>
          <option value="toutes">Toutes catégories</option>
          {config.categories.map((c) => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
          <option value="toutes">Toutes provenances</option>
          {(Object.keys(LIBELLE_SOURCE) as SourceTransaction[]).map((s) => (
            <option key={s} value={s}>{LIBELLE_SOURCE[s]}</option>
          ))}
        </select>
      </div>

      <p className="compteur">
        {filtrees.length} transaction{filtrees.length > 1 ? 's' : ''}
        {' · '}
        {filtrees.filter((t) => t.statut === 'pending').length} en attente
      </p>

      {parJour.length === 0 && (
        <Vide message="Aucune transaction. Utilisez le bouton + pour en saisir une, même hors ligne." />
      )}

      {parJour.map(([date, lignes]) => (
        <Carte key={date} titre={dateCourte(date)}>
          {lignes.map((t) => {
            const suspect = (empreintesMultiples.get(empreinte(t)) ?? 0) > 1;
            return (
              <div key={t.id} className="transaction">
                <div className="transaction-principal">
                  <span className="transaction-libelle">
                    {t.commercant ?? t.description ?? nomCategorie(t.categorieId)}
                  </span>
                  <span
                    className={`transaction-montant ton-${t.type === 'revenu' ? 'positif' : 'neutre'}`}
                  >
                    {t.type === 'revenu' ? '+' : '−'} {montant(t.montant)}
                  </span>
                </div>
                <div className="transaction-meta">
                  <Etiquette>{nomCategorie(t.categorieId)}</Etiquette>
                  <Etiquette ton={t.statut === 'pending' ? 'attente' : 'ok'}>
                    {t.statut === 'pending' ? 'En attente' : 'Validée'}
                  </Etiquette>
                  <Etiquette>{LIBELLE_SOURCE[t.source]}</Etiquette>
                  {suspect && <Etiquette ton="doublon">Doublon possible</Etiquette>}
                  <button
                    className="lien lien-detail"
                    disabled={suppressionEnCours === t.id}
                    onClick={() => void supprimer(t.id, t.commercant ?? t.description ?? '')}
                  >
                    {suppressionEnCours === t.id ? 'Suppression…' : 'Supprimer'}
                  </button>
                </div>
              </div>
            );
          })}
        </Carte>
      ))}

      <p className="note">
        Un doublon possible est signalé, jamais supprimé : deux dépenses identiques
        le même jour sont parfois bien réelles.
      </p>
      <p className="note">Période courante : {periodeDe(new Date().toISOString().slice(0, 10))}</p>
    </div>
  );
}
