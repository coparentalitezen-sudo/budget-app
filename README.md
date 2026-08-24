# Budget — PWA personnelle de gestion budgétaire

Application mobile-first en français, pensée pour iPhone. Le Google Sheet
reste la référence jusqu'à validation complète : **aucune écriture n'y est
faite**, l'import est strictement en lecture.

## Vérifier l'ensemble

```bash
npm install
npm test        # 118 tests moteur + 46 tests app + 51 vérifications base
npm run build   # typecheck strict + tests + build PWA
```

| Brique | Vérification |
|---|---|
| `packages/core` | 118 tests, précédés de `tsc --noEmit` strict |
| `apps/web` | 46 tests (parseur, règles, API), typecheck strict |
| `supabase` | 44 vérifications exécutées sur un vrai PostgreSQL (PGlite) |

## Documentation

| Fichier | Pour quoi |
|---|---|
| `ARCHITECTURE.md` | Structure, flux de données, choix techniques |
| `AI_HANDOFF.md` | Reprise du projet sans contexte de conversation |
| `ACCESS_FOR_AI.md` | Donner un accès révocable à un assistant externe |
| `DEPLOYMENT.md` | Supabase, Vercel, variables d'environnement |
| `CHECKLIST_DEPLOIEMENT.md` | Séquence exacte et vérifications après mise en ligne |
| `supabase/DATABASE.md` | Schéma, contraintes, RLS, idempotence |

## Mise en route

1. Créer un projet Supabase, puis `supabase db push`.
2. Se connecter une fois dans l'application pour créer le compte Auth.
3. Charger les données de référence :

```bash
npm run db:seed   # régénère seed.sql depuis la fixture du moteur
psql "$DATABASE_URL" -v user_id="'<votre-uuid-auth>'" -f supabase/seed.sql
```

Le seed est **dérivé du moteur, jamais transcrit à la main**, et idempotent :
le rejouer ne duplique rien.
