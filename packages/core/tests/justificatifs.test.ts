import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { statutJustificatif } from '../src/justificatifs.ts';
import type { Transaction } from '../src/types.ts';

const t = (pointage: Transaction['pointage']): Transaction => ({
  id: 't1',
  date: '2026-08-28',
  montant: 1000,
  type: 'depense',
  categorieId: null,
  compteId: 'cpt_courant',
  source: 'manual',
  statut: 'validated',
  pointage,
});

describe('statutJustificatif', () => {
  test('transaction pointée -> comptabilisé', () => {
    assert.equal(statutJustificatif(t('pointed')), 'comptabilise');
  });

  test('transaction non pointée -> en attente', () => {
    assert.equal(statutJustificatif(t('unpointed')), 'en_attente');
  });

  test('transaction absente (supprimée) -> orphelin', () => {
    assert.equal(statutJustificatif(undefined), 'orphelin');
  });
});
