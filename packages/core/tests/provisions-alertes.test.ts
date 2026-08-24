import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur } from '../src/money.ts';
import { etatProvision, TOLERANCE_ARRONDI } from '../src/provisions.ts';
import { genererAlertes } from '../src/alertes.ts';
import { foyer2026, CATEGORIES } from '../src/fixtures/foyer2026.ts';
import type { Transaction } from '../src/types.ts';

const taxeFonciere = foyer2026.provisions.find((p) => p.id === 'prov_taxe_fonciere')!;

describe('Provisions annuelles', () => {
  test('sans date d’échéance confirmée, la couverture est indéterminée, pas « OK »', () => {
    const etat = etatProvision(taxeFonciere, '2026-08-23');
    assert.equal(etat.prochaineEcheance, null);
    assert.equal(etat.couverte, null);
    assert.equal(etat.deficitPrevisionnel, null);
    assert.equal(etat.dotationRequise, null);
    assert.equal(etat.montantEstime, true); // « environ 1 600 € »
    // La dotation reste active malgré tout.
    assert.equal(etat.dotationMensuelle, eur(133.33));
  });

  test('scénario SIMULÉ : si la taxe foncière tombait en octobre 2026', () => {
    const etat = etatProvision(
      { ...taxeFonciere, prochaineEcheance: '2026-10-15', montantProvisionne: eur(0) },
      '2026-08-23',
    );
    assert.equal(etat.moisAvantEcheance, 2);
    // 2 dotations = 266,66 € sur 1 600 € dus
    assert.equal(etat.deficitPrevisionnel, eur(1333.34));
    assert.equal(etat.dotationRequise, eur(800));
    assert.equal(etat.couverte, false);
  });

  test('une provision démarrée à temps se couvre exactement', () => {
    const etat = etatProvision(
      { ...taxeFonciere, prochaineEcheance: '2027-10-15', montantProvisionne: eur(0) },
      '2026-10-15',
    );
    assert.equal(etat.moisAvantEcheance, 12);
    // 12 × 133,33 € = 1 599,96 € : 4 centimes de dérive d’arrondi, tolérés.
    assert.equal(etat.deficitPrevisionnel, eur(0.04));
    assert.ok(etat.deficitPrevisionnel <= TOLERANCE_ARRONDI);
    assert.equal(etat.couverte, true);
  });

  test('le montant déjà provisionné réduit la dotation requise', () => {
    const etat = etatProvision(
      { ...taxeFonciere, prochaineEcheance: '2026-10-15', montantProvisionne: eur(800) },
      '2026-08-23',
    );
    assert.equal(etat.restantAProvisionner, eur(800));
    assert.equal(etat.dotationRequise, eur(400));
  });
});

