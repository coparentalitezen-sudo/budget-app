-- =====================================================================
-- 0009 — Revenus récurrents et réglages utilisateur
-- =====================================================================
-- Lacune constatée en branchant l'application : le schéma modélisait les
-- charges récurrentes (`recurring_expenses`) mais pas les revenus, alors
-- que `Configuration.revenus` existe dans le moteur depuis le début.
-- Migration ADDITIVE : aucune table existante n'est modifiée dans sa
-- structure, seules des colonnes sont ajoutées à `public.users`.
-- =====================================================================

create table public.recurring_incomes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  name          text not null,
  amount_cents  bigint not null check (amount_cents > 0),
  -- NULL = jour de versement INCONNU. Le revenu est alors exclu des
  -- encaissements à venir (hypothèse prudente côté moteur).
  day_of_month  smallint check (day_of_month is null or day_of_month between 1 and 31),
  starts_on     date,
  ends_on       date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint recurring_incomes_dates_ordered
    check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

comment on column public.recurring_incomes.day_of_month is
  'NULL = inconnu. Ne jamais supposer une date de versement : la projection '
  'de trésorerie exclut alors ce revenu des rentrées à venir.';

create index recurring_incomes_user_idx
  on public.recurring_incomes (user_id) where deleted_at is null;

-- ---------------------------------------------------------------------
-- Réglages portés par le profil utilisateur
-- ---------------------------------------------------------------------

alter table public.users
  -- Objectif d'épargne THÉORIQUE. Ne descend jamais automatiquement au
  -- niveau de la capacité du mois : c'est l'écart qui porte l'information.
  add column savings_target_cents bigint not null default 20000
    check (savings_target_cents >= 0),
  -- Plafonds de versement saisis manuellement, par période.
  -- Forme : [{"debut":"2026-09","fin":"2026-09","montant":1000}]
  add column savings_manual_caps jsonb not null default '[]'::jsonb,
  -- Données que l'utilisateur doit encore confirmer, affichées en alertes info.
  add column pending_parameters text[] not null default '{}';

comment on column public.users.savings_target_cents is
  'Objectif théorique en centimes. Constante métier, jamais recalculée.';

-- ---------------------------------------------------------------------
-- RLS sur la nouvelle table, à l'identique du reste du schéma.
-- ---------------------------------------------------------------------

alter table public.recurring_incomes enable row level security;
alter table public.recurring_incomes force row level security;

create policy recurring_incomes_owner_access on public.recurring_incomes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
