import { synthetiserMois, synthetiserSemaine } from '@budget/core/src/budget.ts';
import { situationVirement } from '@budget/core/src/tresorerie.ts';
import { projeterSolde } from '@budget/core/src/projection.ts';
import { genererAlertes } from '@budget/core/src/alertes.ts';
import { calculerSoldeTheorique } from '@budget/core/src/rapprochement.ts';
import { periodeDe, joursDansMois, finDeMois } from '@budget/core/src/periode.ts';
import { Anneau, PALETTE_ANNEAU, type PartAnneau } from '../components/Anneau.tsx';
import {
  Carte, Jauge, Valeur, IconeBadge, JaugeSemiCirculaire,
  COULEUR_REVENUS, COULEUR_DEPENSES, COULEUR_EPARGNE,
} from '../components/ui.tsx';
import {
  aujourdhuiISO, dateCourte, moisPilule, montant, montantSigne, nomMois, pourcent, jourMois,
} from '../lib/format.ts';
import { useConfiguration, useTransactions } from '../state/useDonnees.ts';
import { estARenseigner } from './Transactions.tsx';

type CibleNavigation = 'budget' | 'epargne' | 'configurer';

/**
 * Tableau de bord.
 *
 * AUCUN calcul métier ici. Tout provient de `synthetiserMois`,
 * `synthetiserSemaine`, `situationVirement`, `projeterSolde` et
 * `genererAlertes`. Ce fichier ne fait que choisir des couleurs, icônes,
 * trier/replier pour l'affichage et mettre en forme — jamais recalculer
 * une valeur financière.
 */
