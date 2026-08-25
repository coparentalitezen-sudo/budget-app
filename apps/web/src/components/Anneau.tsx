import type { Cents } from '@budget/core/src/money.ts';
import { montant } from '../lib/format.ts';

/**
 * Graphique en anneau, en SVG pur.
 *
 * Aucune bibliothèque de graphiques : un anneau est un cercle avec un
 * `stroke-dasharray`, et une dépendance de 100 Ko pour cela serait payée
 * au chargement de chaque écran sur mobile.
 *
 * Aucun calcul métier ici : les parts, montants et pourcentages arrivent
 * déjà calculés par le moteur. Ce composant ne fait que les dessiner et,
 * pour la légende, replier la queue de distribution au-delà de `limiteLegende`
 * — un simple découpage d'affichage, aucune valeur n'est recalculée.
 */

export interface PartAnneau {
  cle: string;
  nom: string;
  montant: Cents;
  /** Fraction du total, entre 0 et 1, fournie par le moteur. */
  part: number;
}

export const PALETTE_ANNEAU = [
  '#4ade80', '#38bdf8', '#a78bfa', '#fbbf24',
  '#fb7185', '#2dd4bf', '#f472b6', '#94a3b8',
];

const RAYON = 54;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

export function Anneau({
  parts,
  total,
  legendeCentre,
  centreValeur,
  compact = false,
  limiteLegende,
  videTexte = 'Aucune donnée pour le moment.',
  note,
  lienDetail,
}: {
  parts: PartAnneau[];
  total: Cents;
  /** Sous-texte affiché sous la valeur centrale, ex. « prévus », « du budget ». */
  legendeCentre: string;
  /** Texte central ; par défaut le montant total. */
  centreValeur?: string;
  compact?: boolean;
  /** Nombre maximal de lignes de légende ; le reste est replié en compteur. */
  limiteLegende?: number;
  videTexte?: string;
  note?: string;
  lienDetail?: { texte: string; onClick: () => void };
}) {
  const taille = compact ? 'anneau-bloc-compact' : '';

  if (parts.length === 0 || total === 0) {
    return (
      <div className={`anneau-bloc anneau-vide ${taille}`}>
        <div className="anneau-graphe">
          <svg viewBox="0 0 140 140" role="img" aria-label={videTexte}>
            <circle cx="70" cy="70" r={RAYON} className="anneau-fond" />
            <text x="70" y="74" className="anneau-libelle">—</text>
          </svg>
        </div>
        <p className="note anneau-vide-texte">{videTexte}</p>
        {lienDetail && (
          <button className="lien lien-detail" onClick={lienDetail.onClick}>
            {lienDetail.texte} ›
          </button>
        )}
      </div>
    );
  }

  let offset = 0;
  const segments = parts.map((p, i) => {
    const longueur = p.part * CIRCONFERENCE;
    const segment = {
      ...p,
      couleur: PALETTE_ANNEAU[i % PALETTE_ANNEAU.length],
      dash: `${longueur} ${CIRCONFERENCE - longueur}`,
      // Décalage négatif : les segments s'enchaînent dans le sens horaire.
      decalage: -offset,
    };
    offset += longueur;
    return segment;
  });

  const lignesLegende = limiteLegende ? segments.slice(0, limiteLegende) : segments;
  const masquees = segments.length - lignesLegende.length;

  return (
    <div className={`anneau-bloc ${taille}`}>
      <div className="anneau-graphe">
        <svg viewBox="0 0 140 140" role="img" aria-label={legendeCentre}>
          <g transform="rotate(-90 70 70)">
            <circle cx="70" cy="70" r={RAYON} className="anneau-fond" />
            {segments.map((s) => (
              <circle
                key={s.cle}
                cx="70"
                cy="70"
                r={RAYON}
                className="anneau-segment"
                stroke={s.couleur}
                strokeDasharray={s.dash}
                strokeDashoffset={s.decalage}
              />
            ))}
          </g>
          <text x="70" y="66" className="anneau-total">{centreValeur ?? montant(total)}</text>
          <text x="70" y="84" className="anneau-libelle">{legendeCentre}</text>
        </svg>
      </div>

      <ul className="anneau-legende">
        {lignesLegende.map((s) => (
          <li key={s.cle}>
            <span className="pastille" style={{ background: s.couleur }} />
            <span className="legende-nom">{s.nom}</span>
            <span className="legende-part">{Math.round(s.part * 100)} %</span>
            <span className="legende-montant">{montant(s.montant)}</span>
          </li>
        ))}
      </ul>
      {masquees > 0 && <p className="note anneau-plus">+ {masquees} autre(s) catégorie(s)</p>}

      {note && <p className="note">{note}</p>}
      {lienDetail && (
        <button className="lien lien-detail" onClick={lienDetail.onClick}>
          {lienDetail.texte} ›
        </button>
      )}
    </div>
  );
}
