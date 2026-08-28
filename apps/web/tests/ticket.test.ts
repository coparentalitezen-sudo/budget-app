/**
 * Tests de `lireTicket`. Le moteur OCR est un faux (voir `moteur.ts`) qui
 * renvoie un texte prédéfini : seule l'INTERPRÉTATION du texte est
 * testée, jamais Tesseract lui-même (pas de navigateur ici).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur } from '@budget/core/src/money.ts';
import { lireTicket } from '../src/import/ticket.ts';
import type { MoteurOcr } from '../src/lib/ocr/moteur.ts';

const moteur = (texte: string): MoteurOcr => ({
  extraireTexte: async () => texte,
});

describe('lireTicket', () => {
  test('trouve le montant sur une ligne « TOTAL » et la date', async () => {
    const texte = [
      'CARREFOUR MARKET',
      '12/08/2026 14:32',
      'PAIN                2,10',
      'LAIT                1,45',
      'TOTAL              12,50',
      'CB',
    ].join('\n');
    const r = await lireTicket(moteur(texte), new Blob());
    assert.equal(r.montant, eur(12.50));
    assert.equal(r.date, '2026-08-12');
  });

  test('reconnaît « NET A PAYER » comme mot-clé de total', async () => {
    const texte = ['ARTICLE 1        5,00', 'ARTICLE 2        3,00', 'NET A PAYER      8,00'].join('\n');
    const r = await lireTicket(moteur(texte), new Blob());
    assert.equal(r.montant, eur(8.00));
  });

  test('sans mot-clé, retient le plus gros montant du ticket', async () => {
    const texte = ['ARTICLE 1        5,00', 'ARTICLE 2        3,50', '8,50'].join('\n');
    const r = await lireTicket(moteur(texte), new Blob());
    assert.equal(r.montant, eur(8.50));
  });

  test('un code-barres ou un numéro sans virgule n’est jamais pris pour un montant', async () => {
    const texte = ['8033628324910', 'TEL 0123456789', 'TOTAL', '9,99'].join('\n');
    const r = await lireTicket(moteur(texte), new Blob());
    assert.equal(r.montant, eur(9.99));
  });

  test('aucun montant ni date lisible -> null, jamais une valeur devinée', async () => {
    const r = await lireTicket(moteur('ticket illisible sans chiffres'), new Blob());
    assert.equal(r.montant, null);
    assert.equal(r.date, null);
  });

  test('un montant à quatre chiffres avec espace de milliers est reconnu, sans fusionner deux articles voisins', async () => {
    const texte = ['ARTICLE 1        5,00', 'ARTICLE 2        3,50', 'TOTAL      1 234,56'].join('\n');
    const r = await lireTicket(moteur(texte), new Blob());
    assert.equal(r.montant, eur(1234.56));
  });

  test('une date au format JJ-MM-AA est reconnue', async () => {
    const texte = ['12-08-26', 'TOTAL 15,00'].join('\n');
    const r = await lireTicket(moteur(texte), new Blob());
    assert.equal(r.date, '2026-08-12');
  });
});
