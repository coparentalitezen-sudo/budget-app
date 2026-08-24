import { formatEUR, type Cents } from './money.ts';
import { ecartMois, periodeDe, type DateISO } from './periode.ts';
import type { Configuration, Transaction } from './types.ts';
import { situationEpargne, synthetiserMois } from './budget.ts';
import { etatProvisions } from './provisions.ts';
import { projeterSolde } from './projection.ts';
import { cibleFondUrgence } from './fondUrgence.ts';
import { analyserEcheances } from './echeances.ts';
import { inventaireInconnues } from './inconnues.ts';

export type NiveauAlerte = 'info' | 'attention' | 'critique';

export interface Alerte {
  code: string;
  niveau: NiveauAlerte;
  titre: string;
  detail: string;
  /** Action suggérée, affichée en bouton dans l'interface. */
  action?: string;
}

const SEUIL_VIGILANCE = 0.8;

export function genererAlertes(
  config: Configuration,
  transactions: Transaction[],
  aujourdhui: DateISO,
): Alerte[] {
  const p = periodeDe(aujourdhui);
  const alertes: Alerte[] = [];
  const mois = synthetiserMois(config, transactions, p);

  /* --- Enveloppes variables ------------------------------------- */
  for (const c of mois.categories) {
    if (c.pourcentage > 1) {
      alertes.push({
        code: 'budget_depassement',
        niveau: 'critique',
        titre: `${c.nom} : dépassement`,
        detail: `${formatEUR(c.depense)} dépensés sur ${formatEUR(c.prevu)} prévus (${formatEUR(-c.restant)} de trop).`,
        action: 'Ajuster l’enveloppe ou compenser sur une autre catégorie',
      });
    } else if (c.pourcentage >= 1) {
      alertes.push({
        code: 'budget_100',
        niveau: 'attention',
        titre: `${c.nom} : enveloppe épuisée`,
        detail: `L’enveloppe de ${formatEUR(c.prevu)} est entièrement consommée.`,
      });
    } else if (c.pourcentage >= SEUIL_VIGILANCE) {
      alertes.push({
        code: 'budget_80',
        niveau: 'info',
        titre: `${c.nom} : ${Math.round(c.pourcentage * 100)} % consommés`,
        detail: `Il reste ${formatEUR(c.restant)}.`,
      });
    }
  }

  /* --- Épargne : objectif ≠ capacité ----------------------------- */
  const epargne = situationEpargne(config, p);
  if (!epargne.atteignable) {
    alertes.push({
      code: 'epargne_inatteignable',
      niveau: 'attention',
      titre: `Objectif ${formatEUR(epargne.objectifEpargne)} non atteignable avec le budget actuel`,
      detail:
        `Capacité budgétaire : ${formatEUR(epargne.capaciteEpargneBudgetaire)}. ` +
        `Écart : ${formatEUR(epargne.ecartObjectif)}. ` +
        `Versement autorisé par le budget : ${formatEUR(epargne.versementBudgetaire)}. ` +
        `L’objectif reste fixé à ${formatEUR(epargne.objectifEpargne)}.`,
      action: 'Réduire une enveloppe variable, ou accepter l’écart ce mois-ci',
    });
  }

  /* --- Échéances exceptionnelles --------------------------------- */
  for (const analyse of analyserEcheances(config, aujourdhui)) {
    const faisable = analyse.scenarios.some((sc) => sc.faisabilite === 'faisable');
    const indetermine = analyse.scenarios.some((sc) => sc.faisabilite === 'indetermine');
    alertes.push({
      code: 'echeance_exceptionnelle',
      niveau: faisable ? 'attention' : 'critique',
      titre:
        `${analyse.nom} : ${formatEUR(analyse.baseFinancement)} à financer` +
        (analyse.baseEstBorneSuperieure ? ' (au plus)' : ''),
      detail:
        (analyse.dateEcheance
          ? `Échéance ${analyse.dateEcheance}` +
            (analyse.moisAvantEcheance !== null ? ` (${analyse.moisAvantEcheance} mois)` : '')
          : 'Date d’échéance à confirmer') +
        `. ${analyse.scenarios.length} scénarios chiffrés` +
        (faisable
          ? '.'
          : indetermine
            ? ', aucun n’est finançable sur le budget seul et certaines ressources restent inconnues.'
            : ', aucun n’est finançable sur le budget courant seul.'),
      action: 'Examiner les scénarios',
    });
  }

  /* --- Provisions ------------------------------------------------ */
  for (const etat of etatProvisions(config.provisions, aujourdhui)) {
    if (etat.couverte === null) {
      // Deux causes possibles, jamais confondues dans le message.
      const manques: string[] = [];
      if (etat.prochaineEcheance === null) manques.push('la date d’échéance');
      if (etat.montantProvisionne === null) manques.push('le montant déjà provisionné');
      alertes.push({
        code: 'provision_couverture_indeterminee',
        niveau: 'info',
        titre: `${etat.nom} : couverture indéterminée`,
        detail:
          `Dotation de ${formatEUR(etat.dotationMensuelle)}/mois active. ` +
          `Il manque ${manques.join(' et ')} pour vérifier si elle suffira.`,
        action: `Renseigner ${manques.join(' et ')}`,
      });
    } else if (etat.couverte === false) {
      alertes.push({
        code: 'provision_deficit',
        niveau: (etat.moisAvantEcheance ?? 99) <= 2 ? 'critique' : 'attention',
        titre: `${etat.nom} : provision insuffisante`,
        detail:
          `Échéance le ${etat.prochaineEcheance} (${etat.moisAvantEcheance} mois). ` +
          `Manquera ${formatEUR(etat.deficitPrevisionnel!)} au rythme actuel. ` +
          `Dotation requise : ${formatEUR(etat.dotationRequise!)}/mois.`,
        action: 'Augmenter la dotation ou prévoir un financement ponctuel',
      });
    }
  }

  /* --- Trésorerie ------------------------------------------------ */
  const projection = projeterSolde(config, transactions, aujourdhui);
  if (projection.soldeProjetePrudent !== null && projection.soldeProjetePrudent < 0) {
    alertes.push({
      code: 'solde_negatif_projete',
      niveau: (projection.soldeProjeteTendanciel ?? 0) < 0 ? 'critique' : 'attention',
      titre: 'Risque de solde négatif en fin de mois',
      detail:
        `Projection prudente : ${formatEUR(projection.soldeProjetePrudent)}. ` +
        `Projection au rythme actuel : ${formatEUR(projection.soldeProjeteTendanciel!)}.`,
      action: 'Décaler une dépense ou réduire le versement d’épargne du mois',
    });
  }

  /* --- Fin de crédit : opportunité d'épargne --------------------- */
  for (const charge of config.charges) {
    if (!charge.fin) continue;
    const restant = ecartMois(p, charge.fin);
    if (restant >= 0 && restant <= 2) {
      alertes.push({
        code: 'fin_credit_proche',
        niveau: 'info',
        titre: `${charge.nom} : dernière échéance en ${charge.fin}`,
        detail: `${formatEUR(charge.montant)}/mois vont se libérer. Proposition : les basculer vers l’épargne.`,
        action: 'Basculer vers l’épargne',
      });
    }
  }

  /* --- Données financières inconnues ------------------------------
   * Regroupées en UNE alerte : en produire une par champ noierait les
   * alertes actionnables sous une trentaine de lignes d'information.
   * Le détail complet reste disponible via `inventaireInconnues(config)`.
   */
  const inconnues = inventaireInconnues(config);
  if (inconnues.length > 0) {
    alertes.push({
      code: 'donnees_inconnues',
      niveau: 'info',
      titre: `${inconnues.length} données financières inconnues`,
      detail:
        `Aucune n’est remplacée par 0. Concernées : ` +
        `${inconnues.slice(0, 4).map((i) => i.libelle).join(', ')}` +
        `${inconnues.length > 4 ? `, et ${inconnues.length - 4} autres.` : '.'}`,
      action: 'Voir la liste complète',
    });
  }

  /* --- Paramètres non confirmés ---------------------------------- */
  if (config.parametresAConfirmer.length > 0) {
    alertes.push({
      code: 'parametres_a_confirmer',
      niveau: 'info',
      titre: `${config.parametresAConfirmer.length} paramètres à confirmer`,
      detail: config.parametresAConfirmer.slice(0, 3).join(' · ') +
        (config.parametresAConfirmer.length > 3
          ? ` · et ${config.parametresAConfirmer.length - 3} autres.`
          : ''),
      action: 'Compléter la configuration',
    });
  }

  const nonClassees = cibleFondUrgence(config, p).categoriesNonClassees;
  if (nonClassees.length > 0) {
    alertes.push({
      code: 'categories_non_classees',
      niveau: 'info',
      titre: 'Catégories non classées pour le fonds d’urgence',
      detail:
        `${nonClassees.join(', ')} — exclues du calcul « dépenses essentielles » ` +
        `tant qu’elles ne sont pas classées.`,
      action: 'Classer les catégories',
    });
  }

  const ordre: Record<NiveauAlerte, number> = { critique: 0, attention: 1, info: 2 };
  return alertes.sort((a, b) => ordre[a.niveau] - ordre[b.niveau]);
}

export type { Cents };
