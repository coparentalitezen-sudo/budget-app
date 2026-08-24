import { clampPositif, round, somme, type Cents } from './money.ts';
import {
  comparerPeriodes,
  decomposer,
  jourDuMois,
  joursRestantsMois,
  joursRestantsSemaine,
  jourSemaine,
  periodeDe,
  type DateISO,
  type Periode,
} from './periode.ts';
import type {
  Categorie,
  ChargeRecurrente,
  Configuration,
  RevenuRecurrent,
  Transaction,
} from './types.ts';

/* ------------------------------------------------------------------ */
/* Activité des éléments récurrents sur une période                    */
/* ------------------------------------------------------------------ */

function estActif(
  element: { debut?: Periode; fin?: Periode },
  p: Periode,
): boolean {
  if (element.debut && comparerPeriodes(p, element.debut) < 0) return false;
  if (element.fin && comparerPeriodes(p, element.fin) > 0) return false;
  return true;
}

export function revenusPrevus(config: Configuration, p: Periode): Cents {
  return somme(config.revenus.filter((r) => estActif(r, p)).map((r) => r.montant));
}

export function chargesFixesPrevues(config: Configuration, p: Periode): Cents {
  const { mois } = decomposer(p);
  return somme(
    config.charges
      .filter((c) => estActif(c, p) && !(c.moisExclus ?? []).includes(mois))
      .map((c) => c.montant),
  );
}

export function dotationsProvisions(config: Configuration): Cents {
  return somme(config.provisions.map((pr) => pr.dotationMensuelle));
}

export function budgetVariableTotal(config: Configuration): Cents {
  return somme(config.budgetVariable.map((l) => l.montantPrevu));
}

/**
 * Objectif d'épargne THÉORIQUE de la période. Constant : il n'est jamais
 * rabaissé automatiquement au niveau de la capacité réelle.
 */
export function objectifEpargne(config: Configuration): Cents {
  return config.reglageEpargne.objectif;
}

export interface SituationEpargne {
  /** Ce que l'on vise : 200 €. Constant. */
  objectifEpargne: Cents;
  /** Ce que la STRUCTURE du budget dégage. N'est pas une autorisation de virement. */
  capaciteEpargneBudgetaire: Cents;
  /** Négatif quand l'objectif n'est pas atteignable (ex. −189,21 €). */
  ecartObjectif: Cents;
  atteignable: boolean;
  /** Plafond saisi manuellement par l'utilisateur, s'il y en a un. */
  plafondManuel: Cents | null;
  /**
   * Versement que le budget autorise, hors considération de trésorerie.
   * Ne jamais présenter ce montant comme virable : voir `situationVirement`.
   */
  versementBudgetaire: Cents;
}

/**
 * Sépare explicitement l'objectif, la capacité et l'écart.
 * L'application doit annoncer « objectif 200 € non atteignable, il manque
 * 189,21 € » plutôt que de transformer silencieusement l'objectif en 10 €.
 */
export function situationEpargne(config: Configuration, p: Periode): SituationEpargne {
  const objectif = objectifEpargne(config);
  const capacite = capaciteEpargne(config, p);

  const plafond =
    config.reglageEpargne.plafondsManuels.find(
      (e) => comparerPeriodes(p, e.debut) >= 0 && comparerPeriodes(p, e.fin) <= 0,
    )?.montant ?? null;

  let versement = Math.min(objectif, Math.max(0, capacite));
  if (plafond !== null) versement = Math.min(versement, plafond);

  return {
    objectifEpargne: objectif,
    capaciteEpargneBudgetaire: capacite,
    ecartObjectif: capacite - objectif,
    atteignable: capacite >= objectif,
    plafondManuel: plafond,
    versementBudgetaire: versement,
  };
}

/**
 * Capacité d'épargne théorique du mois :
 * ce qui reste une fois les charges fixes, les provisions
 * et l'intégralité des enveloppes variables financées.
 */
