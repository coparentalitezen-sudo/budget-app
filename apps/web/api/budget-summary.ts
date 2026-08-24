import { entier, lireVue, verifier } from './_assistance.ts';


export default async function handler(request: Request): Promise<Response> {
  const ctx = verifier(request);
  if (ctx instanceof Response) return ctx;

  const parametres: Record<string, string> = {
    order: 'year.desc,month.desc',
    limit: String(entier(ctx.requete, 'limit', 12, 60)),
  };

  const annee = ctx.requete.searchParams.get('annee');
  if (annee && /^\d{4}$/.test(annee)) parametres['year'] = `eq.${annee}`;

  return lireVue(ctx, 'v_ai_budget_summary', parametres);
}
