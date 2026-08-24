import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eur } from '../src/money.ts';
import {
  analyserEcheance,
  analyserEcheances,
  mensualisationPossiblePour,
} from '../src/echeances.ts';
import { etatProvisions } from '../src/provisions.ts';
import { foyer2026 } from '../src/fixtures/foyer2026.ts';

const AUJOURDHUI = '2026-08-23';
const taxe2026 = foyer2026.echeancesExceptionnelles.find((e) => e.id === 'taxe_fonciere_2026')!;

describe('Séparation dette 2026 / provision future', () => {
  test('la taxe foncière 2026 n’est PAS une provision', () => {
    assert.equal(foyer2026.provisions.find((p) => p.id === 'taxe_fonciere_2026'), undefined);
    assert.equal(taxe2026.montant, eur(1600));
  });

  test('la provision taxe foncière vise 2027 et suivantes, à 133,33 €/mois', () => {
    const prov = foyer2026.provisions.find((p) => p.id === 'prov_taxe_fonciere')!;
    assert.match(prov.nom, /2027/);
    assert.equal(prov.dotationMensuelle, eur(133.33));
  });

  test('aucune provision ne réclame 800 €/mois', () => {
    for (const e of etatProvisions(foyer2026.provisions, AUJOURDHUI)) {
      assert.ok(e.dotationMensuelle <= eur(200));
      assert.ok(e.dotationRequise === null || e.dotationRequise <= eur(200));
    }
  });
});

describe('Calendrier de la mensualisation', () => {
  test('trop tard pour 2026 au 23 août', () => {
    assert.equal(mensualisationPossiblePour(2026, AUJOURDHUI), false);
  });

  test('encore possible avant le 30 juin 2026', () => {
    assert.equal(mensualisationPossiblePour(2026, '2026-06-30'), true);
    assert.equal(mensualisationPossiblePour(2026, '2026-07-01'), false);
  });

  test('ouverte pour 2027', () => {
    assert.equal(mensualisationPossiblePour(2027, AUJOURDHUI), true);
  });
});

describe('Scénarios de financement — taxe foncière 2026', () => {
  test('montant déjà mis de côté inconnu : reste à décaisser null, base = borne supérieure', () => {
    const a = analyserEcheance(foyer2026, taxe2026, AUJOURDHUI);
    assert.equal(a.dejaProvisionne, null);
    assert.equal(a.resteADecaisser, null); // et surtout pas 1 600 € affirmés
    assert.equal(a.baseFinancement, eur(1600));
    assert.equal(a.baseEstBorneSuperieure, true);
    assert.equal(a.montantEstime, true);
  });

  test('sans date confirmée, aucun scénario daté n’est fabriqué', () => {
    const a = analyserEcheance(foyer2026, taxe2026, AUJOURDHUI);
    assert.equal(a.dateEcheance, null);
    assert.equal(a.moisAvantEcheance, null);
    assert.deepEqual(
      a.scenarios.map((s) => s.id),
      ['epargne_disponible', 'compression_variables', 'delai_administratif'],
    );
    assert.ok(!a.scenarios.some((s) => s.id === 'marge_budgetaire_du_mois'));
  });

  test('épargne de solde INCONNU : indéterminé, jamais « 0 € disponible »', () => {
    const a = analyserEcheance(foyer2026, taxe2026, AUJOURDHUI);
    const s = a.scenarios.find((x) => x.id === 'epargne_disponible')!;
    assert.equal(s.faisabilite, 'indetermine');
    assert.equal(s.montantMobilisable, null);
    assert.equal(s.resteAFinancer, null);
    assert.match(s.detail, /ni retenu ni écarté/);
  });

  test('compression : mois inconnu faute de date, donc indéterminé', () => {
    const s = analyserEcheance(foyer2026, taxe2026, AUJOURDHUI).scenarios.find(
      (x) => x.id === 'compression_variables',
    )!;
    assert.equal(s.faisabilite, 'indetermine');
    assert.equal(s.montantMobilisable, null);
  });

  test('scénario SIMULÉ en octobre : la marge budgétaire ne suffit pas', () => {
    const a = analyserEcheance(
      foyer2026,
      { ...taxe2026, dateEcheance: '2026-10-15', dejaProvisionne: eur(0) },
      AUJOURDHUI,
    );
    assert.equal(a.moisAvantEcheance, 2);
    assert.equal(a.resteADecaisser, eur(1600));
    const s = a.scenarios.find((x) => x.id === 'marge_budgetaire_du_mois')!;
    assert.equal(s.faisabilite, 'insuffisant');
    assert.equal(s.montantMobilisable, eur(200.29));
    assert.equal(s.resteAFinancer, eur(1399.71));
  });

  test('compression sur 2 mois : 380 € au maximum, très loin du compte', () => {
    const s = analyserEcheance(
      foyer2026,
      { ...taxe2026, dateEcheance: '2026-10-15', dejaProvisionne: eur(0) },
      AUJOURDHUI,
    ).scenarios.find((x) => x.id === 'compression_variables')!;
    // 90 restaurants + 70 sorties + 20 vêtements + 10 divers = 190 €/mois
    assert.equal(s.montantMobilisable, eur(380));
    assert.equal(s.faisabilite, 'insuffisant');
    assert.equal(s.resteAFinancer, eur(1220));
  });

  test('une épargne suffisante et connue rend le scénario faisable', () => {
    const config = {
      ...foyer2026,
      objectifsEpargne: foyer2026.objectifsEpargne.map((o) =>
        o.type === 'urgence' ? { ...o, montantActuel: eur(2000) } : { ...o, montantActuel: eur(0) },
      ),
    };
    const s = analyserEcheance(config, taxe2026, AUJOURDHUI).scenarios.find(
      (x) => x.id === 'epargne_disponible',
    )!;
    assert.equal(s.faisabilite, 'faisable');
    assert.equal(s.montantMobilisable, eur(2000));
    assert.equal(s.resteAFinancer, eur(0));
  });

  test('le délai administratif reste « à vérifier », jamais promis', () => {
    const s = analyserEcheances(foyer2026, AUJOURDHUI)[0].scenarios.find(
      (x) => x.id === 'delai_administratif',
    )!;
    assert.equal(s.faisabilite, 'a_verifier');
    assert.match(s.detail, /n’est pas automatique/);
  });

  test('la note rappelle que la mensualisation ne sauvera pas 2026', () => {
    assert.match(taxe2026.note!, /30 juin 2026/);
    assert.match(taxe2026.note!, /2027/);
  });
});
