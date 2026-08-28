import { obtenirSupabase } from './supabase.ts';
import { HorsLigne } from '../db/configuration.ts';

/**
 * RGPD : consentement, export, suppression de compte.
 *
 * Toute lecture/écriture ici passe par la session de l'UTILISATEUR
 * (`obtenirSupabase()`, clé `anon` + RLS) — jamais une clé de service :
 * personne ne peut obtenir par ce chemin plus que ce qu'il voit déjà à
 * l'écran.
 */

/** Toutes les tables applicatives scopées par utilisateur. À TENIR À JOUR : voir `exporterMesDonnees`. */
const TABLES_EXPORT = [
  'users', 'accounts', 'categories', 'transactions', 'budget_periods', 'budgets',
  'savings_goals', 'savings_transactions', 'loans', 'recurring_expenses',
  'annual_provisions', 'one_off_liabilities', 'recurring_incomes',
  'categorization_rules', 'workspaces', 'workspace_members', 'consent_logs',
] as const;

export interface ExportDonnees {
  exporteLe: string;
  contenu: Record<string, unknown>;
}

/**
 * Export complet (RGPD art. 15 et 20) : une table refusée (droit,
 * réseau...) n'interrompt jamais l'export entier — le demandeur reçoit le
 * reste et SAIT ce qui manque, plutôt qu'un échec total silencieux.
 */
export async function exporterMesDonnees(): Promise<ExportDonnees> {
  const supabase = await obtenirSupabase();
  if (!supabase) throw new HorsLigne();

  const contenu: Record<string, unknown> = {};
  for (const table of TABLES_EXPORT) {
    const { data, error } = await supabase.from(table).select('*');
    contenu[table] = error ? { non_communique: error.message } : (data ?? []);
  }

  return { exporteLe: new Date().toISOString(), contenu };
}

/**
 * Journalise un consentement (CGU, confidentialité...) — jamais ré-écrit
 * ni supprimé ensuite (voir la table `consent_logs`, immuable).
 */
export async function journaliserConsentement(
  consentKind: string,
  version: string,
  granted: boolean,
): Promise<void> {
  const supabase = await obtenirSupabase();
  if (!supabase) throw new HorsLigne();
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Session absente.');

  const { error } = await supabase.from('consent_logs').insert({
    user_id: userId,
    consent_kind: consentKind,
    version,
    granted,
  });
  if (error) throw new Error(error.message);
}

/**
 * Droit à l'effacement (RGPD art. 17). Appelle `delete_my_account()`
 * (fonction serveur, `SECURITY DEFINER` restreinte à `auth.uid()` —
 * jamais un id transmis par le client). Ne clôt PAS la session : c'est à
 * l'appelant de le faire ensuite (voir `useSession().deconnecter`), une
 * fois la suppression confirmée.
 */
export async function supprimerMonCompte(): Promise<void> {
  const supabase = await obtenirSupabase();
  if (!supabase) throw new HorsLigne();
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw new Error(error.message);
}
