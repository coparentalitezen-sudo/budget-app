import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur } from '../src/money.ts';
import { contributionCompte, rapprocherCompte } from '../src/rapprochement.ts';
import type { Transaction } from '../src/types.ts';

const COURANT = 'cpt_courant';
const EPARGNE = 'cpt_vacances';

let compteur = 0;
const t = (partiel: Partial<Transaction> & { montant: number; date: string }): Transaction => ({
  id: `t_${++compteur}`,
  type: 'depense',
  categorieId: null,
  compteId: COURANT,
  source: 'manual',
  statut: 'validated',
  ...partiel,
  montant: eur(partiel.montant),
});

describe('Contribution signée sur un compte', () => {
  test('une dépense diminue le compte source', () => {
    const tx = t({ type: 'depense', montant: 50, date: '2026-07-01' });
    assert.equal(contributionCompte(tx, COURANT), -eur(50));
  });

  test('une facture diminue le compte source', () => {
    const tx = t({ type: 'facture', montant: 30, date: '2026-07-01' });
    assert.equal(contributionCompte(tx, COURANT), -eur(30));
  });

  test('un revenu augmente le compte source', () => {
    const tx = t({ type: 'revenu', montant: 2700, date: '2026-07-01' });
    assert.equal(contributionCompte(tx, COURANT), eur(2700));
  });

  test('un remboursement augmente le compte source', () => {
    const tx = t({ type: 'remboursement', montant: 20, date: '2026-07-01' });
    assert.equal(contributionCompte(tx, COURANT), eur(20));
  });

  test('une reprise d’épargne augmente le compte source', () => {
    const tx = t({ type: 'reprise_epargne', montant: 100, date: '2026-07-01' });
    assert.equal(contributionCompte(tx, COURANT), eur(100));
  });

  test('un virement diminue la source et augmente la destination', () => {
    const tx = t({
      type: 'transfert', montant: 200, date: '2026-07-01',
      compteId: COURANT, compteDestinationId: EPARGNE,
    });
    assert.equal(contributionCompte(tx, COURANT), -eur(200));
    assert.equal(contributionCompte(tx, EPARGNE), eur(200));
  });

  test('un versement épargne diminue la source et augmente la destination', () => {
    const tx = t({
      type: 'epargne', montant: 150, date: '2026-07-01',
      compteId: COURANT, compteDestinationId: EPARGNE,
    });
    assert.equal(contributionCompte(tx, COURANT), -eur(150));
    assert.equal(contributionCompte(tx, EPARGNE), eur(150));
  });

  test('une transaction sans lien avec le compte contribue pour 0', () => {
    const tx = t({ type: 'depense', montant: 50, date: '2026-07-01', compteId: EPARGNE });
    assert.equal(contributionCompte(tx, COURANT), 0);
  });
});

describe('Rapprochement d’un compte entre deux relevés', () => {
  test('écart nul quand les opérations reconstituent exactement le solde de clôture', () => {
    const transactions: Transaction[] = [
      t({ type: 'revenu', montant: 2700, date: '2026-07-02' }),
      t({ type: 'depense', montant: 45.2, date: '2026-07-05' }),
      t({ type: 'depense', montant: 18.5, date: '2026-07-10' }),
    ];
    const r = rapprocherCompte(transactions, COURANT, eur(117.41), '2026-07-01', eur(2753.71), '2026-07-31');
    assert.equal(r.soldeAttendu, eur(2753.71));
    assert.equal(r.ecartTotal, 0);
    assert.equal(r.lignes.length, 3);
  });

  test('un écart non nul révèle une opération manquante ou en trop', () => {
    const transactions: Transaction[] = [
      t({ type: 'revenu', montant: 2700, date: '2026-07-02' }),
      t({ type: 'depense', montant: 45.2, date: '2026-07-05' }),
      // Une dépense de 18,50 € du relevé n'a jamais été saisie.
    ];
    const r = rapprocherCompte(transactions, COURANT, eur(117.41), '2026-07-01', eur(2753.71), '2026-07-31');
    // La dépense manquante n'a pas été soustraite : le solde attendu est
    // trop HAUT de 18,50 € par rapport au relevé, donc l'écart est négatif.
    assert.equal(r.ecartTotal, -eur(18.5));
  });

  test('les dates de début et de fin sont incluses', () => {
    const transactions: Transaction[] = [
      t({ type: 'depense', montant: 10, date: '2026-07-01' }), // = date de départ
      t({ type: 'depense', montant: 20, date: '2026-07-31' }), // = date de clôture
    ];
    const r = rapprocherCompte(transactions, COURANT, eur(100), '2026-07-01', eur(70), '2026-07-31');
    assert.equal(r.lignes.length, 2);
    assert.equal(r.ecartTotal, 0);
  });

  test('une opération hors période est ignorée', () => {
    const transactions: Transaction[] = [
      t({ type: 'depense', montant: 10, date: '2026-06-30' }),
      t({ type: 'depense', montant: 10, date: '2026-08-01' }),
    ];
    const r = rapprocherCompte(transactions, COURANT, eur(100), '2026-07-01', eur(100), '2026-07-31');
    assert.equal(r.lignes.length, 0);
    assert.equal(r.ecartTotal, 0);
  });

  test('une opération d’un autre compte est ignorée', () => {
    const transactions: Transaction[] = [
      t({ type: 'depense', montant: 10, date: '2026-07-05', compteId: EPARGNE }),
    ];
    const r = rapprocherCompte(transactions, COURANT, eur(100), '2026-07-01', eur(100), '2026-07-31');
    assert.equal(r.lignes.length, 0);
  });

  test('un virement vers CE compte apparaît dans son rapprochement', () => {
    const transactions: Transaction[] = [
      t({
        type: 'transfert', montant: 200, date: '2026-07-05',
        compteId: COURANT, compteDestinationId: EPARGNE,
      }),
    ];
    const r = rapprocherCompte(transactions, EPARGNE, eur(500), '2026-07-01', eur(700), '2026-07-31');
    assert.equal(r.lignes.length, 1);
    assert.equal(r.lignes[0].contribution, eur(200));
    assert.equal(r.ecartTotal, 0);
  });
});
