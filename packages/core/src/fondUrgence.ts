import type { Cents } from './money.ts';
import type { Periode } from './periode.ts';
import type { Configuration, ObjectifEpargne, ReglageFondUrgence } from './types.ts';
import { chargesFixesPrevues, dotationsProvisions, revenusPrevus } from './budget.ts';

/**
 * Dépenses essentielles mensuelles = ce qu'il faut vraiment décaisser
 * chaque mois pour tenir : charges fixes contraintes + dotations de
 * provisions + enveloppes variables marquées `essentielle: true`.
 *
 * Une catégorie dont `essentielle` vaut `undefined` est EXCLUE du calcul
 * et signalée comme paramètre à confirmer : on ne devine pas à la place
 * de l'utilisateur ce qui est vital ou non.
 */
export interface DetailDepensesEssentielles {
  chargesFixes: Cents;
  provisions: Cents;
  enveloppesEssentielles: Cents;
  total: Cents;
  categoriesRetenues: string[];
  categoriesExclues: string[];
  categoriesNonClassees: string[];
}

export function depensesEssentielles(
  config: Configuration,
  p: Periode,
  inclureSemiEssentielles = false,
): DetailDepensesEssentielles {
  const retenues: string[] = [];
  const exclues: string[] = [];
  const nonClassees: string[] = [];
  let enveloppes = 0;

  for (const ligne of config.budgetVariable) {
    const cat = config.categories.find((c) => c.id === ligne.categorieId);
    const nom = cat?.nom ?? ligne.categorieId;
    const retenue =
      cat?.criticite === 'essentielle' ||
      (inclureSemiEssentielles && cat?.criticite === 'semi_essentielle');

    if (retenue) {
      enveloppes += ligne.montantPrevu;
      retenues.push(nom);
    } else if (cat?.criticite !== undefined) {
      exclues.push(nom);
    } else {
      nonClassees.push(nom);
    }
  }

  const chargesFixes = chargesFixesPrevues(config, p);
  const provisions = dotationsProvisions(config);

  return {
    chargesFixes,
    provisions,
    enveloppesEssentielles: enveloppes,
    total: chargesFixes + provisions + enveloppes,
    categoriesRetenues: retenues,
    categoriesExclues: exclues,
    categoriesNonClassees: nonClassees,
  };
}

export interface CibleFondUrgence {
  cible: Cents;
  mode: ReglageFondUrgence['mode'];
  nombreDeMois: number | null;
  baseMensuelle: Cents | null;
  periodeReference: Periode | null;
  /** Explication affichable telle quelle dans l'interface. */
  explication: string;
  categoriesNonClassees: string[];
}

/**
 * Calcule la cible du fonds d'urgence selon le mode retenu.
 * La période de référence par défaut est celle passée en argument : elle
 * compte, car les charges fixes changent en octobre 2026 (fin du prêt cuisine).
 */
export function cibleFondUrgence(
  config: Configuration,
  p: Periode,
  reglage: ReglageFondUrgence = config.reglageFondUrgence,
): CibleFondUrgence {
  if (reglage.mode === 'manuel') {
    return {
      cible: reglage.montant,
      mode: 'manuel',
      nombreDeMois: null,
      baseMensuelle: null,
      periodeReference: null,
      explication: 'Cible saisie manuellement.',
      categoriesNonClassees: [],
    };
  }

  const reference = reglage.periodeReference ?? p;

  if (reglage.mode === 'revenus') {
    const base = revenusPrevus(config, reference);
    return {
      cible: base * reglage.nombreDeMois,
      mode: 'revenus',
      nombreDeMois: reglage.nombreDeMois,
      baseMensuelle: base,
      periodeReference: reference,
      explication: `${reglage.nombreDeMois} mois de revenus réguliers (référence ${reference}).`,
      categoriesNonClassees: [],
    };
  }

  const detail = depensesEssentielles(
    config,
    reference,
    reglage.inclureSemiEssentielles ?? false,
  );
  return {
    cible: detail.total * reglage.nombreDeMois,
    mode: 'depenses_essentielles',
    nombreDeMois: reglage.nombreDeMois,
    baseMensuelle: detail.total,
    periodeReference: reference,
    explication:
      `${reglage.nombreDeMois} mois de dépenses essentielles (référence ${reference}) : ` +
      `charges fixes + provisions + ${detail.categoriesRetenues.length} enveloppes retenues` +
      `${reglage.inclureSemiEssentielles ? ' (semi-essentielles incluses)' : ''}.`,
    categoriesNonClassees: detail.categoriesNonClassees,
  };
}

/**
 * Renvoie les objectifs d'épargne avec la cible du fonds d'urgence résolue
 * dynamiquement. Le montant n'est jamais figé en base : il suit l'évolution
 * réelle des charges du foyer.
 */
export function resoudreObjectifs(config: Configuration, p: Periode): ObjectifEpargne[] {
  const cible = cibleFondUrgence(config, p);
  return config.objectifsEpargne.map((o) =>
    o.type === 'urgence' ? { ...o, objectifTotal: cible.cible } : o,
  );
}


