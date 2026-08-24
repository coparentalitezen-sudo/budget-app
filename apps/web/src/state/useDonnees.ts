import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie.ts';
import {
  chargerConfiguration,
  configurationLocale,
  configurationParDefaut,
} from '../db/repository.ts';
import { periodeDe } from '@budget/core/src/periode.ts';
import type { Configuration, Transaction } from '@budget/core/src/types.ts';

/**
 * Chargement de la configuration, hors ligne d'abord.
 *
 * Ordre : cache Dexie → affichage immédiat, puis rafraîchissement depuis
 * Supabase en arrière-plan. L'écran ne reste jamais vide en attendant le
 * réseau, et fonctionne intégralement sans lui.
 */
export function useConfiguration(): { config: Configuration; source: 'cache' | 'distant' | 'defaut' } {
  const [config, setConfig] = useState<Configuration>(configurationParDefaut);
  const [source, setSource] = useState<'cache' | 'distant' | 'defaut'>('defaut');

  useEffect(() => {
    let annule = false;
    void (async () => {
      const cache = await configurationLocale();
      if (cache && !annule) {
        setConfig(cache);
        setSource('cache');
      }
      const distante = await chargerConfiguration(periodeDe(new Date().toISOString().slice(0, 10)));
      if (distante && !annule) {
        setConfig(distante);
        setSource('distant');
      }
    })();
    return () => { annule = true; };
  }, []);

  return { config, source };
}

export function useTransactions(): Transaction[] {
  return useLiveQuery(() => db.transactions.toArray(), [], []) ?? [];
}

export function useOutboxCount(): number {
  return useLiveQuery(() => db.outbox.count(), [], 0) ?? 0;
}
