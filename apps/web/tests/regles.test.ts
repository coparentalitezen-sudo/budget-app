import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoriser, categoriserLot, normaliser, regleCorrespond,
  motifDepuisLibelle, nettoyerCommercant, REGLES_INITIALES, type RegleCategorisation,
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

describe('Motif proposé à partir d’un libellé brut', () => {
  test('les parties volatiles sont retirées', () => {
    assert.equal(motifDepuisLibelle('PAIEMENT CB 04/09 CARREFOUR MARKET 1234'), 'CARREFOUR MARKET');
    assert.equal(motifDepuisLibelle('PRLV SEPA FREE MOBILE'), 'FREE MOBILE');
    assert.equal(motifDepuisLibelle('CB LIDL'), 'LIDL');
  });

  test('le motif proposé correspond bien au libellé d’origine', () => {
    const libelle = 'PAIEMENT CB 04/09 CARREFOUR MARKET 1234';
    const motif = motifDepuisLibelle(libelle);
    assert.ok(
      regleCorrespond(
        { id: 'x', motif, typeCorrespondance: 'contains', categorieId: 'c', priorite: 100, autoValider: false, active: true },
        libelle,
      ),
    );
  });

  test('il capte aussi les variantes du même commerçant', () => {
    const motif = motifDepuisLibelle('PAIEMENT CB 04/09 CARREFOUR MARKET 1234');
    const regle = { id: 'x', motif, typeCorrespondance: 'contains' as const, categorieId: 'c', priorite: 100, autoValider: false, active: true };
    assert.ok(regleCorrespond(regle, 'CB 17/10 CARREFOUR MARKET LYON 9876'));
  });

  test('un libellé sans mot exploitable ne produit pas un motif vide', () => {
    assert.notEqual(motifDepuisLibelle('CB 04/09 1234'), '');
  });
});

describe('Nettoyage du commerçant (versTransactions, import PDF/CSV)', () => {
  test('un prélèvement PayPal donne un commerçant lisible, sans forme juridique ni référence', () => {
    assert.equal(
      nettoyerCommercant('PRLV SEPA PAYPAL EUROPE S.A.R.L. ... REF/123456'),
      'PAYPAL EUROPE',
    );
  });

  test('les fragments de domaine (.com) sont retirés comme les autres parties volatiles', () => {
    assert.equal(nettoyerCommercant('PRLV SEPA NETFLIX.COM REF/987654'), 'NETFLIX');
  });

  test('contrairement à motifDepuisLibelle, le commerçant n’est PAS tronqué à deux mots', () => {
    assert.equal(
      nettoyerCommercant('CB BOULANGERIE PAUL SAINT GERMAIN 04/09'),
      'BOULANGERIE PAUL SAINT GERMAIN',
    );
  });

  test('des références différentes produisent le même commerçant nettoyé', () => {
    const a = nettoyerCommercant('PRLV SEPA PAYPAL EUROPE S.A.R.L. ... REF/111111');
    const b = nettoyerCommercant('PRLV SEPA PAYPAL EUROPE S.A.R.L. ... REF/222222');
    assert.equal(a, b);
    assert.equal(a, 'PAYPAL EUROPE');
  });
});

/** Construit les règles à partir du socle par défaut, pour tester le pipeline réel. */
function reglesDepuisInitiales(): RegleCategorisation[] {
  return REGLES_INITIALES.map((r, i) => ({
    id: `initiale_${i}`,
    motif: r.motif,
    typeCorrespondance: 'contains' as const,
    categorieId: r.categorie,
    priorite: 100,
    autoValider: false,
    active: true,
  }));
}

describe('Pipeline réel : libellé PDF brut -> commerçant nettoyé -> catégorie', () => {
  const regles = reglesDepuisInitiales();

  const classer = (libelleBrut: string) => {
    const commercant = nettoyerCommercant(libelleBrut);
    const { transaction: t } = categoriser(transaction(commercant), regles);
    return { commercant, categorieId: t.categorieId };
  };

  test('CARREFOUR classé en Courses', () => {
    assert.equal(classer('PAIEMENT CB 04/09 CARREFOUR MARKET PARIS 1234').categorieId, 'Courses');
  });

  test('LIDL classé en Courses', () => {
    assert.equal(classer('CB LIDL PARIS 15 04/09').categorieId, 'Courses');
  });

  test('NETFLIX classé en Divers / achats plaisir', () => {
    assert.equal(classer('PRLV SEPA NETFLIX.COM REF/987654').categorieId, 'Divers / achats plaisir');
  });

  test('FREE (Freebox) et FREE MOBILE ne se confondent pas', () => {
    assert.equal(classer('PRLV SEPA FREE MOBILE REF/1122').categorieId, 'Téléphone');
    assert.equal(classer('PRLV SEPA FREE REF/3344').categorieId, 'Internet / TV');
  });

  test('EDF classé en Électricité', () => {
    assert.equal(classer('PRLV SEPA EDF REF/5566').categorieId, 'Électricité');
  });

  test('PayPal : commerçant nettoyé, mais jamais catégorisé au hasard', () => {
    const r = classer('PRLV SEPA PAYPAL EUROPE S.A.R.L. ... REF/123456');
    assert.equal(r.commercant, 'PAYPAL EUROPE');
    assert.equal(r.categorieId, null, 'PayPal ne dit rien de ce qui a été acheté : aucune catégorie ne doit être devinée');
  });

  test('UBER : aucune catégorie transport cohérente n’existe, reste à renseigner', () => {
    assert.equal(classer('PAIEMENT CB UBER TRIP HELP.UBER.COM 04/09').categorieId, null);
  });

  test('retrait DAB : aucune catégorie « espèces » n’existe, reste à renseigner', () => {
    assert.equal(classer('RETRAIT DAB 04/09 PARIS 75015').categorieId, null);
  });

  test('virement générique : jamais catégorisé sur le seul mot VIR/VIREMENT', () => {
    assert.equal(classer('VIREMENT SEPA RECU DE M DUPONT JEAN').categorieId, null);
  });

  test('une règle créée depuis une première opération capte la suivante malgré une référence différente', () => {
    const motifPropose = motifDepuisLibelle('PRLV SEPA PAYPAL EUROPE S.A.R.L. ... REF/111111');
    const regleUtilisateur: RegleCategorisation = {
      id: 'u1',
      motif: motifPropose,
      typeCorrespondance: 'contains',
      categorieId: 'Divers / achats plaisir',
      priorite: 100,
      autoValider: false,
      active: true,
    };
    const commercantSuivant = nettoyerCommercant('PRLV SEPA PAYPAL EUROPE S.A.R.L. ... REF/999999');
    const { transaction: t } = categoriser(transaction(commercantSuivant), [regleUtilisateur]);
    assert.equal(t.categorieId, 'Divers / achats plaisir');
  });
});
