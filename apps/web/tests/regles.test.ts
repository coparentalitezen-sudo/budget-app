import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoriser, categoriserLot, normaliser, regleCorrespond,
  REGLES_INITIALES, type RegleCategorisation,
} from '../src/import/regles.ts';
import type { Transaction } from '@budget/core/src/types.ts';

const regle = (p: Partial<RegleCategorisation>): RegleCategorisation => ({
  id: 'r1', motif: 'LIDL', typeCorrespondance: 'contains',
  categorieId: 'cat_courses', priorite: 100, autoValider: false, active: true, ...p,
});

const transaction = (libelle: string, categorieId: string | null = null): Transaction => ({
  id: crypto.randomUUID(), date: '2026-09-03', montant: 4520, type: 'depense',
  categorieId, compteId: 'cpt', commercant: libelle,
  source: 'csv_import', statut: 'pending',
});

describe('Correspondance', () => {
  test('insensible à la casse et aux accents', () => {
    assert.ok(regleCorrespond(regle({}), 'PAIEMENT CB LIDL 4521 PARIS'));
    assert.ok(regleCorrespond(regle({ motif: 'électricité' }), 'FACTURE ELECTRICITE'));
  });

  test('les quatre types de correspondance', () => {
    assert.ok(regleCorrespond(regle({ typeCorrespondance: 'exact', motif: 'LIDL' }), 'lidl'));
    assert.ok(!regleCorrespond(regle({ typeCorrespondance: 'exact' }), 'LIDL PARIS'));
    assert.ok(regleCorrespond(regle({ typeCorrespondance: 'starts_with' }), 'LIDL PARIS'));
    assert.ok(regleCorrespond(regle({ typeCorrespondance: 'regex', motif: '^CB .*LIDL' }), 'CB 04/09 LIDL'));
  });

  test('une expression régulière invalide ne fait pas tomber l’import', () => {
    assert.doesNotThrow(() =>
      regleCorrespond(regle({ typeCorrespondance: 'regex', motif: '[' }), 'LIDL'),
    );
    assert.equal(regleCorrespond(regle({ typeCorrespondance: 'regex', motif: '[' }), 'LIDL'), false);
  });

  test('une règle désactivée ne s’applique jamais', () => {
    assert.equal(regleCorrespond(regle({ active: false }), 'LIDL'), false);
  });

  test('un motif vide n’attrape pas tout', () => {
    assert.equal(regleCorrespond(regle({ motif: '  ' }), 'LIDL'), false);
  });
});

describe('Application', () => {
  test('la catégorie est proposée, la transaction reste en attente', () => {
    const { transaction: t, regleAppliquee } = categoriser(transaction('LIDL PARIS'), [regle({})]);
    assert.equal(t.categorieId, 'cat_courses');
    assert.equal(t.statut, 'pending'); // jamais validée d'office
    assert.ok(regleAppliquee);
  });

  test('autoValider reste possible mais explicite', () => {
    const { transaction: t } = categoriser(transaction('LIDL'), [regle({ autoValider: true })]);
    assert.equal(t.statut, 'validated');
  });

  test('une catégorie choisie par l’utilisateur n’est JAMAIS écrasée', () => {
    const { transaction: t, regleAppliquee } = categoriser(
      transaction('LIDL PARIS', 'cat_choisie_a_la_main'),
      [regle({})],
    );
    assert.equal(t.categorieId, 'cat_choisie_a_la_main');
    assert.equal(regleAppliquee, null);
  });

  test('la priorité départage, puis le motif le plus spécifique', () => {
    const regles = [
      regle({ id: 'large', motif: 'TOTAL', categorieId: 'cat_essence', priorite: 100 }),
      regle({ id: 'precis', motif: 'TOTALENERGIES', categorieId: 'cat_elec', priorite: 100 }),
    ];
    // À priorité égale, le motif le plus long gagne : « TOTALENERGIES »
    // ne doit pas être capté par la règle « TOTAL ».
    const { transaction: t } = categoriser(transaction('PRLV TOTALENERGIES'), regles);
    assert.equal(t.categorieId, 'cat_elec');

    const { transaction: u } = categoriser(transaction('CB TOTAL ACCESS A6'), regles);
    assert.equal(u.categorieId, 'cat_essence');
  });

  test('une priorité explicite l’emporte sur la longueur du motif', () => {
    const regles = [
      regle({ id: 'prioritaire', motif: 'CB', categorieId: 'cat_a', priorite: 1 }),
      regle({ id: 'longue', motif: 'LIDL PARIS', categorieId: 'cat_b', priorite: 100 }),
    ];
    const { transaction: t } = categoriser(transaction('CB LIDL PARIS'), regles);
    assert.equal(t.categorieId, 'cat_a');
  });
});

describe('Lot', () => {
  test('bilan complet, avec compteur par règle', () => {
    const regles = [
      regle({ id: 'lidl', motif: 'LIDL', categorieId: 'cat_courses' }),
      regle({ id: 'free', motif: 'FREE', categorieId: 'cat_internet' }),
    ];
    const bilan = categoriserLot(
      [transaction('LIDL 1'), transaction('LIDL 2'), transaction('FREE MOBILE'), transaction('INCONNU SARL')],
      regles,
    );
    assert.equal(bilan.categorisees, 3);
    assert.equal(bilan.nonCategorisees, 1);
    assert.equal(bilan.parRegle.get('lidl'), 2);
    assert.equal(bilan.parRegle.get('free'), 1);
  });

  test('sans aucune règle, rien n’est catégorisé et rien n’échoue', () => {
    const bilan = categoriserLot([transaction('LIDL')], []);
    assert.equal(bilan.categorisees, 0);
    assert.equal(bilan.transactions[0].categorieId, null);
  });
});

describe('Règles initiales', () => {
  test('aucun motif par défaut n’est dangereusement court', () => {
    for (const r of REGLES_INITIALES) {
      assert.ok(normaliser(r.motif).length >= 3, `motif trop court : ${r.motif}`);
    }
  });

  test('TOTALENERGIES et TOTAL ACCESS ne se confondent pas', () => {
    const elec = REGLES_INITIALES.find((r) => r.motif === 'TOTALENERGIES')!;
    const essence = REGLES_INITIALES.find((r) => r.motif === 'TOTAL ACCESS')!;
    assert.equal(elec.categorie, 'Électricité');
    assert.equal(essence.categorie, 'Essence / voiture');
    assert.ok(!REGLES_INITIALES.some((r) => normaliser(r.motif) === 'TOTAL'));
  });
});
