import { synthetiserMois, synthetiserSemaine } from '@budget/core/src/budget.ts';
import { situationVirement } from '@budget/core/src/tresorerie.ts';
import { projeterSolde } from '@budget/core/src/projection.ts';
import { genererAlertes } from '@budget/core/src/alertes.ts';
import { periodeDe } from '@budget/core/src/periode.ts';
import { Anneau, type PartAnneau } from '../components/Anneau.tsx';
import { Carte, Jauge, Valeur } from '../components/ui.tsx';
import { aujourdhuiISO, moisLong, montant } from '../lib/format.ts';
import { useConfiguration, useTransactions } from '../state/useDonnees.ts';
import { estARenseigner } from './Transactions.tsx';

/**
 * Tableau de bord.
 *
 * AUCUN calcul métier ici. Tout provient de `synthetiserMois`,
 * `synthetiserSemaine`, `situationVirement`, `projeterSolde` et
 * `genererAlertes`. Ce fichier ne fait que choisir des couleurs, trier
 * pour l'affichage et mettre en forme.
 */
export function Dashboard({ onOuvrirARenseigner }: { onOuvrirARenseigner?: () => void } = {}) {
  const { config } = useConfiguration();
  const transactions = useTransactions();
  const aujourdhui = aujourdhuiISO();
  const periode = periodeDe(aujourdhui);

  const mois = synthetiserMois(config, transactions, periode);
  const semaine = synthetiserSemaine(config, transactions, aujourdhui);
  const virement = situationVirement(config, transactions, aujourdhui);
  const projection = projeterSolde(config, transactions, aujourdhui);
  const alertes = genererAlertes(config, transactions, aujourdhui);

  const aRenseigner = transactions.filter(estARenseigner).length;
  const epargne = mois.epargne;

  /* --- Anneau des dépenses : issu de mois.categories ----------------- */
  const totalDepense = mois.depensesVariables;
  const partsDepenses: PartAnneau[] = mois.categories
    .filter((c) => c.depense > 0)
    .sort((a, b) => b.depense - a.depense)
    .map((c) => ({
      cle: c.categorieId,
      nom: c.nom,
      montant: c.depense,
      part: totalDepense > 0 ? c.depense / totalDepense : 0,
    }));

  /* --- Anneau des revenus : issu de mois.revenus --------------------- */
  const partsRevenus: PartAnneau[] = mois.revenus.lignes.map((l) => ({
    cle: l.sourceId ?? 'non_identifie',
    nom: l.nom,
    montant: l.montant,
    part: l.part,
  }));

  const topCategories = [...mois.categories]
    .filter((c) => c.depense > 0)
    .sort((a, b) => b.depense - a.depense)
    .slice(0, 5);

  const alertesFortes = alertes.filter((a) => a.niveau !== 'info').slice(0, 3);

  return (
    <div className="ecran">
      <p className="periode">{moisLong(periode)}</p>

      {aRenseigner > 0 && (
        <button className="bandeau-alerte" onClick={onOuvrirARenseigner}>
          ⚠️ {aRenseigner} opération(s) à renseigner
        </button>
      )}

      {/* Information numéro un */}
      <section className="heros">
        <p className="heros-question">Combien puis-je encore dépenser ?</p>
        <Valeur texte={montant(mois.resteADepenser)} taille="geante" />
        <p className="heros-appui">
          {montant(semaine.disponibleCetteSemaine)} d’ici dimanche ·{' '}
          {montant(semaine.allocationQuotidienne)}/jour
        </p>
      </section>

      {/* Trois indicateurs */}
      <div className="kpi-grille">
        <div className="kpi kpi-revenus">
          <span className="kpi-libelle">Revenus</span>
          <span className="kpi-valeur">{montant(mois.revenus.total)}</span>
          <span className="kpi-appui">
            {mois.revenus.base === 'prevu' ? 'prévus' : 'perçus'}
          </span>
        </div>
        <div className="kpi kpi-depenses">
          <span className="kpi-libelle">Dépenses</span>
          <span className="kpi-valeur">{montant(mois.depensesVariables)}</span>
          <span className="kpi-appui">sur {montant(mois.budgetVariable)}</span>
        </div>
        <div className="kpi kpi-epargne">
          <span className="kpi-libelle">Épargne</span>
          <span className="kpi-valeur">{montant(epargne.capaciteEpargneBudgetaire)}</span>
          <span className="kpi-appui">capacité</span>
        </div>
      </div>

      <Carte titre="Dépenses par catégorie">
        <Anneau
          parts={partsDepenses}
          total={totalDepense}
          legendeCentre="dépensés"
          note={
            partsDepenses.length === 0
              ? undefined
              : `${partsDepenses.length} catégorie(s) mouvementée(s) ce mois-ci.`
          }
        />
      </Carte>

      <Carte titre="Revenus par source">
        <Anneau
          parts={partsRevenus}
          total={mois.revenus.total}
          legendeCentre={mois.revenus.base === 'prevu' ? 'prévus' : 'perçus'}
          note={
            mois.revenus.base === 'prevu'
              ? 'Aucun encaissement enregistré ce mois-ci : répartition prévisionnelle. Ce n’est pas une absence de revenus.'
              : mois.revenus.comporteNonIdentifie
                ? 'Une part des encaissements n’a pas pu être rattachée à une source connue. Elle est isolée, jamais répartie d’office.'
                : undefined
          }
        />
      </Carte>

      {topCategories.length > 0 && (
        <Carte titre="Où part l’argent">
          {topCategories.map((c) => (
            <div key={c.categorieId} className="top-ligne">
              <div className="categorie-tete">
                <span>{c.nom}</span>
                <span className={c.pourcentage > 1 ? 'ton-negatif' : ''}>
                  {montant(c.depense)}
                </span>
              </div>
              <Jauge ratio={c.pourcentage} />
              <div className="categorie-pied">
                <span>{Math.round(c.pourcentage * 100)} % de l’enveloppe</span>
                <span className={c.restant < 0 ? 'ton-negatif' : ''}>
                  {c.restant < 0 ? 'Dépassement ' : 'Reste '}
                  {montant(Math.abs(c.restant))}
                </span>
              </div>
            </div>
          ))}
        </Carte>
      )}

      <Carte titre={`Objectif épargne ${montant(epargne.objectifEpargne)}`}>
        <Jauge
          ratio={Math.max(0, epargne.capaciteEpargneBudgetaire / epargne.objectifEpargne)}
          seuil={1}
        />
        <div className="categorie-pied">
          <span>Capacité {montant(epargne.capaciteEpargneBudgetaire)}</span>
          <span className={epargne.atteignable ? 'ton-positif' : 'ton-negatif'}>
            Écart {montant(epargne.ecartObjectif)}
          </span>
        </div>
        {!epargne.atteignable && (
          <p className="note note-attention">
            Objectif {montant(epargne.objectifEpargne)} non atteignable avec le budget
            actuel. L’objectif reste inchangé.
          </p>
        )}
        <div className="categorie-pied">
          <span>Transférable maintenant</span>
          <span>{montant(virement.montantTransferableMaintenant)}</span>
        </div>
        {virement.blocages.map((b) => (
          <p key={b} className="note">{b} — aucun virement n’est présenté comme sûr.</p>
        ))}
      </Carte>

      <Carte titre="Projection fin de mois">
        <div className="categorie-pied">
          <span>Prudente</span>
          <span>{montant(projection.soldeProjetePrudent)}</span>
        </div>
        <div className="categorie-pied">
          <span>Au rythme actuel</span>
          <span>{montant(projection.soldeProjeteTendanciel)}</span>
        </div>
        {projection.soldeProjetePrudent === null && (
          <p className="note">
            Solde du compte courant inconnu : aucune projection n’est produite plutôt
            qu’un chiffre calculé sur un solde supposé nul.
          </p>
        )}
      </Carte>

      {alertesFortes.length > 0 && (
        <Carte titre="À surveiller">
          {alertesFortes.map((a, i) => (
            <div key={`${a.code}-${i}`} className={`alerte alerte-${a.niveau}`}>
              <p className="alerte-titre">{a.titre}</p>
              <p className="alerte-detail">{a.detail}</p>
            </div>
          ))}
          {alertes.length > alertesFortes.length && (
            <p className="note">
              {alertes.length - alertesFortes.length} autre(s) information(s) dans
              Réglages.
            </p>
          )}
        </Carte>
      )}
    </div>
  );
}
