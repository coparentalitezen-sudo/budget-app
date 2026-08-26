import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur, formatEUR } from '../src/money.ts';
import {
  budgetVariableTotal,
  capaciteEpargne,
  chargesFixesPrevues,
  dotationsProvisions,
  revenusPrevus,
  situationEpargne,
  synthetiserMois,
  synthetiserSemaine,
} from '../src/budget.ts';
import { foyer2026, CATEGORIES } from '../src/fixtures/foyer2026.ts';
import type { Transaction } from '../src/types.ts';

const AOUT = '2026-08'; // prêt cuisine encore actif
const SEPTEMBRE = '2026-09'; // dernière échéance du prêt cuisine
const OCTOBRE = '2026-10'; // prêt cuisine soldé

describe('Structure budgétaire réelle', () => {
  test('revenus mensuels réguliers = 3 352,80 €', () => {
    assert.equal(revenusPrevus(foyer2026, AOUT), eur(3352.8));
  });

  test('charges fixes : 1 958,39 € avant octobre, 1 768,89 € ensuite', () => {
    assert.equal(chargesFixesPrevues(foyer2026, AOUT), eur(1958.39));
    assert.equal(chargesFixesPrevues(foyer2026, '2026-09'), eur(1958.39));
    assert.equal(chargesFixesPrevues(foyer2026, OCTOBRE), eur(1768.89));
  });

  test('la disparition du prêt cuisine libère exactement 189,50 €', () => {
    const ecart = chargesFixesPrevues(foyer2026, '2026-09') - chargesFixesPrevues(foyer2026, OCTOBRE);
    assert.equal(ecart, eur(189.5));
  });

  test('dotations de provisions = 253,62 €/mois', () => {
    assert.equal(dotationsProvisions(foyer2026), eur(253.62));
  });

  test('enveloppes variables cibles = 1 130 €', () => {
    assert.equal(budgetVariableTotal(foyer2026), eur(1130));
  });
});

describe('Disponible après charges fixes et provisions', () => {
  const disponible = (p: string) =>
    revenusPrevus(foyer2026, p) - chargesFixesPrevues(foyer2026, p) - dotationsProvisions(foyer2026);

  test('août 2026 : 1 140,79 €', () => {
    assert.equal(disponible(AOUT), eur(1140.79));
  });

  test('octobre 2026 : 1 330,29 €', () => {
    assert.equal(disponible(OCTOBRE), eur(1330.29));
  });

  test('après épargne de 200 €, octobre laisse bien 1 130,29 €', () => {
    assert.equal(disponible(OCTOBRE) - eur(200), eur(1130.29));
  });
});

describe('Capacité d’épargne — le point critique du dossier', () => {
  test('avant octobre 2026, seuls 10,79 € sont dégageables', () => {
    assert.equal(capaciteEpargne(foyer2026, AOUT), eur(10.79));
    assert.equal(capaciteEpargne(foyer2026, SEPTEMBRE), eur(10.79));
  });

  test('à partir d’octobre 2026, la capacité dépasse l’objectif de 200 €', () => {
    assert.equal(capaciteEpargne(foyer2026, OCTOBRE), eur(200.29));
    assert.ok(capaciteEpargne(foyer2026, OCTOBRE) >= eur(200));
  });

  test('l’objectif de 200 € N’EST PAS abaissé automatiquement en septembre', () => {
    const s = situationEpargne(foyer2026, SEPTEMBRE);
    assert.equal(s.objectifEpargne, eur(200)); // inchangé
    assert.equal(s.capaciteEpargneBudgetaire, eur(10.79));
    assert.equal(s.ecartObjectif, eur(-189.21));
    assert.equal(s.atteignable, false);
    // Le versement est limité, l'objectif affiché ne l'est pas.
    assert.equal(s.versementBudgetaire, eur(10.79));
  });

  test('en octobre, l’objectif devient atteignable sans rien changer', () => {
    const s = situationEpargne(foyer2026, OCTOBRE);
    assert.equal(s.objectifEpargne, eur(200));
    assert.equal(s.capaciteEpargneBudgetaire, eur(200.29));
    assert.equal(s.ecartObjectif, eur(0.29));
    assert.equal(s.atteignable, true);
    assert.equal(s.versementBudgetaire, eur(200));
  });

  test('un plafond manuel limite le virement sans toucher à l’objectif', () => {
    const config = {
      ...foyer2026,
      reglageEpargne: {
        objectif: eur(200),
        plafondsManuels: [{ debut: '2026-09', fin: '2026-09', montant: eur(10) }],
      },
    };
    const s = situationEpargne(config, SEPTEMBRE);
    assert.equal(s.objectifEpargne, eur(200));
    assert.equal(s.plafondManuel, eur(10));
    assert.equal(s.versementBudgetaire, eur(10));
    assert.equal(s.ecartObjectif, eur(-189.21));
  });

  test('l’effort supplémentaire réel à partir d’octobre est de 10,50 €', () => {
    const libere = eur(189.5);
    const effortSupplementaire = eur(200) - libere;
    assert.equal(effortSupplementaire, eur(10.5));
  });
});

