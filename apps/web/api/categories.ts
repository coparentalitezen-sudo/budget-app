import { lireVue, router, verifier } from './_assistance';


export default router(async function handler(request: Request): Promise<Response> {
  const ctx = verifier(request);
  if (ctx instanceof Response) return ctx;
  return lireVue(ctx, 'v_ai_categories', { order: 'name.asc' });
});
