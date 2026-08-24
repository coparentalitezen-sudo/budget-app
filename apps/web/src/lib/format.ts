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

export function moisLong(periode: string): string {
  const [a, m] = periode.split('-').map(Number);
  const noms = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ];
  return `${noms[m - 1]} ${a}`;
}

export function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}