describe('Reste à dépenser', () => {
  const depense = (id: string, montant: number, date: string): Transaction => ({
    id: `t_${id}_${date}`,
    date,
    montant: eur(montant),
    type: 'depense',
    categorieId: id,
    compteId: 'cpt_courant',
    source: 'manual',
    statut: 'validated',
    pointage: 'unpointed',
  });

  test('sans aucune dépense, le reste est égal aux enveloppes', () => {
    const s = synthetiserMois(foyer2026, [], AOUT);
    assert.equal(s.resteADepenser, eur(1130));
  });

  test('les dépenses variables diminuent le reste, pas les charges fixes', () => {
    const transactions: Transaction[] = [
      depense(CATEGORIES.courses, 120.4, '2026-08-03'),
      depense(CATEGORIES.essence, 60, '2026-08-06'),
      depense(CATEGORIES.pretImmobilier, 1200, '2026-08-05'), // charge fixe
    ];
    const s = synthetiserMois(foyer2026, transactions, AOUT);

    assert.equal(s.depensesVariables, eur(180.4));
    assert.equal(s.resteADepenser, eur(949.6));
    assert.equal(s.chargesFixes, eur(1958.39));
  });

  test('un remboursement reconstitue l’enveloppe d’origine', () => {
    const transactions: Transaction[] = [
      depense(CATEGORIES.sante, 80, '2026-08-04'),
      {
        id: 't_remb',
        date: '2026-08-12',
        montant: eur(30),
        type: 'remboursement',
        categorieId: CATEGORIES.sante,
        compteId: 'cpt_courant',
        source: 'manual',
        statut: 'validated',
        pointage: 'unpointed',
      },
    ];
    const s = synthetiserMois(foyer2026, transactions, AOUT);
    assert.equal(s.depensesVariables, eur(50));

    const sante = s.categories.find((c) => c.categorieId === CATEGORIES.sante)!;
    assert.equal(sante.depense, eur(50));
    assert.equal(sante.restant, eur(-25)); // enveloppe santé de 25 € dépassée
  });

  test('le suivi par catégorie calcule le pourcentage consommé', () => {
    const s = synthetiserMois(foyer2026, [depense(CATEGORIES.courses, 400, '2026-08-10')], AOUT);
    const courses = s.categories.find((c) => c.categorieId === CATEGORIES.courses)!;
    assert.equal(courses.prevu, eur(500));
    assert.equal(courses.restant, eur(100));
    assert.equal(courses.pourcentage, 0.8);
  });
});

describe('Vue hebdomadaire', () => {
  test('le 23/08/2026 est un dimanche : la semaine se termine le jour même', () => {
    // 9 jours restants dans le mois (23 -> 31), 1 seul dans la semaine.
    const h = synthetiserSemaine(foyer2026, [], '2026-08-23');
    assert.equal(h.joursRestantsMois, 9);
    assert.equal(h.joursRestantsSemaine, 1);
    assert.equal(h.allocationQuotidienne, eur(125.56)); // 1130 / 9
    assert.equal(h.disponibleCetteSemaine, eur(125.56));
  });

  test('en milieu de semaine, l’enveloppe couvre les jours restants', () => {
    // Mercredi 5 août 2026 : 27 jours restants au mois, 5 jusqu’à dimanche.
    const h = synthetiserSemaine(foyer2026, [], '2026-08-05');
    assert.equal(h.joursRestantsMois, 27);
    assert.equal(h.joursRestantsSemaine, 5);
    assert.equal(h.disponibleCetteSemaine, eur(209.26)); // 1130 * 5 / 27
  });

  test('une semaine à cheval sur deux mois est tronquée à la fin du mois', () => {
    // Lundi 31 août 2026 : la semaine irait jusqu’au 6 septembre.
    const h = synthetiserSemaine(foyer2026, [], '2026-08-31');
    assert.equal(h.joursRestantsMois, 1);
    assert.equal(h.joursRestantsSemaine, 1);
  });

  test('l’enveloppe hebdomadaire se réduit quand on a déjà dépensé', () => {
    const transactions: Transaction[] = [
      {
        id: 't1',
        date: '2026-08-03',
        montant: eur(565),
        type: 'depense',
        categorieId: CATEGORIES.courses,
        compteId: 'cpt_courant',
        source: 'manual',
        statut: 'validated',
        pointage: 'unpointed',
      },
    ];
    const h = synthetiserSemaine(foyer2026, transactions, '2026-08-05');
    assert.equal(h.disponibleCetteSemaine, eur(104.63)); // 565 restants * 5 / 27
    assert.equal(h.depensesDepuisLundi, eur(565));
    assert.ok(formatEUR(h.disponibleCetteSemaine).includes('104,63'));
  });
});
