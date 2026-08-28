import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur } from '../src/money.ts';
import { projeterSolde, projeterSoldeTheorique } from '../src/projection.ts';
import type { Configuration, Transaction } from '../src/types.ts';

const AUJOURDHUI = '2026-08-10'; // jour 10 : passé le 5, pas encore le 20/25.

const COURANT = 'cpt_courant';

const config = (partiel: Partial<Configuration> = {}): Configuration => ({
  comptes: [{ id: COURANT, nom: 'Compte courant', type: 'courant', solde: eur(1000) }],
  categories: [],
  revenus: [
    { id: 'r1', nom: 'Salaire', montant: eur(2000), jour: 25 }, // à venir
    { id: 'r2', nom: 'Prime', montant: eur(300), jour: null }, // non daté -> pas compté en entrée
  ],
  charges: [
    { id: 'c1', nom: 'Loyer', montant: eur(800), jour: 5, categorieId: 'cat1' }, // déjà passé
    { id: 'c2', nom: 'Assurance', montant: eur(50), jour: null, categorieId: 'cat1' }, // non datée -> prudent
    { id: 'c3', nom: 'Internet', montant: eur(40), jour: 20, categorieId: 'cat1' }, // à venir
  ],
  provisions: [
    {
      id: 'p1', nom: 'Impôts', montantAnnuel: eur(1200), dotationMensuelle: eur(100),
      jourDotation: 20, prochaineEcheance: null, montantProvisionne: null,
    },
  ],
  echeancesExceptionnelles: [],
  objectifsEpargne: [],
  reglageEpargne: { objectif: 0, plafondsManuels: [] },
  credits: [],
  budgetVariable: [],
  reglageFondUrgence: { mode: 'manuel', montant: 0 },
  reglageTresorerie: { seuilSecurite: 0 },
  parametresAConfirmer: [],
  ...partiel,
});

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

describe('projeterSoldeTheorique : solde du relevé + non pointées + récurrentes à venir', () => {
  test('solde du compte inconnu -> tout reste null', () => {
    const c = config({ comptes: [{ id: COURANT, nom: 'Compte courant', type: 'courant', solde: null }] });
    const r = projeterSoldeTheorique(c, [], c.comptes[0], AUJOURDHUI);
    assert.equal(r.soldeReel, null);
    assert.equal(r.soldeTheorique, null);
  });

  test('sans opération non pointée : relevé (1 000 €) + récurrentes à venir', () => {
    const c = config();
    const r = projeterSoldeTheorique(c, [], c.comptes[0], AUJOURDHUI);
    // Revenus à venir : Salaire (jour 25) = 2 000 €. Prime (jour inconnu) exclue.
    assert.equal(r.revenusAVenir, eur(2000));
    // Charges à venir : Assurance (non datée, prudente) + Internet (jour 20) = 90 €.
    // Loyer (jour 5, déjà passé) exclu.
    assert.equal(r.chargesAVenir, eur(90));
    assert.equal(r.provisionsAVenir, eur(100));
    assert.equal(r.epargneAVenir, 0); // objectif d’épargne à 0 dans ce jeu de test.
    assert.equal(r.soldeTheorique, eur(1000 + 2000 - 90 - 100));
    assert.deepEqual(r.fluxNonDates.sort(), ['Assurance', 'Prime'].sort());
  });

  test('une opération non pointée diminue le socle avant application des récurrentes', () => {
    const c = config();
    const transactions: Transaction[] = [
      t({ type: 'depense', montant: 50, date: '2026-08-05', pointage: 'unpointed' }),
    ];
    const r = projeterSoldeTheorique(c, transactions, c.comptes[0], AUJOURDHUI);
    assert.equal(r.soldeTheorique, eur(1000 - 50 + 2000 - 90 - 100));
  });

  test('une opération déjà pointée n’est pas comptée deux fois', () => {
    const c = config();
    const transactions: Transaction[] = [
      t({ type: 'depense', montant: 50, date: '2026-08-05', pointage: 'pointed' }),
    ];
    const r = projeterSoldeTheorique(c, transactions, c.comptes[0], AUJOURDHUI);
    // Le relevé (1 000 €) intègre déjà cette dépense pointée : elle ne doit
    // pas être soustraite une seconde fois.
    assert.equal(r.soldeTheorique, eur(1000 + 2000 - 90 - 100));
  });
});

describe('projeterSolde : le socle part du solde THÉORIQUE, pas du seul relevé', () => {
  test('solde inconnu -> aucune projection', () => {
    const c = config({ comptes: [{ id: COURANT, nom: 'Compte courant', type: 'courant', solde: null }] });
    const r = projeterSolde(c, [], AUJOURDHUI);
    assert.equal(r.soldeActuel, null);
    assert.equal(r.soldeProjetePrudent, null);
    assert.equal(r.soldeProjeteTendanciel, null);
  });

  test('une opération non pointée déplace bien le socle de départ', () => {
    const c = config();
    const transactions: Transaction[] = [
      t({ type: 'revenu', montant: 200, date: '2026-08-05', pointage: 'unpointed' }),
    ];
    const r = projeterSolde(c, transactions, AUJOURDHUI);
    // soldeActuel = solde théorique (1 000 + 200 non pointés), pas le seul relevé (1 000).
    assert.equal(r.soldeActuel, eur(1200));
  });
});
