import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur } from '../src/money.ts';
import { categoriesDuMois, comparerLignes } from '../src/comparaison.ts';
import type { Configuration, Transaction } from '../src/types.ts';

const COURANT = 'cpt_courant';

const config: Configuration = {
  comptes: [{ id: COURANT, nom: 'Compte courant', type: 'courant', solde: eur(1000) }],
  categories: [
    { id: 'cat_salaire', nom: 'Salaire', nature: 'revenu' },
    { id: 'cat_courses', nom: 'Courses', nature: 'variable' },
    { id: 'cat_loyer', nom: 'Loyer', nature: 'fixe' },
  ],
  revenus: [],
  charges: [],
  provisions: [],
  echeancesExceptionnelles: [],
  objectifsEpargne: [],
  reglageEpargne: { objectif: 0, plafondsManuels: [] },
  credits: [],
  budgetVariable: [],
  reglageFondUrgence: { mode: 'manuel', montant: 0 },
  reglageTresorerie: { seuilSecurite: 0 },
  parametresAConfirmer: [],
};

let compteur = 0;
const t = (partiel: Partial<Transaction> & { montant: number; date: string }): Transaction => ({
  id: `t_${++compteur}`,
  type: 'depense',
  categorieId: null,
  compteId: COURANT,
  source: 'manual',
  statut: 'validated',
  pointage: 'unpointed',
  ...partiel,
  montant: eur(partiel.montant),
});

describe('categoriesDuMois : réalisé par catégorie, revenus et dépenses fixes + variables', () => {
  test('revenus et dépenses sont groupés par catégorie', () => {
    const transactions: Transaction[] = [
      t({ type: 'revenu', categorieId: 'cat_salaire', montant: 2500, date: '2026-08-05' }),
      t({ type: 'depense', categorieId: 'cat_courses', montant: 60, date: '2026-08-06' }),
      t({ type: 'depense', categorieId: 'cat_courses', montant: 40, date: '2026-08-12' }),
      t({ type: 'facture', categorieId: 'cat_loyer', montant: 800, date: '2026-08-01' }),
    ];
    const r = categoriesDuMois(config, transactions, '2026-08');
    assert.deepEqual(r.revenus, [{ categorieId: 'cat_salaire', nom: 'Salaire', montant: eur(2500) }]);
    assert.deepEqual(r.depenses, [
      { categorieId: 'cat_loyer', nom: 'Loyer', montant: eur(800) },
      { categorieId: 'cat_courses', nom: 'Courses', montant: eur(100) },
    ]);
  });

  test('une transaction hors période est ignorée', () => {
    const transactions: Transaction[] = [
      t({ type: 'revenu', categorieId: 'cat_salaire', montant: 2500, date: '2026-07-05' }),
    ];
    const r = categoriesDuMois(config, transactions, '2026-08');
    assert.deepEqual(r.revenus, []);
  });

  test('une transaction sans catégorie va en « Non catégorisé »', () => {
    const transactions: Transaction[] = [
      t({ type: 'depense', categorieId: null, montant: 25, date: '2026-08-03' }),
    ];
    const r = categoriesDuMois(config, transactions, '2026-08');
    assert.deepEqual(r.depenses, [{ categorieId: null, nom: 'Non catégorisé', montant: eur(25) }]);
  });

  test('un remboursement diminue la dépense de sa catégorie d’origine', () => {
    const transactions: Transaction[] = [
      t({ type: 'depense', categorieId: 'cat_courses', montant: 60, date: '2026-08-06' }),
      t({ type: 'remboursement', categorieId: 'cat_courses', montant: 20, date: '2026-08-10' }),
    ];
    const r = categoriesDuMois(config, transactions, '2026-08');
    assert.deepEqual(r.depenses, [{ categorieId: 'cat_courses', nom: 'Courses', montant: eur(40) }]);
  });

  test('un virement, une épargne ou une reprise ne comptent ni comme revenu ni comme dépense', () => {
    const transactions: Transaction[] = [
      t({ type: 'transfert', montant: 200, date: '2026-08-06', compteDestinationId: 'cpt_epargne' }),
      t({ type: 'epargne', montant: 100, date: '2026-08-06' }),
      t({ type: 'reprise_epargne', montant: 50, date: '2026-08-06' }),
    ];
    const r = categoriesDuMois(config, transactions, '2026-08');
    assert.deepEqual(r.revenus, []);
    assert.deepEqual(r.depenses, []);
  });
});

describe('comparerLignes : fusion de deux mois par catégorie', () => {
  test('une catégorie absente d’un mois y vaut 0, pas une inconnue', () => {
    const actuel = [{ categorieId: 'cat_courses', nom: 'Courses', montant: eur(100) }];
    const precedent = [{ categorieId: 'cat_loyer', nom: 'Loyer', montant: eur(800) }];
    const r = comparerLignes(actuel, precedent);
    assert.deepEqual(
      r.sort((a, b) => (a.nom < b.nom ? -1 : 1)),
      [
        { categorieId: 'cat_courses', nom: 'Courses', actuel: eur(100), precedent: 0, delta: eur(100) },
        { categorieId: 'cat_loyer', nom: 'Loyer', actuel: 0, precedent: eur(800), delta: -eur(800) },
      ].sort((a, b) => (a.nom < b.nom ? -1 : 1)),
    );
  });

  test('le delta est actuel moins précédent', () => {
    const actuel = [{ categorieId: 'cat_courses', nom: 'Courses', montant: eur(150) }];
    const precedent = [{ categorieId: 'cat_courses', nom: 'Courses', montant: eur(100) }];
    const r = comparerLignes(actuel, precedent);
    assert.equal(r.length, 1);
    assert.equal(r[0].delta, eur(50));
  });
});
