import { lireVue, verifier } from './_assistance.ts';


export default async function handler(request: Request): Promise<Response> {
  const ctx = verifier(request);
  if (ctx instanceof Response) return ctx;
  // `balance_cents` peut valoir null : un solde inconnu reste inconnu
  // jusque dans la réponse de l'API.
  return lireVue(ctx, 'v_ai_accounts', { order: 'type.asc' });
}
