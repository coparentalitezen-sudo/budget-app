/**
 * Apparence d'une catégorie : icône et couleur, purement décoratives.
 *
 * Aucune incidence financière — la classification métier reste
 * `Categorie.nature`, définie dans `packages/core`. La couleur doit rester
 * STABLE d'un écran à l'autre (anneau, calendrier, enveloppes, flux) : elle
 * dépend donc du nom (mots-clés) ou, à défaut, de l'identifiant — jamais de
 * la position dans une liste triée.
 */

export interface StyleCategorie {
  icone: string;
  couleur: string;
}

/** Palette chaude, lisible sur fond crème comme sur fond sombre. */
export const PALETTE_CATEGORIES = [
  '#c9a23c', '#3fa877', '#d7604a', '#4a83c9', '#8a6fd9',
  '#2fa3ad', '#d06a9e', '#e0913a', '#7f8b5a', '#8a8f9c',
];

const PAR_MOT_CLE: [RegExp, StyleCategorie][] = [
  [/logement|loyer|immo/, { icone: '🏠', couleur: '#c9a23c' }],
  [/aliment|course|super/, { icone: '🛒', couleur: '#3fa877' }],
  [/resto|restaurant/, { icone: '🍽️', couleur: '#d7604a' }],
  [/transport|essence|carburant|voiture/, { icone: '🚗', couleur: '#4a83c9' }],
  [/internet|\bbox\b|\btv\b/, { icone: '🌐', couleur: '#8a6fd9' }],
  [/abonnement|t[ée]l[ée]phon|forfait|mobile/, { icone: '📱', couleur: '#6a7fd0' }],
  [/[ée]lectricit|[ée]nergie|\bgaz\b|\beau\b/, { icone: '💡', couleur: '#e0913a' }],
  [/enfant|[ée]cole|cr[èe]che/, { icone: '🧸', couleur: '#d06a9e' }],
  [/loisir|sortie|cin[ée]/, { icone: '🎟️', couleur: '#2fa3ad' }],
  [/sant[ée]|pharma|m[ée]dic/, { icone: '💊', couleur: '#5fb3a1' }],
  [/v[êe]tement|habill/, { icone: '👕', couleur: '#b6789e' }],
  [/pr[êe]t|cr[ée]dit/, { icone: '🏦', couleur: '#7f8b5a' }],
  [/imp[ôo]t|taxe/, { icone: '🧾', couleur: '#9a7b52' }],
  [/assurance/, { icone: '🛡️', couleur: '#5d7fa8' }],
  [/[ée]pargne/, { icone: '🐷', couleur: '#8a6fd9' }],
  [/salaire|revenu|caf|allocation/, { icone: '💶', couleur: '#3fa877' }],
];

function hacher(texte: string): number {
  let h = 0;
  for (const c of texte) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function styleCategorie(nom: string, id: string = nom): StyleCategorie {
  const n = nom.toLowerCase();
  const trouve = PAR_MOT_CLE.find(([motif]) => motif.test(n));
  if (trouve) return trouve[1];
  return { icone: '🏷️', couleur: PALETTE_CATEGORIES[hacher(id) % PALETTE_CATEGORIES.length] };
}
