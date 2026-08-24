/**
 * Socle commun des routes d'assistance externe.
 *
 * Contraintes non négociables, dans l'ordre où elles sont appliquées :
 *  1. LECTURE SEULE — toute méthode autre que GET est refusée.
 *  2. Jeton dédié `AI_ASSISTANT_API_TOKEN`, comparé en temps constant,
 *     révocable en changeant une variable Vercel sans toucher au code.
 *  3. Filtre explicite sur `user_id` : les vues `v_ai_*` sont interrogées
 *     avec une clé de service, donc sans `auth.uid()`. La RLS ne peut pas
 *     filtrer ici — c'est l'API qui doit le faire, et elle refuse de servir
 *     si l'utilisateur cible n'est pas configuré.
 *  4. Seules les vues `v_ai_*` sont accessibles : jamais les tables.
 */


const VUES_AUTORISEES = [
  'v_ai_transactions',
  'v_ai_categories',
  'v_ai_accounts',
  'v_ai_loans',
  'v_ai_budget_summary',
] as const;

export type VueAssistance = (typeof VUES_AUTORISEES)[number];

/** Comparaison à temps constant : une comparaison naïve fuit la longueur du préfixe correct. */
function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function reponse(corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps, null, 2), {
    status: statut,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Une réponse d'assistance ne doit jamais être mise en cache par un
      // intermédiaire : elle contient des données financières personnelles.
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

export function erreur(message: string, statut: number): Response {
  return reponse({ erreur: message }, statut);
}

interface Contexte {
  urlSupabase: string;
  cleService: string;
  userId: string;
  requete: URL;
}

/**
 * Vérifie la requête. Renvoie soit un contexte utilisable, soit la réponse
 * d'erreur à retourner telle quelle.
 */
export function verifier(request: Request): Contexte | Response {
  if (request.method !== 'GET') {
    return erreur('Lecture seule : seule la méthode GET est acceptée.', 405);
  }

  const jetonAttendu = process.env.AI_ASSISTANT_API_TOKEN;
  const urlSupabase = process.env.SUPABASE_URL;
  const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.AI_ASSISTANT_USER_ID;

  // Si l'API n'est pas configurée, elle refuse de servir plutôt que de
  // s'ouvrir : une variable oubliée ne doit jamais valoir « pas de contrôle ».
  if (!jetonAttendu || !urlSupabase || !cleService || !userId) {
    return erreur('API d’assistance non configurée sur ce déploiement.', 503);
  }
  // Un jeton trop court serait devinable : on refuse plutôt que d'accepter.
  if (jetonAttendu.length < 32) {
    return erreur('Jeton d’assistance trop court : 32 caractères minimum.', 503);
  }

  const entete = request.headers.get('authorization') ?? '';
  const fourni = entete.startsWith('Bearer ') ? entete.slice(7) : '';
  if (!fourni || !egalConstant(fourni, jetonAttendu)) {
    return erreur('Jeton absent ou invalide.', 401);
  }

  return { urlSupabase, cleService, userId, requete: new URL(request.url) };
}

/** Entier de requête borné, pour qu'une pagination ne devienne pas un export massif. */
export function entier(url: URL, nom: string, defaut: number, max: number): number {
  const brut = url.searchParams.get(nom);
  // Un paramètre vide (`?limit=`) doit retomber sur le défaut : `Number('')`
  // vaut 0, ce qui donnerait silencieusement une réponse vide.
  if (brut === null || brut.trim() === '') return defaut;
  const valeur = Number(brut);
  if (!Number.isFinite(valeur) || valeur < 0) return defaut;
  return Math.min(Math.floor(valeur), max);
}

/**
 * Interroge une vue d'assistance via PostgREST.
 * La clé de service reste côté serveur : elle n'est jamais renvoyée au client
 * et n'apparaît dans aucune réponse, même en cas d'erreur.
 */
export async function lireVue(
  ctx: Contexte,
  vue: VueAssistance,
  parametres: Record<string, string> = {},
): Promise<Response> {
  if (!VUES_AUTORISEES.includes(vue)) {
    return erreur('Vue non autorisée.', 403);
  }

  const url = new URL(`${ctx.urlSupabase}/rest/v1/${vue}`);
  // Filtre utilisateur EXPLICITE, toujours posé en premier.
  url.searchParams.set('user_id', `eq.${ctx.userId}`);
  for (const [cle, valeur] of Object.entries(parametres)) {
    url.searchParams.set(cle, valeur);
  }

  const reponseSupabase = await fetch(url, {
    headers: {
      apikey: ctx.cleService,
      authorization: `Bearer ${ctx.cleService}`,
      accept: 'application/json',
    },
  });

  if (!reponseSupabase.ok) {
    // Le détail renvoyé par PostgREST peut contenir des éléments de schéma :
    // on ne le relaie pas, on journalise côté serveur.
    console.error('assistance: échec Supabase', vue, reponseSupabase.status);
    return erreur('Lecture impossible.', 502);
  }

  const donnees = (await reponseSupabase.json()) as unknown[];
  console.log(`assistance: ${vue} — ${donnees.length} ligne(s)`);

  return reponse(
    {
      vue,
      lectureSeule: true,
      generePar: 'API d’assistance — les règles de calcul font autorité dans @budget/core',
      nombre: donnees.length,
      donnees,
    },
    200,
  );
}
