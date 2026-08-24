/**
 * Gestion des périodes budgétaires.
 * Une période = un mois calendaire, clé "YYYY-MM".
 * La semaine est lundi -> dimanche, TOUJOURS bornée au mois courant
 * (décision : une semaine à cheval sur deux mois est coupée, car le budget
 * mensuel ne peut pas financer des jours du mois suivant).
 */

export type Periode = string; // "2026-08"
export type DateISO = string; // "2026-08-23"

export function periodeDe(date: DateISO): Periode {
  return date.slice(0, 7);
}

export function decomposer(p: Periode): { annee: number; mois: number } {
  const [a, m] = p.split('-').map(Number);
  return { annee: a, mois: m };
}

export function ajouterMois(p: Periode, n: number): Periode {
  const { annee, mois } = decomposer(p);
  const total = annee * 12 + (mois - 1) + n;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${a}-${String(m).padStart(2, '0')}`;
}

/** Nombre de mois de a vers b (b - a). Peut être négatif. */
export function ecartMois(a: Periode, b: Periode): number {
  const da = decomposer(a);
  const db = decomposer(b);
  return (db.annee - da.annee) * 12 + (db.mois - da.mois);
}

export function comparerPeriodes(a: Periode, b: Periode): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function joursDansMois(p: Periode): number {
  const { annee, mois } = decomposer(p);
  return new Date(Date.UTC(annee, mois, 0)).getUTCDate();
}

export function jourDuMois(date: DateISO): number {
  return Number(date.slice(8, 10));
}

/** 1 = lundi ... 7 = dimanche */
export function jourSemaine(date: DateISO): number {
  const d = new Date(`${date}T00:00:00Z`);
  const js = d.getUTCDay(); // 0 = dimanche
  return js === 0 ? 7 : js;
}

/**
 * Jours restants dans le mois, aujourd'hui inclus.
 * "Aujourd'hui inclus" car la journée en cours peut encore générer des dépenses.
 */
export function joursRestantsMois(aujourdhui: DateISO): number {
  const p = periodeDe(aujourdhui);
  return joursDansMois(p) - jourDuMois(aujourdhui) + 1;
}

/**
 * Jours restants dans la semaine courante (aujourd'hui inclus),
 * tronqués à la fin du mois.
 */
export function joursRestantsSemaine(aujourdhui: DateISO): number {
  const jusquDimanche = 7 - jourSemaine(aujourdhui) + 1;
  return Math.min(jusquDimanche, joursRestantsMois(aujourdhui));
}

/** Dernier jour du mois d'une période, en ISO. */
export function finDeMois(p: Periode): DateISO {
  return `${p}-${String(joursDansMois(p)).padStart(2, '0')}`;
}
