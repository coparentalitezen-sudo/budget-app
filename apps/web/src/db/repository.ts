import { obtenirSupabase } from '../lib/supabase.ts';
import { db, ecrireMeta, lireMeta } from './dexie.ts';
import { foyer2026 } from '@budget/core/src/fixtures/foyer2026.ts';
import type {
  Categorie, ChargeRecurrente, Compte, Configuration, Credit,
  EcheanceExceptionnelle, LigneBudget, ObjectifEpargne, Provision, RevenuRecurrent,
} from '@budget/core/src/types.ts';

/**
 * Construction de la `Configuration` du moteur à partir de Supabase.
 *
 * La forme de l'objet ne change pas d'un iota par rapport à la fixture :
 * c'est précisément pour cela que `Configuration` est défini dans le moteur
 * et non dans l'application. Brancher la base n'a donc demandé aucune
 * modification des écrans ni du moteur.
 *
 * OFFLINE : la configuration chargée est mise en cache dans Dexie. Au
 * lancement suivant, elle est lue depuis le cache — l'application démarre
 * complètement sans réseau, et se rafraîchit en arrière-plan.
 */

const CLE_CACHE = 'configuration';

/** Convertit un entier possiblement `null` sans jamais fabriquer un 0. */
const centimes = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

const requis = (v: unknown): number => Number(v);

type Ligne = Record<string, unknown>;

function versConfiguration(d: {
  profil: Ligne;
  comptes: Ligne[];
  categories: Ligne[];
  revenus: Ligne[];
  charges: Ligne[];
  provisions: Ligne[];
  echeances: Ligne[];
  objectifs: Ligne[];
  credits: Ligne[];
  budgets: Ligne[];
  reglageFonds: Ligne | null;
}): Configuration {
  const comptes: Compte[] = d.comptes.map((c) => ({
    id: c.id as string,
    nom: c.name as string,
    type: c.type as Compte['type'],
    solde: centimes(c.balance_cents),
    soldeDate: (c.balance_as_of as string | null) ?? null,
    soldeSource: (c.balance_source as Compte['soldeSource']) ?? null,
    soldeImporteLe: (c.balance_imported_at as string | null) ?? null,
  }));

  const categories: Categorie[] = d.categories.map((c) => ({
    id: c.id as string,
    nom: c.name as string,
    nature: c.nature as Categorie['nature'],
    criticite: (c.criticality as Categorie['criticite']) ?? undefined,
  }));

  const revenus: RevenuRecurrent[] = d.revenus.map((r) => ({
    id: r.id as string,
    nom: r.name as string,
    montant: requis(r.amount_cents),
    jour: r.day_of_month === null ? null : Number(r.day_of_month),
  }));

  const charges: ChargeRecurrente[] = d.charges.map((c) => ({
    id: c.id as string,
    nom: c.name as string,
    montant: requis(c.amount_cents),
    jour: c.day_of_month === null ? null : Number(c.day_of_month),
    categorieId: c.category_id as string,
    moisExclus: (c.excluded_months as number[] | null) ?? undefined,
    debut: c.starts_on ? (c.starts_on as string).slice(0, 7) : undefined,
    fin: c.ends_on ? (c.ends_on as string).slice(0, 7) : undefined,
  }));

  const provisions: Provision[] = d.provisions.map((p) => ({
    id: p.id as string,
    nom: p.name as string,
    montantAnnuel: requis(p.annual_amount_cents),
    montantEstime: Boolean(p.amount_is_estimate),
    dotationMensuelle: requis(p.monthly_amount_cents),
    prochaineEcheance: (p.next_due_date as string | null) ?? null,
    montantProvisionne: centimes(p.provisioned_cents),
    jourDotation: p.day_of_transfer === null ? null : Number(p.day_of_transfer),
  }));

  const echeancesExceptionnelles: EcheanceExceptionnelle[] = d.echeances.map((e) => ({
    id: e.id as string,
    nom: e.name as string,
    montant: requis(e.amount_cents),
    montantEstime: Boolean(e.amount_is_estimate),
    dateEcheance: (e.due_date as string | null) ?? null,
    dejaProvisionne: centimes(e.already_set_aside_cents),
    note: (e.note as string | null) ?? undefined,
  }));

  const objectifsEpargne: ObjectifEpargne[] = d.objectifs.map((o) => ({
    id: o.id as string,
    nom: o.name as string,
    type: o.type as ObjectifEpargne['type'],
    objectifTotal: centimes(o.target_cents),
    montantActuel: centimes(o.current_amount_cents),
    versementMensuelCible: requis(o.monthly_target_cents),
    priorite: Number(o.priority),
  }));

  // Un prêt sans capital restant connu ne produit PAS d'objet Credit :
  // aucun tableau d'amortissement ni intérêt ne doit être extrapolé.
  const credits: Credit[] = d.credits
    .filter((c) => c.remaining_principal_cents !== null && c.annual_rate !== null)
    .map((c) => ({
      id: c.id as string,
      nom: c.name as string,
      organisme: (c.lender as string | null) ?? undefined,
      capitalInitial: centimes(c.initial_principal_cents) ?? undefined,
      capitalRestant: requis(c.remaining_principal_cents),
      mensualite: requis(c.monthly_payment_cents),
      assuranceMensuelle: centimes(c.insurance_monthly_cents) ?? undefined,
      tauxAnnuel: Number(c.annual_rate),
      dateFinPrevue: (c.end_date as string | null) ?? undefined,
    }));

  const budgetVariable: LigneBudget[] = d.budgets.map((b) => ({
    categorieId: b.category_id as string,
    montantPrevu: requis(b.planned_cents),
  }));

  const rf = d.reglageFonds;
  const reglageFondUrgence: Configuration['reglageFondUrgence'] =
    rf && rf.mode === 'manuel'
      ? { mode: 'manuel', montant: requis(rf.manual_target_cents) }
      : {
          mode: (rf?.mode as 'depenses_essentielles' | 'revenus') ?? 'depenses_essentielles',
          nombreDeMois: rf ? Number(rf.months_count) : 3,
          inclureSemiEssentielles: Boolean(rf?.include_semi_essential),
          periodeReference:
            rf?.reference_year && rf?.reference_month
              ? `${rf.reference_year}-${String(rf.reference_month).padStart(2, '0')}`
              : undefined,
        };

  return {
    comptes,
    categories,
    revenus,
    charges,
    provisions,
    echeancesExceptionnelles,
    objectifsEpargne,
    credits,
    budgetVariable,
    reglageFondUrgence,
    reglageTresorerie: { seuilSecurite: requis(d.profil.safety_buffer_cents) },
    reglageEpargne: {
      objectif: requis(d.profil.savings_target_cents),
      plafondsManuels: (d.profil.savings_manual_caps as Configuration['reglageEpargne']['plafondsManuels']) ?? [],
    },
    parametresAConfirmer: (d.profil.pending_parameters as string[]) ?? [],
  };
}

