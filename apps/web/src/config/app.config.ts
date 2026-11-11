/**
 * Identité, image de marque et navigation — SOURCE UNIQUE.
 *
 * Change ici, jamais séparément dans `vite.config.ts`, `index.html`,
 * `App.tsx` ou `session.tsx`. Les couleurs reprises ici sont exactement
 * celles déjà définies dans `apps/web/src/styles.css` (`:root`) : ce
 * fichier ne fait qu'exposer les valeurs dont `vite.config.ts` (un script
 * Node, qui ne peut pas lire un fichier `.css`) a besoin pour générer le
 * manifeste PWA — jamais une nouvelle valeur inventée.
 *
 * `index.html` ne peut pas importer ce module (fichier HTML statique, lu
 * avant tout bundling) : son titre et son `theme-color` restent des
 * littéraux à synchroniser manuellement avec `identite.nom` et
 * `marque.themeColor` ci-dessous si l'un des deux change.
 */

export type CleOnglet =
  | 'accueil' | 'transactions' | 'budget' | 'epargne'
  | 'credits' | 'provisions' | 'import' | 'rapprochement' | 'configurer' | 'parametres'
  | 'confidentialite' | 'justificatifs' | 'plus';

export interface EntreeNavigation {
  cle: CleOnglet;
  libelle: string;
}

export const app = {
  identite: {
    nom: 'Budget',
    /** ≤ 12 caractères : nom affiché sous l'icône à l'écran d'accueil iOS. */
    nomCourt: 'Budget',
    description: 'Gestion budgétaire personnelle',
    langue: 'fr-FR',
  },

  marque: {
    /** Reprises telles quelles de `styles.css` (`:root`, thème clair) — jamais dupliquées avec une valeur différente. */
    couleurs: {
      fond: '#f6f1e7',
      accent: '#2f9e6e',
      bleu: '#4a83c9',
      violet: '#8a6fd9',
    },
    /** Couleur de chrome PWA (barre de statut, splash) : le fond crème du thème clair. */
    themeColor: '#f6f1e7',
  },

  pwa: {
    startUrl: '/',
    affichage: 'standalone' as const,
    icones: {
      icon192: 'icon-192.png',
      icon512: 'icon-512.png',
      maskable512: 'icon-maskable-512.png',
    },
  },

  /** Barre de navigation basse (≤ 5 entrées) + sections repliées sous « Plus ». */
  navigation: {
    principale: [
      { cle: 'accueil', libelle: 'Accueil' },
      { cle: 'transactions', libelle: 'Opérations' },
      { cle: 'budget', libelle: 'Budget' },
      { cle: 'epargne', libelle: 'Épargne' },
      { cle: 'plus', libelle: 'Plus' },
    ] satisfies EntreeNavigation[],
    sousPlus: [
      'credits', 'provisions', 'import', 'rapprochement', 'configurer', 'parametres',
      'justificatifs', 'confidentialite',
    ] satisfies CleOnglet[],
  },

  /**
   * Valeurs de repli pour l'identité éditeur (mentions légales). Les
   * variables d'environnement (voir `src/lib/legal.ts`) priment toujours ;
   * ceci ne sert que tant qu'elles ne sont pas renseignées.
   */
  legal: {
    formeParDefaut: 'À compléter',
    versionTextes: '2026-08-28',
    conservation: {
      compteInactif: '3 ans',
      journauxTechniques: '12 mois',
    },
  },
} as const;
