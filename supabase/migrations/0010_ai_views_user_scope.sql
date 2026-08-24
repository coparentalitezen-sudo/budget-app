-- =====================================================================
-- 0010 — Portée utilisateur explicite dans les vues d'assistance
-- =====================================================================
-- Les vues `v_ai_*` sont consommées par l'API d'assistance, qui s'authentifie
-- par un jeton de service et NON par une session utilisateur : `auth.uid()`
-- y vaut donc NULL et `security_invoker` ne peut rien filtrer.
--
-- La colonne `user_id` est ajoutée pour que l'API applique elle-même un
-- filtre explicite. Sans cela, une base devenue multi-utilisateurs
-- exposerait tout à travers l'API. Le filtre applicatif et la RLS sont deux
-- barrières distinctes, et l'on veut les deux.
-- =====================================================================

drop view if exists public.v_ai_categories;
drop view if exists public.v_ai_accounts;
drop view if exists public.v_ai_transactions;
drop view if exists public.v_ai_loans;
drop view if exists public.v_ai_budget_summary;

create view public.v_ai_categories with (security_invoker = true) as
select user_id, id, name, nature, criticality, parent_id
from public.categories
where deleted_at is null;

create view public.v_ai_accounts with (security_invoker = true) as
select user_id, id, name, type, balance_cents, balance_as_of, is_active
from public.accounts
where deleted_at is null;

create view public.v_ai_transactions with (security_invoker = true) as
select
  t.user_id, t.id, t.occurred_on, t.amount_cents, t.type, t.status, t.source,
  t.category_id, c.name as category_name, t.account_id, t.description, t.merchant
from public.transactions t
left join public.categories c on c.id = t.category_id
where t.deleted_at is null;

create view public.v_ai_loans with (security_invoker = true) as
select
  user_id, id, name, lender,
  initial_principal_cents, remaining_principal_cents, remaining_principal_as_of,
  monthly_payment_cents, insurance_monthly_cents, annual_rate, start_date, end_date
from public.loans
where deleted_at is null;

-- Agrégat mensuel. Les montants NULL restent NULL : la vue ne comble aucune
-- inconnue. Les calculs budgétaires font autorité dans @budget/core, pas ici.
create view public.v_ai_budget_summary with (security_invoker = true) as
select
  p.user_id,
  p.year,
  p.month,
  p.is_closed,
  coalesce(sum(b.planned_cents), 0) as planned_total_cents,
  (
    select coalesce(sum(t.amount_cents), 0)
    from public.transactions t
    join public.categories c on c.id = t.category_id
    where t.user_id = p.user_id
      and c.nature = 'variable'
      and t.type in ('depense', 'facture')
      and t.deleted_at is null
      and extract(year from t.occurred_on) = p.year
      and extract(month from t.occurred_on) = p.month
  ) as variable_spent_cents
from public.budget_periods p
left join public.budgets b on b.period_id = p.id
group by p.id, p.user_id, p.year, p.month, p.is_closed;

comment on view public.v_ai_budget_summary is
  'Agrégat de lecture pour diagnostic. Ne pilote rien : les règles de calcul '
  'restent dans @budget/core.';
