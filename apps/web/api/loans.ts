import { lireVue, verifier } from './_assistance.ts';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const ctx = verifier(request);
  if (ctx instanceof Response) return ctx;
  return lireVue(ctx, 'v_ai_loans', { order: 'name.asc' });
}
