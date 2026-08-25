/**
 * Tests du parseur d'import. Exécutés par Node natif, sans navigateur :
 * le parseur est volontairement une fonction pure, comme le moteur.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyserDate, analyserLignes, analyserMontant,
  decouper, detecterFormat, detecterSeparateur, versTransactions,
} from '../src/import/parseur.ts';
import { urlExportCsv } from '../src/import/sources.ts';

describe('Montants français', () => {
  test('virgule décimale et séparateur de milliers', () => {
    assert.equal(analyserMontant('1 234,56'), 123456);
    assert.equal(analyserMontant('1.234,56'), 123456);
    assert.equal(analyserMontant('45,20 €'), 4520);
    assert.equal(analyserMontant('1,234.56'), 123456); // format anglo-saxon
  });

  test('négatifs sous toutes leurs formes', () => {
    assert.equal(analyserMontant('-45,20'), -4520);
    assert.equal(analyserMontant('(45,20)'), -4520); // notation comptable
    assert.equal(analyserMontant('45,20-'), -4520); // signe final, certains relevés bancaires
  });

  test('un champ illisible vaut null, JAMAIS zéro', () => {
    for (const cas of ['', 'SOLDE', 'n/a', '--', 'abc']) {
      assert.equal(analyserMontant(cas), null, `« ${cas} » aurait dû être null`);
    }
  });

  test('un vrai zéro reste zéro', () => {
    assert.equal(analyserMontant('0,00'), 0);
  });
});

describe('Dates', () => {
  test('formats courants des relevés français', () => {
    assert.equal(analyserDate('03/09/2026'), '2026-09-03');
    assert.equal(analyserDate('3/9/2026'), '2026-09-03');
    assert.equal(analyserDate('03-09-26'), '2026-09-03');
    assert.equal(analyserDate('2026-09-03'), '2026-09-03');
  });

  test('une date indéchiffrable vaut null', () => {
    assert.equal(analyserDate('Date'), null);
    assert.equal(analyserDate('32/13/2026'), null); // mois 13 impossible
  });
});

describe('Découpage', () => {
  test('les guillemets protègent le séparateur', () => {
    assert.deepEqual(
      decouper('03/09/2026;"CARREFOUR MARKET; PARIS";-45,20', ';'),
      ['03/09/2026', 'CARREFOUR MARKET; PARIS', '-45,20'],
    );
  });

  test('le séparateur est détecté sur le contenu, jamais supposé', () => {
    assert.equal(detecterSeparateur(['a;b;c', 'd;e;f']), ';');
    assert.equal(detecterSeparateur(['a,b,c', 'd,e,f']), ',');
    assert.equal(detecterSeparateur(['a\tb\tc', 'd\te\tf']), '\t');
  });
});

describe('Relevé avec entête et colonne montant unique', () => {
  const csv = [
    'Date;Libellé;Montant',
    '03/09/2026;CARREFOUR MARKET;-45,20',
    '05/09/2026;VIREMENT SALAIRE;2 719,00',
    '06/09/2026;TOTAL ACCESS;-62,15',
  ].join('\n');

  test('entête et colonnes reconnues', () => {
    const f = detecterFormat(csv.split('\n'));
    assert.equal(f.separateur, ';');
    assert.deepEqual(f.enteteDetectee, ['Date', 'Libellé', 'Montant']);
    assert.equal(f.colonneDate, 0);
    assert.equal(f.colonneLibelle, 1);
    assert.equal(f.colonneMontant, 2);
  });

  test('le signe détermine le sens de l’opération', () => {
    const f = detecterFormat(csv.split('\n'));
    const lignes = analyserLignes(csv, f);
    assert.equal(lignes.length, 3);
    assert.equal(lignes[0].sens, 'debit');
    assert.equal(lignes[0].montant, 4520);
    assert.equal(lignes[1].sens, 'credit');
    assert.equal(lignes[1].montant, 271900);
  });

  test('conversion en transactions, toutes en attente de validation', () => {
    const f = detecterFormat(csv.split('\n'));
    const ts = versTransactions(analyserLignes(csv, f), 'cpt', 'csv_import');
    assert.equal(ts.length, 3);
    assert.ok(ts.every((t) => t.statut === 'pending'));
    assert.ok(ts.every((t) => t.categorieId === null));
    assert.ok(ts.every((t) => t.montant > 0)); // le sens est porté par `type`
    assert.equal(ts[1].type, 'revenu');
  });
});

describe('Relevé à colonnes débit / crédit séparées', () => {
  const csv = [
    'Date;Nature;Débit;Crédit',
    '03/09/2026;CARREFOUR;45,20;',
    '05/09/2026;SALAIRE;;2719,00',
  ].join('\n');

  test('les deux colonnes sont reconnues et fusionnées', () => {
    const f = detecterFormat(csv.split('\n'));
    assert.equal(f.colonneDebit, 2);
    assert.equal(f.colonneCredit, 3);
    const lignes = analyserLignes(csv, f);
    assert.equal(lignes[0].sens, 'debit');
    assert.equal(lignes[0].montant, 4520);
    assert.equal(lignes[1].sens, 'credit');
    assert.equal(lignes[1].montant, 271900);
  });
});

describe('Robustesse', () => {
  test('une ligne illisible est ÉCARTÉE et signalée, jamais mise à zéro', () => {
    const csv = [
      'Date;Libellé;Montant',
      '03/09/2026;CARREFOUR;-45,20',
      'SOLDE AU 30/09;;',
      '06/09/2026;ESSENCE;-62,15',
    ].join('\n');
    const f = detecterFormat(csv.split('\n'));
    const lignes = analyserLignes(csv, f);
    const illisibles = lignes.filter((l) => l.erreur);
    assert.equal(illisibles.length, 1);
    assert.equal(illisibles[0].montant, null);
    assert.match(illisibles[0].erreur!, /montant illisible/);

    // Elle n'entre PAS dans les transactions produites.
    assert.equal(versTransactions(lignes, 'cpt', 'csv_import').length, 2);
  });

  test('un fichier sans entête est traité par position', () => {
    const csv = '03/09/2026;CARREFOUR;-45,20\n05/09/2026;SALAIRE;2719,00';
    const f = detecterFormat(csv.split('\n'));
    assert.equal(f.enteteDetectee, null);
    assert.equal(analyserLignes(csv, f).length, 2);
  });

  test('le BOM UTF-8 des exports Excel n’empêche pas la lecture', () => {
    const csv = '\uFEFFDate;Libellé;Montant\n03/09/2026;CARREFOUR;-45,20';
    const f = detecterFormat(csv.replace(/^\uFEFF/, '').split('\n'));
    assert.equal(analyserLignes(csv, f).length, 1);
  });
});

describe('Google Sheet — lecture seule', () => {
  test('l’URL d’export CSV est construite depuis l’URL de la feuille', () => {
    assert.equal(
      urlExportCsv('https://docs.google.com/spreadsheets/d/ABC123_x-y/edit#gid=456'),
      'https://docs.google.com/spreadsheets/d/ABC123_x-y/export?format=csv&gid=456',
    );
  });

  test('l’URL générée est bien un export, jamais une écriture', () => {
    const url = urlExportCsv('https://docs.google.com/spreadsheets/d/ABC/edit')!;
    assert.match(url, /export\?format=csv/);
    assert.ok(!url.includes('append') && !url.includes('update'));
  });

  test('une URL non reconnue renvoie null plutôt qu’une URL fabriquée', () => {
    assert.equal(urlExportCsv('https://example.com/feuille'), null);
  });
});
