import type { CleOnglet } from '../config/app.config.ts';

/**
 * Icônes de la barre de navigation, en SVG au trait : nettes à toutes les
 * tailles et colorées par `currentColor` (l'onglet actif prend la couleur
 * de la marque), là où un emoji garde ses propres couleurs.
 */
const TRACES: Partial<Record<CleOnglet, JSX.Element>> = {
  accueil: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  transactions: (
    <>
      <path d="M7 4h13M7 12h13M7 20h13" />
      <circle cx="3" cy="4" r="0.8" /><circle cx="3" cy="12" r="0.8" /><circle cx="3" cy="20" r="0.8" />
    </>
  ),
  budget: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9h-9z" />
      <path d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
    </>
  ),
  epargne: (
    <>
      <path d="M19 10c1.5 0 2 1 2 2M5 11a7 6 0 0 1 12-2.5L19 8v4l-1.5 1.2V17h-3v-1.5h-5V17h-3v-2.6A6 6 0 0 1 5 11z" />
      <circle cx="15" cy="10.5" r="0.6" />
    </>
  ),
  plus: (
    <>
      <circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />
    </>
  ),
};

export function IconeOnglet({ cle }: { cle: CleOnglet }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRACES[cle] ?? TRACES.plus}
    </svg>
  );
}
