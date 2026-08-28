import { useState } from 'react';
import { synthetiserMois, synthetiserSemaine } from '@budget/core/src/budget.ts';
import { situationVirement } from '@budget/core/src/tresorerie.ts';
import { projeterSoldeTheorique } from '@budget/core/src/projection.ts';
import { genererAlertes } from '@budget/core/src/alertes.ts';
import { periodeDe, joursDansMois } from '@budget/core/src/periode.ts';
import { Anneau, PALETTE_ANNEAU, type PartAnneau } from '../components/Anneau.tsx';
import {
  Carte, Jauge, Ligne, Valeur, IconeBadge, JaugeSemiCirculaire,
  COULEUR_REVENUS, COULEUR_DEPENSES, COULEUR_EPARGNE,
} from '../components/ui.tsx';
import {
  aujourdhuiISO, dateCourte, moisPilule, montant, montantSigne, nomMois, pourcent,
} from '../lib/format.ts';
import { useConfiguration, useTransactions } from '../state/useDonnees.ts';
import { estARenseigner } from './Transactions.tsx';

type CibleNavigation = 'budget' | 'epargne' | 'configurer';

/**
 * Tableau de bord.
 *
 * AUCUN calcul métier ici. Tout provient de `synthetiserMois`,
 * `synthetiserSemaine`, `situationVirement`, `projeterSoldeTheorique` et
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
  const alertes = genererAlertes(config, transactions, aujourdhui);
  const epargne = mois.epargne;

  const aller = (cible: CibleNavigation) => () => onNaviguer?.(cible);

  const aRenseigner = transactions.filter(estARenseigner).length;

  // Solde théorique = solde du relevé + opérations non pointées +
  // opérations récurrentes encore attendues d'ici la fin du mois : calcul
  // entièrement dans `projeterSoldeTheorique`, jamais recalculé ici — voir
  // packages/core/src/projection.ts. Le prochain relevé importé révèle de
  // lui-même l'écart via le rapprochement bancaire.
  const compteCourant = config.comptes.find((c) => c.type === 'courant');
  const soldeCompte = compteCourant
    ? projeterSoldeTheorique(config, transactions, compteCourant, aujourdhui)
    : null;
  const netRecurrentAVenir = soldeCompte
    ? soldeCompte.revenusAVenir - soldeCompte.chargesAVenir - soldeCompte.provisionsAVenir - soldeCompte.epargneAVenir
    : 0;
  const [detailSoldeOuvert, setDetailSoldeOuvert] = useState(false);

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
            {netRecurrentAVenir !== 0 && (
              <span className="solde-detail">
                {montantSigne(netRecurrentAVenir)} de récurrentes attendues d’ici fin de mois
              </span>
            )}
            <button className="lien solde-lien-detail" onClick={() => setDetailSoldeOuvert((v) => !v)}>
              {detailSoldeOuvert ? 'Masquer le détail' : 'Voir le détail'}
            </button>
          </div>
        </section>
      )}

      {soldeCompte && detailSoldeOuvert && (
        <Carte titre="Détail du solde théorique">
          <p className="note">
            Tout ce qui compte dans le calcul : les opérations déjà saisies mais pas
            encore retrouvées sur un relevé, puis les échéances récurrentes encore à
            venir ce mois-ci.
          </p>

          {soldeCompte.operationsNonPointees.length > 0 && (
            <>
              <p className="detail-solde-soustitre">Opérations non pointées</p>
              {soldeCompte.operationsNonPointees.map((l) => (
                <div key={l.transaction.id} className="transaction">
                  <div className="transaction-principal">
                    <span className="transaction-libelle">
                      {l.transaction.commercant ?? l.transaction.description ?? 'Sans libellé'}
                    </span>
                    <span className={`transaction-montant ton-${l.contribution >= 0 ? 'positif' : 'neutre'}`}>
                      {montantSigne(l.contribution)}
                    </span>
                  </div>
                  <div className="transaction-meta">{dateCourte(l.transaction.date)}</div>
                </div>
              ))}
            </>
          )}

          {(soldeCompte.revenusAVenirDetail.length > 0 ||
            soldeCompte.chargesAVenirDetail.length > 0 ||
            soldeCompte.provisionsAVenirDetail.length > 0 ||
            soldeCompte.epargneAVenir > 0) && (
            <>
              <p className="detail-solde-soustitre">Récurrentes attendues d’ici fin de mois</p>
              {soldeCompte.revenusAVenirDetail.map((l) => (
                <Ligne key={`r-${l.nom}`} libelle={l.nom} valeur={montantSigne(l.montant)} ton="positif" />
              ))}
              {soldeCompte.chargesAVenirDetail.map((l) => (
                <Ligne key={`c-${l.nom}`} libelle={l.nom} valeur={montantSigne(-l.montant)} />
              ))}
              {soldeCompte.provisionsAVenirDetail.map((l) => (
                <Ligne key={`p-${l.nom}`} libelle={l.nom} valeur={montantSigne(-l.montant)} />
              ))}
              {soldeCompte.epargneAVenir > 0 && (
                <Ligne libelle="Épargne (versement prévu)" valeur={montantSigne(-soldeCompte.epargneAVenir)} />
              )}
            </>
          )}

          {soldeCompte.fluxNonDates.length > 0 && (
            <p className="note">
              Jour non confirmé, donc non compté ici : {soldeCompte.fluxNonDates.join(', ')}.
            </p>
          )}
        </Carte>
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

      {/* 7. Alertes */}
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
