import { useEffect, useMemo, useState } from 'react';
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
  const [source, setSource] = useState<'cache' | 'distant' | 'defaut'>('defaut');

  useEffect(() => {
    let annule = false;
    void (async () => {
      const cache = await configurationLocale();
      if (cache && !annule) setSource('cache');
      const distante = await chargerConfiguration(periodeDe(new Date().toISOString().slice(0, 10)));
      if (distante && !annule) setSource('distant');
    })();
    return () => { annule = true; };
  }, []);

  // Lecture EN DIRECT du cache local (comme `useTransactions`) : toute
  // écriture qui touche la configuration (rafraîchissement réseau, création
  // de catégorie, changement de solde...) met immédiatement à jour tous les
  // écrans qui l'affichent, sans attendre un remontage complet de
  // l'application — c'était le cas avant (config restait figée tant que
  // l'écran ne se démontait pas).
  const configBrute = useLiveQuery(() => configurationLocale(), [], null) ?? configurationParDefaut;

  // Point UNIQUE de tri : tous les écrans lisent leurs catégories via ce
  // hook (aucun n'appelle `configurationLocale`/`chargerConfiguration`
  // directement), donc les trier ici suffit à garantir l'ordre alphabétique
  // PARTOUT — y compris juste après la création d'une nouvelle catégorie,
  // qui arriverait sinon en dernière position (ordre d'insertion en base,
  // sans aucune signification pour l'utilisateur).
  const config = useMemo<Configuration>(
    () => ({
      ...configBrute,
      categories: [...configBrute.categories].sort((a, b) =>
        a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }),
      ),
    }),
    [configBrute],
  );

  return { config, source };
}

export function useTransactions(): Transaction[] {
  return useLiveQuery(() => db.transactions.toArray(), [], []) ?? [];
}

export function useOutboxCount(): number {
  return useLiveQuery(() => db.outbox.count(), [], 0) ?? 0;
}
