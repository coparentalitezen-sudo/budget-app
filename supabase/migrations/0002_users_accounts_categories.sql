-- =====================================================================
-- 0002 — Utilisateur, comptes, catégories
-- =====================================================================

-- Profil applicatif, 1-1 avec auth.users (géré par Supabase Auth).
-- Aucun mot de passe ni secret n'est stocké ici : l'authentification
-- reste entièrement du ressort de Supabase Auth.
create table public.users (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  locale        text not null default 'fr-FR',
  currency      char(3) not null default 'EUR',
  -- Matelas laissé sur le compte courant avant tout virement d'épargne.
  safety_buffer_cents bigint not null default 0
    check (safety_buffer_cents >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.users is
  'Profil applicatif. Ne contient aucun identifiant ni secret bancaire.';

-- ---------------------------------------------------------------------

create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  name        text not null,
  type        app.account_type not null,
  -- NULL = solde INCONNU. Surtout pas 0 : la différence est décisive
  -- pour les projections et les scénarios de financement.
  balance_cents      bigint,
  -- Date à laquelle le solde ci-dessus a été constaté.
  balance_as_of      date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  -- Un solde renseigné doit être daté : un solde sans date est invérifiable.
  constraint accounts_balance_needs_date
    check ((balance_cents is null) = (balance_as_of is null))
);

comment on column public.accounts.balance_cents is
  'Centimes. NULL = inconnu. Aucun DEFAULT 0 : voir règle « inconnu ≠ zéro ».';

create index accounts_user_idx on public.accounts (user_id) where deleted_at is null;

-- ---------------------------------------------------------------------

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  parent_id   uuid references public.categories (id) on delete set null,
  name        text not null,
  nature      app.category_nature not null,
  -- NULL = non classée. Exclue du calcul du fonds d'urgence ET signalée.
  criticality app.category_criticality,
  color       text,
  icon        text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint categories_no_self_parent check (parent_id is null or parent_id <> id)
);

comment on column public.categories.criticality is
  'NULL = non classée : exclue du calcul « dépenses essentielles » et signalée. '
  'Ne jamais interpréter NULL comme non_essentielle.';

create unique index categories_unique_name
  on public.categories (user_id, lower(name))
  where deleted_at is null;

create index categories_user_nature_idx on public.categories (user_id, nature);

select app.attach_updated_at('public.users');
select app.attach_updated_at('public.accounts');
select app.attach_updated_at('public.categories');
