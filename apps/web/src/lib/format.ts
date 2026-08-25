import { formatEUR, type Cents } from '@budget/core/src/money.ts';

/**
 * Formatage d'un montant POSSIBLEMENT inconnu.
 *
 * `formatEUR` n'accepte pas `null` — le typage l'interdit, et `tsc --noEmit`
 * fait échouer le build si on essaie. C'est volontaire : c'est ainsi que
 * deux bugs affichant « 0,00 € » pour des valeurs inconnues ont été trouvés.
 * Pour afficher une valeur incertaine, on passe donc explicitement par ici.
 */
export const INCONNU = 'Inconnu';

export function montant(valeur: Cents | null | undefined): string {
  if (valeur === null || valeur === undefined) return INCONNU;
  return formatEUR(valeur);
}

export function pourcent(valeur: number | null): string {
  if (valeur === null) return INCONNU;
  return `${Math.round(valeur * 100)} %`;
}

export function dateCourte(iso: string): string {
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a.slice(2)}`;
}

const NOMS_MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function moisLong(periode: string): string {
  const [a, m] = periode.split('-').map(Number);
  return `${NOMS_MOIS[m - 1]} ${a}`;
}

/** "2026-08" -> "Août 2026", pour une pastille de période compacte. */
export function moisPilule(periode: string): string {
  const texte = moisLong(periode);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** "2026-08" -> "août", sans l'année, pour un intitulé de période court. */
export function nomMois(periode: string): string {
  const [, m] = periode.split('-').map(Number);
  return NOMS_MOIS[m - 1];
}

/** "2026-08-31" -> "31 août", pour un repère de date compact. */
export function jourMois(iso: string): string {
  const [, m, j] = iso.split('-').map(Number);
  return `${j} ${NOMS_MOIS[m - 1]}`;
}

/** Comme `montant`, mais préfixe les valeurs positives ou nulles d'un « + ». */
export function montantSigne(valeur: Cents | null | undefined): string {
  if (valeur === null || valeur === undefined) return INCONNU;
  return valeur >= 0 ? `+${formatEUR(valeur)}` : formatEUR(valeur);
}

export function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}
