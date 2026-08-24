import { entier, lireVue, verifier } from './_assistance.ts';


export default async function handler(request: Request): Promise<Response> {
  const ctx = verifier(request);
  if (ctx instanceof Response) return ctx;

  const parametres: Record<string, string> = {
    order: 'occurred_on.desc',
    limit: String(entier(ctx.requete, 'limit', 200, 1000)),
    offset: String(entier(ctx.requete, 'offset', 0, 100000)),
  };

  const depuis = ctx.requete.searchParams.get('depuis');
  const jusqua = ctx.requete.searchParams.get('jusqua');
  if (depuis) parametres['occurred_on'] = `gte.${depuis}`;
  if (jusqua) parametres['and'] = `(occurred_on.lte.${jusqua})`;

  const statut = ctx.requete.searchParams.get('statut');
  if (statut === 'pending' || statut === 'validated') parametres['status'] = `eq.${statut}`;

  return lireVue(ctx, 'v_ai_transactions', parametres);
}
