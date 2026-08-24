# Checklist de déploiement — V1

## Avant toute chose

```bash
npm install
npm test        # 118 moteur + 46 app + 51 base = doit être 100 % vert
npm run build   # typecheck strict + tests + build PWA
```

Si l'un des trois échoue, **ne pas déployer**. Le pipeline enchaîne
`tsc --noEmit` en mode strict avant les tests : c'est lui qui attrape les
`null` transformés en `0`.

## Variables d'environnement

### Vercel — Production et Preview

| Variable | Visibilité | Où la trouver |
|---|---|---|
| `VITE_SUPABASE_URL` | **Publique** (dans le bundle) | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | **Publique** (dans le bundle) | Supabase → Settings → API → `anon public` |
| `SUPABASE_URL` | Serveur | Même valeur que ci-dessus, sans préfixe |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secrète** | Supabase → Settings → API → `service_role` |
| `AI_ASSISTANT_API_TOKEN` | **Secrète** | À générer : `openssl rand -hex 32` |
| `AI_ASSISTANT_USER_ID` | Serveur | Supabase → Authentication → Users → votre UUID |

Règle absolue : **une variable préfixée `VITE_` est intégrée au bundle et
publiquement lisible**. `SUPABASE_SERVICE_ROLE_KEY` ne doit jamais l'être.
Les deux dernières lignes ne sont nécessaires que si vous ouvrez l'API
d'assistance ; sans elles, les routes `/api/*` répondent `503` — elles
refusent de servir plutôt que de s'ouvrir.

### Supabase

Authentication → URL Configuration → *Redirect URLs* : ajouter l'URL Vercel,
sinon le lien de connexion renverra vers `localhost`.

## Séquence de déploiement

```bash
# 1. Base
supabase link --project-ref <ref>
supabase db push                    # 10 migrations

# 2. Dépôt
git init && git add . && git commit -m "V1"
git branch -M main
git remote add origin git@github.com:<vous>/budget-app.git
git push -u origin main
git checkout -b develop && git push -u origin develop

# 3. Frontend
npm i -g vercel
vercel link                          # Root Directory : apps/web
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add AI_ASSISTANT_API_TOKEN production
vercel env add AI_ASSISTANT_USER_ID production
vercel --prod

# 4. Données de référence — APRÈS une première connexion dans l'app,
#    qui crée la ligne auth.users dont vous relevez l'UUID.
npm run db:seed
psql "$DATABASE_URL" -v user_id="'<votre-uuid>'" -f supabase/seed.sql
```

Puis GitHub → Settings → Branches → protéger `main`.

## Vérifications après déploiement

| # | Test | Attendu |
|---|---|---|
| 1 | Ouvrir l'URL, se connecter | Lien magique reçu, session ouverte |
| 2 | Accueil | « Reste à dépenser » 1 130,00 €, objectif 200 €, écart affiché |
| 3 | Réglages → Données inconnues | 23 entrées, aucune à « 0,00 € » |
| 4 | Saisir une dépense **en mode avion** | Apparaît aussitôt, badge « 1 en attente » |
| 5 | Réactiver le réseau | Badge retombe à zéro |
| 6 | Import → un CSV de relevé | Format détecté affiché, aperçu, tout en attente |
| 7 | iPhone → Partager → Sur l'écran d'accueil | Icône correcte, ouverture sans barre d'adresse |
| 8 | Relancer en mode avion | L'application démarre et calcule |

## Test de l'API d'assistance

```bash
# Doit répondre 401
curl -s -o /dev/null -w "%{http_code}\n" https://<url>/api/transactions

# Doit répondre 200 et des données filtrées sur votre seul user_id
curl -H "Authorization: Bearer $AI_ASSISTANT_API_TOKEN" \
     https://<url>/api/budget-summary

# Doit répondre 405 : l'API est en lecture seule
curl -X POST -H "Authorization: Bearer $AI_ASSISTANT_API_TOKEN" \
     -o /dev/null -w "%{http_code}\n" https://<url>/api/transactions
```

Révocation immédiate : changer `AI_ASSISTANT_API_TOKEN` dans Vercel et
redéployer. L'application ne l'utilise pas, elle n'est pas affectée.

## Rollback

- **Frontend** : Vercel → Deployments → *Promote to Production* sur un
  déploiement antérieur. Immédiat.
- **Base** : aucun rollback automatique. Écrire une migration inverse et la
  valider par `npm run db:test` avant application.
