# @budget/core — Moteur de calcul budgétaire

Module TypeScript **pur** (aucune dépendance, aucun accès réseau, aucun I/O).
Il est destiné à être partagé entre :

- le client React, y compris **hors ligne** (les mêmes chiffres s'affichent sans réseau) ;
- l'API serveur (`/api/budget-summary`) et les Edge Functions Supabase.

Une seule implémentation des formules, donc jamais de divergence entre l'écran
et le serveur.

## Lancer les tests

Node 22+ requis (le TypeScript est exécuté nativement, sans build) :

```bash
npm test        # 86 tests
npm run rapport # rapport lisible de la situation réelle
```

## Structure

| Fichier | Rôle |
|---|---|
| `src/money.ts` | Montants en **centimes entiers**, arrondi commercial, répartition sans perte |
| `src/periode.ts` | Périodes `YYYY-MM`, jours restants, semaine lundi→dimanche bornée au mois |
| `src/types.ts` | Modèle de domaine (miroir exact du futur schéma Supabase) |
| `src/budget.ts` | Revenus, charges, enveloppes, reste à dépenser, vue hebdomadaire |
| `src/epargne.ts` | Répartition urgence/vacances, date d'atteinte des objectifs |
| `src/credits.ts` | Amortissement, intérêts restants, simulation de remboursement anticipé |
| `src/provisions.ts` | Couverture des charges annuelles, déficit prévisionnel |
| `src/fondUrgence.ts` | Cible du fonds d'urgence : dépenses essentielles / revenus / manuel |
| `src/echeances.ts` | Dettes ponctuelles non provisionnables, scénarios de financement chiffrés |
| `src/projection.ts` | Solde projeté en fin de mois (prudent et tendanciel) |
| `src/alertes.ts` | Règles d'alerte, triées par gravité |
| `src/fixtures/foyer2026.ts` | **Vos données réelles**, avec les inconnues annotées `À CONFIRMER` |

## Décisions de conception

1. **Centimes entiers partout.** Aucun float ne circule. `0.1 + 0.2` ne peut pas
   corrompre un solde.
2. **Les provisions ne sont pas de l'épargne.** Un virement de 253,62 € vers le
   compte de provisions est une charge différée. Il n'alimente jamais la jauge
   « objectif 200 € ».
3. **Le pessimisme est la valeur par défaut.** Les transactions `pending` sont
   comptées, et la projection prudente suppose toutes les enveloppes consommées.
   Une bonne surprise vaut mieux qu'un découvert.
4. **Une semaine à cheval sur deux mois est tronquée.** Le budget d'août ne peut
   pas financer le 2 septembre.
5. **Aucun intérêt d'épargne n'est modélisé.** Les projeter rendrait les dates
   d'atteinte optimistes — la mauvaise direction pour une erreur.
6. **Une inconnue vaut `null`, jamais une valeur inventée.** Un solde inconnu
   ne devient pas 0 : la projection renvoie `null` plutôt qu'un chiffre faux.
   Une provision sans date d'échéance a une couverture `null` — jamais `true`.
   Chaque paramètre non confirmé produit une alerte `info` visible à l'écran.
7. **La cible du fonds d'urgence n'est pas stockée**, elle est recalculée à la
   volée : elle suit l'évolution réelle des charges du foyer.
8. **L'objectif d'épargne n'est jamais abaissé automatiquement.** Objectif
   théorique, capacité calculée et écart sont trois grandeurs distinctes.
   Ramener l'objectif à la capacité ferait disparaître l'information utile.
9. **Une dette ponctuelle n'est pas une provision.** Une provision se
   constitue pour l'avenir ; une échéance déjà proche doit être financée.
   Les confondre produit une dotation mensuelle irréaliste.

## Résultats vérifiés par les tests

| | août-sept. 2026 | à partir d'oct. 2026 |
|---|---|---|
| Revenus | 3 352,80 € | 3 352,80 € |
| Charges fixes | −1 958,39 € | −1 768,89 € |
| Provisions | −253,62 € | −253,62 € |
| **Disponible** | **1 140,79 €** | **1 330,29 €** |
| Enveloppes variables | −1 130,00 € | −1 130,00 € |
| **Capacité d'épargne** | **10,79 €** | **200,29 €** |
| Objectif théorique | 200,00 € | 200,00 € |
| **Écart à l'objectif** | **−189,21 €** | +0,29 € |
| Atteignable | **non** | oui |
| Versement exécutable | 10,79 € (8,09 / 2,70) | 200,00 € (150 / 50) |

En septembre, l'application annonce « objectif 200 € non atteignable, écart
−189,21 € » et vire 10,79 €. L'objectif affiché reste 200 €. Un plafond de
versement peut être saisi manuellement (`plafondsManuels`) : il limite le
virement, jamais l'objectif.

**Prêt personnel** : 4 519,25 € restants, **28 échéances**, **325,77 €**
d'intérêts à venir. Un test vérifie que 28 échéances à partir du 04/09/2026
tombent exactement au 04/12/2028 : capital, mensualité, taux et calendrier
sont mutuellement cohérents.

**Prêt immobilier et prêt cuisine** ne sont pas modélisés comme crédits, faute
de capital restant dû. La mensualité de 189,50 € du prêt cuisine ne permet pas
d'en déduire le capital (elle inclut des intérêts) — aucune extrapolation n'est
faite. Les deux charges restent normalement budgétées.

## Fonds d'urgence — cible configurable

Trois modes : `depenses_essentielles`, `revenus`, `manuel`.

Chaque catégorie porte une `criticite` : `essentielle`, `semi_essentielle` ou
`non_essentielle`. Non classée = exclue du calcul **et** signalée.

Assiette essentielle = charges fixes + provisions + courses, électricité,
internet, téléphone, essence, enfants, **santé** = **2 962,51 €/mois**.

| Mode | Cible |
|---|---|
| **3 mois de dépenses essentielles** (retenu) | **8 887,53 €** |
| 3 mois, semi-essentielles incluses | 8 947,53 € |
| 6 mois de dépenses essentielles | 17 775,06 € |
| 3 mois de revenus (ancienne approche) | 10 058,40 € |

Soit **1 170,87 € de moins** que l'approche par les revenus. Atteinte en
60 mois à 150 €/mois (septembre 2031). Période de référence : **octobre 2026**,
sinon la cible intégrerait 3 × 189,50 € de prêt cuisine, une charge qui aura
disparu.

### Scission de « Vêtements / santé / divers »

| Catégorie | Enveloppe | Criticité |
|---|---|---|
| Santé | 25 € | essentielle |
| Vêtements | 20 € | semi-essentielle |
| Divers / achats plaisir | 10 € | non essentielle |

Le total reste 55 €, donc 1 130 € d'enveloppes variables. **La clé 25/20/10 est
une proposition à valider** — vous n'aviez pas fourni de répartition.

## Taxe foncière : deux objets distincts

| | Nature | Traitement |
|---|---|---|
| **Taxe foncière 2026** | Échéance exceptionnelle, ~1 600 € | Scénarios de financement chiffrés |
| **Provision 2027 et suivantes** | Provision régulière | 133,33 €/mois |

Le moteur ne réclame **jamais** 800 €/mois — un test l'interdit explicitement.
La mensualisation devant être demandée avant le 30 juin, `mensualisationPossiblePour(2026, '2026-08-23')` renvoie `false` : elle ne peut pas résoudre 2026,
seulement 2027. À confirmer auprès de la DGFiP avant toute démarche.

**Scénarios 2026** (date d'échéance encore inconnue, donc deux scénarios
seulement ; une date confirmée en ajoute deux) :

| Scénario | Statut | Chiffrage |
|---|---|---|
| Paiement depuis l'épargne | insuffisant | 0 € mobilisable, 1 600 € restants |
| Délai / étalement auprès du SIP | à vérifier | octroi non automatique |
| *(si échéance en oct. 2026)* trésorerie du mois | insuffisant | 200,29 € mobilisables, 1 399,71 € restants |
| *(si échéance en oct. 2026)* mise de côté sur 2 mois | insuffisant | exigerait 800 €/mois — hors de portée |

Le moteur chiffre, il ne recommande pas : l'arbitrage entre puiser dans
l'épargne, comprimer un mois ou solliciter un délai vous appartient.

## Point d'attention majeur

**La taxe foncière d'octobre 2026 ne peut pas être provisionnée à temps.**
Deux dotations de 133,33 € ne couvrent que 266,66 € sur 1 600 €. Il manquera
**1 333,34 €**. Le moteur remonte une alerte critique et calcule la dotation
qui serait nécessaire (800 €/mois), mais aucune décision n'est prise à votre
place. Trois pistes : financement sur épargne existante, mensualisation auprès
du Trésor public, ou report du démarrage des provisions après l'échéance.

## Paramètres non confirmés

Ils sont listés dans `config.parametresAConfirmer` et remontent en alertes
`info`. Aucun n'affecte les calculs structurels ci-dessus.

Deux méritent une attention particulière :

- **Impôt sur le revenu, 10 ou 12 mois.** S'il est étalé sur 10 mois,
  renseigner `moisExclus: [8, 9]` sur la charge : deux mois de l'année
  gagneraient 393 € de disponible. Le champ existe, il est volontairement
  laissé vide plutôt que rempli au hasard.
- **Taxe foncière.** Montant estimé et date de mise en recouvrement inconnue :
  la provision 2027 tourne, mais le moteur refuse d'affirmer qu'elle sera
  suffisante, et l'échéance 2026 est traitée à part — la mensualisation auprès du Trésor public reste
  la piste la plus simple.
