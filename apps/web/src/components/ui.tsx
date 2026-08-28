import type { ReactNode } from 'react';
import { INCONNU } from '../lib/format.ts';
import { app } from '../config/app.config.ts';

export function Carte({
  titre,
  action,
  className,
  children,
}: {
  titre?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`carte${className ? ` ${className}` : ''}`}>
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

/** Couleurs d'accent partagées entre les cartes KPI, badges et jauges. */
export const COULEUR_REVENUS = app.marque.couleurs.accent;
export const COULEUR_DEPENSES = app.marque.couleurs.bleu;
export const COULEUR_EPARGNE = app.marque.couleurs.violet;

/** Pastille ronde colorée portant une icône (emoji) — purement décoratif. */
export function IconeBadge({ emoji, couleur }: { emoji: string; couleur: string }) {
  return (
    <span className="icone-badge" style={{ background: `${couleur}26`, color: couleur }}>
      {emoji}
    </span>
  );
}

/**
 * Jauge semi-circulaire, pour un objectif unique (ex. l'épargne).
 * `ratio` est fourni déjà calculé par l'appelant à partir de valeurs issues
 * du moteur (aucun calcul métier ici) ; il peut dépasser 1, le tracé est
 * alors simplement plafonné à un cercle plein.
 */
export function JaugeSemiCirculaire({
  ratio,
  valeurCentre,
  labelCentre,
  couleur = COULEUR_EPARGNE,
}: {
  ratio: number;
  valeurCentre: string;
  labelCentre: string;
  couleur?: string;
}) {
  const rempli = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="semi-jauge">
      <svg viewBox="0 0 120 68" role="img" aria-label={labelCentre}>
        <path d="M10 60 A50 50 0 0 1 110 60" className="semi-jauge-fond" />
        <path
          d="M10 60 A50 50 0 0 1 110 60"
          className="semi-jauge-remplissage"
          style={{ stroke: couleur }}
          pathLength={100}
          strokeDasharray={`${rempli} 100`}
        />
      </svg>
      <div className="semi-jauge-centre">
        <span className="semi-jauge-valeur">{valeurCentre}</span>
        <span className="semi-jauge-label">{labelCentre}</span>
      </div>
    </div>
  );
}
