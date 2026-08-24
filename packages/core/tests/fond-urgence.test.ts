import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur } from '../src/money.ts';
import { cibleFondUrgence, depensesEssentielles, resoudreObjectifs } from '../src/fondUrgence.ts';
import { projeterTousLesObjectifs } from '../src/epargne.ts';
import { foyer2026 } from '../src/fixtures/foyer2026.ts';

describe('Dépenses essentielles après scission de la catégorie fourre-tout', () => {
  test('la santé est retenue comme essentielle', () => {
    const d = depensesEssentielles(foyer2026, '2026-10');
    assert.ok(d.categoriesRetenues.includes('Santé'));
    assert.ok(!d.categoriesExclues.includes('Santé'));
  });

  test('assiette en régime durable (octobre 2026) : 2 962,51 €', () => {
    const d = depensesEssentielles(foyer2026, '2026-10');
    assert.equal(d.chargesFixes, eur(1768.89));
    assert.equal(d.provisions, eur(253.62));
    // 500 + 100 + 60 + 15 + 120 + 120 + 25 (santé)
    assert.equal(d.enveloppesEssentielles, eur(940));
    assert.equal(d.total, eur(2962.51));
  });

  test('vêtements (semi), restaurants, sorties et divers sont exclus par défaut', () => {
    const d = depensesEssentielles(foyer2026, '2026-10');
    assert.deepEqual(d.categoriesExclues.sort(), [
      'Divers / achats plaisir',
      'Restaurants',
      'Sorties / loisirs',
      'Vêtements',
    ]);
    assert.equal(d.categoriesNonClassees.length, 0);
  });

  test('les enveloppes retenues et exclues totalisent toujours 1 130 €', () => {
    const d = depensesEssentielles(foyer2026, '2026-10');
    assert.equal(d.enveloppesEssentielles + eur(190), eur(1130)); // 90+70+20+10
  });

  test('option : inclure les semi-essentielles ajoute les vêtements', () => {
    const d = depensesEssentielles(foyer2026, '2026-10', true);
    assert.equal(d.enveloppesEssentielles, eur(960));
    assert.equal(d.total, eur(2982.51));
  });

  test('une catégorie non classée est exclue ET signalée', () => {
    const config = {
      ...foyer2026,
      categories: foyer2026.categories.map((c) =>
        c.nom === 'Courses' ? { ...c, criticite: undefined } : c,
      ),
    };
    const d = depensesEssentielles(config, '2026-10');
    assert.deepEqual(d.categoriesNonClassees, ['Courses']);
    assert.equal(d.enveloppesEssentielles, eur(440));
  });
});

describe('Cible du fonds d’urgence — configurable', () => {
  test('mode retenu : 3 mois de dépenses essentielles = 8 887,53 €', () => {
    const c = cibleFondUrgence(foyer2026, '2026-08');
    assert.equal(c.mode, 'depenses_essentielles');
    assert.equal(c.baseMensuelle, eur(2962.51));
    assert.equal(c.cible, eur(8887.53));
    assert.ok(c.cible < eur(10058.4)); // toujours sous l'approche par les revenus
  });

  test('la scission a relevé la cible de 75 € (santé réintégrée)', () => {
    assert.equal(eur(8887.53) - eur(8812.53), eur(75)); // 3 × 25 €
  });

  test('la période de référence neutralise le prêt cuisine', () => {
    const sansReference = cibleFondUrgence(foyer2026, '2026-08', {
      mode: 'depenses_essentielles',
      nombreDeMois: 3,
    });
    assert.equal(sansReference.cible - eur(8887.53), eur(568.5)); // 3 × 189,50 €
  });

  test('mode 6 mois', () => {
    const c = cibleFondUrgence(foyer2026, '2026-10', {
      mode: 'depenses_essentielles',
      nombreDeMois: 6,
    });
    assert.equal(c.cible, eur(17775.06));
  });

  test('mode 3 mois semi-essentielles incluses', () => {
    const c = cibleFondUrgence(foyer2026, '2026-10', {
      mode: 'depenses_essentielles',
      nombreDeMois: 3,
      inclureSemiEssentielles: true,
    });
    assert.equal(c.cible, eur(8947.53));
  });

  test('mode revenus : retrouve bien 3 352,80 × 3', () => {
    const c = cibleFondUrgence(foyer2026, '2026-10', { mode: 'revenus', nombreDeMois: 3 });
    assert.equal(c.cible, eur(10058.4));
  });

  test('mode manuel', () => {
    const c = cibleFondUrgence(foyer2026, '2026-10', { mode: 'manuel', montant: eur(5000) });
    assert.equal(c.cible, eur(5000));
    assert.equal(c.baseMensuelle, null);
  });
});

describe('Résolution dynamique de l’objectif', () => {
  test('la cible n’est jamais figée dans l’objectif stocké', () => {
    assert.equal(foyer2026.objectifsEpargne.find((o) => o.type === 'urgence')!.objectifTotal, null);
    const resolus = resoudreObjectifs(foyer2026, '2026-10');
    assert.equal(resolus.find((o) => o.type === 'urgence')!.objectifTotal, eur(8887.53));
  });

  test('solde inconnu : cible connue, mais AUCUNE date d’atteinte inventée', () => {
    const p = projeterTousLesObjectifs(foyer2026, '2026-10').find(
      (x) => x.objectifId === 'obj_urgence',
    )!;
    assert.equal(p.objectifTotal, eur(8887.53)); // la cible, elle, est calculable
    assert.equal(p.montantActuel, null);
    assert.equal(p.restantAConstituer, null);
    assert.equal(p.progression, null);
    assert.equal(p.moisRestants, null);
    assert.equal(p.dateAtteinte, null);
  });

  test('dès que le solde est saisi, la date d’atteinte apparaît', () => {
    const config = {
      ...foyer2026,
      objectifsEpargne: foyer2026.objectifsEpargne.map((o) =>
        o.type === 'urgence' ? { ...o, montantActuel: eur(1000) } : o,
      ),
    };
    const p = projeterTousLesObjectifs(config, '2026-10').find(
      (x) => x.objectifId === 'obj_urgence',
    )!;
    assert.equal(p.restantAConstituer, eur(7887.53)); // 8 887,53 − 1 000
    assert.equal(p.moisRestants, 53); // 7 887,53 / 150 arrondi au mois supérieur
    assert.equal(p.dateAtteinte, '2031-02-28');
  });
});
