-- =====================================================================
-- 0013 — Fondation « workspace » (espace partagé)
-- =====================================================================
-- Première étape du modèle multi-utilisateur : un espace de données
-- partageable (ex. entre co-parents), sur le schéma déjà éprouvé de
-- `0007_rls.sql`. Volontairement MINIMAL pour cette phase :
--
--  - AUCUNE table existante n'est touchée. `transactions`, `accounts`,
--    `categories`... restent scopées par `user_id` comme aujourd'hui.
--    Les migrer vers `workspace_id`, et l'UI d'invitation qui va avec,
--    sont une phase distincte, pour quand un vrai besoin de partage se
--    présente — pas avant.
--  - Un compte mono-utilisateur crée son propre espace à l'inscription
--    et n'expose jamais d'invitation : le coût de cette fondation est
--    nul aujourd'hui, et la structure existe déjà le jour où le partage
--    est demandé.
--
-- Corrige au passage un écart déjà présent : `public.users` n'avait
-- aucun trigger de création automatique à l'inscription
-- (`chargerConfiguration` renvoyait déjà `null` faute de ligne).
-- =====================================================================

create type app.workspace_role as enum ('owner', 'member');

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references public.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  profile_id    uuid not null references public.users (id) on delete cascade,
  role          app.workspace_role not null default 'member',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint workspace_members_unique unique (workspace_id, profile_id)
);

comment on table public.workspaces is
  'Espace de données partageable. Un utilisateur mono-usage en a un seul, '
  'créé automatiquement à l''inscription (voir app.handle_new_user).';
comment on table public.workspace_members is
  'Appartenance à un espace. Contrairement aux autres tables, sa RLS ne '
  'peut pas être un simple "user_id = auth.uid()" : voir app.is_member.';

select app.attach_updated_at('public.workspaces');
select app.attach_updated_at('public.workspace_members');

-- ---------------------------------------------------------------------
-- Helpers SECURITY DEFINER
-- ---------------------------------------------------------------------
-- Nécessaires ici, contrairement au reste du schéma (voir l'avertissement
-- dans 0007_rls.sql) : une policy sur workspace_members qui s'appuierait
-- directement sur workspace_members pour vérifier l'appartenance
-- boucherait sur elle-même. `search_path` verrouillé : une fonction
-- SECURITY DEFINER qui ne le fixe pas est détournable en changeant le
-- search_path de l'appelant.

create or replace function app.is_member(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.profile_id = auth.uid()
      and m.deleted_at is null
  );
$$;

create or replace function app.member_role_in(p_workspace_id uuid)
returns app.workspace_role
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select m.role from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.profile_id = auth.uid()
    and m.deleted_at is null
  limit 1;
$$;

comment on function app.is_member(uuid) is
  'Vrai si l''utilisateur courant appartient à cet espace. SECURITY DEFINER '
  'pour éviter la boucle RLS sur workspace_members lui-même.';
comment on function app.member_role_in(uuid) is
  'Rôle de l''utilisateur courant dans cet espace, ou NULL s''il n''en est pas membre.';

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_members force row level security;

create policy workspaces_member_select on public.workspaces
  for select to authenticated
  using (app.is_member(id));

create policy workspaces_owner_insert on public.workspaces
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy workspaces_owner_update on public.workspaces
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy workspace_members_member_select on public.workspace_members
  for select to authenticated
  using (app.is_member(workspace_id));

create policy workspace_members_owner_insert on public.workspace_members
  for insert to authenticated
  with check (app.member_role_in(workspace_id) = 'owner');

create policy workspace_members_owner_update on public.workspace_members
  for update to authenticated
  using (app.member_role_in(workspace_id) = 'owner')
  with check (app.member_role_in(workspace_id) = 'owner');

-- ---------------------------------------------------------------------
-- Création automatique à l'inscription
-- ---------------------------------------------------------------------
-- SECURITY DEFINER : contourne délibérément la RLS ci-dessus (le tout
-- premier membre d'un espace ne peut par définition satisfaire une policy
-- qui exige déjà d'être membre). C'est le seul chemin d'écriture prévu
-- vers workspace_members tant qu'aucune UI d'invitation n'existe.

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  insert into public.users (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;

  insert into public.workspaces (id, name, owner_id)
  values (gen_random_uuid(), 'Mon espace', new.id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, profile_id, role)
  values (v_workspace_id, new.id, 'owner');

  return new;
end;
$$;

comment on function app.handle_new_user() is
  'Crée le profil applicatif et l''espace personnel d''un utilisateur à '
  'l''inscription. Corrige un écart préexistant : aucune ligne public.users '
  'n''était créée automatiquement avant cette migration.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------
-- `0007_rls.sql` révoque tout accès anonyme, mais seulement sur les
-- tables qui existaient à ce moment-là — une table créée après en hérite
-- des privilèges par défaut de Supabase (accordés à `anon` comme à
-- `authenticated`). RLS bloque déjà `anon` ici (aucune policy ne le
-- nomme), mais la même défense en profondeur que le reste du schéma
-- s'applique : ne pas laisser un GRANT ouvert dont seule la RLS empêche
-- l'usage.
revoke all on public.workspaces from anon;
revoke all on public.workspace_members from anon;
