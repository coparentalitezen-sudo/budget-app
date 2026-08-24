-- =====================================================================
-- 0004 — Périodes budgétaires, enveloppes, épargne
-- =====================================================================

create table public.budget_periods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  year        smallint not null check (year between 2000 and 2200),
  month       smallint not null check (month between 1 and 12),
  is_closed   boolean not null default false,
  closed_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (user_id, year, month),
  constraint budget_periods_closed_consistency
    check (is_closed = (closed_at is not null))
);

create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  period_id     uuid not null references public.budget_periods (id) on delete cascade,
  category_id   uuid not null references public.categories (id) on delete cascade,
  planned_cents bigint not null check (planned_cents >= 0),
  -- Report éventuel du mois précédent (positif ou négatif).
  carryover_cents bigint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (period_id, category_id)
);

-- ---------------------------------------------------------------------
-- Épargne
-- ---------------------------------------------------------------------

create table public.savings_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  account_id  uuid references public.accounts (id) on delete set null,
  name        text not null,
  type        app.savings_goal_type not null,

  -- NULL pour le fonds d'urgence : sa cible est RECALCULÉE par le moteur
  -- à partir du mode retenu, jamais figée en base.
  target_cents bigint check (target_cents is null or target_cents > 0),
  -- NULL = solde constitué INCONNU. Ce n'est pas un fonds vide.
  current_amount_cents bigint check (current_amount_cents is null or current_amount_cents >= 0),
  current_amount_as_of date,

  monthly_target_cents bigint not null check (monthly_target_cents >= 0),
  priority     smallint not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint savings_goals_amount_needs_date
    check ((current_amount_cents is null) = (current_amount_as_of is null))
);

comment on column public.savings_goals.current_amount_cents is
  'Centimes. NULL = solde inconnu. Tant qu''il est NULL, reste à constituer, '
  'progression et date d''atteinte restent indisponibles côté moteur.';

comment on column public.savings_goals.target_cents is
  'NULL pour le fonds d''urgence : cible dérivée du mode de calcul, pas stockée.';

-- Réglage du mode de calcul de la cible du fonds d'urgence.
create table public.emergency_fund_settings (
  user_id           uuid primary key references public.users (id) on delete cascade,
  mode              app.emergency_fund_mode not null default 'depenses_essentielles',
  months_count      smallint check (months_count is null or months_count between 1 and 24),
  manual_target_cents bigint check (manual_target_cents is null or manual_target_cents > 0),
  include_semi_essential boolean not null default false,
  reference_year    smallint,
  reference_month   smallint check (reference_month is null or reference_month between 1 and 12),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Chaque mode exige ses propres paramètres, et interdit les autres.
  constraint emergency_fund_mode_params check (
    (mode = 'manuel'  and manual_target_cents is not null and months_count is null)
    or (mode <> 'manuel' and months_count is not null and manual_target_cents is null)
  )
);

create table public.savings_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  goal_id       uuid not null references public.savings_goals (id) on delete cascade,
  transaction_id uuid references public.transactions (id) on delete set null,
  occurred_on   date not null,
  amount_cents  bigint not null check (amount_cents > 0),
  -- 'versement' alimente, 'reprise' retire.
  direction     text not null check (direction in ('versement', 'reprise')),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index savings_transactions_goal_idx
  on public.savings_transactions (user_id, goal_id, occurred_on desc);

select app.attach_updated_at('public.budget_periods');
select app.attach_updated_at('public.budgets');
select app.attach_updated_at('public.savings_goals');
select app.attach_updated_at('public.emergency_fund_settings');
select app.attach_updated_at('public.savings_transactions');
