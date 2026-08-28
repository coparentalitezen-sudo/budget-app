import { useEffect, useState } from 'react';
import { appliquerMiseAJour, ecouterMiseAJourDisponible } from '../pwa.ts';

/**
 * Bandeau « nouvelle version disponible ». N'apparaît jamais tout seul :
 * seul l'appui sur « Actualiser » déclenche le rechargement (voir `pwa.ts`)
 * — la saisie en cours n'est jamais perdue sans que l'utilisateur l'ait
 * demandé.
 */
export function BandeauMiseAJour() {
  const [disponible, setDisponible] = useState(false);

  useEffect(() => ecouterMiseAJourDisponible(() => setDisponible(true)), []);

  if (!disponible) return null;

  return (
    <div className="bandeau-maj">
      <span>Nouvelle version disponible.</span>
      <button className="bouton bouton-principal" onClick={appliquerMiseAJour}>
        Actualiser
      </button>
    </div>
  );
}
