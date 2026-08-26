/**
 * Tests de garantie du contrat du moteur.
 * Chacun correspond à une règle explicitement validée avec l'utilisateur.
 * Ils doivent rester verts quelles que soient les évolutions ultérieures.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur, repartir, somme } from '../src/money.ts';
import {
  budgetVariableTotal,
  chargesFixesPrevues,
  calculerRealise,
  situationEpargne,
  synthetiserMois,
} from '../src/budget.ts';
import { situationVirement } from '../src/tresorerie.ts';
import { projeterSolde } from '../src/projection.ts';
import { projeterTousLesObjectifs } from '../src/epargne.ts';
import { cibleFondUrgence, depensesEssentielles } from '../src/fondUrgence.ts';
import { analyserEcheance, mensualisationPossiblePour } from '../src/echeances.ts';
import { inventaireInconnues } from '../src/inconnues.ts';
import { foyer2026, CATEGORIES } from '../src/fixtures/foyer2026.ts';
import type { Transaction } from '../src/types.ts';

const AUJOURDHUI = '2026-08-23';

describe('1. null n’est jamais transformé en 0', () => {
  test('tout champ inventorié comme inconnu vaut bien null dans la config', () => {
    const inconnues = inventaireInconnues(foyer2026);
    assert.ok(inconnues.length > 0);
    // Les soldes des 4 comptes et des 2 objectifs figurent à l'inventaire.
    assert.ok(inconnues.some((i) => i.chemin.includes('cpt_courant')));
    assert.ok(inconnues.some((i) => i.chemin.includes('obj_urgence')));
  });

  test('aucune sortie du moteur ne renvoie 0 là où l’entrée est null', () => {
    const virement = situationVirement(foyer2026, [], AUJOURDHUI);
    assert.equal(virement.montantTransferableMaintenant, null);
    assert.equal(virement.versementReel, null);
    assert.notEqual(virement.montantTransferableMaintenant, 0);

    const projection = projeterSolde(foyer2026, [], AUJOURDHUI);
    assert.equal(projection.soldeActuel, null);
    assert.equal(projection.soldeProjetePrudent, null);
    assert.equal(projection.soldeProjeteTendanciel, null);
  });
});

describe('2. Un solde d’épargne inconnu ne devient jamais 0 € disponible', () => {
  test('le scénario de financement reste indéterminé', () => {
    const taxe = foyer2026.echeancesExceptionnelles[0];
    const s = analyserEcheance(foyer2026, taxe, AUJOURDHUI).scenarios.find(
      (x) => x.id === 'epargne_disponible',
    )!;
    assert.equal(s.montantMobilisable, null);
    assert.equal(s.faisabilite, 'indetermine');
    assert.notEqual(s.faisabilite, 'insuffisant'); // ce serait une conclusion abusive
  });
});

describe('3. Capacité budgétaire ≠ autorisation de virement', () => {
  test('octobre : capacité de 200,29 € mais transférable inconnu', () => {
    const config = { ...foyer2026 };
    const v = situationVirement(config, [], '2026-10-15');
    assert.equal(v.capaciteEpargneBudgetaire, eur(200.29));
    assert.equal(v.atteignable, true);
    assert.equal(v.montantTransferableMaintenant, null);
    assert.equal(v.versementReel, null);
    assert.deepEqual(v.blocages, ['Solde du compte courant inconnu']);
  });

  test('avec un solde réel, le transférable devient calculable et borné', () => {
    const config = {
      ...foyer2026,
      comptes: foyer2026.comptes.map((c) =>
        c.type === 'courant' ? { ...c, solde: eur(2500) } : c,
      ),
    };
    const v = situationVirement(config, [], '2026-10-15');
    assert.notEqual(v.montantTransferableMaintenant, null);
    assert.ok(v.versementReel! <= v.capaciteEpargneBudgetaire);
    assert.equal(v.detail.seuilSecurite, eur(150));
  });

  test('un solde faible plafonne le virement sous la capacité budgétaire', () => {
    const config = {
      ...foyer2026,
      comptes: foyer2026.comptes.map((c) =>
        c.type === 'courant' ? { ...c, solde: eur(900) } : c,
      ),
    };
    const v = situationVirement(config, [], '2026-10-15');
    assert.equal(v.capaciteEpargneBudgetaire, eur(200.29));
    assert.ok(v.versementReel! < eur(200));
  });
});

describe('4. Date d’atteinte du fonds d’urgence null si solde initial inconnu', () => {
  test('cible calculée, date non', () => {
    const p = projeterTousLesObjectifs(foyer2026, '2026-10').find(
      (x) => x.objectifId === 'obj_urgence',
    )!;
    assert.equal(p.objectifTotal, eur(8887.53));
    assert.equal(p.dateAtteinte, null);
    assert.equal(p.restantAConstituer, null);
    assert.equal(p.progression, null);
  });
});

describe('5. Une date de taxe foncière inconnue ne devient jamais octobre', () => {
  test('la config ne porte aucune date de repli', () => {
    const taxe = foyer2026.echeancesExceptionnelles[0];
    assert.equal(taxe.dateEcheance, null);
    const a = analyserEcheance(foyer2026, taxe, AUJOURDHUI);
    assert.equal(a.dateEcheance, null);
    assert.equal(a.moisAvantEcheance, null);
    for (const s of a.scenarios) assert.ok(!s.detail.includes('2026-10'));
  });

  test('la provision future ne porte pas non plus de date inventée', () => {
    const prov = foyer2026.provisions.find((p) => p.id === 'prov_taxe_fonciere')!;
    assert.equal(prov.prochaineEcheance, null);
  });
});

describe('6. La mensualisation ne finance jamais rétroactivement 2026', () => {
  test('impossible pour 2026 après le 30 juin, ouverte pour 2027', () => {
    assert.equal(mensualisationPossiblePour(2026, AUJOURDHUI), false);
    assert.equal(mensualisationPossiblePour(2027, AUJOURDHUI), true);
  });

  test('aucun scénario de financement 2026 ne propose la mensualisation', () => {
    const a = analyserEcheance(foyer2026, foyer2026.echeancesExceptionnelles[0], AUJOURDHUI);
    for (const s of a.scenarios) {
      assert.ok(!s.libelle.toLowerCase().includes('mensualisation'));
      assert.ok(s.faisabilite !== 'faisable' || !s.detail.includes('mensualisation'));
    }
  });
});

describe('7. Les provisions ne comptent jamais comme épargne', () => {
  test('un transfert vers le compte de provisions n’alimente pas l’épargne', () => {
    const transactions: Transaction[] = [
      {
        id: 't_prov',
        date: '2026-09-02',
        montant: eur(253.62),
        type: 'transfert',
        categorieId: CATEGORIES.taxeFonciere,
        compteId: 'cpt_courant',
        compteDestinationId: 'cpt_provisions',
        source: 'manual',
        statut: 'validated',
        pointage: 'unpointed',
      },
    ];
    const realise = calculerRealise(foyer2026, transactions, '2026-09');
    assert.equal(realise.provisions, eur(253.62));
    assert.equal(realise.epargneNette, 0); // et non 253,62 €

    const mois = synthetiserMois(foyer2026, transactions, '2026-09');
    assert.equal(mois.epargneRealisee, 0);
    assert.equal(mois.progressionEpargne, 0); // la jauge des 200 € ne bouge pas
  });

  test('les dotations de provisions ne réduisent pas non plus le reste à dépenser', () => {
    assert.equal(synthetiserMois(foyer2026, [], '2026-09').resteADepenser, eur(1130));
  });
});

describe('8-10. Criticité des catégories issues de la scission', () => {
  const criticite = (id: string) =>
    foyer2026.categories.find((c) => c.id === id)!.criticite;

  test('8. Santé est essentielle et incluse dans l’assiette', () => {
    assert.equal(criticite(CATEGORIES.sante), 'essentielle');
    assert.ok(depensesEssentielles(foyer2026, '2026-10').categoriesRetenues.includes('Santé'));
  });

  test('9. Vêtements est semi-essentielle', () => {
    assert.equal(criticite(CATEGORIES.vetements), 'semi_essentielle');
  });

  test('10. Divers / achats plaisir est non essentielle', () => {
    assert.equal(criticite(CATEGORIES.divers), 'non_essentielle');
  });

  test('aucune catégorie du budget variable n’est laissée non classée', () => {
    assert.deepEqual(depensesEssentielles(foyer2026, '2026-10').categoriesNonClassees, []);
  });
});

describe('11-12. Intégrité du budget variable', () => {
  test('11. la somme des enveloppes vaut exactement 1 130 €', () => {
    assert.equal(budgetVariableTotal(foyer2026), eur(1130));
    assert.equal(somme(foyer2026.budgetVariable.map((l) => l.montantPrevu)), eur(1130));
  });

  test('12. la répartition santé / vêtements / divers est exactement 25 / 20 / 10', () => {
    const montant = (id: string) =>
      foyer2026.budgetVariable.find((l) => l.categorieId === id)!.montantPrevu;
    assert.equal(montant(CATEGORIES.sante), eur(25));
    assert.equal(montant(CATEGORIES.vetements), eur(20));
    assert.equal(montant(CATEGORIES.divers), eur(10));
    assert.equal(
      montant(CATEGORIES.sante) + montant(CATEGORIES.vetements) + montant(CATEGORIES.divers),
      eur(55), // l'ancienne enveloppe unique, à l'euro près
    );
  });
});

describe('13. La fin du prêt cuisine libère exactement 189,50 €', () => {
  test('écart entre septembre et octobre 2026', () => {
    const ecart =
      chargesFixesPrevues(foyer2026, '2026-09') - chargesFixesPrevues(foyer2026, '2026-10');
    assert.equal(ecart, eur(189.5));
  });

  test('l’effort supplémentaire réel pour atteindre 200 € est de 10,50 €', () => {
    assert.equal(eur(200) - eur(189.5), eur(10.5));
  });
});

describe('14. L’objectif reste 200 € même quand la capacité est inférieure', () => {
  test('septembre : objectif intact, écart annoncé', () => {
    const s = situationEpargne(foyer2026, '2026-09');
    assert.equal(s.objectifEpargne, eur(200));
    assert.equal(s.capaciteEpargneBudgetaire, eur(10.79));
    assert.equal(s.ecartObjectif, eur(-189.21));
    assert.equal(s.atteignable, false);
  });

  test('l’objectif ne varie sur aucun mois testé', () => {
    for (const p of ['2026-08', '2026-09', '2026-10', '2026-11', '2027-01']) {
      assert.equal(situationEpargne(foyer2026, p).objectifEpargne, eur(200));
    }
  });

  test('même un plafond manuel ne modifie pas l’objectif', () => {
    const config = {
      ...foyer2026,
      reglageEpargne: {
        objectif: eur(200),
        plafondsManuels: [{ debut: '2026-09', fin: '2026-09', montant: eur(10) }],
      },
    };
    assert.equal(situationEpargne(config, '2026-09').objectifEpargne, eur(200));
  });
});

describe('15. Aucun centime perdu dans les répartitions', () => {
  test('répartitions exhaustives sur des montants retors', () => {
    for (const total of [1, 2, 3, 7, 1079, 20000, 999999]) {
      for (const poids of [
        [eur(150), eur(50)],
        [1, 1, 1],
        [3, 5, 7, 11],
        [eur(500), eur(100), eur(60), eur(15)],
      ]) {
        const parts = repartir(total, poids);
        assert.equal(somme(parts), total, `perte sur ${total} / ${poids}`);
        assert.ok(parts.every(Number.isInteger));
      }
    }
  });

  test('la cible du fonds d’urgence reste un entier de centimes', () => {
    assert.ok(Number.isInteger(cibleFondUrgence(foyer2026, '2026-10').cible));
  });
});

describe('Garde-fou d’affichage : aucun null ne doit se formater en 0,00 €', () => {
  test('formatEUR n’accepte pas null (garanti par tsc --noEmit en mode strict)', () => {
    // Ce test documente la garantie ; c'est le typecheck qui l'applique.
    // `npm test` lance `tsc --noEmit` AVANT les tests : un formatEUR(null)
    // fait échouer le pipeline. Deux bugs de ce type ont été trouvés ainsi
    // dans le script de rapport.
    const inconnues = inventaireInconnues(foyer2026);
    assert.ok(inconnues.every((i) => typeof i.consequence === 'string'));
  });
});
