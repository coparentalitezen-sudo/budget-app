/**
 * Lecture UNIQUE des variables d'environnement CÔTÉ CLIENT (préfixe `VITE_`,
 * intégrées au bundle — jamais un secret ici). Aucun `import.meta.env`
 * ailleurs dans `apps/web/src/` : une variable manquante se diagnostique en
 * un seul endroit plutôt qu'en cherchant dans chaque fichier qui la lit.
 *
 * Les routes serveur (`apps/web/api/*.ts`) sont un contexte d'exécution
 * SÉPARÉ (fonctions Vercel, jamais bundlées côté client) : leurs secrets
 * (`process.env`) restent lus localement dans ces fichiers, pas ici — les
 * mélanger romprait la garantie que rien de `api/` ne peut fuiter dans le
 * bundle client.
 */
export const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? null,
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? null,
};
