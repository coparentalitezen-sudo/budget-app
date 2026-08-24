import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur } from '../src/money.ts';
import {
  simulerRemboursementAnticipe,
  synthetiserCredit,
  tableauAmortissement,
} from '../src/credits.ts';
import { foyer2026 } from '../src/fixtures/foyer2026.ts';

const pretPersonnel = foyer2026.credits.find((c) => c.id === 'cred_perso')!;

describe('Prêt personnel (données réelles)', () => {
  test('28 échéances restantes — cohérent avec une fin en décembre 2028', () => {
    const s = synthetiserCredit(pretPersonnel);
    assert.equal(s.echeancesRestantes, 28);
    // 28 échéances à partir de septembre 2026 tombent exactement en décembre 2028.
  });

  test('intérêts restants : 325,77 €', () => {
    const s = synthetiserCredit(pretPersonnel);
    assert.equal(s.interetsRestants, eur(325.77));
    assert.equal(s.coutTotalRestant, eur(4845.02));
    assert.equal(s.coutTotalRestant, s.capitalRestant + s.interetsRestants);
  });

  test('le tableau d’amortissement solde exactement le capital', () => {
    const tableau = tableauAmortissement(pretPersonnel);
    const capitalRembourse = tableau.reduce((a, e) => a + e.partCapital, 0);
    assert.equal(capitalRembourse, pretPersonnel.capitalRestant);
    assert.equal(tableau[tableau.length - 1].capitalRestant, 0);
  });

  test('la part d’intérêts décroît à chaque échéance', () => {
    const tableau = tableauAmortissement(pretPersonnel);
    for (let i = 1; i < tableau.length; i++) {
      assert.ok(tableau[i].partInterets <= tableau[i - 1].partInterets);
    }
  });

  test('première échéance : 22,33 € d’intérêts', () => {
    const tableau = tableauAmortissement(pretPersonnel);
    assert.equal(tableau[0].partInterets, eur(22.33)); // 4519,25 × 5,93 % / 12
    assert.equal(tableau[0].partCapital, eur(153.56));
  });
});

describe('Simulation de remboursement anticipé', () => {
  test('50 €/mois supplémentaires : 6 mois gagnés, 74,64 € d’intérêts économisés', () => {
    const sim = simulerRemboursementAnticipe(pretPersonnel, {
      mensualiteSupplementaire: eur(50),
    });
    assert.equal(sim.moisGagnes, 6);
    assert.equal(sim.economieInterets, eur(74.64));
  });

  test('versement exceptionnel de 1 000 € : 130,20 € d’intérêts économisés', () => {
    const sim = simulerRemboursementAnticipe(pretPersonnel, {
      versementImmediat: eur(1000),
    });
    assert.equal(sim.moisGagnes, 6);
    assert.equal(sim.economieInterets, eur(130.2));
  });

  test('solder intégralement le prêt supprime tous les intérêts', () => {
    const sim = simulerRemboursementAnticipe(pretPersonnel, {
      versementImmediat: pretPersonnel.capitalRestant,
    });
    assert.equal(sim.echeancesSimulees, 0);
    assert.equal(sim.interetsSimules, 0);
    assert.equal(sim.economieInterets, eur(325.77));
  });
});

describe('Garde-fous', () => {
  test('une mensualité insuffisante lève une erreur explicite', () => {
    assert.throws(
      () =>
        tableauAmortissement({
          id: 'faux',
          nom: 'Prêt incohérent',
          capitalRestant: eur(100000),
          mensualite: eur(10),
          tauxAnnuel: 0.05,
        }),
      /ne couvre pas les intérêts/,
    );
  });
});

describe('Cohérence de l’échéancier confirmé', () => {
  test('28 échéances à partir du 04/09/2026 se terminent le 04/12/2028', () => {
    const s = synthetiserCredit(pretPersonnel);
    const premiere = new Date('2026-09-04T00:00:00Z');
    const derniere = new Date(premiere);
    derniere.setUTCMonth(derniere.getUTCMonth() + s.echeancesRestantes - 1);
    assert.equal(derniere.toISOString().slice(0, 10), '2028-12-04');
    assert.equal(derniere.toISOString().slice(0, 10), pretPersonnel.dateFinPrevue);
  });
});

describe('Ce qui n’est PAS calculé faute de données', () => {
  test('le prêt immobilier n’a pas d’objet Credit : aucun intérêt inventé', () => {
    assert.equal(foyer2026.credits.find((c) => c.nom === 'Prêt immobilier'), undefined);
  });

  test('le prêt cuisine non plus : 189,50 € de mensualité ≠ capital restant', () => {
    assert.equal(foyer2026.credits.find((c) => c.nom === 'Prêt cuisine'), undefined);
    // La charge reste bien budgétée jusqu'en septembre 2026.
    const charge = foyer2026.charges.find((c) => c.id === 'chg_cuisine')!;
    assert.equal(charge.montant, eur(189.5));
    assert.equal(charge.fin, '2026-09');
  });
});
