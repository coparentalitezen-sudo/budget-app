import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur } from '../src/money.ts';
import { operationsRecurrentesAGenerer } from '../src/recurrence.ts';
import type { Configuration, Transaction } from '../src/types.ts';

const COURANT = 'cpt_courant';
const AUJOURDHUI = '2026-08-28'; // jour 28

const config = (partiel: Partial<Configuration> = {}): Configuration => ({
  comptes: [{ id: COURANT, nom: 'Compte courant', type: 'courant', solde: eur(1000) }],
  categories: [],
  revenus: [
    { id: 'rev_salaire', nom: 'Salaire', montant: eur(2719.18), jour: 28 },
    { id: 'rev_caf', nom: 'CAF', montant: eur(173.66), jour: 6 },
    { id: 'rev_prime', nom: 'Prime', montant: eur(300), jour: null },
    { id: 'rev_futur', nom: 'Treizième mois', montant: eur(500), jour: 30 },
  ],
  charges: [
    { id: 'chg_pret', nom: 'Prêt personnel', montant: eur(175.89), jour: 4, categorieId: 'cat_pret' },
    { id: 'chg_immo', nom: 'Prêt immobilier', montant: eur(1200), jour: 29, categorieId: 'cat_immo' },
    { id: 'chg_taxe', nom: 'Taxe (étalée)', montant: eur(100), jour: 15, categorieId: 'cat_taxe', moisExclus: [8] },
  ],
  provisions: [],
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

describe('operationsRecurrentesAGenerer', () => {
  test('un revenu dont le jour est atteint (y compris aujourd’hui) est généré, un futur ne l’est pas', () => {
    const r = operationsRecurrentesAGenerer(config(), [], AUJOURDHUI);
    const noms = r.filter((g) => g.type === 'revenu').map((g) => g.description);
    assert.ok(noms.some((n) => n.startsWith('Salaire')), 'Salaire (jour 28 == aujourd’hui) doit être généré');
    assert.ok(noms.some((n) => n.startsWith('CAF')), 'CAF (jour 6, déjà passé) doit être généré');
    assert.ok(!noms.some((n) => n.startsWith('Prime')), 'Prime (jour inconnu) ne doit jamais être générée');
    assert.ok(!noms.some((n) => n.startsWith('Treizième')), 'Treizième mois (jour 30, futur) ne doit pas être généré');
  });

  test('une charge dont le jour est passé est générée, une future ou exclue ce mois-ci ne l’est pas', () => {
    const r = operationsRecurrentesAGenerer(config(), [], AUJOURDHUI);
    const noms = r.filter((g) => g.type === 'depense').map((g) => g.description);
    assert.ok(noms.some((n) => n.startsWith('Prêt personnel')), 'jour 4, déjà passé');
    assert.ok(!noms.some((n) => n.startsWith('Prêt immobilier')), 'jour 29, pas encore atteint');
    assert.ok(!noms.some((n) => n.startsWith('Taxe')), 'exclue en août (moisExclus)');
  });

  test('une opération déjà saisie (même type, même montant, même mois) n’est jamais régénérée', () => {
    const transactions: Transaction[] = [
      t({ type: 'revenu', montant: 2719.18, date: '2026-08-28' }),
    ];
    const r = operationsRecurrentesAGenerer(config(), transactions, AUJOURDHUI);
    assert.ok(!r.some((g) => g.description.startsWith('Salaire')));
  });

  test('un même appel répété ne produit jamais un id différent (idempotence)', () => {
    const r1 = operationsRecurrentesAGenerer(config(), [], AUJOURDHUI);
    const r2 = operationsRecurrentesAGenerer(config(), [], AUJOURDHUI);
    assert.deepEqual(r1.map((g) => g.id).sort(), r2.map((g) => g.id).sort());
  });

  test('deux échéances différentes produisent toujours des id différents', () => {
    const r = operationsRecurrentesAGenerer(config(), [], AUJOURDHUI);
    const ids = r.map((g) => g.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('la charge générée porte la catégorie de la charge d’origine ; le revenu reste non catégorisé', () => {
    const r = operationsRecurrentesAGenerer(config(), [], AUJOURDHUI);
    const pret = r.find((g) => g.description.startsWith('Prêt personnel'));
    const salaire = r.find((g) => g.description.startsWith('Salaire'));
    assert.equal(pret?.categorieId, 'cat_pret');
    assert.equal(salaire?.categorieId, null);
  });

  test('sans compte courant, rien n’est généré', () => {
    const c = config({ comptes: [{ id: 'ep', nom: 'Épargne', type: 'epargne', solde: eur(500) }] });
    const r = operationsRecurrentesAGenerer(c, [], AUJOURDHUI);
    assert.deepEqual(r, []);
  });

  test('le jour est ramené au dernier jour du mois s’il le dépasse', () => {
    const c = config({
      revenus: [{ id: 'rev_31', nom: 'Loyer perçu', montant: eur(100), jour: 31 }],
    });
    // Avril compte 30 jours : le jour 31 devient le 30.
    const r = operationsRecurrentesAGenerer(c, [], '2026-04-30');
    const ligne = r.find((g) => g.description.startsWith('Loyer perçu'));
    assert.equal(ligne?.date, '2026-04-30');
  });
});
