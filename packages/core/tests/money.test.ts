import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur, mensualiser, repartir, round, somme } from '../src/money.ts';

describe('Primitives monétaires', () => {
  test('les montants sont stockés en centimes entiers', () => {
    assert.equal(eur(2719), 271900);
    assert.equal(eur(173.66), 17366);
    assert.equal(eur(460.14), 46014);
    assert.equal(eur(189.5), 18950);
  });

  test('pas d’erreur de flottant sur le total des revenus', () => {
    const total = somme([eur(2719), eur(173.66), eur(460.14)]);
    assert.equal(total, 335280); // 3 352,80 €
  });

  test('arrondi commercial symétrique autour de zéro', () => {
    assert.equal(round(0.5), 1);
    assert.equal(round(-0.5), -1);
    assert.equal(round(2.4), 2);
  });

  test('mensualisation des charges annuelles réelles', () => {
    assert.equal(mensualiser(eur(1600)), eur(133.33)); // taxe foncière
    assert.equal(mensualiser(eur(765.3)), eur(63.78)); // assurance habitation
    assert.equal(mensualiser(eur(678.13)), eur(56.51)); // assurance auto
  });

  test('la répartition ne perd ni ne crée de centime', () => {
    const parts = repartir(eur(200), [eur(150), eur(50)]);
    assert.deepEqual(parts, [eur(150), eur(50)]);

    const petites = repartir(eur(10), [eur(150), eur(50)]);
    assert.deepEqual(petites, [eur(7.5), eur(2.5)]);
    assert.equal(somme(petites), eur(10));

    // Cas retors : 1 centime à répartir en trois
    const retors = repartir(1, [1, 1, 1]);
    assert.equal(somme(retors), 1);
  });
});
