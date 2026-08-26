import { obtenirSupabase } from '../lib/supabase.ts';
import { ecrireMeta, lireMeta } from './dexie.ts';
import { patcherCacheConfiguration } from './repository.ts';
import type { RegleCategorisation } from '../import/regles.ts';
import type { Categorie, ChargeRecurrente, LigneBudget, NatureCategorie, RevenuRecurrent } from '@budget/core/src/types.ts';

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
  nature: NatureCategorie;
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
 * Résout les périodes ciblées par une modification d'enveloppe : la période
 * donnée seule, ou elle et toutes celles qui suivent. Partagé entre
 * `definirEnveloppe` et `supprimerEnveloppe` — les deux doivent cibler
 * exactement le même ensemble de mois.
 */
async function periodesCiblees(
  periode: string,
  moisSuivantsInclus: boolean,
): Promise<{ userId: string; ids: string[] }> {
  const supabase = await client();
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Session absente.');

  const [annee, mois] = periode.split('-').map(Number);

  const { data: periodes, error } = await supabase
    .from('budget_periods')
    .select('id, year, month')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);

  const cibles = (periodes ?? []).filter((p) => {
    const apres = p.year > annee || (p.year === annee && p.month >= mois);
    return moisSuivantsInclus ? apres : p.year === annee && p.month === mois;
  });

  return { userId, ids: cibles.map((p) => p.id) };
}

/**
 * Met à jour l'enveloppe d'une catégorie pour une période, et pour toutes
 * les périodes suivantes si demandé — c'est presque toujours l'intention
 * réelle quand on ajuste un budget récurrent. Sert aussi bien à créer une
 * NOUVELLE enveloppe (aucune ligne n'existe encore pour cette catégorie)
 * qu'à en modifier une existante : `upsert` couvre les deux.
 */
export async function definirEnveloppe(
  periode: string,
  categorieId: string,
  montantCents: number,
  moisSuivantsInclus: boolean,
): Promise<number> {
  const supabase = await client();
  const { userId, ids } = await periodesCiblees(periode, moisSuivantsInclus);
  if (ids.length === 0) return 0;

  const { error } = await supabase.from('budgets').upsert(
    ids.map((periodId) => ({
      user_id: userId,
      period_id: periodId,
      category_id: categorieId,
      planned_cents: montantCents,
    })),
    { onConflict: 'period_id,category_id' },
  );
  if (error) throw new Error(error.message);

  // Le cache ne porte que la période COURANTE (celle chargée au dernier
  // `chargerConfiguration`) : la corriger ici suffit, `periodesCiblees`
  // (mois suivants) n'a rien à y refléter tant qu'on n'y est pas encore.
  const ligne: LigneBudget = { categorieId, montantPrevu: montantCents };
  await patcherCacheConfiguration((c) => ({
    ...c,
    budgetVariable: c.budgetVariable.some((l) => l.categorieId === categorieId)
      ? c.budgetVariable.map((l) => (l.categorieId === categorieId ? ligne : l))
      : [...c.budgetVariable, ligne],
  }));

  return ids.length;
}

/**
 * Retire l'enveloppe d'une catégorie — la catégorie elle-même n'est pas
 * touchée, seule sa ligne de budget disparaît (le mois en cours, et les
 * suivants si demandé). Contrairement aux transactions, une ligne de
 * budget n'a pas de valeur historique propre : c'est un montant PRÉVU, pas
 * un fait passé — la suppression est donc physique, pas logique.
 */
export async function supprimerEnveloppe(
  periode: string,
  categorieId: string,
  moisSuivantsInclus: boolean,
): Promise<number> {
  const supabase = await client();
  const { ids } = await periodesCiblees(periode, moisSuivantsInclus);
  if (ids.length === 0) return 0;

  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('category_id', categorieId)
    .in('period_id', ids);
  if (error) throw new Error(error.message);

  await patcherCacheConfiguration((c) => ({
    ...c,
    budgetVariable: c.budgetVariable.filter((l) => l.categorieId !== categorieId),
  }));

  return ids.length;
}

/* ------------------------------------------------------------------ */
/* Revenus et charges récurrentes                                      */
/* ------------------------------------------------------------------ */

/** Le cache local ne porte que les éléments ACTIFS (comme `chargerConfiguration`, filtré côté requête). */
function retirerDuCache(table: 'recurring_incomes' | 'recurring_expenses', id: string) {
  return patcherCacheConfiguration((c) =>
    table === 'recurring_incomes'
      ? { ...c, revenus: c.revenus.filter((r) => r.id !== id) }
      : { ...c, charges: c.charges.filter((ch) => ch.id !== id) },
  );
}

export async function activerRecurrent(
  table: 'recurring_incomes' | 'recurring_expenses',
  id: string,
  actif: boolean,
): Promise<void> {
  const supabase = await client();
  const { error } = await supabase.from(table).update({ is_active: actif }).eq('id', id);
  if (error) throw new Error(error.message);

  // Désactiver retire l'élément du cache (comme du prochain chargement
  // distant, filtré sur `is_active`) ; réactiver n'a pas d'UI pour l'instant
  // (rien à ajouter au cache sans re-questionner le serveur).
  if (!actif) await retirerDuCache(table, id);
}

export async function enregistrerRevenuRecurrent(revenu: {
  id?: string;
  nom: string;
  montant: number;
  jour: number | null;
}): Promise<void> {
  const supabase = await client();
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Session absente.');

  const id = revenu.id ?? crypto.randomUUID();
  const { error } = await supabase.from('recurring_incomes').upsert(
    {
      id,
      user_id: userId,
      name: revenu.nom,
      amount_cents: revenu.montant,
      day_of_month: revenu.jour,
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message);

  // Sans ce correctif, le revenu modifié (ex. jour de versement renseigné)
  // ne serait à jour qu'après un rechargement complet de l'application.
  const nouveau: RevenuRecurrent = { id, nom: revenu.nom, montant: revenu.montant, jour: revenu.jour };
  await patcherCacheConfiguration((c) => ({
    ...c,
    revenus: c.revenus.some((r) => r.id === id)
      ? c.revenus.map((r) => (r.id === id ? nouveau : r))
      : [...c.revenus, nouveau],
  }));
}

export async function enregistrerChargeRecurrente(charge: {
  id?: string;
  nom: string;
  montant: number;
  jour: number | null;
  categorieId: string;
}): Promise<void> {
  const supabase = await client();
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Session absente.');

  const id = charge.id ?? crypto.randomUUID();
  const { error } = await supabase.from('recurring_expenses').upsert(
    {
      id,
      user_id: userId,
      name: charge.nom,
      amount_cents: charge.montant,
      day_of_month: charge.jour,
      category_id: charge.categorieId,
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message);

  const nouvelle: ChargeRecurrente = {
    id, nom: charge.nom, montant: charge.montant, jour: charge.jour, categorieId: charge.categorieId,
  };
  await patcherCacheConfiguration((c) => ({
    ...c,
    charges: c.charges.some((ch) => ch.id === id)
      ? c.charges.map((ch) => (ch.id === id ? nouvelle : ch))
      : [...c.charges, nouvelle],
  }));
}

/**
 * Suppression LOGIQUE : un revenu ou une charge récurrente supprimé reste
 * dans l'historique (utile pour comprendre un mois passé), contrairement à
 * « Désactiver » qui reste réversible et visible dans l'écran.
 */
export async function supprimerRecurrent(
  table: 'recurring_incomes' | 'recurring_expenses',
  id: string,
): Promise<void> {
  const supabase = await client();
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  await retirerDuCache(table, id);
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
