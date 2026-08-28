-- =====================================================================
-- 0014 — Conformité : consentement et droit à l'effacement
-- =====================================================================
-- Socle RGPD minimal (voir le plan « App Starter », Phase 1) : le
-- consentement journalisé et la suppression de compte. La rédaction des
-- textes légaux eux-mêmes, l'adhésion à un médiateur de la consommation
-- et la relecture professionnelle restent hors du code — voir
-- apps/web/src/lib/legal.ts.
-- =====================================================================

create table public.consent_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  -- 'terms', 'privacy', 'marketing_email'... jamais une valeur devinée :
  -- c'est l'appelant qui déclare CE qu'il a fait accepter.
  consent_kind text not null,
  -- Version des textes acceptée (LEGAL_VERSION). Sans elle, impossible de
  -- savoir CE qui a été accepté si les textes changent plus tard.
  version      text not null,
  granted      boolean not null,
  -- Haché, jamais l'adresse IP en clair.
  ip_hash      text,
  created_at   timestamptz not null default now()
);

comment on table public.consent_logs is
  'Journal de consentement, IMMUABLE (aucune policy update/delete) : '
  'même le propriétaire ne peut pas réécrire un consentement déjà donné.';

alter table public.consent_logs enable row level security;
alter table public.consent_logs force row level security;

create policy consent_logs_owner_select on public.consent_logs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy consent_logs_owner_insert on public.consent_logs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Volontairement AUCUNE policy update/delete : un consentement journalisé
-- ne se corrige pas, il se complète par une nouvelle ligne (ex. un retrait).

revoke all on public.consent_logs from anon;

-- ---------------------------------------------------------------------
-- Droit à l'effacement (RGPD art. 17)
-- ---------------------------------------------------------------------
-- SECURITY DEFINER, mais restreint à `auth.uid()` — jamais un paramètre :
-- aucun appel, même mal formé côté client, ne peut cibler le compte d'un
-- autre. Les contraintes ON DELETE CASCADE déjà en place sur TOUTES les
-- tables applicatives (comptes, transactions, catégories, budgets,
-- espaces dont l'utilisateur est propriétaire...) suffisent : supprimer
-- la ligne `public.users` efface tout le reste d'un coup.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Session absente : suppression impossible.';
  end if;

  delete from public.users where id = v_uid;
  -- Termine aussi le compte d'authentification : sans cela, la personne
  -- pourrait se reconnecter sur un compte vidé de ses données.
  delete from auth.users where id = v_uid;
end;
$$;

comment on function public.delete_my_account() is
  'Droit à l''effacement (RGPD art. 17). Supprime le compte APPELANT '
  'uniquement (auth.uid()), jamais un id fourni en paramètre.';

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
