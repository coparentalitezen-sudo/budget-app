import { synthetiserMois, synthetiserSemaine, situationEpargne } from '@budget/core/src/budget.ts';
import { situationVirement } from '@budget/core/src/tresorerie.ts';
import { projeterSolde } from '@budget/core/src/projection.ts';
import { genererAlertes } from '@budget/core/src/alertes.ts';
import { periodeDe } from '@budget/core/src/periode.ts';
import { Carte, Jauge, Ligne, Valeur } from '../components/ui.tsx';
import { aujourdhuiISO, moisLong, montant } from '../lib/format.ts';
import { useConfiguration, useTransactions } from '../state/useDonnees.ts';
import { estARenseigner } from './Transactions.tsx';

export function Dashboard({ onOuvrirARenseigner }: { onOuvrirARenseigner?: () => void } = {}) {
  const { config } = useConfiguration();
  const transactions = useTransactions();
  const aujourdhui = aujourdhuiISO();
  const periode = periodeDe(aujourdhui);

  // TOUS les calculs viennent du moteur. Aucune formule ici.
  const mois = synthetiserMois(config, transactions, periode);
  const semaine = synthetiserSemaine(config, transactions, aujourdhui);
  const epargne = situationEpargne(config, periode);
  const virement = situationVirement(config, transactions, aujourdhui);
  const projection = projeterSolde(config, transactions, aujourdhui);
  const alertes = genererAlertes(config, transactions, aujourdhui);

  const alertesFortes = alertes.filter((a) => a.niveau !== 'info');

  const aRenseigner = transactions.filter(estARenseigner).length;

  return (
    <div className="ecran">
      <p className="periode">{moisLong(periode)}</p>

      {aRenseigner > 0 && (
        <button className="bandeau-alerte" onClick={onOuvrirARenseigner}>
          ⚠️ {aRenseigner} opération(s) à renseigner
        </button>
      )}

      <section className="heros">
        <p className="heros-question">Combien puis-je encore dépenser ?</p>
        <Valeur texte={montant(mois.resteADepenser)} taille="geante" />
        <p className="heros-appui">
          sur {montant(mois.budgetVariable)} d’enveloppes ce mois-ci
        </p>
      </section>

      <Carte>
        <div className="duo">
          <div>
            <p className="duo-libelle">Reste cette semaine</p>
            <Valeur texte={montant(semaine.disponibleCetteSemaine)} taille="grande" />
            <p className="duo-appui">
              {semaine.joursRestantsSemaine} j · {montant(semaine.allocationQuotidienne)}/jour
            </p>
          </div>
        </div>
      </Carte>

      <Carte titre={`Objectif épargne ${montant(epargne.objectifEpargne)}`}>
        <Jauge ratio={Math.max(0, epargne.capaciteEpargneBudgetaire / epargne.objectifEpargne)} />
        <Ligne
          libelle="Capacité budgétaire"
          valeur={montant(epargne.capaciteEpargneBudgetaire)}
        />
        <Ligne
          libelle="Écart à l’objectif"
          valeur={montant(epargne.ecartObjectif)}
          ton={epargne.atteignable ? 'positif' : 'negatif'}
        />
        {!epargne.atteignable && (
          <p className="note note-attention">
            Objectif {montant(epargne.objectifEpargne)} non atteignable avec le budget
            actuel. L’objectif reste inchangé.
          </p>
        )}
        <Ligne
          libelle="Transférable maintenant"
          valeur={montant(virement.montantTransferableMaintenant)}
        />
        {virement.blocages.map((b) => (
          <p key={b} className="note">
            {b} — aucun virement n’est présenté comme sûr.
          </p>
        ))}
      </Carte>

      <Carte titre="Projection fin de mois">
        <Ligne libelle="Prudente (enveloppes pleines)" valeur={montant(projection.soldeProjetePrudent)} />
        <Ligne libelle="Au rythme actuel" valeur={montant(projection.soldeProjeteTendanciel)} />
        {projection.soldeProjetePrudent === null && (
          <p className="note">
            Solde du compte courant inconnu : aucune projection n’est produite plutôt
            qu’un chiffre calculé sur un solde supposé nul.
          </p>
        )}
      </Carte>

      <Carte titre={`Alertes (${alertes.length})`}>
        {alertesFortes.length === 0 && <p className="note">Aucune alerte critique.</p>}
        {alertes.slice(0, 6).map((a, i) => (
          <div key={`${a.code}-${i}`} className={`alerte alerte-${a.niveau}`}>
            <p className="alerte-titre">{a.titre}</p>
            <p className="alerte-detail">{a.detail}</p>
          </div>
        ))}
      </Carte>
    </div>
  );
}