export function capaciteEpargne(config: Configuration, p: Periode): Cents {
  return (
    revenusPrevus(config, p) -
    chargesFixesPrevues(config, p) -
    dotationsProvisions(config) -
    budgetVariableTotal(config)
  );
}

/* ------------------------------------------------------------------ */
/* Réalisé (à partir des transactions)                                 */
/* ------------------------------------------------------------------ */

export interface Realise {
  revenus: Cents;
  chargesFixes: Cents;
  depensesVariables: Cents;
  provisions: Cents;
  epargneNette: Cents;
  /** Détail des dépenses variables par catégorie. */
  parCategorie: Map<string, Cents>;
}

const natureDe = (categories: Categorie[], id: string | null) =>
  categories.find((c) => c.id === id)?.nature ?? null;

/**
 * Agrège les transactions d'une période.
 * Les transactions `pending` sont incluses par défaut : mieux vaut afficher
 * un reste à dépenser pessimiste qu'un reste optimiste.
 */
export function calculerRealise(
  config: Configuration,
  transactions: Transaction[],
  p: Periode,
  options: { inclurePending?: boolean } = {},
): Realise {
  const inclurePending = options.inclurePending ?? true;
  const lignes = transactions.filter(
    (t) => periodeDe(t.date) === p && (inclurePending || t.statut === 'validated'),
  );

  const realise: Realise = {
    revenus: 0,
    chargesFixes: 0,
    depensesVariables: 0,
    provisions: 0,
    epargneNette: 0,
    parCategorie: new Map(),
  };

  for (const t of lignes) {
    const nature = natureDe(config.categories, t.categorieId);

    switch (t.type) {
      case 'revenu':
        realise.revenus += t.montant;
        break;

      case 'epargne':
        realise.epargneNette += t.montant;
        break;

      case 'reprise_epargne':
        realise.epargneNette -= t.montant;
        break;

      case 'depense':
      case 'facture':
        if (nature === 'fixe') {
          realise.chargesFixes += t.montant;
        } else if (nature === 'provision') {
          realise.provisions += t.montant;
        } else {
          realise.depensesVariables += t.montant;
          const cle = t.categorieId ?? 'non_categorise';
          realise.parCategorie.set(cle, (realise.parCategorie.get(cle) ?? 0) + t.montant);
        }
        break;

      case 'remboursement':
        // Un remboursement reconstitue l'enveloppe de sa catégorie d'origine.
        if (nature === 'variable' || nature === null) {
          realise.depensesVariables -= t.montant;
          const cle = t.categorieId ?? 'non_categorise';
          realise.parCategorie.set(cle, (realise.parCategorie.get(cle) ?? 0) - t.montant);
        } else {
          realise.revenus += t.montant;
        }
        break;

      case 'transfert':
        // Un virement vers le compte de provisions est une dotation réelle.
        if (nature === 'provision') realise.provisions += t.montant;
        // Un virement vers un compte d'épargne est un versement.
        else if (nature === 'epargne') realise.epargneNette += t.montant;
        break;
    }
  }

  return realise;
}

/* ------------------------------------------------------------------ */
/* Synthèse mensuelle                                                  */
/* ------------------------------------------------------------------ */

export interface LigneCategorie {
  categorieId: string;
  nom: string;
  prevu: Cents;
  depense: Cents;
  restant: Cents;
  pourcentage: number; // 0 -> 1+, non borné pour visualiser les dépassements
}

export interface SyntheseMensuelle {
  periode: Periode;
  revenusPrevus: Cents;
  revenusRealises: Cents;
  chargesFixes: Cents;
  provisions: Cents;
  budgetVariable: Cents;
  depensesVariables: Cents;
  /** L'information n°1 de l'écran d'accueil. */
  resteADepenser: Cents;
  /** Objectif théorique, capacité réelle et écart — jamais confondus. */
  epargne: SituationEpargne;
  epargneRealisee: Cents;
  /** Progression par rapport à l'OBJECTIF théorique (0 -> 1). */
  progressionEpargne: number;
  categories: LigneCategorie[];
}

