import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur, somme } from '../src/money.ts';
import { projeterObjectif, repartitionDuMois, repartitionObjectif } from '../src/epargne.ts';
import { foyer2026 } from '../src/fixtures/foyer2026.ts';

describe('Répartition du versement mensuel', () => {
  test('à 200 €, la clé 150 / 50 est respectée', () => {
    const r = repartitionDuMois(foyer2026, '2026-10');
    assert.equal(r.find((x) => x.objectifId === 'obj_urgence')!.montant, eur(150));
    assert.equal(r.find((x) => x.objectifId === 'obj_vacances')!.montant, eur(50));
    assert.equal(somme(r.map((x) => x.montant)), eur(200));
  });

  test('en septembre, l’objectif reste réparti sur 200 €…', () => {
    const r = repartitionObjectif(foyer2026, '2026-09');
    assert.equal(somme(r.map((x) => x.montant)), eur(200));
    assert.equal(r.find((x) => x.objectifId === 'obj_urgence')!.montant, eur(150));
  });

  test('…mais le versement réel ne porte que sur 10,79 €', () => {
    const r = repartitionDuMois(foyer2026, '2026-09');
    assert.equal(somme(r.map((x) => x.montant)), eur(10.79));
    assert.equal(r.find((x) => x.objectifId === 'obj_urgence')!.montant, eur(8.09));
    assert.equal(r.find((x) => x.objectifId === 'obj_vacances')!.montant, eur(2.7));
  });
});

describe('Projection d’atteinte des objectifs', () => {
  test('date d’atteinte au rythme de 50 €/mois', () => {
    const vacances = {
      id: 'obj_vacances',
      nom: 'Vacances',
      type: 'vacances' as const,
      objectifTotal: eur(1200),
      montantActuel: eur(200),
      versementMensuelCible: eur(50),
      priorite: 2,
    };
    const p = projeterObjectif(vacances, eur(50), '2026-10');
    assert.equal(p.restantAConstituer, eur(1000));
    assert.equal(p.moisRestants, 20);
    assert.equal(p.dateAtteinte, '2028-05-31');
    assert.ok(p.progression !== null && Math.abs(p.progression - 1 / 6) < 1e-9);
  });

  test('un objectif déjà atteint est signalé comme tel', () => {
    const p = projeterObjectif(
      {
        id: 'x',
        nom: 'Test',
        type: 'autre',
        objectifTotal: eur(500),
        montantActuel: eur(600),
        versementMensuelCible: eur(50),
        priorite: 1,
      },
      eur(50),
      '2026-10',
    );
    assert.equal(p.moisRestants, 0);
    assert.equal(p.progression, 1);
    assert.equal(p.restantAConstituer, 0);
  });

  test('sans versement, aucune date n’est promise', () => {
    const p = projeterObjectif(
      {
        id: 'x',
        nom: 'Test',
        type: 'autre',
        objectifTotal: eur(500),
        montantActuel: eur(0),
        versementMensuelCible: 0,
        priorite: 1,
      },
      0,
      '2026-10',
    );
    assert.equal(p.dateAtteinte, null);
    assert.equal(p.moisRestants, null);
  });
});
