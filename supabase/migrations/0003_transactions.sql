-- =====================================================================
-- 0003 — Transactions
-- =====================================================================

create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  account_id    uuid not null references public.accounts (id) on delete restrict,
  -- Renseigné uniquement pour les virements (épargne, provisions).
  destination_account_id uuid references public.accounts (id) on delete restrict,
  category_id   uuid references public.categories (id) on delete set null,

  occurred_on   date not null,
  -- TOUJOURS POSITIF : le sens est porté par `type`, comme dans le moteur.
  amount_cents  bigint not null check (amount_cents > 0),
  type          app.transaction_type not null,
  status        app.transaction_status not null default 'pending',
  source        app.transaction_source not null default 'manual',

  description   text,
  merchant      text,
  -- Libellé brut du relevé, utile aux règles de catégorisation.
  raw_label     text,

  -- Identifiant fourni par la source (banque, ligne de fichier importé).
  external_id   text,
  import_job_id uuid,
  -- Empreinte de déduplication : sha256(date | montant | libellé normalisé).
  dedup_hash    text,
  -- Renseigné quand la transaction est reconnue comme doublon d'une autre.
  duplicate_of_id uuid references public.transactions (id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint transactions_transfer_needs_destination
    check (type <> 'transfert' or destination_account_id is not null),
  constraint transactions_no_self_transfer
    check (destination_account_id is null or destination_account_id <> account_id),
  constraint transactions_no_self_duplicate
    check (duplicate_of_id is null or duplicate_of_id <> id)
);

-- IDEMPOTENCE DES IMPORTS : une même ligne source ne peut entrer qu'une fois.
-- Contrainte posée sur (user_id, source, external_id) et non sur le hash,
-- car deux dépenses réellement identiques le même jour sont légitimes.
create unique index transactions_source_external_unique
  on public.transactions (user_id, source, external_id)
  where external_id is not null and deleted_at is null;

-- Le hash sert à SUGGÉRER des doublons, jamais à les rejeter d'office.
create index transactions_dedup_idx
  on public.transactions (user_id, dedup_hash)
  where dedup_hash is not null and deleted_at is null;

create index transactions_period_idx
  on public.transactions (user_id, occurred_on desc)
  where deleted_at is null;

create index transactions_category_idx
  on public.transactions (user_id, category_id, occurred_on desc)
  where deleted_at is null;

create index transactions_pending_idx
  on public.transactions (user_id, status)
  where status = 'pending' and deleted_at is null;

select app.attach_updated_at('public.transactions');

comment on constraint transactions_transfer_needs_destination on public.transactions is
  'Un virement sans compte de destination serait une fuite comptable.';