describe('Alertes', () => {
  const alertes = genererAlertes(foyer2026, [], '2026-08-23');
  const codes = alertes.map((a) => a.code);

  test('la taxe foncière sans date remonte « couverture indéterminée », pas un faux OK', () => {
    const a = alertes.find(
      (x) => x.code === 'provision_couverture_indeterminee' && x.titre.includes('Taxe'),
    );
    assert.ok(a);
    assert.match(a!.detail, /la date d’échéance et le montant déjà provisionné/);
  });

  test('l’assurance habitation, dont la date EST connue, ne réclame que le montant', () => {
    const a = alertes.find(
      (x) => x.code === 'provision_couverture_indeterminee' && x.titre.includes('habitation'),
    );
    assert.ok(a);
    assert.match(a!.detail, /Il manque le montant déjà provisionné/);
    assert.ok(!a!.detail.includes('date d’échéance'));
  });

  test('assurance habitation : date connue mais montant provisionné inconnu → indéterminé', () => {
    // La date du 1er janvier est confirmée, mais le solde du compte de
    // provisions ne l'est pas : le moteur ne conclut ni à la couverture,
    // ni au déficit.
    const etat = etatProvision(
      foyer2026.provisions.find((p) => p.id === 'prov_assurance_habitation')!,
      '2026-08-23',
    );
    assert.equal(etat.prochaineEcheance, '2027-01-01');
    assert.equal(etat.couverte, null);
    assert.equal(etat.deficitPrevisionnel, null);

    const a = alertes.find((x) => x.code === 'provision_deficit');
    assert.equal(a, undefined); // aucun déficit affirmé sans données
  });

  test('avec le montant provisionné saisi, le déficit devient calculable', () => {
    const config = {
      ...foyer2026,
      provisions: foyer2026.provisions.map((p) =>
        p.id === 'prov_assurance_habitation' ? { ...p, montantProvisionne: eur(0) } : p,
      ),
    };
    const a = genererAlertes(config, [], '2026-08-23').find(
      (x) => x.code === 'provision_deficit' && x.titre.includes('habitation'),
    );
    assert.ok(a);
    assert.equal(a!.niveau, 'attention'); // 5 mois d’ici l’échéance
    assert.match(a!.detail, /446,40/); // 765,30 − 5 × 63,78
  });

  test('les inconnues sont regroupées en une alerte, sans noyer les alertes utiles', () => {
    const groupee = alertes.filter((x) => x.code === 'donnees_inconnues');
    assert.equal(groupee.length, 1);
    assert.match(groupee[0].titre, /données financières inconnues/);
    assert.match(groupee[0].detail, /Aucune n’est remplacée par 0/);

    const parametres = alertes.filter((x) => x.code === 'parametres_a_confirmer');
    assert.equal(parametres.length, 1);
    assert.match(parametres[0].titre, /15 paramètres/);

    // Les alertes actionnables restent en tête et peu nombreuses.
    assert.ok(alertes.length < 12);
    assert.equal(alertes[0].niveau, 'critique');
  });

  test('la dernière échéance du prêt cuisine est signalée comme opportunité', () => {
    const a = alertes.find((x) => x.code === 'fin_credit_proche');
    assert.ok(a);
    assert.match(a!.detail, /189,50/);
    assert.equal(a!.action, 'Basculer vers l’épargne');
  });

  test('l’écart à l’objectif de 200 € est annoncé, pas masqué', () => {
    const a = alertes.find((x) => x.code === 'epargne_inatteignable');
    assert.ok(a);
    assert.match(a!.titre, /200,00/); // l'objectif reste affiché à 200 €
    assert.match(a!.detail, /-189,21/); // écart
    assert.match(a!.detail, /10,79/); // versement réellement exécutable
  });

  test('la taxe foncière 2026 est traitée comme échéance exceptionnelle', () => {
    const a = alertes.find((x) => x.code === 'echeance_exceptionnelle');
    assert.ok(a);
    assert.equal(a!.niveau, 'critique'); // aucun scénario finançable
    // Intl utilise une espace fine insécable comme séparateur de milliers.
    assert.match(a!.titre.replace(/\s/g, ' '), /1 600,00/);
  });

  test('aucune alerte ne réclame une provision de 800 €/mois', () => {
    for (const a of alertes) assert.ok(!a.detail.includes('800,00 €/mois'));
  });

  test('un dépassement d’enveloppe remonte en tête de liste', () => {
    const transactions: Transaction[] = [
      {
        id: 't1',
        date: '2026-08-10',
        montant: eur(560),
        type: 'depense',
        categorieId: CATEGORIES.courses,
        compteId: 'cpt_courant',
        source: 'manual',
        statut: 'validated',
      },
    ];
    const resultat = genererAlertes(foyer2026, transactions, '2026-08-23');
    assert.equal(resultat[0].niveau, 'critique');
    const depassement = resultat.find((a) => a.code === 'budget_depassement');
    assert.ok(depassement);
    assert.match(depassement!.detail, /60,00/);
  });

  test('les alertes sont triées par gravité décroissante', () => {
    const rang = { critique: 0, attention: 1, info: 2 } as const;
    for (let i = 1; i < alertes.length; i++) {
      assert.ok(rang[alertes[i].niveau] >= rang[alertes[i - 1].niveau]);
    }
  });
});
