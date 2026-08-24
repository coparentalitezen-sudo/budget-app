# DATABASE.md — Schéma Supabase

## Statut

Les 8 migrations sont **exécutées réellement** contre PostgreSQL à chaque
lancement de `npm run db:test` (PGlite, Postgres compilé en WebAssembly).
**33 vérifications**, dont l'isolation RLS entre deux utilisateurs distincts.
Ce n'est pas du SQL relu : c'est du SQL qui tourne.

```bash
npm install
npm run db:test
```

## Migrations

| Fichier | Contenu |
|---|---|
| `0001_conventions.sql` | Schéma `app`, trigger `updated_at`, types énumérés |
| `0002_users_accounts_categories.sql` | Profil, comptes, catégories |
| `0003_transactions.sql` | Transactions, déduplication, index |
| `0004_budget_savings.sql` | Périodes, enveloppes, objectifs d'épargne |
| `0005_loans_provisions_liabilities.sql` | Crédits, charges récurrentes, provisions, dettes ponctuelles |
| `0006_imports_and_banking.sql` | Imports idempotents, règles, Open Banking |
| `0007_rls.sql` | Row Level Security activée **et forcée** |
| `0008_ai_read_only_views.sql` | Vues restreintes pour l'assistance externe |

## Principes structurants

**Montants en BIGINT de centimes.** Jamais `NUMERIC`, jamais `FLOAT`. La base
reflète exactement le modèle de `@budget/core`.

**Inconnu ≠ zéro, imposé par le schéma.** Les colonnes financières
susceptibles d'être inconnues sont `NULL`-ables et **sans `DEFAULT`**. Un test
parcourt `information_schema` et échoue si un `DEFAULT 0` apparaît un jour sur
une colonne nullable en `_cents` ou en date.

Un couple valeur/date est vérifié par contrainte : un solde renseigné sans
date de constat est rejeté (`accounts_balance_needs_date`), car un solde non
daté est invérifiable.

**Provisions et dettes ponctuelles sont deux tables.** `annual_provisions`
prépare l'avenir, `one_off_liabilities` finance une échéance déjà proche. Les
confondre produirait une dotation mensuelle irréaliste — exactement le piège
de la taxe foncière 2026.

**`excluded_months` distingue trois états.** `NULL` = calendrier non confirmé,
`{}` = confirmé sur 12 mois, `{8,9}` = étalé sur 10 mois. Le cas de l'impôt
sur le revenu est ainsi représentable sans supposition.

**La cible du fonds d'urgence n'est pas stockée.** `savings_goals.target_cents`
reste `NULL` pour le fonds d'urgence : la cible est dérivée par le moteur à
partir de `emergency_fund_settings`, et suit l'évolution réelle des charges.

## Idempotence des imports

Deux mécanismes distincts, volontairement :

- **Unicité stricte** sur `(user_id, source, external_id)` : rejouer un import
  ne peut pas dupliquer une ligne source.
- **Empreinte indicative** `dedup_hash`, simplement indexée. Deux dépenses
  réellement identiques le même jour (deux cafés à 3,50 €) restent permises —
  une contrainte d'unicité sur le hash aurait rejeté des données légitimes.

`import_jobs` porte une unicité sur `(user_id, file_hash)` limitée aux imports
réussis : un fichier échoué peut être rejoué, un fichier réussi non.

## Sécurité

RLS **activée et forcée** sur les 19 tables, avec une politique unique et
identique partout : `user_id = auth.uid()`. Forcer la RLS soumet aussi le
propriétaire des tables, pour qu'une future fonction `SECURITY DEFINER` mal
écrite ne contourne pas l'isolation par inadvertance.

Les tests vérifient l'isolation en conditions réelles : sous l'identité d'un
second utilisateur, les comptes et transactions du premier sont invisibles, et
une écriture usurpant son `user_id` est rejetée par la clause `WITH CHECK`.

**Aucun secret bancaire en base.** `bank_connections` ne stocke qu'une
référence opaque fournie par le prestataire. Les jetons vivent exclusivement
dans les secrets Supabase et les variables Vercel. Un test échoue si une
colonne nommée `password`, `secret`, `token`, `credential`, `api_key`, `iban`
ou `bic` apparaît dans le schéma.

Les vues `v_ai_*` sont la seule surface exposable à une assistance externe.
Elles excluent `raw_label`, `external_id`, `dedup_hash` et toute donnée de
connexion, et portent `security_invoker = true` pour que la RLS s'applique à
travers elles — une vue ne doit jamais servir de contournement.

## Synchronisation hors ligne

Les UUID sont générés **côté client** ; le `DEFAULT gen_random_uuid()` n'est
qu'un filet pour les insertions serveur. `updated_at`, maintenu par trigger,
arbitre les conflits en last-write-wins. `deleted_at` assure une suppression
logique : une suppression hors ligne se propage sans perdre l'historique.

## Point ouvert

`v_ai_budget_summary` agrège planifié et dépensé, mais **les calculs
budgétaires font autorité dans `@budget/core`**, pas en SQL. Dupliquer les
formules en base recréerait exactement la divergence que le moteur partagé
cherche à éviter. Cette vue sert au diagnostic, jamais au pilotage.
