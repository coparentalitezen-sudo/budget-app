import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur } from '../src/money.ts';
import {
  apparierOperationImportee, calculerSoldeTheorique, contributionCompte,
  fusionnerRapprochement, rapprocherCompte,
} from '../src/rapprochement.ts';
import type { OperationImportee } from '../src/rapprochement.ts';
import type { Compte, Transaction } from '../src/types.ts';

const COURANT = 'cpt_courant';
const EPARGNE = 'cpt_vacances';

let compteur = 0;
const t = (partiel: Partial<Transaction> & { montant: number; date: string }): Transaction => ({
  id: `t_${++compteur}`,
  type: 'depense',
  categorieId: null,
  compteId: COURANT,
  source: 'manual',
  statut: 'validated',
  pointage: 'unpointed',
  ...partiel,
  montant: eur(partiel.montant),
});

describe('Contribution signée sur un compte', () => {
  test('une dépense diminue le compte source', () => {
    const tx = t({ type: 'depense', montant: 50, date: '2026-07-01' });
    assert.equal(contributionCompte(tx, COURANT), -eur(50));
  });

  test('une facture diminue le compte source', () => {
    const tx = t({ type: 'facture', montant: 30, date: '2026-07-01' });
    assert.equal(contributionCompte(tx, COURANT), -eur(30));
  });

  test('un revenu augmente le compte source', () => {
    const tx = t({ type: 'revenu', montant: 2700, date: '2026-07-01' });
    assert.equal(contributionCompte(tx, COURANT), eur(2700));
  });

  test('un remboursement augmente le compte source', () => {
    const tx = t({ type: 'remboursement', montant: 20, date: '2026-07-01' });
    assert.equal(contributionCompte(tx, COURANT), eur(20));
  });

  test('une reprise d’épargne augmente le compte source', () => {
    const tx = t({ type: 'reprise_epargne', montant: 100, date: '2026-07-01' });
    assert.equal(contributionCompte(tx, COURANT), eur(100));
  });

  test('un virement diminue la source et augmente la destination', () => {
    const tx = t({
      type: 'transfert', montant: 200, date: '2026-07-01',
      compteId: COURANT, compteDestinationId: EPARGNE,
    });
    assert.equal(contributionCompte(tx, COURANT), -eur(200));
    assert.equal(contributionCompte(tx, EPARGNE), eur(200));
  });

  test('un versement épargne diminue la source et augmente la destination', () => {
    const tx = t({
      type: 'epargne', montant: 150, date: '2026-07-01',
      compteId: COURANT, compteDestinationId: EPARGNE,
    });
    assert.equal(contributionCompte(tx, COURANT), -eur(150));
    assert.equal(contributionCompte(tx, EPARGNE), eur(150));
  });

  test('une transaction sans lien avec le compte contribue pour 0', () => {
    const tx = t({ type: 'depense', montant: 50, date: '2026-07-01', compteId: EPARGNE });
    assert.equal(contributionCompte(tx, COURANT), 0);
  });
});

describe('Rapprochement d’un compte entre deux relevés', () => {
  test('écart nul quand les opérations reconstituent exactement le solde de clôture', () => {
    const transactions: Transaction[] = [
      t({ type: 'revenu', montant: 2700, date: '2026-07-02' }),
      t({ type: 'depense', montant: 45.2, date: '2026-07-05' }),
      t({ type: 'depense', montant: 18.5, date: '2026-07-10' }),
    ];
    const r = rapprocherCompte(transactions, COURANT, eur(117.41), '2026-07-01', eur(2753.71), '2026-07-31');
    assert.equal(r.soldeAttendu, eur(2753.71));
    assert.equal(r.ecartTotal, 0);
    assert.equal(r.lignes.length, 3);
  });

  test('un écart non nul révèle une opération manquante ou en trop', () => {
    const transactions: Transaction[] = [
      t({ type: 'revenu', montant: 2700, date: '2026-07-02' }),
      t({ type: 'depense', montant: 45.2, date: '2026-07-05' }),
      // Une dépense de 18,50 € du relevé n'a jamais été saisie.
    ];
    const r = rapprocherCompte(transactions, COURANT, eur(117.41), '2026-07-01', eur(2753.71), '2026-07-31');
    // La dépense manquante n'a pas été soustraite : le solde attendu est
    // trop HAUT de 18,50 € par rapport au relevé, donc l'écart est négatif.
    assert.equal(r.ecartTotal, -eur(18.5));
  });

  test('les dates de début et de fin sont incluses', () => {
    const transactions: Transaction[] = [
      t({ type: 'depense', montant: 10, date: '2026-07-01' }), // = date de départ
      t({ type: 'depense', montant: 20, date: '2026-07-31' }), // = date de clôture
    ];
    const r = rapprocherCompte(transactions, COURANT, eur(100), '2026-07-01', eur(70), '2026-07-31');
    assert.equal(r.lignes.length, 2);
    assert.equal(r.ecartTotal, 0);
  });

  test('une opération hors période est ignorée', () => {
    const transactions: Transaction[] = [
      t({ type: 'depense', montant: 10, date: '2026-06-30' }),
      t({ type: 'depense', montant: 10, date: '2026-08-01' }),
    ];
    const r = rapprocherCompte(transactions, COURANT, eur(100), '2026-07-01', eur(100), '2026-07-31');
    assert.equal(r.lignes.length, 0);
    assert.equal(r.ecartTotal, 0);
  });

  test('une opération d’un autre compte est ignorée', () => {
    const transactions: Transaction[] = [
      t({ type: 'depense', montant: 10, date: '2026-07-05', compteId: EPARGNE }),
    ];
    const r = rapprocherCompte(transactions, COURANT, eur(100), '2026-07-01', eur(100), '2026-07-31');
    assert.equal(r.lignes.length, 0);
  });

  test('un virement vers CE compte apparaît dans son rapprochement', () => {
    const transactions: Transaction[] = [
      t({
        type: 'transfert', montant: 200, date: '2026-07-05',
        compteId: COURANT, compteDestinationId: EPARGNE,
      }),
    ];
    const r = rapprocherCompte(transactions, EPARGNE, eur(500), '2026-07-01', eur(700), '2026-07-31');
    assert.equal(r.lignes.length, 1);
    assert.equal(r.lignes[0].contribution, eur(200));
    assert.equal(r.ecartTotal, 0);
  });
});

