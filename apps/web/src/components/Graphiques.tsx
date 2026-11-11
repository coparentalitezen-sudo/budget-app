import { useState } from 'react';
import type { Cents } from '@budget/core/src/money.ts';
import type { JourDepenses } from '@budget/core/src/budget.ts';
import { joursDansMois, jourSemaine } from '@budget/core/src/periode.ts';
import type { Transaction } from '@budget/core/src/types.ts';
import type { StyleCategorie } from '../lib/categories.ts';
import { jourMois, montant, montantArrondi } from '../lib/format.ts';

/**
 * Graphiques de l'accueil, en SVG pur (aucune bibliothèque, voir
 * `Anneau.tsx`). Comme partout dans `apps/web`, AUCUN calcul métier : les
 * montants arrivent du moteur ; ce fichier ne fait que les placer.
 */

/* ------------------------------------------------------------------ */
/* Anneau « reste à dépenser »                                         */
/* ------------------------------------------------------------------ */

export interface SegmentAnneau {
  cle: string;
  couleur: string;
  /** Part de l'enveloppe totale, entre 0 et 1. */
  ratio: number;
}

const R = 58;
const CIRC = 2 * Math.PI * R;

/**
 * Chaque catégorie dépensée occupe sa part de l'enveloppe du mois, dans sa
 * couleur ; la partie restée vide est ce qu'il reste à dépenser. Au-delà de
 * 100 %, l'anneau entier passe en rouge : un dépassement ne doit jamais
 * ressembler à un mois normal.
 */
