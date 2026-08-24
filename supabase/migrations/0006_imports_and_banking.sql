-- =====================================================================
-- 0006 — Imports, règles de catégorisation, connexions bancaires
-- =====================================================================

create table public.import_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  source        app.transaction_source not null,
  file_name     text,
  -- Empreinte du contenu importé : rejouer le même fichier ne recrée rien.
  file_hash     text,
  status        app.import_job_status not null default 'pending',
  rows_total    integer check (rows_total is null or rows_total >= 0),
  rows_imported integer check (rows_imported is null or rows_imported >= 0),
  rows_duplicate integer check (rows_duplicate is null or rows_duplicate >= 0),
  report        jsonb not null default '{}'::jsonb,
  error_message text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint import_jobs_rows_coherent
    check (rows_total is null or rows_imported is null or rows_imported <= rows_total),
  constraint import_jobs_failed_has_message
    check (status <> 'failed' or error_message is not null)
);

-- IDEMPOTENCE : le même fichier ne peut pas être importé deux fois avec succès.
create unique index import_jobs_file_hash_unique
  on public.import_jobs (user_id, file_hash)
  where file_hash is not null and status = 'succeeded';

alter table public.transactions
  add constraint transactions_import_job_fk
  foreign key (import_job_id) references public.import_jobs (id) on delete set null;

-- ---------------------------------------------------------------------

create table public.categorization_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  category_id   uuid not null references public.categories (id) on delete cascade,
  pattern       text not null,
  match_type    text not null default 'contains'
                  check (match_type in ('contains', 'exact', 'regex', 'starts_with')),
  priority      smallint not null default 100,
  -- true : la transaction est validée d'office ; false : elle reste pending.
  auto_validate boolean not null default false,
  hit_count     integer not null default 0 check (hit_count >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint categorization_rules_pattern_not_blank check (length(btrim(pattern)) > 0)
);

create unique index categorization_rules_unique
  on public.categorization_rules (user_id, match_type, lower(pattern));

create index categorization_rules_priority_idx
  on public.categorization_rules (user_id, priority)
  where is_active;

-- ---------------------------------------------------------------------
-- Open Banking — préparé, non requis pour le MVP.
-- ---------------------------------------------------------------------

create table public.bank_connections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  provider        text not null check (provider in ('powens', 'bridge')),
  -- Identifiant de connexion CHEZ LE PRESTATAIRE. Ce n'est pas un secret
  -- d'authentification : aucun identifiant ni mot de passe bancaire, aucun
  -- jeton d'accès ne doit JAMAIS être stocké dans cette base. Les jetons
  -- vivent exclusivement dans les secrets Supabase / variables Vercel.
  provider_connection_id text not null,
  institution_name text,
  status          app.bank_connection_status not null default 'active',
  last_synced_at  timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  unique (user_id, provider, provider_connection_id)
);

comment on table public.bank_connections is
  'AUCUN secret bancaire ici : ni identifiant, ni mot de passe, ni jeton. '
  'Uniquement des références opaques fournies par le prestataire.';

create table public.bank_sync_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  connection_id uuid not null references public.bank_connections (id) on delete cascade,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        app.import_job_status not null default 'pending',
  accounts_synced integer check (accounts_synced is null or accounts_synced >= 0),
  transactions_created integer check (transactions_created is null or transactions_created >= 0),
  error_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index bank_sync_logs_connection_idx
  on public.bank_sync_logs (user_id, connection_id, started_at desc);

select app.attach_updated_at('public.import_jobs');
select app.attach_updated_at('public.categorization_rules');
select app.attach_updated_at('public.bank_connections');
select app.attach_updated_at('public.bank_sync_logs');
