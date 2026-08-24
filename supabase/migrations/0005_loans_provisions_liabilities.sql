-- =====================================================================
-- 0005 — Crédits, charges récurrentes, provisions, dettes ponctuelles
-- =====================================================================

create table public.loans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  category_id   uuid references public.categories (id) on delete set null,
  name          text not null,
  lender        text,

  initial_principal_cents   bigint check (initial_principal_cents is null or initial_principal_cents > 0),
  -- NULL = capital restant INCONNU (cas du prêt immobilier et du prêt cuisine).
  -- Tant qu'il l'est, aucun tableau d'amortissement n'est calculable.
  remaining_principal_cents bigint check (remaining_principal_cents is null or remaining_principal_cents >= 0),
  remaining_principal_as_of date,

  monthly_payment_cents bigint not null check (monthly_payment_cents > 0),
  insurance_monthly_cents bigint check (insurance_monthly_cents is null or insurance_monthly_cents >= 0),
  -- Taux annuel nominal : 0.0593 pour 5,93 %. NULL = inconnu.
  annual_rate   numeric(6, 5) check (annual_rate is null or (annual_rate >= 0 and annual_rate < 1)),

  start_date    date,
  end_date      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint loans_principal_needs_date
    check ((remaining_principal_cents is null) = (remaining_principal_as_of is null)),
  constraint loans_dates_ordered
    check (start_date is null or end_date is null or end_date >= start_date)
);

comment on column public.loans.remaining_principal_cents is
  'Centimes. NULL = inconnu. Ne JAMAIS le déduire de la mensualité : '
  'celle-ci inclut des intérêts.';

create table public.loan_payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  loan_id         uuid not null references public.loans (id) on delete cascade,
  due_on          date not null,
  amount_cents    bigint not null check (amount_cents > 0),
  principal_cents bigint check (principal_cents is null or principal_cents >= 0),
  interest_cents  bigint check (interest_cents is null or interest_cents >= 0),
  transaction_id  uuid references public.transactions (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (loan_id, due_on)
);

-- ---------------------------------------------------------------------

create table public.recurring_expenses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  category_id   uuid not null references public.categories (id) on delete restrict,
  name          text not null,
  amount_cents  bigint not null check (amount_cents > 0),
  -- NULL = jour de prélèvement INCONNU. La charge est alors comptée comme
  -- restant à décaisser (hypothèse prudente côté moteur).
  day_of_month  smallint check (day_of_month is null or day_of_month between 1 and 31),
  -- Mois (1-12) où la charge n'est PAS prélevée. Tableau vide = 12 mois.
  -- NULL = calendrier non confirmé (cas de l'impôt sur le revenu).
  excluded_months smallint[],
  starts_on     date,
  ends_on       date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint recurring_expenses_dates_ordered
    check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

comment on column public.recurring_expenses.excluded_months is
  'NULL = calendrier non confirmé (ne pas supposer 12 mois). '
  'Tableau vide = confirmé sur 12 mois. Ex. impôt sur 10 mois : {8,9}.';

-- ---------------------------------------------------------------------
-- Provisions : charges annuelles FUTURES, lissées mensuellement.
-- ---------------------------------------------------------------------

create table public.annual_provisions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users (id) on delete cascade,
  account_id          uuid references public.accounts (id) on delete set null,
  name                text not null,
  annual_amount_cents bigint not null check (annual_amount_cents > 0),
  -- true quand le montant annuel n'est qu'une estimation.
  amount_is_estimate  boolean not null default false,
  monthly_amount_cents bigint not null check (monthly_amount_cents >= 0),
  -- NULL = date d'échéance INCONNUE : la couverture reste indéterminée,
  -- jamais présumée suffisante.
  next_due_date       date,
  -- NULL = montant déjà provisionné INCONNU.
  provisioned_cents   bigint check (provisioned_cents is null or provisioned_cents >= 0),
  provisioned_as_of   date,
  day_of_transfer     smallint check (day_of_transfer is null or day_of_transfer between 1 and 31),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  constraint annual_provisions_amount_needs_date
    check ((provisioned_cents is null) = (provisioned_as_of is null))
);

comment on table public.annual_provisions is
  'Charges annuelles FUTURES lissées. À ne pas confondre avec '
  'one_off_liabilities : une provision se constitue, une dette se finance.';

create table public.provision_movements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  provision_id  uuid not null references public.annual_provisions (id) on delete cascade,
  transaction_id uuid references public.transactions (id) on delete set null,
  occurred_on   date not null,
  amount_cents  bigint not null check (amount_cents > 0),
  direction     text not null check (direction in ('dotation', 'utilisation')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Dettes ponctuelles : sommes dues qui n'ont PAS pu être provisionnées.
-- ---------------------------------------------------------------------

create table public.one_off_liabilities (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users (id) on delete cascade,
  name                text not null,
  amount_cents        bigint not null check (amount_cents > 0),
  amount_is_estimate  boolean not null default false,
  -- NULL = date INCONNUE. Ne jamais présumer un mois de rattachement.
  due_date            date,
  -- NULL = montant déjà mis de côté INCONNU. Le reste à décaisser est
  -- alors indisponible et les scénarios sont chiffrés sur une borne haute.
  already_set_aside_cents bigint check (already_set_aside_cents is null or already_set_aside_cents >= 0),
  already_set_aside_as_of  date,
  -- Contexte affiché tel quel (contraintes de calendrier, démarches).
  note                text,
  settled_at          date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  constraint one_off_liabilities_aside_needs_date
    check ((already_set_aside_cents is null) = (already_set_aside_as_of is null))
);

comment on table public.one_off_liabilities is
  'Échéances exceptionnelles (ex. taxe foncière 2026). Distinctes des '
  'provisions : les confondre produirait une dotation mensuelle irréaliste.';

select app.attach_updated_at('public.loans');
select app.attach_updated_at('public.loan_payments');
select app.attach_updated_at('public.recurring_expenses');
select app.attach_updated_at('public.annual_provisions');
select app.attach_updated_at('public.provision_movements');
select app.attach_updated_at('public.one_off_liabilities');
