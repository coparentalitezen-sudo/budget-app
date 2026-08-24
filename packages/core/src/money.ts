/**
 * Tous les montants du moteur sont des ENTIERS en CENTIMES.
 * Aucun float ne circule dans les calculs : on évite 0.1 + 0.2 !== 0.3.
 */

export type Cents = number;

/** 1 234,56 € -> 123456 */
export const eur = (montant: number): Cents => round(montant * 100);

/** 123456 -> 1234.56 (usage affichage / debug uniquement) */
export const toEur = (c: Cents): number => c / 100;

/** Arrondi commercial : la moitié s'éloigne de zéro (-0,5 -> -1, 0,5 -> 1). */
export function round(valeur: number): Cents {
  return valeur < 0 ? -Math.round(-valeur) : Math.round(valeur);
}

export function formatEUR(c: Cents): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(c / 100);
}

export const somme = (valeurs: Cents[]): Cents => valeurs.reduce((a, b) => a + b, 0);

/**
 * Répartit un total en centimes selon des poids, sans perdre ni créer un centime.
 * Méthode du plus fort reste : le reliquat va aux plus grosses décimales.
 */
export function repartir(total: Cents, poids: number[]): Cents[] {
  const totalPoids = poids.reduce((a, b) => a + b, 0);
  if (totalPoids <= 0) return poids.map(() => 0);

  const bruts = poids.map((p) => (total * p) / totalPoids);
  const bases = bruts.map((v) => Math.floor(v));
  let reste = total - bases.reduce((a, b) => a + b, 0);

  const ordre = bruts
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const resultat = [...bases];
  for (let k = 0; reste > 0 && k < ordre.length; k++, reste--) {
    resultat[ordre[k].i] += 1;
  }
  return resultat;
}

/** Mensualisation d'une charge annuelle. 1600 € / an -> 133,33 €/mois */
export const mensualiser = (montantAnnuel: Cents): Cents => round(montantAnnuel / 12);

export const clampPositif = (c: Cents): Cents => (c > 0 ? c : 0);