/** Configuration en cache local. Disponible hors ligne dès le second lancement. */
export async function configurationLocale(): Promise<Configuration | null> {
  return lireMeta<Configuration | null>(CLE_CACHE, null);
}

/**
 * Charge la configuration depuis Supabase pour une période donnée
 * (les enveloppes variables sont propres au mois) et la met en cache.
 */
export async function chargerConfiguration(periode: string): Promise<Configuration | null> {
  const supabase = await obtenirSupabase();
  if (!supabase || !navigator.onLine) return null;

  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return null;

  const [annee, mois] = periode.split('-').map(Number);

  const vivant = <T,>(q: T) => (q as { is: (a: string, b: null) => T }).is('deleted_at', null);

  const [profil, comptes, categories, revenus, charges, provisions, echeances, objectifs, credits, periodes, reglageFonds] =
    await Promise.all([
      supabase.from('users').select('*').eq('id', userId).single(),
      vivant(supabase.from('accounts').select('*')),
      vivant(supabase.from('categories').select('*')),
      // Un revenu ou une charge désactivé sort de la Configuration : le
      // moteur n'a pas besoin de connaître la notion d'activation.
      vivant(supabase.from('recurring_incomes').select('*')).eq('is_active', true),
      vivant(supabase.from('recurring_expenses').select('*')).eq('is_active', true),
      vivant(supabase.from('annual_provisions').select('*')),
      vivant(supabase.from('one_off_liabilities').select('*')),
      vivant(supabase.from('savings_goals').select('*')),
      vivant(supabase.from('loans').select('*')),
      supabase.from('budget_periods').select('id').eq('year', annee).eq('month', mois).maybeSingle(),
      supabase.from('emergency_fund_settings').select('*').eq('user_id', userId).maybeSingle(),
    ]);

  if (profil.error || !profil.data) return null;

  let budgets: Ligne[] = [];
  if (periodes.data?.id) {
    const { data } = await supabase
      .from('budgets')
      .select('category_id, planned_cents')
      .eq('period_id', periodes.data.id);
    budgets = (data ?? []) as Ligne[];
  }

  const config = versConfiguration({
    profil: profil.data as Ligne,
    comptes: (comptes.data ?? []) as Ligne[],
    categories: (categories.data ?? []) as Ligne[],
    revenus: (revenus.data ?? []) as Ligne[],
    charges: (charges.data ?? []) as Ligne[],
    provisions: (provisions.data ?? []) as Ligne[],
    echeances: (echeances.data ?? []) as Ligne[],
    objectifs: (objectifs.data ?? []) as Ligne[],
    credits: (credits.data ?? []) as Ligne[],
    budgets,
    reglageFonds: (reglageFonds.data as Ligne | null) ?? null,
  });

  await ecrireMeta(CLE_CACHE, config);
  return config;
}

