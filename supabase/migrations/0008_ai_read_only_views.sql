-- =====================================================================
-- 0008 — Vues restreintes pour l'assistance externe (lecture seule)
-- =====================================================================
-- Ces vues sont la SEULE surface exposée à une API d'assistance. Elles
-- excluent par construction :
--   - les libellés bruts de relevés (raw_label) ;
--   - les identifiants externes (external_id, provider_connection_id) ;
--   - toute donnée de connexion bancaire.
--
-- `security_invoker` fait que la RLS de l'utilisateur s'applique à travers
-- la vue : elle ne peut pas servir de contournement.
-- =====================================================================

create view public.v_ai_categories
with (security_invoker = true) as
select id, name, nature, criticality, parent_id
from public.categories
where deleted_at is null;

create view public.v_ai_accounts
with (security_invoker = true) as
select id, name, type, balance_cents, balance_as_of, is_active
from public.accounts
where deleted_at is null;

create view public.v_ai_transactions
with (security_invoker = true) as
select
  t.id,
  t.occurred_on,
  t.amount_cents,
  t.type,
  t.status,
  t.source,
  t.category_id,
  c.name as category_name,
  t.account_id,
  t.description,
  t.merchant
from public.transactions t
left join public.categories c on c.id = t.category_id
where t.deleted_at is null;

create view public.v_ai_loans
with (security_invoker = true) as
select
  id, name, lender,
  initial_principal_cents, remaining_principal_cents, remaining_principal_as_of,
  monthly_payment_cents, insurance_monthly_cents, annual_rate,
  start_date, end_date
from public.loans
where deleted_at is null;

-- Agrégat mensuel. Les montants NULL restent NULL : la vue ne comble
-- aucune inconnue, conformément à la règle « inconnu ≠ zéro ».
create view public.v_ai_budget_summary
with (security_invoker = true) as
select
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
  'Agrégat de lecture. Les calculs budgétaires font autorité dans '
  '@budget/core, pas ici : cette vue sert au diagnostic, pas au pilotage.';
