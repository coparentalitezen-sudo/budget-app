/**
 * Tests des garde-fous de l'API d'assistance.
 * Aucune connexion réseau : on vérifie le comportement de la validation,
 * qui est la seule barrière entre un jeton fuité et vos données.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { entier, verifier } from '../api/_assistance.ts';

const JETON = 'x'.repeat(48);

function configurer(surcharges: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    AI_ASSISTANT_API_TOKEN: JETON,
    SUPABASE_URL: 'https://exemple.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'cle-de-service',
    AI_ASSISTANT_USER_ID: '11111111-1111-1111-1111-111111111111',
    ...surcharges,
  };
  for (const [cle, valeur] of Object.entries(base)) {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
}

const requete = (options: { methode?: string; jeton?: string; url?: string } = {}) =>
  new Request(options.url ?? 'https://exemple.test/api/transactions', {
    method: options.methode ?? 'GET',
    headers: options.jeton ? { authorization: `Bearer ${options.jeton}` } : {},
  });

beforeEach(() => configurer());

describe('Lecture seule', () => {
  for (const methode of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    test(`${methode} est refusé même avec un jeton valide`, () => {
      const r = verifier(requete({ methode, jeton: JETON }));
      assert.ok(r instanceof Response);
      assert.equal((r as Response).status, 405);
    });
  }
});

describe('Authentification', () => {
  test('sans jeton : 401', () => {
    const r = verifier(requete());
    assert.equal((r as Response).status, 401);
  });

  test('jeton erroné de même longueur : 401', () => {
    const r = verifier(requete({ jeton: 'y'.repeat(48) }));
    assert.equal((r as Response).status, 401);
  });

  test('bon préfixe mais jeton incomplet : 401', () => {
    const r = verifier(requete({ jeton: 'x'.repeat(47) }));
    assert.equal((r as Response).status, 401);
  });

  test('jeton valide : contexte utilisable', () => {
    const r = verifier(requete({ jeton: JETON }));
    assert.ok(!(r instanceof Response));
    assert.equal((r as { userId: string }).userId, '11111111-1111-1111-1111-111111111111');
  });
});

describe('Refus de servir plutôt que de s’ouvrir', () => {
  test('variable manquante : 503, jamais un accès libre', () => {
    for (const manquante of [
      'AI_ASSISTANT_API_TOKEN',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'AI_ASSISTANT_USER_ID',
    ]) {
      configurer({ [manquante]: undefined });
      const r = verifier(requete({ jeton: JETON }));
      assert.equal((r as Response).status, 503, `${manquante} absente`);
    }
  });

  test('un jeton trop court est refusé au lieu d’être accepté', () => {
    configurer({ AI_ASSISTANT_API_TOKEN: 'court' });
    const r = verifier(requete({ jeton: 'court' }));
    assert.equal((r as Response).status, 503);
  });
});

describe('Bornage des paramètres', () => {
  test('une limite excessive est ramenée au plafond', () => {
    const url = new URL('https://exemple.test/api/transactions?limit=999999');
    assert.equal(entier(url, 'limit', 200, 1000), 1000);
  });

  test('une valeur absurde retombe sur la valeur par défaut', () => {
    for (const brut of ['abc', '-5', '']) {
      const url = new URL(`https://exemple.test/api/transactions?limit=${brut}`);
      assert.equal(entier(url, 'limit', 200, 1000), 200);
    }
  });
});

describe('Aucune fuite de secret', () => {
  test('les réponses d’erreur ne contiennent aucune valeur sensible', async () => {
    const reponses = [
      verifier(requete()) as Response,
      verifier(requete({ methode: 'POST', jeton: JETON })) as Response,
    ];
    for (const r of reponses) {
      const corps = await r.text();
      assert.ok(!corps.includes(JETON));
      assert.ok(!corps.includes('cle-de-service'));
      assert.ok(!corps.includes('supabase.co'));
    }
  });

  test('les réponses ne sont jamais mises en cache ni indexées', () => {
    const r = verifier(requete()) as Response;
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  });
});