export function Dashboard({
  onOuvrirARenseigner,
  onNaviguer,
}: {
  onOuvrirARenseigner?: () => void;
  onNaviguer?: (cible: CibleNavigation) => void;
} = {}) {
  const { config } = useConfiguration();
  const transactions = useTransactions();
  const aujourdhui = aujourdhuiISO();
  const periode = periodeDe(aujourdhui);

  const mois = synthetiserMois(config, transactions, periode);
  const semaine = synthetiserSemaine(config, transactions, aujourdhui);
  const virement = situationVirement(config, transactions, aujourdhui);
  const projection = projeterSolde(config, transactions, aujourdhui);
  const alertes = genererAlertes(config, transactions, aujourdhui);
  const epargne = mois.epargne;

  const aller = (cible: CibleNavigation) => () => onNaviguer?.(cible);

  const aRenseigner = transactions.filter(estARenseigner).length;

  // Solde réel (relevé) / solde théorique (relevé + opérations non
  // pointées) : calcul entièrement dans `calculerSoldeTheorique`, jamais
  // recalculé ici — voir packages/core/src/rapprochement.ts.
  const compteCourant = config.comptes.find((c) => c.type === 'courant');
  const soldeCompte = compteCourant ? calculerSoldeTheorique(transactions, compteCourant) : null;

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
  const ratioBudgetVariable = mois.budgetVariable > 0 ? mois.depensesVariables / mois.budgetVariable : null;

  /* --- Anneau des revenus : issu de mois.revenus --------------------- */
  const partsRevenus: PartAnneau[] = mois.revenus.lignes.map((l) => ({
    cle: l.sourceId ?? 'non_identifie',
    nom: l.nom,
    montant: l.montant,
    part: l.part,
  }));

  /* --- Enveloppes : jusqu'à 4, les plus consommées d'abord ------------ */
  const enveloppes = [...mois.categories]
    .filter((c) => c.prevu > 0)
    .sort((a, b) => b.pourcentage - a.pourcentage)
    .slice(0, 4);

  /* --- Top 3 dépenses --------------------------------------------- */
  const topCategories = [...mois.categories]
    .filter((c) => c.depense > 0)
    .sort((a, b) => b.depense - a.depense)
    .slice(0, 3);

  const alertesFortes = alertes.filter((a) => a.niveau !== 'info').slice(0, 3);

  /* --- Objectif épargne : ratio d'affichage de la jauge semi-circulaire.
   * Le ratio n'est qu'un affichage d'une valeur déjà calculée par le moteur
   * (`mois.progressionEpargne` = épargne RÉELLEMENT réalisée / objectif) ;
   * aucune donnée financière n'est produite ici. Volontairement PAS basé
   * sur `capaciteEpargneBudgetaire` (ce que le budget pourrait dégager) :
   * remplir un anneau de progression avec une capacité théorique donnait
   * l'impression trompeuse qu'un montant avait déjà été épargné. -------- */
  const ratioEpargneReelle = Math.max(0, mois.progressionEpargne);

  const ratioHero = mois.budgetVariable > 0 ? mois.depensesVariables / mois.budgetVariable : 0;

  const tendance = projection.soldeProjeteTendanciel === null
    ? null
    : projection.soldeProjeteTendanciel >= 0 ? 'hausse' : 'baisse';

  return (
    <div className="ecran">
      <div className="entete-ligne">
        <span className="pilule-periode">📅 {moisPilule(periode)}</span>
      </div>

      {aRenseigner > 0 && (
        <button className="bandeau-alerte" onClick={onOuvrirARenseigner}>
          ⚠️ {aRenseigner} opération(s) à renseigner
        </button>
      )}

      {/* 1. Carte principale — l'information numéro un */}
      <section className="carte carte-principale">
        <div className="principale-tete">
          <IconeBadge emoji="👛" couleur={COULEUR_REVENUS} />
          <span className="principale-libelle">Reste à dépenser</span>
        </div>
        <Valeur texte={montant(mois.resteADepenser)} taille="geante" />
        <p className="heros-appui">
          {montant(semaine.disponibleCetteSemaine)} d’ici dimanche ·{' '}
          {montant(semaine.allocationQuotidienne)}/jour
        </p>
        <Jauge ratio={ratioHero} />
        <div className="principale-pied">
          <span>Période : 1 – {joursDansMois(periode)} {nomMois(periode)}</span>
          <span>{semaine.joursRestantsMois} jours restants</span>
        </div>
      </section>

      {/* 1bis. Solde réel (relevé) / solde théorique (relevé + non pointé) */}
      {soldeCompte && soldeCompte.soldeReel !== null && (
        <section className="carte carte-soldes">
          <div className="solde-bloc">
            <span className="solde-libelle">Solde réel</span>
            <Valeur texte={montant(soldeCompte.soldeReel)} taille="grande" />
            {soldeCompte.soldeReelDate && (
              <span className="solde-detail">Relevé au {dateCourte(soldeCompte.soldeReelDate)}</span>
            )}
          </div>
          <div className="solde-bloc solde-bloc-theorique">
            <span className="solde-libelle">Solde théorique</span>
            <Valeur texte={montant(soldeCompte.soldeTheorique)} taille="grande" />
            <span className="solde-detail">
              {soldeCompte.operationsNonPointees.length === 0
                ? 'Aucune opération non pointée'
                : `${soldeCompte.operationsNonPointees.length} opération(s) non pointée(s) · ${montantSigne(soldeCompte.ecartNonPointe)}`}
            </span>
          </div>
        </section>
      )}

      {/* 2. Deux anneaux côte à côte */}
      <div className="colonnes colonnes-anneaux">
        <Carte titre="Revenus" className="carte-anneau">
          <p className="anneau-entete-total">{montant(mois.revenus.total)}</p>
          <p className="anneau-entete-sous">
            {mois.revenus.base === 'prevu' ? 'prévus' : 'perçus'}
          </p>
          <Anneau
            compact
            limiteLegende={4}
            parts={partsRevenus}
            total={mois.revenus.total}
            centreValeur={mois.revenus.base === 'prevu' ? '100 %' : montant(mois.revenus.total)}
            legendeCentre={mois.revenus.base === 'prevu' ? 'prévu' : 'perçu'}
            videTexte="Aucun revenu configuré."
            note={
              mois.revenus.base === 'realise' && mois.revenus.comporteNonIdentifie
                ? 'Une part n’a pas pu être rattachée à une source connue.'
                : undefined
            }
            lienDetail={{ texte: 'Voir le détail', onClick: aller('configurer') }}
          />
        </Carte>

        <Carte titre="Dépenses" className="carte-anneau">
          <p className="anneau-entete-total">{montant(totalDepense)}</p>
          <p className="anneau-entete-sous">réalisées</p>
          <Anneau
            compact
            limiteLegende={4}
            parts={partsDepenses}
            total={totalDepense}
            centreValeur={ratioBudgetVariable === null ? montant(totalDepense) : pourcent(ratioBudgetVariable)}
            legendeCentre="du budget"
            videTexte="Aucune dépense ce mois-ci."
            note={mois.budgetVariable > 0 ? `Enveloppes : ${montant(mois.budgetVariable)}` : undefined}
            lienDetail={{ texte: 'Voir le détail', onClick: aller('budget') }}
          />
        </Carte>
      </div>

      {/* 3. KPI secondaires */}
      <div className="kpi-grille">
        <div className="kpi kpi-revenus">
          <IconeBadge emoji="📈" couleur={COULEUR_REVENUS} />
          <span className="kpi-libelle">Revenus</span>
          <span className="kpi-valeur">{montant(mois.revenus.total)}</span>
          <span className="kpi-appui">
            {mois.revenus.base === 'prevu' ? 'prévus' : 'perçus'}
          </span>
        </div>
        <div className="kpi kpi-depenses">
          <IconeBadge emoji="📉" couleur={COULEUR_DEPENSES} />
          <span className="kpi-libelle">Dépenses</span>
          <span className="kpi-valeur">{montant(mois.depensesVariables)}</span>
          <span className="kpi-appui">sur {montant(mois.budgetVariable)}</span>
        </div>
        <div className="kpi kpi-epargne">
          <IconeBadge emoji="🐷" couleur={COULEUR_EPARGNE} />
          <span className="kpi-libelle">Épargne</span>
          <span className="kpi-valeur">{montant(epargne.capaciteEpargneBudgetaire)}</span>
          <span className="kpi-appui">capacité</span>
        </div>
      </div>

      {/* 4. Enveloppes */}
      {enveloppes.length > 0 && (
        <Carte
          titre="Enveloppes"
          action={<button className="lien" onClick={aller('budget')}>Gérer</button>}
        >
          {enveloppes.map((c, i) => (
            <div key={c.categorieId} className="enveloppe-ligne">
              <div className="enveloppe-tete">
                <span
                  className="pastille pastille-icone"
                  style={{ background: `${PALETTE_ANNEAU[i % PALETTE_ANNEAU.length]}26` }}
                >
                  {iconePourCategorie(c.nom)}
                </span>
                <span className="enveloppe-nom">{c.nom}</span>
                <span className={`enveloppe-montant${c.pourcentage > 1 ? ' ton-negatif' : ''}`}>
                  {montant(c.depense)} / {montant(c.prevu)}
                </span>
                <span className="enveloppe-pourcent">{Math.round(c.pourcentage * 100)} %</span>
              </div>
              <Jauge ratio={c.pourcentage} />
            </div>
          ))}
        </Carte>
      )}

      {/* 5 & 6. Top 3 dépenses et objectif épargne, côte à côte */}
      <div className="colonnes colonnes-compactes">
        <Carte titre="Top 3 dépenses">
          {topCategories.length === 0 && <p className="note">Aucune dépense ce mois-ci.</p>}
          {topCategories.map((c, i) => (
            <div key={c.categorieId} className="top3-ligne">
              <span className="pastille" style={{ background: PALETTE_ANNEAU[i % PALETTE_ANNEAU.length] }} />
              <span className="top3-nom">{c.nom}</span>
              <span className="top3-montant">{montant(c.depense)}</span>
              <span className="top3-pourcent">{Math.round(c.pourcentage * 100)} %</span>
            </div>
          ))}
          {mois.categories.filter((c) => c.depense > 0).length > 0 && (
            <button className="lien lien-detail" onClick={aller('budget')}>
              Voir toutes les catégories ›
            </button>
          )}
        </Carte>

        <Carte titre="Objectif épargne">
          <JaugeSemiCirculaire
            ratio={ratioEpargneReelle}
            valeurCentre={montant(mois.epargneRealisee)}
            labelCentre={`épargnés sur ${montant(epargne.objectifEpargne)}`}
            couleur={COULEUR_EPARGNE}
          />
          <div className="categorie-pied">
            <span>{montant(mois.epargneRealisee)} / {montant(epargne.objectifEpargne)}</span>
            <span className={mois.progressionEpargne >= 1 ? 'ton-positif' : undefined}>
              {pourcent(mois.progressionEpargne)}
            </span>
          </div>
          <p className="note">
            Capacité budgétaire ce mois-ci (ce que le budget pourrait dégager,
            pas un montant déjà mis de côté) : {montant(epargne.capaciteEpargneBudgetaire)}.
          </p>
          {!epargne.atteignable && (
            <p className="note note-attention">
              Objectif non atteignable avec le budget actuel — écart{' '}
              {montant(epargne.ecartObjectif)}, objectif inchangé.
            </p>
          )}
          <p className="note">
            Transférable maintenant : {montant(virement.montantTransferableMaintenant)}
          </p>
          {virement.blocages.length > 0 && (
            <p className="note">{virement.blocages.join(' · ')}.</p>
          )}
        </Carte>
      </div>

      {/* 7. Projection fin de mois */}
      <Carte
        titre="Projection fin de mois"
        action={<span className="badge">{jourMois(finDeMois(periode))}</span>}
      >
        <div className="projection-corps">
          <div className="projection-principal">
            <span className="ligne-libelle">Solde prévisionnel</span>
            <Valeur texte={montantSigne(projection.soldeProjeteTendanciel)} taille="grande" />
            <span className="note">si tendance actuelle</span>
          </div>
          {tendance && (
            <span className={`projection-tendance projection-${tendance}`}>
              {tendance === 'hausse' ? '▲' : '▼'}
            </span>
          )}
        </div>
        <div className="categorie-pied">
          <span>Prudente</span>
          <span>{montant(projection.soldeProjetePrudent)}</span>
        </div>
        {projection.soldeProjetePrudent === null && (
          <p className="note">
            Solde du compte courant inconnu : aucune projection n’est produite plutôt
            qu’un chiffre calculé sur un solde supposé nul.
          </p>
        )}
      </Carte>

      {/* 8. Alertes */}
      {alertesFortes.length > 0 && (
        <Carte titre="À surveiller">
          {alertesFortes.map((a, i) => (
            <div key={`${a.code}-${i}`} className={`alerte alerte-${a.niveau}`}>
              <p className="alerte-titre">
                <span className="alerte-icone">{a.niveau === 'critique' ? '🔴' : '🟠'}</span>
                {a.titre}
              </p>
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

/**
 * Icône purement décorative associée au nom d'une catégorie.
 * Aucune incidence financière : à défaut de correspondance, une icône
 * générique est utilisée. Ce n'est pas une classification métier — celle-ci
 * reste `Categorie.nature`, définie dans `packages/core`.
 */
function iconePourCategorie(nom: string): string {
  const n = nom.toLowerCase();
  if (/logement|loyer|immo/.test(n)) return '🏠';
  if (/aliment|course|super/.test(n)) return '🛒';
  if (/transport|essence|carburant|voiture/.test(n)) return '🚗';
  if (/loisir|sortie|resto|restaurant/.test(n)) return '🍽️';
  if (/sant[ée]|pharma|médic/.test(n)) return '💊';
  if (/abonnement|téléphon|internet|forfait/.test(n)) return '📱';
  if (/vêtement|habill/.test(n)) return '👕';
  return '🏷️';
}
