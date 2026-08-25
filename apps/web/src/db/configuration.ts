import { obtenirSupabase } from '../lib/supabase.ts';
import { ecrireMeta, lireMeta } from './dexie.ts';
import { patcherCacheConfiguration } from './repository.ts';
import type { RegleCategorisation } from '../import/regles.ts';
import type { Categorie } from '@budget/core/src/types.ts';

/**
 * Écritures de configuration : catégories, enveloppes, activation des
 * éléments récurrents, règles de catégorisation.
 *
 * Ces écritures ne passent PAS par la file `outbox` des transactions :
 * modifier une enveloppe hors ligne puis synchroniser plus tard produirait
 * un budget affiché différent du budget réel pendant un temps indéterminé.
 * Elles exigent donc le réseau, et le disent clairement.
 */

export class HorsLigne extends Error {
  constructor() {
    super('Modification impossible hors ligne : reconnectez-vous pour l’enregistrer.');
  }
}

async function client() {
  const supabase = await obtenirSupabase();
  if (!supabase || !navigator.onLine) throw new HorsLigne();
  return supabase;
}

/* ------------------------------------------------------------------ */
/* Catégories                                                          */
/* ------------------------------------------------------------------ */

export async function enregistrerCategorie(categorie: {
  id?: string;
  nom: string;
  nature: 'fixe' | 'variable' | 'provision' | 'epargne';
  criticite: 'essentielle' | 'semi_essentielle' | 'non_essentielle' | null;
}): Promise<void> {
  const supabase = await client();
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Session absente.');

  const id = categorie.id ?? crypto.randomUUID();
  const { error } = await supabase.from('categories').upsert(
    {
      id,
      user_id: userId,
      name: categorie.nom,
      nature: categorie.nature,
      criticality: categorie.criticite,
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message);

  // Sans ce correctif, la nouvelle catégorie ne serait visible qu'après un
  // rechargement complet de l'application (le cache local, seul lu par les
  // écrans, ne le saurait sinon qu'au prochain `chargerConfiguration`).
  const nouvelle: Categorie = {
    id,
    nom: categorie.nom,
    nature: categorie.nature,
    criticite: categorie.criticite ?? undefined,
  };
  await patcherCacheConfiguration((c) => ({
    ...c,
    categories: c.categories.some((x) => x.id === id)
      ? c.categories.map((x) => (x.id === id ? nouvelle : x))
      : [...c.categories, nouvelle],
  }));
}

/**
 * Suppression LOGIQUE. Une catégorie supprimée physiquement emporterait le
 * rattachement de toutes les transactions passées.
 */
export async function archiverCategorie(id: string): Promise<void> {
  const supabase = await client();
  const { error } = await supabase
    .from('categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  await patcherCacheConfiguration((c) => ({
    ...c,
    categories: c.categories.filter((x) => x.id !== id),
  }));
}

/* ------------------------------------------------------------------ */
/* Enveloppes budgétaires                                              */
/* ------------------------------------------------------------------ */

/**
 * Met à jour l'enveloppe d'une catégorie pour une période, et pour toutes
 * les périodes suivantes si demandé — c'est presque toujours l'intention
 * réelle quand on ajuste un budget récurrent.
 */
export async function definirEnveloppe(
  periode: string,
  categorieId: string,
  montantCents: number,
  moisSuivantsInclus: boolean,
): Promise<number> {
  const supabase = await client();
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Session absente.');

  const [annee, mois] = periode.split('-').map(Number);

  const { data: periodes, error: erreurPeriodes } = await supabase
    .from('budget_periods')
    .select('id, year, month')
    .eq('user_id', userId);
  if (erreurPeriodes) throw new Error(erreurPeriodes.message);

  const cibles = (periodes ?? []).filter((p) => {
    const apres = p.year > annee || (p.year === annee && p.month >= mois);
    return moisSuivantsInclus ? apres : p.year === annee && p.month === mois;
  });

  if (cibles.length === 0) return 0;

  const { error } = await supabase.from('budgets').upsert(
    cibles.map((p) => ({
      user_id: userId,
      period_id: p.id,
      category_id: categorieId,
      planned_cents: montantCents,
    })),
    { onConflict: 'period_id,category_id' },
  );
  if (error) throw new Error(error.message);
  return cibles.length;
}

/* ------------------------------------------------------------------ */
/* Revenus et charges récurrentes                                      */
/* ------------------------------------------------------------------ */

export async function activerRecurrent(
  table: 'recurring_incomes' | 'recurring_expenses',
  id: string,
  actif: boolean,
): Promise<void> {
  const supabase = await client();
  const { error } = await supabase.from(table).update({ is_active: actif }).eq('id', id);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Règles de catégorisation                                            */
/* ------------------------------------------------------------------ */

const CLE_REGLES = 'regles';

/** Règles en cache : la catégorisation d'un import fonctionne hors ligne. */
export async function reglesLocales(): Promise<RegleCategorisation[]> {
  return lireMeta<RegleCategorisation[]>(CLE_REGLES, []);
}

export async function chargerRegles(): Promise<RegleCategorisation[]> {
  const supabase = await obtenirSupabase();
  if (!supabase || !navigator.onLine) return reglesLocales();

  const { data, error } = await supabase
    .from('categorization_rules')
    .select('*')
    .order('priority', { ascending: true });
  if (error) return reglesLocales();

  const regles: RegleCategorisation[] = (data ?? []).map((r) => ({
    id: r.id as string,
    motif: r.pattern as string,
    typeCorrespondance: r.match_type as RegleCategorisation['typeCorrespondance'],
    categorieId: r.category_id as string,
    priorite: Number(r.priority),
    autoValider: Boolean(r.auto_validate),
    active: Boolean(r.is_active),
  }));
  await ecrireMeta(CLE_REGLES, regles);
  return regles;
}

export async function enregistrerRegle(regle: Omit<RegleCategorisation, 'id'> & { id?: string }): Promise<void> {
  const supabase = await client();
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Session absente.');

  const { error } = await supabase.from('categorization_rules').upsert(
    {
      id: regle.id ?? crypto.randomUUID(),
      user_id: userId,
      category_id: regle.categorieId,
      pattern: regle.motif,
      match_type: regle.typeCorrespondance,
      priority: regle.priorite,
      auto_validate: regle.autoValider,
      is_active: regle.active,
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message);
  await chargerRegles();
}

export async function supprimerRegle(id: string): Promise<void> {
  const supabase = await client();
  const { error } = await supabase.from('categorization_rules').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await chargerRegles();
}
