# ACCESS_FOR_AI.md

Comment donner à un assistant externe (ChatGPT ou autre) l'accès nécessaire
pour diagnostiquer, corriger et proposer des améliorations — **sans jamais
lui confier un moyen d'action irréversible**.

## Principes

1. **Lecture seule par défaut.** L'écriture se demande explicitement, se
   limite dans le temps, et passe par une revue.
2. **Permissions minimales.** Un accès au code ne donne pas accès aux données.
   Un accès aux données ne donne pas accès aux journaux.
3. **Révocable en une action**, sans redéploiement ni interruption de service.
4. **Jamais partagés, sous aucun prétexte** : la clé `service_role` Supabase,
   un mot de passe personnel, un identifiant ou mot de passe bancaire, un
   jeton GitHub personnel de longue durée.
5. **Aucun secret dans ce fichier ni dans le dépôt.** Ce document décrit des
   procédures, jamais des valeurs.

## Niveau 1 — Code source (le plus fréquent, le moins risqué)

Le dépôt ne contient aucun secret ni donnée financière personnelle : les
données réelles vivent dans Supabase, les valeurs de `fixtures/foyer2026.ts`
sont des montants budgétaires sans identifiant bancaire.

- **Option A** — copier-coller des fichiers concernés dans la conversation.
  Suffisant dans la grande majorité des cas.
- **Option B** — dépôt public en lecture seule, si le contenu est jugé non
  sensible.
- **Option C** — inviter un compte dédié en rôle *Read*.
  Révocation : *Settings → Collaborators → Remove*.

Ne jamais créer de *Personal Access Token* de longue durée. Si un jeton est
indispensable, utiliser un **fine-grained token** limité à ce seul dépôt, en
lecture, avec une expiration de sept jours au maximum.

## Niveau 2 — Données, via l'API d'assistance

Une petite API serveur, hébergée sur Vercel, expose des lectures agrégées :

```
GET /api/budget-summary
GET /api/transactions
GET /api/categories
GET /api/accounts
GET /api/loans
```

Caractéristiques imposées :

- Authentification par un en-tête `Authorization: Bearer <AI_ASSISTANT_API_TOKEN>`.
- Le jeton est stocké **uniquement** dans les variables d'environnement
  Vercel. Il n'apparaît ni dans le dépôt, ni dans ce fichier.
- Les routes lisent **exclusivement** les vues `v_ai_*`, qui excluent par
  construction `raw_label`, `external_id`, `dedup_hash` et toute donnée de
  connexion bancaire.
- Aucune route d'écriture. `POST /api/import` et `POST /api/categorize`
  restent réservés à l'application elle-même.
- Limitation de débit et journalisation des accès.

**Révocation :** changer la valeur de `AI_ASSISTANT_API_TOKEN` dans Vercel.
L'ancien jeton cesse d'être valide au redéploiement suivant, sans aucune
modification de code. L'application, qui n'utilise pas ce jeton, n'est pas
affectée — c'est précisément l'intérêt d'un chemin d'accès séparé.

## Niveau 3 — Journaux Vercel

Utile pour diagnostiquer une erreur de déploiement ou une exception serveur.

- **Option A** — copier-coller l'extrait de journal pertinent. À privilégier.
- **Option B** — inviter un compte dédié au projet Vercel en rôle *Viewer*.
  Révocation : *Team Settings → Members → Remove*.

Avant tout partage de journal, vérifier qu'il ne contient ni jeton, ni URL
signée, ni adresse e-mail.

## Niveau 4 — Supabase (à éviter)

L'accès direct à la base n'est presque jamais nécessaire : les vues `v_ai_*`
et l'API couvrent les besoins de diagnostic.

S'il devient indispensable, dans cet ordre de préférence :

1. Exécuter soi-même la requête proposée par l'assistant et lui transmettre
   le résultat. **C'est l'option recommandée** : l'assistant n'obtient aucun
   accès, et vous voyez exactement ce qui est lu.
2. Créer un rôle PostgreSQL dédié, en lecture seule, restreint aux vues :

```sql
create role ai_readonly login password '<généré, non stocké ici>';
grant usage on schema public to ai_readonly;
grant select on public.v_ai_transactions, public.v_ai_categories,
                public.v_ai_accounts, public.v_ai_loans,
                public.v_ai_budget_summary
  to ai_readonly;
-- Révocation :
-- drop role ai_readonly;
```

Attention : un rôle PostgreSQL dédié **contourne la RLS** au sens où il n'a
pas d'`auth.uid()`. Sur une base mono-utilisateur l'effet est nul, mais si
d'autres utilisateurs venaient à exister, ce rôle verrait tout. Ne l'utiliser
que le temps du diagnostic, et le supprimer ensuite.

## Ce qu'un assistant ne doit jamais recevoir

| Élément | Pourquoi |
|---|---|
| Clé `service_role` Supabase | Contourne toute la RLS. Accès total en écriture |
| Identifiants ou mot de passe bancaires | N'existent nulle part dans le système, et ne doivent pas y entrer |
| Jeton GitHub personnel | Porte tous vos dépôts, pas seulement celui-ci |
| Mot de passe de compte | Aucun usage légitime |
| Export brut de `transactions` avec `raw_label` | Les libellés de relevés contiennent des données identifiantes |

## Vérification périodique

Une fois par trimestre : lister les collaborateurs GitHub et Vercel, vérifier
qu'aucun accès temporaire n'a survécu à son besoin, et faire tourner
`AI_ASSISTANT_API_TOKEN`. Un accès oublié est la faille la plus banale.