const compte = (partiel: Partial<Compte> = {}): Compte => ({
  id: COURANT, nom: 'Compte courant', type: 'courant', solde: eur(1250),
  ...partiel,
});

describe('Solde théorique (solde réel + opérations non pointées)', () => {
  test('solde réel inconnu -> solde théorique reste null (jamais 0)', () => {
    const r = calculerSoldeTheorique([], compte({ solde: null }));
    assert.equal(r.soldeReel, null);
    assert.equal(r.soldeTheorique, null);
    assert.equal(r.operationsNonPointees.length, 0);
  });

  test('solde réel connu, aucune opération non pointée -> solde théorique = solde réel', () => {
    const transactions: Transaction[] = [
      t({ type: 'depense', montant: 30, date: '2026-07-10', pointage: 'pointed' }),
    ];
    const r = calculerSoldeTheorique(transactions, compte());
    assert.equal(r.soldeReel, eur(1250));
    assert.equal(r.soldeTheorique, eur(1250));
  });

  test('une dépense non pointée diminue le solde théorique', () => {
    const transactions: Transaction[] = [
      t({ type: 'depense', montant: 120, date: '2026-07-10', pointage: 'unpointed' }),
    ];
    const r = calculerSoldeTheorique(transactions, compte());
    assert.equal(r.soldeTheorique, eur(1130));
    assert.equal(r.ecartNonPointe, -eur(120));
  });

  test('un revenu non pointé augmente le solde théorique', () => {
    const transactions: Transaction[] = [
      t({ type: 'revenu', montant: 50, date: '2026-07-10', pointage: 'unpointed' }),
    ];
    const r = calculerSoldeTheorique(transactions, compte());
    assert.equal(r.soldeTheorique, eur(1300));
    assert.equal(r.ecartNonPointe, eur(50));
  });

  test('exemple métier : 1 250 € réel, EDF -120 € et remboursement +50 € non pointés -> 1 180 €', () => {
    const transactions: Transaction[] = [
      t({ type: 'depense', montant: 120, date: '2026-07-10', pointage: 'unpointed', commercant: 'EDF' }),
      t({ type: 'remboursement', montant: 50, date: '2026-07-12', pointage: 'unpointed' }),
    ];
    const r = calculerSoldeTheorique(transactions, compte());
    assert.equal(r.soldeTheorique, eur(1180));
    assert.equal(r.operationsNonPointees.length, 2);
  });

  test('une opération déjà pointée n’entre pas dans le calcul', () => {
    const transactions: Transaction[] = [
      t({ type: 'depense', montant: 120, date: '2026-07-10', pointage: 'pointed' }),
    ];
    const r = calculerSoldeTheorique(transactions, compte());
    assert.equal(r.soldeTheorique, eur(1250));
    assert.equal(r.operationsNonPointees.length, 0);
  });

  test('une opération non pointée d’un AUTRE compte n’entre pas dans le calcul', () => {
    const transactions: Transaction[] = [
      t({ type: 'depense', montant: 120, date: '2026-07-10', pointage: 'unpointed', compteId: EPARGNE }),
    ];
    const r = calculerSoldeTheorique(transactions, compte());
    assert.equal(r.soldeTheorique, eur(1250));
  });
});

