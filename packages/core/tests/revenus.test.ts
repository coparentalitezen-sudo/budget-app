import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur, somme } from '../src/money.ts';
import { repartitionRevenus } from '../src/revenus.ts';
import { synthetiserMois } from '../src/budget.ts';
import { foyer2026 } from '../src/fixtures/foyer2026.ts';
import type { Transaction } from '../src/types.ts';

const PERIODE = '2026-09';

const revenu = (montant: number, libelle: string): Transaction => ({
  id: `t_${libelle}_${montant}`,
  date: '2026-09-05',
  montant: eur(montant),
  type: 'revenu',
  categorieId: null,
  compteId: 'cpt_courant',
  commercant: libelle,
  source: 'csv_import',
  statut: 'validated',
  pointage: 'pointed',
});

describe('Sans encaissement enregistré', () => {
  test('la répartition montre le PRÉVISIONNEL, pas des zéros', () => {
    const r = repartitionRevenus(foyer2026, [], PERIODE);
    assert.equal(r.base, 'prevu');
    assert.equal(r.total, eur(3352.8));
    assert.equal(r.lignes.length, 3);
    assert.equal(r.comporteNonIdentifie, false);
  });

  test('les parts totalisent 1', () => {
    const r = repartitionRevenus(foyer2026, [], PERIODE);
    assert.ok(Math.abs(somme(r.lignes.map((l) => l.montant)) - r.total) === 0);
    assert.ok(Math.abs(r.lignes.reduce((a, l) => a + l.part, 0) - 1) < 1e-9);
  });

  test('le salaire pèse bien 81 % du total prévu', () => {
    const salaire = repartitionRevenus(foyer2026, [], PERIODE).lignes.find(
      (l) => l.nom === 'Salaire',
    )!;
    assert.equal(salaire.montant, eur(2719));
    assert.ok(Math.abs(salaire.part - 2719 / 3352.8) < 1e-9);
  });
});

describe('Avec encaissements enregistrés', () => {
  test('rattachement par libellé', () => {
    const r = repartitionRevenus(foyer2026, [revenu(2719, 'VIREMENT SALAIRE')], PERIODE);
    assert.equal(r.base, 'realise');
    assert.equal(r.total, eur(2719));
    assert.equal(r.lignes[0].nom, 'Salaire');
    assert.equal(r.lignes[0].part, 1);
  });

  test('rattachement par montant exact quand le libellé ne dit rien', () => {
    const r = repartitionRevenus(foyer2026, [revenu(173.66, 'VIR RECU 4471')], PERIODE);
    assert.equal(r.lignes[0].nom, 'CAF');
    assert.equal(r.comporteNonIdentifie, false);
  });

  test('un revenu non rattachable devient « Non identifié », jamais 0 ni réparti', () => {
    const r = repartitionRevenus(foyer2026, [revenu(450, 'REMBOURSEMENT DIVERS')], PERIODE);
    assert.equal(r.comporteNonIdentifie, true);
    const ligne = r.lignes.find((l) => l.sourceId === null)!;
    assert.equal(ligne.nom, 'Non identifié');
    assert.equal(ligne.montant, eur(450));
    assert.equal(ligne.part, 1);
  });

  test('mélange de sources connues et inconnues', () => {
    const r = repartitionRevenus(
      foyer2026,
      [revenu(2719, 'VIREMENT SALAIRE'), revenu(450, 'INCONNU SARL')],
      PERIODE,
    );
    assert.equal(r.total, eur(3169));
    assert.equal(r.lignes.length, 2);
    assert.equal(somme(r.lignes.map((l) => l.montant)), r.total);
    assert.ok(Math.abs(r.lignes.reduce((a, l) => a + l.part, 0) - 1) < 1e-9);
  });

  test('une source sans encaissement n’apparaît pas avec un montant nul', () => {
    const r = repartitionRevenus(foyer2026, [revenu(2719, 'VIREMENT SALAIRE')], PERIODE);
    assert.ok(!r.lignes.some((l) => l.nom === 'CAF'));
    assert.ok(!r.lignes.some((l) => l.montant === 0));
  });
});

describe('Intégration à synthetiserMois', () => {
  test('la synthèse porte la répartition, aucun calcul n’incombe à l’interface', () => {
    const s = synthetiserMois(foyer2026, [], PERIODE);
    assert.equal(s.revenus.base, 'prevu');
    assert.equal(s.revenus.total, eur(3352.8));
  });

  test('l’objectif d’épargne reste à 200 € et n’est pas affecté', () => {
    const s = synthetiserMois(foyer2026, [revenu(2719, 'SALAIRE')], PERIODE);
    assert.equal(s.epargne.objectifEpargne, eur(200));
    assert.equal(s.epargne.atteignable, false);
  });
});
