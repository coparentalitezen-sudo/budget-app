/**
 * Tests de l'analyse des relevés bancaires extraits d'un PDF (Hello bank,
 * BNP Paribas...). Le texte simulé ici reproduit ce que produit
 * `extraireTextePdf` : une tabulation entre deux fragments séparés par un
 * grand écart horizontal (changement de colonne), une espace simple entre
 * deux mots d'un même champ.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyserPeriodeReleve, analyserRelevePdf, deduireDateSansAnnee,
  detecterColonnesOperations, estLigneAdministrative,
} from '../src/import/releve.ts';
import { versTransactions } from '../src/import/parseur.ts';

describe('Période du relevé', () => {
  test('« du D mois AAAA au D mois AAAA » est reconnu', () => {
    const p = analyserPeriodeReleve(['Hello bank', 'du 15 juin 2026 au 15 juillet 2026', 'P. 1/10']);
    assert.deepEqual(p, { debut: '2026-06-15', fin: '2026-07-15' });
  });

  test('absente du relevé, la période vaut null', () => {
    assert.equal(analyserPeriodeReleve(['Hello bank', 'P. 1/10']), null);
  });
});

describe('Déduction de l’année à partir de la période', () => {
  test('un jour/mois dans la période prend son année', () => {
    const periode = { debut: '2026-06-15', fin: '2026-07-15' };
    assert.equal(deduireDateSansAnnee(20, 6, periode), '2026-06-20');
    assert.equal(deduireDateSansAnnee(3, 7, periode), '2026-07-03');
  });

  test('période à cheval sur le Nouvel An : la bonne année est choisie', () => {
    const periode = { debut: '2026-12-15', fin: '2027-01-15' };
    assert.equal(deduireDateSansAnnee(20, 12, periode), '2026-12-20');
    assert.equal(deduireDateSansAnnee(5, 1, periode), '2027-01-05');
  });

  test('sans période connue, jamais d’année devinée', () => {
    assert.equal(deduireDateSansAnnee(20, 6, null), null);
  });

  test('un mois hors bornes reste indéchiffrable', () => {
    assert.equal(deduireDateSansAnnee(20, 13, { debut: '2026-06-15', fin: '2026-07-15' }), null);
  });
});

describe('Lignes administratives', () => {
  const cas: [string, boolean][] = [
    ['P. 1/10', true],
    ['Page 3/12', true],
    ['du 15 juin 2026 au 15 juillet 2026', true],
    ['IBAN FR76 3000 4000 0512 3456 7890 143', true],
    ['03101 03183', true],
    ["Date\tNature de l'opération\tDébit\tCrédit", true],
    ['SOLDE INTERMEDIAIRE AU 30/06/2026\t\t1234,56', true],
    ['Nouveau solde\t\t987,65', true],
    ['Hello bank', true],
    ['BNP Paribas SA au capital de 2 468 663 292 euros', true],
    ['www.hellobank.fr', true],
    ['', true],
    ['15/06/2026\tVIREMENT SEPA RECU\t\t2 719,00', false],
    ['CB CARREFOUR MARKET PARIS 15EME', false],
  ];

  for (const [ligne, attendu] of cas) {
    test(`« ${ligne || '(vide)'} » -> ${attendu ? 'administrative' : 'candidate'}`, () => {
      assert.equal(estLigneAdministrative(ligne), attendu);
    });
  }
});

describe('Détection des colonnes débit/crédit depuis l’entête', () => {
  test('entête Date / Nature / Débit / Crédit', () => {
    const c = detecterColonnesOperations(["Date\tNature de l'opération\tDébit\tCrédit"]);
    assert.deepEqual(c, { libelle: 0, debit: 1, credit: 2, montant: null });
  });

  test('sans entête reconnaissable, renvoie null', () => {
    assert.equal(detecterColonnesOperations(['Hello bank', 'P. 1/10']), null);
  });
});

describe('Relevé Hello bank / BNP — cas complet', () => {
  const texte = [
    'Hello bank',
    'P. 1/10',
    'du 15 juin 2026 au 15 juillet 2026',
    'IBAN FR76 3000 4000 0512 3456 7890 143',
    '03101 03183',
    "Date\tNature de l'opération\tDébit\tCrédit",
    // Crédit, date sans année (déduite de la période).
    '15/06\tVIREMENT SEPA RECU DUPONT SALAIRE JUIN\t\t2 719,00',
    // Débit, date complète.
    '16/06/2026\tCB CARREFOUR MARKET PARIS 15EME\t45,20\t',
    // Débit sur plusieurs lignes : le libellé continue sans nouvelle date.
    '17/06/2026\tPRLV SEPA EDF\t62,15\t',
    'ELECTRICITE REFERENCE 987654321',
    // Ligne administrative au milieu du flux (répétée en bas de page).
    'SOLDE INTERMEDIAIRE AU 30/06/2026\t\t1234,56',
    'P. 2/10',
    // Ressemble à une opération (commence par une date) mais sans montant :
    // doit rester une vraie ligne illisible, jamais un montant à 0.
    '20/06/2026\tFRAIS DIVERS\t\t',
  ].join('\n');

  test('les lignes administratives sont comptées, jamais traitées comme illisibles', () => {
    const { administratives } = analyserRelevePdf(texte);
    // Hello bank, P.1/10, période, IBAN, codes, entête, SOLDE, P.2/10 = 8
    assert.equal(administratives, 8);
  });

  test('exactement 4 lignes candidates (3 exploitables + 1 réellement illisible)', () => {
    const { lignes } = analyserRelevePdf(texte);
    assert.equal(lignes.length, 4);
  });

  test('virement crédité, date JJ/MM déduite de la période', () => {
    const { lignes } = analyserRelevePdf(texte);
    const virement = lignes[0];
    assert.equal(virement.date, '2026-06-15');
    assert.equal(virement.sens, 'credit');
    assert.equal(virement.montant, 271900);
    assert.match(virement.libelle, /VIREMENT SEPA RECU/);
    assert.equal(virement.erreur, undefined);
  });

  test('carte débitée, colonne débit reconnue depuis l’entête', () => {
    const { lignes } = analyserRelevePdf(texte);
    const carte = lignes[1];
    assert.equal(carte.date, '2026-06-16');
    assert.equal(carte.sens, 'debit');
    assert.equal(carte.montant, 4520);
    assert.equal(carte.erreur, undefined);
  });

  test('opération sur deux lignes : une seule transaction, libellé fusionné', () => {
    const { lignes } = analyserRelevePdf(texte);
    const prelevement = lignes[2];
    assert.equal(prelevement.date, '2026-06-17');
    assert.equal(prelevement.sens, 'debit');
    assert.equal(prelevement.montant, 6215);
    assert.match(prelevement.libelle, /PRLV SEPA EDF/);
    assert.match(prelevement.libelle, /ELECTRICITE REFERENCE 987654321/);
  });

  test('une ligne qui ressemble à une opération sans montant reste illisible, jamais 0', () => {
    const { lignes } = analyserRelevePdf(texte);
    const illisible = lignes[3];
    assert.equal(illisible.date, '2026-06-20');
    assert.equal(illisible.montant, null);
    assert.match(illisible.erreur!, /montant illisible/);
  });

  test('conversion en transactions : seules les 3 opérations exploitables passent', () => {
    const { lignes } = analyserRelevePdf(texte);
    const ts = versTransactions(lignes, 'cpt', 'pdf_import');
    assert.equal(ts.length, 3);
    assert.ok(ts.every((t) => t.statut === 'pending'));
    assert.equal(ts.filter((t) => t.type === 'revenu').length, 1);
    assert.equal(ts.filter((t) => t.type === 'depense').length, 2);
  });
});

describe('Colonne Solde non confondue avec le montant', () => {
  test('une colonne Solde en dernière position n’est jamais prise pour le montant', () => {
    const texte = [
      "Date\tNature de l'opération\tDébit\tCrédit\tSolde",
      '10/06/2026\tCB PHARMACIE\t12,50\t\t987,65',
    ].join('\n');
    const { lignes } = analyserRelevePdf(texte);
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].montant, 1250); // 12,50 €, pas 987,65 €
    assert.equal(lignes[0].sens, 'debit');
  });
});

describe('Libellé jamais pollué par du texte d’en-tête ou de pied de page', () => {
  test('RELEVE DE COMPTE CHEQUES, RIB, Date Valeur, Nature des opérations, Débit Crédit sont écartés', () => {
    const texte = [
      'RELEVE DE COMPTE CHEQUES',
      'RIB',
      'Date Valeur',
      'Nature des opérations',
      'Débit Crédit',
      '15/06/2026\tPRLV SEPA PAYPAL EUROPE S.A.R.L.\t45,00\t',
    ].join('\n');
    const { lignes, administratives } = analyserRelevePdf(texte);
    assert.equal(administratives, 5);
    assert.equal(lignes.length, 1);
    assert.doesNotMatch(lignes[0].libelle, /RELEVE|CHEQUES|\bRIB\b|VALEUR|NATURE|OPERATIONS/i);
    assert.match(lignes[0].libelle, /PAYPAL/i);
  });

  test('ces mêmes fragments après une opération ne sont pas fusionnés dans son libellé', () => {
    const texte = [
      '15/06/2026\tPRLV SEPA PAYPAL EUROPE S.A.R.L.\t45,00\t',
      'RELEVE DE COMPTE CHEQUES',
      'RIB',
      'Nature des opérations',
    ].join('\n');
    const { lignes, administratives } = analyserRelevePdf(texte);
    assert.equal(administratives, 3);
    assert.equal(lignes.length, 1);
    assert.doesNotMatch(lignes[0].libelle, /RELEVE|CHEQUES|\bRIB\b|NATURE|OPERATIONS/i);
  });
});

describe('Un débit ne devient jamais un crédit (signe séparé par l’extraction PDF)', () => {
  test('un signe « - » isolé dans son propre champ est recollé au montant', () => {
    // Sans entête débit/crédit détectée : l'extraction a inséré une
    // tabulation entre le signe et le chiffre (espacement de police), un
    // débit de 45,20 € ne doit surtout pas être lu comme un crédit.
    const texte = '16/06/2026\tCB CARREFOUR MARKET\t-\t45,20';
    const { lignes } = analyserRelevePdf(texte);
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].sens, 'debit');
    assert.equal(lignes[0].montant, 4520);
  });

  test('un montant avec signe final (« 45,20- ») est bien un débit', () => {
    const texte = '16/06/2026\tCB CARREFOUR MARKET\t45,20-';
    const { lignes } = analyserRelevePdf(texte);
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].sens, 'debit');
    assert.equal(lignes[0].montant, 4520);
  });
});
