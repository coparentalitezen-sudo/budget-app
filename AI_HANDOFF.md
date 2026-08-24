# AI_HANDOFF.md

Document destiné à un assistant technique (ChatGPT, Claude, autre) ou à un
développeur reprenant le projet **sans accès à la conversation d'origine**.
Tout ce qui compte est ici.

## Ce qu'est ce projet

Une PWA personnelle de gestion budgétaire, mono-utilisateur, en français,
pensée pour iPhone. Elle remplace progressivement un Google Sheet qui reste
la référence jusqu'à validation complète. **Aucune écriture n'est faite sur
ce Sheet.**

## Commandes

```bash
# Moteur de calcul
cd packages/core && npm test        # tsc --noEmit puis 118 tests
cd packages/core && npm run rapport # rapport lisible de la situation

# Base de données
npm run db:test                     # 8 migrations + 33 vérifications sur PostgreSQL

# Application
cd apps/web && npm run dev
cd apps/web && npm run build        # typecheck + build
```

Node 22 minimum : le moteur exécute TypeScript nativement via
`--experimental-strip-types`, sans étape de compilation.

## Les cinq règles à ne jamais enfreindre

1. **Aucune formule budgétaire hors de `packages/core`.** Si un calcul manque,
   l'ajouter au moteur avec ses tests, puis le consommer. Ne jamais le
   recopier dans un composant React ou dans une vue SQL.

2. **Inconnu ≠ zéro.** Une donnée financière non connue vaut `null`. Ne jamais
   la remplacer par `0` pour « faire tourner » un calcul : la sortie doit
   valoir `null` à son tour. `tsc --noEmit` en mode strict fait partie de
   `npm test` précisément pour attraper ces glissements.

3. **L'objectif d'épargne ne s'abaisse jamais tout seul.** Objectif théorique,
   capacité budgétaire et écart sont trois grandeurs distinctes. Ramener
   l'objectif à la capacité ferait disparaître l'information utile.

4. **Capacité budgétaire ≠ autorisation de virement.** `situationVirement`
   renvoie `null` tant que le solde réel est inconnu. Ne jamais présenter la
   capacité comme un montant virable.

5. **Aucun secret côté client.** Seule la clé `anon` est exposée. `service_role`
   et `AI_ASSISTANT_API_TOKEN` vivent dans les variables serveur.

## Où se trouve quoi

| Besoin | Fichier |
|---|---|
| Arithmétique en centimes, répartitions sans perte | `packages/core/src/money.ts` |
| Périodes, semaines bornées au mois | `packages/core/src/periode.ts` |
| Reste à dépenser, vue hebdo, situation d'épargne | `packages/core/src/budget.ts` |
| Cible du fonds d'urgence (3 modes) | `packages/core/src/fondUrgence.ts` |
| Amortissement, remboursement anticipé | `packages/core/src/credits.ts` |
| Couverture des charges annuelles | `packages/core/src/provisions.ts` |
| Dettes ponctuelles et scénarios de financement | `packages/core/src/echeances.ts` |
| Montant réellement transférable | `packages/core/src/tresorerie.ts` |
| Inventaire des données inconnues | `packages/core/src/inconnues.ts` |
| Règles d'alerte | `packages/core/src/alertes.ts` |
| Données réelles du foyer | `packages/core/src/fixtures/foyer2026.ts` |
| Schéma et contraintes | `supabase/migrations/` |
| Persistance locale et file de sync | `apps/web/src/db/` |

## Vocabulaire du domaine

| Terme | Sens précis |
|---|---|
| `objectifEpargne` | Cible théorique : 200 €. Constante |
| `capaciteEpargneBudgetaire` | Ce que la structure du budget dégage |
| `ecartObjectif` | Capacité − objectif. Négatif = non atteignable |
| `versementBudgetaire` | Ce que le budget autorise, hors trésorerie |
| `montantTransferableMaintenant` | Ce qui est réellement virable. `null` si solde inconnu |
| `versementReel` | Le minimum des deux. `null` si trésorerie inconnue |
| Provision | Charge annuelle **future** lissée. N'est pas de l'épargne |
| Dette ponctuelle | Somme due **déjà proche**, non provisionnable |
| Criticité | `essentielle` / `semi_essentielle` / `non_essentielle`. `null` = non classée, donc exclue **et** signalée |

## Deux pièges déjà rencontrés

**La taxe foncière 2026.** Un premier calcul concluait à une provision de
800 €/mois. C'était une erreur de modélisation : une échéance à deux mois
n'est pas une provision, c'est une dette. Deux objets distincts existent
désormais, et un test interdit toute alerte réclamant 800 €/mois.

**Le capital du prêt cuisine.** La mensualité de 189,50 € ne permet pas d'en
déduire le capital restant : elle inclut des intérêts. Un test vérifie
qu'aucun objet `Credit` n'a été créé pour ce prêt.

## Contexte budgétaire de référence

Revenus 3 352,80 €/mois. Le prêt cuisine (189,50 €) s'arrête après septembre
2026, ce qui fait passer la capacité d'épargne de **10,79 €** à **200,29 €**.
L'objectif de 200 € reste affiché dans les deux cas ; en septembre l'écart de
**−189,21 €** est annoncé explicitement.

## Données encore inconnues

Voir `config.parametresAConfirmer` (15 entrées) et `inventaireInconnues()`
(23 champs). Aucune ne bloque le développement. Les principales : soldes réels
de tous les comptes, dates de versement des revenus, calendrier exact de
l'impôt (10 ou 12 mois), date et montant exact de la taxe foncière 2026,
capital restant du prêt immobilier.