export function synthetiserMois(
  config: Configuration,
  transactions: Transaction[],
  p: Periode,
): SyntheseMensuelle {
  const realise = calculerRealise(config, transactions, p);
  const budgetVar = budgetVariableTotal(config);
  const epargne = situationEpargne(config, p);

  const categories: LigneCategorie[] = config.budgetVariable.map((ligne) => {
    const depense = realise.parCategorie.get(ligne.categorieId) ?? 0;
    const nom =
      config.categories.find((c) => c.id === ligne.categorieId)?.nom ?? ligne.categorieId;
    return {
      categorieId: ligne.categorieId,
      nom,
      prevu: ligne.montantPrevu,
      depense,
      restant: ligne.montantPrevu - depense,
      pourcentage: ligne.montantPrevu > 0 ? depense / ligne.montantPrevu : 0,
    };
  });

  return {
    periode: p,
    revenusPrevus: revenusPrevus(config, p),
    revenusRealises: realise.revenus,
    chargesFixes: chargesFixesPrevues(config, p),
    provisions: dotationsProvisions(config),
    budgetVariable: budgetVar,
    depensesVariables: realise.depensesVariables,
    resteADepenser: budgetVar - realise.depensesVariables,
    epargne,
    epargneRealisee: realise.epargneNette,
    progressionEpargne:
      epargne.objectifEpargne > 0 ? realise.epargneNette / epargne.objectifEpargne : 1,
    categories,
  };
}

/* ------------------------------------------------------------------ */
/* Vue hebdomadaire                                                    */
/* ------------------------------------------------------------------ */

export interface SyntheseHebdo {
  joursRestantsMois: number;
  joursRestantsSemaine: number;
  allocationQuotidienne: Cents;
  /** Enveloppe disponible pour la fin de la semaine en cours. */
  disponibleCetteSemaine: Cents;
  depensesDepuisLundi: Cents;
  /** Reste réellement disponible d'ici dimanche (jamais négatif à l'affichage). */
  resteReelSemaine: Cents;
}

export function synthetiserSemaine(
  config: Configuration,
  transactions: Transaction[],
  aujourdhui: DateISO,
): SyntheseHebdo {
  const p = periodeDe(aujourdhui);
  const mois = synthetiserMois(config, transactions, p);

  const jrMois = joursRestantsMois(aujourdhui);
  const jrSemaine = joursRestantsSemaine(aujourdhui);

  const reste = mois.resteADepenser;
  const quotidien = jrMois > 0 ? round(reste / jrMois) : 0;
  const disponibleSemaine = jrMois > 0 ? round((reste * jrSemaine) / jrMois) : 0;

  // Dépenses variables depuis le lundi de la semaine en cours (borné au mois).
  const debutSemaineJour = Math.max(1, jourDuMois(aujourdhui) - (jourSemaine(aujourdhui) - 1));
  const depensesSemaine = somme(
    transactions
      .filter((t) => {
        if (periodeDe(t.date) !== p) return false;
        if (t.type !== 'depense' && t.type !== 'facture') return false;
        const nature = config.categories.find((c) => c.id === t.categorieId)?.nature;
        if (nature && nature !== 'variable') return false;
        return jourDuMois(t.date) >= debutSemaineJour;
      })
      .map((t) => t.montant),
  );

  return {
    joursRestantsMois: jrMois,
    joursRestantsSemaine: jrSemaine,
    allocationQuotidienne: quotidien,
    disponibleCetteSemaine: disponibleSemaine,
    depensesDepuisLundi: depensesSemaine,
    resteReelSemaine: clampPositif(disponibleSemaine),
  };
}

export type { ChargeRecurrente, RevenuRecurrent };
