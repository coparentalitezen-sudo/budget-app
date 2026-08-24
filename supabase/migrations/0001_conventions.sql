-- =====================================================================
-- 0001 — Conventions transverses
-- =====================================================================
-- Règles appliquées à TOUT le schéma :
--
--  1. Les montants sont des BIGINT en CENTIMES. Jamais NUMERIC, jamais
--     FLOAT : le moteur @budget/core travaille en centimes entiers et la
--     base doit refléter exactement le même modèle.
--
--  2. INCONNU ≠ ZÉRO. Une donnée financière non connue est NULL. Les
--     colonnes concernées sont explicitement NULLABLE et documentées.
--     Aucune n'a de DEFAULT 0 — ce serait fabriquer une information.
--
--  3. Les identifiants sont des UUID générés CÔTÉ CLIENT (mode hors ligne).
--     Le DEFAULT n'est qu'un filet de sécurité pour les insertions serveur.
--
--  4. Suppression logique via deleted_at : la synchronisation offline doit
--     pouvoir propager une suppression sans perdre l'historique.
--
--  5. updated_at sert d'arbitre de conflit (last-write-wins) lors de la
--     synchronisation. Il est maintenu par trigger, jamais par le client.
-- =====================================================================

create schema if not exists app;

-- Horodatage automatique, source de vérité pour la résolution de conflits.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.set_updated_at() is
  'Maintient updated_at côté serveur. Le client ne doit jamais le fixer : '
  'il sert d''arbitre last-write-wins à la synchronisation offline.';

-- Applique le trigger de manière homogène.
create or replace function app.attach_updated_at(target_table regclass)
returns void
language plpgsql
as $$
declare
  trigger_name text := 'set_updated_at_' || replace(target_table::text, '.', '_');
begin
  execute format(
    'create trigger %I before update on %s for each row execute function app.set_updated_at()',
    trigger_name, target_table
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Types énumérés — miroirs exacts des types de @budget/core
-- ---------------------------------------------------------------------

create type app.account_type as enum ('courant', 'provisions', 'epargne');

create type app.category_nature as enum ('fixe', 'variable', 'provision', 'epargne');

-- Criticité pour le calcul « N mois de dépenses essentielles ».
-- Volontairement NULLABLE en base : une catégorie non classée est exclue
-- du calcul ET signalée, elle n'est jamais présumée non essentielle.
create type app.category_criticality as enum (
  'essentielle', 'semi_essentielle', 'non_essentielle'
);

create type app.transaction_type as enum (
  'revenu', 'depense', 'facture', 'remboursement',
  'epargne', 'reprise_epargne', 'transfert'
);

create type app.transaction_source as enum (
  'manual', 'csv_import', 'pdf_import', 'bank_api', 'google_sheet_import'
);

create type app.transaction_status as enum ('pending', 'validated');

create type app.savings_goal_type as enum ('urgence', 'vacances', 'autre');

create type app.emergency_fund_mode as enum (
  'depenses_essentielles', 'revenus', 'manuel'
);

create type app.import_job_status as enum (
  'pending', 'running', 'succeeded', 'failed', 'cancelled'
);

create type app.bank_connection_status as enum (
  'active', 'expired', 'revoked', 'error'
);
