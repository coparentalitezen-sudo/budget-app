# ARCHITECTURE.md

## Principe directeur

**Une seule implémentation des règles de calcul.** `packages/core` est un
module TypeScript pur, sans réseau, sans I/O, sans dépendance au navigateur.
Il est consommé à l'identique par le client React (en ligne comme hors ligne),
par l'API serveur et par les Edge Functions. Aucune formule budgétaire n'est
réécrite ailleurs — c'est la garantie que l'écran et le serveur ne peuvent
pas diverger.

## Arborescence

```
budget-app/
├── packages/core/          @budget/core — moteur de calcul (118 tests)
│   ├── src/                money, periode, budget, epargne, fondUrgence,
│   │                       credits, provisions, echeances, tresorerie,
│   │                       projection, alertes, inconnues
│   └── tests/
├── apps/web/               PWA React + TypeScript + Vite
│   ├── src/db/             Dexie (IndexedDB) + file de synchronisation
│   ├── src/screens/        7 écrans
│   ├── src/components/
│   └── src/lib/            formatage, client Supabase
├── supabase/
│   ├── migrations/         8 migrations SQL versionnées
│   └── tests/run.mjs       exécution réelle contre PostgreSQL (33 checks)
└── docs                    ARCHITECTURE / AI_HANDOFF / ACCESS_FOR_AI / DEPLOYMENT
```

## Flux de données

```
Saisie utilisateur
      │
      ▼
   Dexie (IndexedDB) ◄──── source de vérité LOCALE
      │        │
      │        └──► outbox (file d'opérations en attente)
      │                      │
      ▼                      ▼  au retour du réseau
 @budget/core          Supabase (PostgreSQL + RLS)
 (calculs purs)
      │
      ▼
   Écrans React (affichage uniquement)
```

Le client écrit toujours dans Dexie en premier. L'application reste donc
utilisable sans réseau, et la synchronisation devient un détail d'arrière-plan
plutôt qu'un préalable.

## Synchronisation

- Les identifiants sont des **UUID générés côté client**. Une transaction
  créée hors ligne porte déjà son identité définitive.
- Chaque opération est poussée en `upsert` sur la clé primaire : **rejouer la
  file est sans effet de bord**. C'est ce qui rend la synchronisation
  idempotente sans registre de transactions distribuées.
- `updated_at`, maintenu par trigger côté base, arbitre les conflits en
  last-write-wins.
- Les suppressions sont logiques (`deleted_at`) : une suppression hors ligne
  se propage sans perdre l'historique.

## Séparation des responsabilités

| Couche | Responsabilité | Ce qu'elle ne fait PAS |
|---|---|---|
| `packages/core` | Toutes les règles de calcul | Aucun accès réseau, base ou DOM |
| `apps/web/src/db` | Persistance locale, file de sync | Aucun calcul budgétaire |
| `apps/web/src/screens` | Affichage, saisie | Aucune formule |
| `supabase/` | Stockage, isolation, contraintes | Aucun calcul métier (voir plus bas) |

**Pourquoi aucun calcul en SQL.** Il serait tentant de calculer le reste à
dépenser dans une vue. Ce serait une seconde implémentation des règles, donc
une divergence garantie à terme. La vue `v_ai_budget_summary` se limite à des
agrégats bruts et le documente explicitement.

## Règle transverse : inconnu ≠ zéro

Elle traverse les trois couches :

- **Moteur** : les champs inconnus valent `null`, et les sorties dépendantes
  valent `null` plutôt qu'un chiffre fabriqué.
- **Base** : colonnes `NULL`-ables **sans `DEFAULT`**, avec un test qui échoue
  si un `DEFAULT 0` apparaît sur une colonne financière nullable.
- **Interface** : le formateur refuse `null` au niveau des types ; l'affichage
  passe par un composant dédié qui rend « Inconnu », jamais « 0,00 € ».

Deux bugs de ce type ont déjà été trouvés par `tsc --noEmit` en mode strict.
Le typecheck fait partie de `npm test` pour cette raison.

## Sécurité

- RLS **activée et forcée** sur les 19 tables, politique unique
  `user_id = auth.uid()`, isolation vérifiée par des tests inter-utilisateurs.
- Le frontend n'utilise que la clé `anon`. La clé `service_role` ne quitte
  jamais les secrets Supabase et les variables Vercel.
- Aucun secret bancaire en base : `bank_connections` ne stocke qu'une
  référence opaque de prestataire.

## Choix techniques et leurs raisons

| Choix | Raison |
|---|---|
| Centimes entiers (`BIGINT` / `number`) | `0.1 + 0.2 ≠ 0.3` : aucun flottant ne doit toucher un solde |
| Dexie plutôt que localStorage | Volume, index, transactions atomiques, quota |
| CSS écrit à la main plutôt que Tailwind | Une seule feuille, aucune étape de build supplémentaire, contrôle total du rendu iPhone. Tailwind reste ajoutable sans refonte |
| Node natif pour les tests du moteur | Zéro dépendance de test dans un module qui doit rester pur |
| PGlite pour tester les migrations | Le SQL est exécuté pour de vrai, pas relu |

## Étapes ultérieures non engagées

L'Open Banking (Powens / Bridge) est **préparé mais non implémenté** :
les tables `bank_connections` et `bank_sync_logs` existent et sont vides.
Aucune dépendance ne pèse sur le MVP.
