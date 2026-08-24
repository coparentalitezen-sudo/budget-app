import type { Cents } from '@budget/core/src/money.ts';
import { montant } from '../lib/format.ts';

/**
 * Graphique en anneau, en SVG pur.
 *
 * Aucune bibliothèque de graphiques : un anneau est un cercle avec un
 * `stroke-dasharray`, et une dépendance de 100 Ko pour cela serait payée
 * au chargement de chaque écran sur mobile.
 *
 * Aucun calcul métier ici : les parts arrivent déjà calculées par le moteur.
 */

export interface PartAnneau {
  cle: string;
  nom: string;
  montant: Cents;
  /** Fraction du total, entre 0 et 1, fournie par le moteur. */
  part: number;
}

const PALETTE = [
  '#4ade80', '#38bdf8', '#a78bfa', '#fbbf24',
  '#fb7185', '#2dd4bf', '#f472b6', '#94a3b8',
];

const RAYON = 54;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

export function Anneau({
  parts,
  total,
  legendeCentre,
  note,
}: {
  parts: PartAnneau[];
  total: Cents;
  legendeCentre: string;
  note?: string;
}) {
  if (parts.length === 0 || total === 0) {
    return <p className="note">Aucune donnée à représenter pour le moment.</p>;
  }

  let offset = 0;
  const segments = parts.map((p, i) => {
    const longueur = p.part * CIRCONFERENCE;
    const segment = {
      ...p,
      couleur: PALETTE[i % PALETTE.length],
      dash: `${longueur} ${CIRCONFERENCE - longueur}`,
      // Décalage négatif : les segments s'enchaînent dans le sens horaire.
      decalage: -offset,
    };
    offset += longueur;
    return segment;
  });

  return (
    <div className="anneau-bloc">
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
          <text x="70" y="66" className="anneau-total">{montant(total)}</text>
          <text x="70" y="84" className="anneau-libelle">{legendeCentre}</text>
        </svg>
      </div>

      <ul className="anneau-legende">
        {segments.map((s) => (
          <li key={s.cle}>
            <span className="pastille" style={{ background: s.couleur }} />
            <span className="legende-nom">{s.nom}</span>
            <span className="legende-part">{Math.round(s.part * 100)} %</span>
            <span className="legende-montant">{montant(s.montant)}</span>
          </li>
        ))}
      </ul>

      {note && <p className="note">{note}</p>}
    </div>
  );
}