export function AnneauRestant({
  segments,
  depasse,
  valeur,
  libelle,
}: {
  segments: SegmentAnneau[];
  depasse: boolean;
  valeur: string;
  libelle: string;
}) {
  let decalage = 0;
  return (
    <div className="anneau-restant">
      <svg viewBox="0 0 150 150" role="img" aria-label={`${valeur} ${libelle}`}>
        <g transform="rotate(-90 75 75)">
          <circle cx="75" cy="75" r={R} className="anneau-restant-fond" />
          {depasse ? (
            <circle cx="75" cy="75" r={R} className="anneau-restant-segment" style={{ stroke: 'var(--critique)' }} />
          ) : (
            segments.map((s) => {
              const longueur = Math.max(0, s.ratio) * CIRC;
              const cercle = (
                <circle
                  key={s.cle}
                  cx="75"
                  cy="75"
                  r={R}
                  className="anneau-restant-segment"
                  style={{ stroke: s.couleur }}
                  strokeDasharray={`${longueur} ${CIRC - longueur}`}
                  strokeDashoffset={-decalage}
                />
              );
              decalage += longueur;
              return cercle;
            })
          )}
        </g>
      </svg>
      <div className="anneau-restant-centre">
        <span className={`anneau-restant-valeur${depasse ? ' ton-negatif' : ''}`}>{valeur}</span>
        <span className="anneau-restant-libelle">{libelle}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barre de répartition                                                */
/* ------------------------------------------------------------------ */

export function BarreRepartition({ parts }: { parts: { cle: string; couleur: string; ratio: number }[] }) {
  return (
    <div className="barre-repartition" aria-hidden="true">
      {parts
        .filter((p) => p.ratio > 0)
        .map((p) => (
          <span key={p.cle} style={{ flexGrow: p.ratio, background: p.couleur }} />
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ligne d'enveloppe                                                   */
/* ------------------------------------------------------------------ */

export function LigneEnveloppe({
  nom,
  style,
  depense,
  prevu,
  ratio,
  onClick,
}: {
  nom: string;
  style: StyleCategorie;
  depense: Cents;
  prevu: Cents;
  /** `depense / prevu`, déjà calculé par le moteur (`LigneCategorie.pourcentage`). */
  ratio: number;
  onClick?: () => void;
}) {
  const etat = ratio > 1 ? 'depassement' : ratio >= 0.8 ? 'vigilance' : 'ok';
  const contenu = (
    <>
      <span className="pastille-categorie" style={{ background: `${style.couleur}24`, color: style.couleur }}>
        {style.icone}
      </span>
      <span className="enveloppe-corps">
        <span className="enveloppe-tete">
          <span className="enveloppe-nom">{nom}</span>
          <span className={`enveloppe-pourcent enveloppe-${etat}`}>{Math.round(ratio * 100)} %</span>
        </span>
        <span className="enveloppe-barre">
          <span
            style={{
              width: `${Math.min(100, Math.max(0, ratio * 100))}%`,
              background: etat === 'depassement' ? 'var(--critique)' : style.couleur,
            }}
          />
        </span>
        <span className="enveloppe-pied">
          <span>{montant(depense)} dépensés</span>
          <span className={ratio > 1 ? 'ton-negatif' : undefined}>sur {montant(prevu)}</span>
        </span>
      </span>
    </>
  );
  return onClick ? (
    <button className="enveloppe-ligne enveloppe-cliquable" onClick={onClick}>{contenu}</button>
  ) : (
    <div className="enveloppe-ligne">{contenu}</div>
  );
}

/* ------------------------------------------------------------------ */
/* Calendrier du mois                                                  */
/* ------------------------------------------------------------------ */

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function Calendrier({
  periode,
  aujourdhui,
  jours,
  transactions,
  styleDe,
  nomDe,
}: {
  periode: string;
  aujourdhui: string;
  jours: JourDepenses[];
  transactions: Transaction[];
  styleDe: (categorieId: string) => StyleCategorie;
  nomDe: (categorieId: string | null) => string;
}) {
  const [selection, setSelection] = useState<string | null>(null);
  const nbJours = joursDansMois(periode);
  const premier = jourSemaine(`${periode}-01`);
  const parDate = new Map(jours.map((j) => [j.date, j]));

  const cases: (string | null)[] = [
    ...Array.from({ length: premier - 1 }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => `${periode}-${String(i + 1).padStart(2, '0')}`),
  ];

  const operationsDuJour = selection
    ? transactions
        .filter((t) => t.date === selection)
        .sort((a, b) => b.montant - a.montant)
    : [];

  return (
    <div className="calendrier">
      <div className="calendrier-grille">
        {JOURS.map((j, i) => (
          <span key={`${j}-${i}`} className="calendrier-jour-nom">{j}</span>
        ))}
        {cases.map((date, i) => {
          if (!date) return <span key={`vide-${i}`} />;
          const jour = parDate.get(date);
          const style = jour ? styleDe(jour.categories[0].categorieId) : null;
          const classes = [
            'calendrier-case',
            date === aujourdhui ? 'calendrier-aujourdhui' : '',
            date === selection ? 'calendrier-selection' : '',
            date > aujourdhui ? 'calendrier-futur' : '',
          ].join(' ');
          return (
            <button
              key={date}
              className={classes}
              onClick={() => setSelection((s) => (s === date ? null : date))}
              aria-label={`${jourMois(date)}${jour ? `, ${montant(jour.depensesVariables)} dépensés` : ''}`}
            >
              <span className="calendrier-numero">{Number(date.slice(8))}</span>
              {jour && style && (
                <>
                  <span className="calendrier-icone" style={{ background: `${style.couleur}2e` }}>
                    {style.icone}
                  </span>
                  <span className="calendrier-montant">−{montantArrondi(jour.depensesVariables)}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {selection && (
        <div className="calendrier-detail">
          <p className="detail-solde-soustitre">{jourMois(selection)}</p>
          {operationsDuJour.length === 0 && <p className="note">Aucune opération ce jour-là.</p>}
          {operationsDuJour.map((t) => {
            const style = t.categorieId ? styleDe(t.categorieId) : null;
            const entree = t.type === 'revenu' || t.type === 'remboursement' || t.type === 'reprise_epargne';
            return (
              <div key={t.id} className="calendrier-operation">
                <span
                  className="pastille-categorie pastille-petite"
                  style={style ? { background: `${style.couleur}24`, color: style.couleur } : undefined}
                >
                  {style?.icone ?? '•'}
                </span>
                <span className="calendrier-operation-texte">
                  <span>{t.commercant ?? t.description ?? 'Sans libellé'}</span>
                  <span className="note">{nomDe(t.categorieId)}</span>
                </span>
                <span className={`transaction-montant${entree ? ' ton-positif' : ''}`}>
                  {entree ? '+' : '−'}{montant(t.montant)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Flux « Où part votre argent »                                       */
/* ------------------------------------------------------------------ */

export interface NoeudFlux {
  cle: string;
  nom: string;
  montant: Cents;
  couleur: string;
  /** Détail affiché en troisième colonne ; sans détail, le poste s'arrête en deuxième. */
  enfants?: NoeudFlux[];
}

const LARGEUR = 340;
const X_GROUPES = 104;
const X_DETAIL = 196;
const NOEUD = 8;
const HAUTEUR_UTILE = 250;
const CRENEAU_MIN = 15;

function bande(x1: number, y1: number, x2: number, y2: number, h: number): string {
  const xm = (x1 + x2) / 2;
  return `M${x1} ${y1} C${xm} ${y1} ${xm} ${y2} ${x2} ${y2} L${x2} ${y2 + h} C${xm} ${y2 + h} ${xm} ${y1 + h} ${x1} ${y1 + h} Z`;
}

const tronquer = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * Diagramme de flux (type Sankey) : revenus → grands postes → détail.
 * Épaisseurs proportionnelles aux montants ; seules les positions
 * verticales sont espacées pour garder chaque libellé lisible.
 */
export function FluxArgent({ groupes }: { groupes: NoeudFlux[] }) {
  const visibles = groupes.filter((g) => g.montant > 0);
  const total = visibles.reduce((s, g) => s + g.montant, 0);
  if (total <= 0) return <p className="note">Aucun revenu ni poste configuré.</p>;
  const echelle = (m: Cents) => Math.max(1.5, (m / total) * HAUTEUR_UTILE);

  let yDetail = 0;
  let yGauche = 0;
  const blocs = visibles.map((g) => {
    const enfants = (g.enfants ?? []).filter((e) => e.montant > 0);
    const hGroupe = echelle(g.montant);
    const yGroupe = yDetail;
    const sommeEnfants = enfants.reduce((s, x) => s + echelle(x.montant), 0);
    let ySortie = yGroupe;
    const details = enfants.map((d) => {
      const h = echelle(d.montant) * (hGroupe / sommeEnfants);
      const placee = { ...d, y: yDetail, h, ySortie };
      ySortie += h;
      yDetail += Math.max(h, CRENEAU_MIN) + 3;
      return placee;
    });
    // Sans détail, le poste s'arrête en deuxième colonne : son libellé y
    // prend la place, il n'est pas répété une seconde fois à droite.
    if (details.length === 0) yDetail += Math.max(hGroupe, CRENEAU_MIN);
    yDetail += 8;
    const bloc = { ...g, y: yGroupe, h: hGroupe, yEntree: yGauche, details };
    yGauche += hGroupe;
    return bloc;
  });
  const hauteur = Math.max(yDetail, yGauche) + 2;

  return (
    <svg className="flux" viewBox={`0 0 ${LARGEUR} ${hauteur}`} role="img" aria-label="Répartition des revenus du mois">
      {blocs.map((b) => (
        <g key={b.cle}>
          <path d={bande(NOEUD, b.yEntree, X_GROUPES, b.y, b.h)} style={{ fill: b.couleur }} className="flux-lien" />
          {b.details.map((d) => (
            <path key={d.cle} d={bande(X_GROUPES + NOEUD, d.ySortie, X_DETAIL, d.y, d.h)} style={{ fill: d.couleur }} className="flux-lien" />
          ))}
        </g>
      ))}
      <rect x="0" y="0" width={NOEUD} height={yGauche} rx="3" className="flux-source" />
      {blocs.map((b) => (
        <g key={`n-${b.cle}`}>
          <rect x={X_GROUPES} y={b.y} width={NOEUD} height={b.h} rx="3" style={{ fill: b.couleur }} />
          {b.details.length > 0 ? (
            <text x={X_GROUPES - 4} y={b.y + b.h / 2 + 3.5} className="flux-texte flux-texte-groupe">
              {tronquer(b.nom, 14)}
            </text>
          ) : (
            <text x={X_GROUPES + NOEUD + 5} y={b.y + b.h / 2 + 3.5} className="flux-texte flux-texte-fin">
              {b.nom}
              <tspan className="flux-montant" x={LARGEUR} textAnchor="end">{montantArrondi(b.montant)}</tspan>
            </text>
          )}
          {b.details.map((d) => (
            <g key={`d-${d.cle}`}>
              <rect x={X_DETAIL} y={d.y} width={NOEUD} height={d.h} rx="2" style={{ fill: d.couleur }} />
              <text x={X_DETAIL + NOEUD + 5} y={d.y + d.h / 2 + 3.5} className="flux-texte">
                {tronquer(d.nom, 15)}
                <tspan className="flux-montant" x={LARGEUR} textAnchor="end">{montantArrondi(d.montant)}</tspan>
              </text>
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}