describe('Appariement automatique d’une opération importée', () => {
  const operation = (partiel: Partial<OperationImportee> = {}): OperationImportee => ({
    date: '2026-07-10',
    montant: eur(45.2),
    type: 'depense',
    compteId: COURANT,
    libelle: 'CARREFOUR MARKET PARIS',
    ...partiel,
  });

  test('rapprochement automatique : montant, compte, type identiques, date et libellé très proches', () => {
    const existante = t({
      type: 'depense', montant: 45.2, date: '2026-07-10',
      commercant: 'CARREFOUR MARKET', pointage: 'unpointed',
    });
    const r = apparierOperationImportee(operation(), [existante]);
    assert.equal(r.decision, 'rapprocher');
    assert.equal(r.meilleur?.transaction.id, existante.id);
  });

  test('un montant différent élimine totalement le candidat', () => {
    const existante = t({
      type: 'depense', montant: 45.21, date: '2026-07-10',
      commercant: 'CARREFOUR MARKET', pointage: 'unpointed',
    });
    const r = apparierOperationImportee(operation(), [existante]);
    assert.equal(r.decision, 'nouvelle');
    assert.equal(r.meilleur, null);
  });

  test('un type différent (débit/crédit) élimine totalement le candidat', () => {
    const existante = t({
      type: 'revenu', montant: 45.2, date: '2026-07-10',
      commercant: 'CARREFOUR MARKET', pointage: 'unpointed',
    });
    const r = apparierOperationImportee(operation(), [existante]);
    assert.equal(r.decision, 'nouvelle');
  });

  test('un compte différent élimine totalement le candidat', () => {
    const existante = t({
      type: 'depense', montant: 45.2, date: '2026-07-10',
      commercant: 'CARREFOUR MARKET', compteId: EPARGNE, pointage: 'unpointed',
    });
    const r = apparierOperationImportee(operation(), [existante]);
    assert.equal(r.decision, 'nouvelle');
  });

  test('une date trop éloignée (au-delà de la tolérance) élimine le candidat', () => {
    const existante = t({
      type: 'depense', montant: 45.2, date: '2026-06-20',
      commercant: 'CARREFOUR MARKET', pointage: 'unpointed',
    });
    const r = apparierOperationImportee(operation(), [existante]);
    assert.equal(r.decision, 'nouvelle');
  });

  test('libellé très différent et date décalée -> confiance insuffisante, aucun rapprochement', () => {
    const existante = t({
      type: 'depense', montant: 45.2, date: '2026-07-14',
      commercant: 'ABONNEMENT SALLE DE SPORT', pointage: 'unpointed',
    });
    const r = apparierOperationImportee(operation(), [existante]);
    assert.notEqual(r.decision, 'rapprocher');
  });

  test('déjà pointée : jamais candidate, même si tout correspond', () => {
    const existante = t({
      type: 'depense', montant: 45.2, date: '2026-07-10',
      commercant: 'CARREFOUR MARKET', pointage: 'pointed',
    });
    const r = apparierOperationImportee(operation(), [existante]);
    assert.equal(r.decision, 'nouvelle');
  });

  test('deux candidats proches et également plausibles -> ambigu, jamais tranché au hasard', () => {
    const a = t({
      type: 'depense', montant: 45.2, date: '2026-07-10',
      commercant: 'CARREFOUR', pointage: 'unpointed',
    });
    const b = t({
      type: 'depense', montant: 45.2, date: '2026-07-11',
      commercant: 'CARREFOUR MARKET', pointage: 'unpointed',
    });
    const r = apparierOperationImportee(operation(), [a, b]);
    assert.equal(r.decision, 'ambigu');
    assert.ok(r.meilleur !== null);
  });
});

describe('Fusion d’un rapprochement (jamais de doublon)', () => {
  test('la catégorie et le statut déjà saisis sont conservés', () => {
    const existante = t({
      type: 'depense', montant: 45.2, date: '2026-07-08',
      categorieId: 'cat_courses', statut: 'validated', commercant: 'CARREFOUR MARKET',
      pointage: 'unpointed',
    });
    const fusionnee = fusionnerRapprochement(existante, operationDefaut(), '2026-07-15T10:00:00.000Z');
    assert.equal(fusionnee.id, existante.id); // même transaction, jamais un doublon
    assert.equal(fusionnee.categorieId, 'cat_courses');
    assert.equal(fusionnee.statut, 'validated');
  });

  test('la date se met à jour sur celle, faisant foi, du relevé', () => {
    const existante = t({ type: 'depense', montant: 45.2, date: '2026-07-08', pointage: 'unpointed' });
    const fusionnee = fusionnerRapprochement(existante, operationDefaut(), '2026-07-15T10:00:00.000Z');
    assert.equal(fusionnee.date, '2026-07-10');
  });

  test('la transaction devient pointée, avec la date de pointage fournie', () => {
    const existante = t({ type: 'depense', montant: 45.2, date: '2026-07-08', pointage: 'unpointed' });
    const fusionnee = fusionnerRapprochement(existante, operationDefaut(), '2026-07-15T10:00:00.000Z');
    assert.equal(fusionnee.pointage, 'pointed');
    assert.equal(fusionnee.datePointage, '2026-07-15T10:00:00.000Z');
  });
});

function operationDefaut(): OperationImportee {
  return {
    date: '2026-07-10',
    montant: eur(45.2),
    type: 'depense',
    compteId: COURANT,
    libelle: 'CARREFOUR MARKET PARIS',
  };
}
