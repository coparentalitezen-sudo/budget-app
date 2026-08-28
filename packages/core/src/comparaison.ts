import type { Cents } from './money.ts';
import { periodeDe, type Periode } from './periode.ts';
import type { Configuration, Transaction } from './types.ts';

/**
 * Comparaison mois par mois, par catégorie.
 *
 * Contrairement à `synthetiserMois` (budget PRÉVU vs consommé, limité aux
 * enveloppes variables), ceci ne regarde QUE ce qui a été RÉELLEMENT
 * encaissé/décaissé sur une période donnée, revenus et dépenses confondus
 * (fixes et variables), catégorie par catégorie — pour répondre à « où est
 * passé mon argent ce mois-ci par rapport au mois dernier ? ».
 *
 * Les mouvements internes (virement, épargne, reprise d'épargne) sont
 * exclus : ce ne sont ni un revenu ni une dépense réelle.
 */

const NON_CATEGORISE = 'Non catégorisé';

export interface LigneCategorieMontant {
  /** `null` = aucune catégorie assignée. */
  categorieId: string | null;
  nom: string;
  montant: Cents;
}

export interface CategoriesDuMois {
  periode: Periode;
  revenus: LigneCategorieMontant[];
  depenses: LigneCategorieMontant[];
}

export function categoriesDuMois(
  config: Configuration,
  transactions: Transaction[],
  p: Periode,
): CategoriesDuMois {
  const nomCategorie = (id: string | null) =>
    (id ? config.categories.find((c) => c.id === id)?.nom : undefined) ?? NON_CATEGORISE;

  const revenus = new Map<string | null, Cents>();
  const depenses = new Map<string | null, Cents>();
  const ajouter = (m: Map<string | null, Cents>, id: string | null, montant: Cents) =>
    m.set(id, (m.get(id) ?? 0) + montant);

  for (const t of transactions) {
    if (periodeDe(t.date) !== p) continue;
    switch (t.type) {
      case 'revenu':
        ajouter(revenus, t.categorieId, t.montant);
        break;
      case 'depense':
      case 'facture':
        ajouter(depenses, t.categorieId, t.montant);
        break;
      case 'remboursement':
        // Un remboursement reconstitue l'enveloppe de sa catégorie d'origine.
        ajouter(depenses, t.categorieId, -t.montant);
        break;
      // 'transfert', 'epargne', 'reprise_epargne' : mouvements internes
      // entre comptes propres, jamais un revenu ni une dépense -- exclus.
    }
  }

  const versLignes = (m: Map<string | null, Cents>): LigneCategorieMontant[] =>
    [...m.entries()]
      .map(([categorieId, montant]) => ({ categorieId, nom: nomCategorie(categorieId), montant }))
      .sort((a, b) => b.montant - a.montant);

  return { periode: p, revenus: versLignes(revenus), depenses: versLignes(depenses) };
}

export interface LigneComparaison {
  categorieId: string | null;
  nom: string;
  actuel: Cents;
  precedent: Cents;
  delta: Cents;
}

/**
 * Fusionne deux mois pour comparaison, catégorie par catégorie. Une
 * catégorie absente d'un des deux mois y vaut 0 (un vrai zéro constaté —
 * rien n'a été encaissé/décaissé dans cette catégorie ce mois-là — pas une
 * inconnue).
 */
export function comparerLignes(
  actuel: LigneCategorieMontant[],
  precedent: LigneCategorieMontant[],
): LigneComparaison[] {
  const noms = new Map<string | null, string>();
  const parCategorie = new Map<string | null, { actuel: Cents; precedent: Cents }>();

  for (const l of actuel) {
    noms.set(l.categorieId, l.nom);
    parCategorie.set(l.categorieId, { actuel: l.montant, precedent: 0 });
  }
  for (const l of precedent) {
    noms.set(l.categorieId, l.nom);
    const entree = parCategorie.get(l.categorieId) ?? { actuel: 0, precedent: 0 };
    entree.precedent = l.montant;
    parCategorie.set(l.categorieId, entree);
  }

  return [...parCategorie.entries()]
    .map(([categorieId, { actuel: a, precedent: p }]) => ({
      categorieId,
      nom: noms.get(categorieId)!,
      actuel: a,
      precedent: p,
      delta: a - p,
    }))
    .sort((x, y) => y.actuel - x.actuel);
}