/**
 * Configuration de repli utilisée tant qu'aucune donnée distante n'a été
 * chargée : la fixture validée du moteur. Elle porte les vraies valeurs
 * budgétaires du foyer, y compris tous les `null` des données inconnues.
 */
export const configurationParDefaut = foyer2026;

/**
 * Met à jour le SOLDE RÉEL d'un compte, localement puis à distance —
 * jamais recalculé depuis les transactions : c'est le relevé (ou une
 * saisie manuelle) qui fait foi. `source` trace d'où vient cette valeur
 * (import PDF/CSV/Google Sheet, ou 'manual' par défaut) ; l'horodatage de
 * l'enregistrement est posé automatiquement.
 */
export async function definirSoldeCompte(
  compteId: string,
  soldeCents: number | null,
  dateISO: string,
  source: Compte['soldeSource'] = 'manual',
): Promise<void> {
  const importeLe = soldeCents === null ? null : new Date().toISOString();
  const config = await configurationLocale();
  if (config) {
    await ecrireMeta(CLE_CACHE, {
      ...config,
      comptes: config.comptes.map((c) =>
        c.id === compteId
          ? { ...c, solde: soldeCents, soldeDate: soldeCents === null ? null : dateISO, soldeSource: source, soldeImporteLe: importeLe }
          : c,
      ),
    });
  }
  const supabase = await obtenirSupabase();
  if (!supabase || !navigator.onLine) return;
  await supabase
    .from('accounts')
    .update({
      balance_cents: soldeCents,
      balance_as_of: soldeCents === null ? null : dateISO,
      balance_source: soldeCents === null ? null : source,
      balance_imported_at: importeLe,
    })
    .eq('id', compteId);
}

/** Met à jour le solde constitué d'un objectif d'épargne. */
export async function definirSoldeObjectif(
  objectifId: string,
  soldeCents: number | null,
  dateISO: string,
): Promise<void> {
  const config = await configurationLocale();
  if (config) {
    await ecrireMeta(CLE_CACHE, {
      ...config,
      objectifsEpargne: config.objectifsEpargne.map((o) =>
        o.id === objectifId ? { ...o, montantActuel: soldeCents } : o,
      ),
    });
  }
  const supabase = await obtenirSupabase();
  if (!supabase || !navigator.onLine) return;
  await supabase
    .from('savings_goals')
    .update({
      current_amount_cents: soldeCents,
      current_amount_as_of: soldeCents === null ? null : dateISO,
    })
    .eq('id', objectifId);
}

export async function viderCacheConfiguration(): Promise<void> {
  await db.meta.delete(CLE_CACHE);
}

/**
 * Corrige le cache local sans repasser par Supabase — pour qu'une écriture
 * qui vient de réussir à distance (catégorie créée, règle modifiée...) soit
 * visible immédiatement, sans attendre le prochain `chargerConfiguration`
 * (réseau) ou un remontage complet de l'application. Sans effet si rien
 * n'est encore en cache (le prochain chargement distant l'inclura).
 */
export async function patcherCacheConfiguration(
  corriger: (c: Configuration) => Configuration,
): Promise<void> {
  const cache = await configurationLocale();
  if (cache) await ecrireMeta(CLE_CACHE, corriger(cache));
}
