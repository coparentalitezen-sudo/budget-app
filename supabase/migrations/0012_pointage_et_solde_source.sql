-- Pointage bancaire (rapprochement) et traçabilité du solde réel d'un compte.
--
-- POINTAGE : une transaction est « pointée » une fois retrouvée sur un
-- relevé bancaire importé. `pointed_at` suit le même principe que
-- `deleted_at` (NULL = état par défaut, non NULL = horodatage de
-- l'évènement) plutôt qu'un champ texte séparé — un seul fait, un seul
-- horodatage, jamais deux colonnes qui pourraient se contredire.
--
-- Une transaction importée (source ≠ 'manual') est pointée PAR
-- DÉFINITION : elle vient du relevé. Une transaction saisie à la main ne
-- l'est qu'une fois rapprochée d'un import ultérieur. Le correctif
-- rétroactif ci-dessous applique cette règle aux transactions déjà en
-- base, sans quoi elles apparaîtraient toutes comme « à pointer » alors
-- que la plupart le sont déjà de fait.
alter table public.transactions
  add column pointed_at timestamptz;

update public.transactions
set pointed_at = coalesce(updated_at, created_at, now())
where source <> 'manual' and pointed_at is null;

-- SOLDE RÉEL : d'où vient le solde connu d'un compte, et quand il a été
-- enregistré dans l'application — distinct de `balance_as_of`, qui est la
-- date DU RELEVÉ (le solde peut être saisi longtemps après cette date).
alter table public.accounts
  add column balance_source app.transaction_source,
  add column balance_imported_at timestamptz;

-- Un solde déjà renseigné avant cette migration n'a pas de source connue
-- avec certitude : 'manual' est la valeur la plus sûre par défaut (elle ne
-- prétend pas venir d'un import qui n'a peut-être jamais eu lieu).
update public.accounts
set balance_source = 'manual', balance_imported_at = coalesce(updated_at, created_at, now())
where balance_cents is not null and balance_source is null;

comment on column public.transactions.pointed_at is
  'NULL = non pointée (voir la règle « inconnu ≠ zéro » : jamais un booléen '
  'à faux par défaut sans distinction). Non NULL = horodatage du pointage, '
  'automatique (import rapproché) ou manuel.';
comment on column public.accounts.balance_source is
  'D''où vient balance_cents : import PDF/CSV/Google Sheet, ou saisie manuelle. '
  'NULL seulement si balance_cents l''est aussi.';
comment on column public.accounts.balance_imported_at is
  'Quand balance_cents a été enregistré dans l''application — distinct de '
  'balance_as_of, la date DU RELEVÉ (souvent antérieure).';
