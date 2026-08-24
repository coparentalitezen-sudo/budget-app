import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase, chargé PARESSEUSEMENT.
 *
 * Le SDK pèse plus de 100 Ko gzippés et ne sert qu'à la synchronisation.
 * Le charger au démarrage retarderait l'affichage du premier écran sur
 * mobile, alors que l'application lit ses données dans IndexedDB. Il n'est
 * donc importé qu'au premier besoin réel.
 *
 * Seule la clé `anon` est utilisée : elle est publique par conception, et
 * c'est la Row Level Security qui assure l'isolation. La clé `service_role`
 * ne doit JAMAIS apparaître côté client — toute variable préfixée `VITE_`
 * est intégrée au bundle et publiquement lisible.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigure = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export async function obtenirSupabase(): Promise<SupabaseClient | null> {
  if (!supabaseConfigure) return null;
  if (client) return client;
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(url!, anonKey!, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
