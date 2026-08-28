-- =====================================================================
-- 0016 — Justificatifs : photo de ticket liée à une transaction
-- =====================================================================
-- Une transaction ne peut avoir qu'UN justificatif (v1) : le rattachement
-- rétroactif à une transaction déjà existante, et plusieurs photos par
-- transaction, sont hors scope pour l'instant.
-- =====================================================================

create table public.receipts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  storage_path   text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Un seul justificatif par transaction (v1).
  constraint receipts_transaction_unique unique (transaction_id)
);

select app.attach_updated_at('public.receipts');

alter table public.receipts enable row level security;
alter table public.receipts force row level security;

create policy receipts_owner_access on public.receipts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.receipts from anon;

-- ---------------------------------------------------------------------
-- Supabase Storage : bucket + policy sur storage.objects.
--
-- pglite (harness de test local, `node supabase/tests/run.mjs`) est un
-- Postgres nu SANS l'extension Storage : le schéma `storage` n'y existe
-- pas. Ce bloc est donc gardé par un `if exists`, pour que ce fichier
-- continue de rejouer proprement en local tout en posant la vraie policy
-- sur le projet Supabase réel, qui a toujours `storage.*` par défaut.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('justificatifs', 'justificatifs', false)
    on conflict (id) do nothing;

    -- Chemin objet : `{user_id}/{transaction_id}.jpg` — le premier segment
    -- du chemin PORTE l'identité, comme partout ailleurs (user_id = auth.uid()).
    execute $sql$
      create policy justificatifs_owner_access on storage.objects
        for all to authenticated
        using (bucket_id = 'justificatifs' and (storage.foldername(name))[1] = auth.uid()::text)
        with check (bucket_id = 'justificatifs' and (storage.foldername(name))[1] = auth.uid()::text)
    $sql$;
  end if;
end;
$$;
