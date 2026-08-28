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

  test('sans mot-clé, retient le DERNIER montant du ticket, pas le plus gros', async () => {
    // Une suite de totaux décroissants (remises successives) rend le total
    // final souvent plus petit que ceux qui le précèdent — voir le test
    // « plusieurs lignes Total » ci-dessous pour le même principe avec le
    // mot-clé « TOTAL » présent.
    const texte = ['ARTICLE 1        5,00', 'ARTICLE 2        3,50', '8,50', '6,00'].join('\n');
    const r = await lireTicket(moteur(texte), new Blob());
    assert.equal(r.montant, eur(6.00));
  });

  test('plusieurs lignes « Total » successives (remises appliquées une à une) : la DERNIÈRE l’emporte', async () => {
    // Cas réel : DistriCenter imprime un total après chaque remise
    // « 2e article à -50 % » — trois lignes « Total » décroissantes, seule
    // la dernière (163,90 €) est le montant réellement dû.
    const texte = [
      'a Total = 181,90 €',
      'a 2e Jeans à -50% = -9,00 €',
      'Total = 172,90 €',
      'a 2e Jeans à -50% = -9,00 €',
      'Total = 163,90 €',
    ].join('\n');
    const r = await lireTicket(moteur(texte), new Blob());
    assert.equal(r.montant, eur(163.90));
  });

  test('une ligne de moyen de paiement (Carte Bancaire) prime sur les lignes « Total »', async () => {
    const texte = [
      'a Total = 181,90 €',
      'Total = 172,90 €',
      'Total = 163,90 €',
      'Carte Bancaire       163.90 €',
      'Montant H.T.         136.57 €',
    ].join('\n');
    const r = await lireTicket(moteur(texte), new Blob());
    assert.equal(r.montant, eur(163.90));
  });

  test('« TOTAL TTC » explicite l’emporte sur un tableau de TVA qui répète « TOTAL » plus bas', async () => {
    // Cas réel (Action) : après le total, un tableau récapitulatif de TVA
    // imprime SA PROPRE ligne « TOTAL » (intitulé de colonne, pas le
    // montant payé) suivie de trois nombres. Sans hiérarchie de mots-clés,
    // cette ligne, plus bas dans le texte, écrasait le bon montant.
    const texte = [
      'tontarelli poubelle       3,99',
      'pink stuff détachant 1kg  4,45',
      'TOTAL TTC                20,88',
      'MODE DE PAIEMENT',
      'Carte',
      'DETAILS TVA   TVA   Excl.   Incl.',
      'TOTAL         3,48  17,40   20,88',
    ].join('\n');
    const r = await lireTicket(moteur(texte), new Blob());
    assert.equal(r.montant, eur(20.88));
  });

  test('« Montant H.T. » (hors taxes) n’est jamais pris pour le total payé, même sans ligne de paiement', async () => {
    const texte = ['Total          100,00', 'Montant H.T.    83,33', 'Taux TVA 20%    16,67'].join('\n');
    const r = await lireTicket(moteur(texte), new Blob());
    assert.equal(r.montant, eur(100.00));
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
