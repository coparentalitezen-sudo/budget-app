import type { ReactNode } from 'react';
import { INCONNU } from '../lib/format.ts';

export function Carte({
  titre,
  action,
  children,
}: {
  titre?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="carte">
      {titre && (
        <header className="carte-tete">
          <h2>{titre}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Affiche une valeur potentiellement inconnue.
 * Une valeur inconnue reçoit un traitement visuel distinct : elle ne doit
 * jamais se confondre avec un montant réel, et surtout jamais avec zéro.
 */
export function Valeur({
  texte,
  taille = 'normale',
}: {
  texte: string;
  taille?: 'geante' | 'grande' | 'normale';
}) {
  const inconnu = texte === INCONNU;
  return (
    <span className={`valeur valeur-${taille}${inconnu ? ' valeur-inconnue' : ''}`}>
      {texte}
    </span>
  );
}

export function Ligne({
  libelle,
  valeur,
  ton,
}: {
  libelle: string;
  valeur: string;
  ton?: 'positif' | 'negatif' | 'neutre';
}) {
  return (
    <div className="ligne">
      <span className="ligne-libelle">{libelle}</span>
      <span className={`ligne-valeur${ton ? ` ton-${ton}` : ''}`}>{valeur}</span>
    </div>
  );
}

/** Barre de progression. `ratio` peut dépasser 1 pour montrer un dépassement. */
export function Jauge({ ratio, seuil = 0.8 }: { ratio: number; seuil?: number }) {
  const pourcent = Math.min(100, Math.max(0, ratio * 100));
  const etat = ratio > 1 ? 'depassement' : ratio >= 1 ? 'plein' : ratio >= seuil ? 'vigilance' : 'ok';
  return (
    <div className={`jauge jauge-${etat}`} role="progressbar" aria-valuenow={Math.round(ratio * 100)}>
      <div className="jauge-remplissage" style={{ width: `${pourcent}%` }} />
    </div>
  );
}

export function Etiquette({ children, ton }: { children: ReactNode; ton?: string }) {
  return <span className={`etiquette${ton ? ` etiquette-${ton}` : ''}`}>{children}</span>;
}

export function Vide({ message }: { message: string }) {
  return <p className="vide">{message}</p>;
}
