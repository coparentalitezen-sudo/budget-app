import { useEffect, useState } from 'react';
import { Carte, Etiquette, Vide } from '../components/ui.tsx';
import { dateCourte, montant } from '../lib/format.ts';
import { televergerPhoto } from '../db/syncJustificatifs.ts';
import { useConfiguration, useJustificatifs, type LigneJustificatif } from '../state/useDonnees.ts';
import type { StatutJustificatif } from '@budget/core/src/justificatifs.ts';

const LIBELLE_STATUT: Record<StatutJustificatif, string> = {
  en_attente: 'En attente',
  comptabilise: 'Comptabilisé',
  orphelin: 'Transaction supprimée',
};

const TON_STATUT: Record<StatutJustificatif, string | undefined> = {
  en_attente: 'attente',
  comptabilise: 'ok',
  orphelin: undefined,
};

/**
 * Liste des tickets photographiés (voir `SaisieRapide.tsx`), avec leur
 * statut. Ce statut n'est JAMAIS stocké : il est recalculé à chaque
 * affichage depuis le `pointage` de la transaction liée
 * (`statutJustificatif`), pour qu'un rapprochement bancaire (voir
 * `Rapprochement.tsx`) le fasse passer à « Comptabilisé » sans aucune
 * action supplémentaire.
 */
export function Justificatifs() {
  const lignes = useJustificatifs();
  const { config } = useConfiguration();
  const [ouvert, setOuvert] = useState<LigneJustificatif | null>(null);

  return (
    <div className="ecran">
      <Carte titre={`Justificatifs (${lignes.length})`}>
        {lignes.length === 0 && (
          <Vide message="Aucun ticket photographié pour l’instant — prenez-en un depuis la saisie rapide." />
        )}
        {lignes.map((l) => (
          <VignetteJustificatif
            key={l.justificatif.id}
            ligne={l}
            nomCategorie={config.categories.find((c) => c.id === l.transaction?.categorieId)?.nom}
            onOuvrir={() => setOuvert(l)}
          />
        ))}
      </Carte>

      {ouvert && <Visualiseur ligne={ouvert} onFermer={() => setOuvert(null)} />}
    </div>
  );
}

function VignetteJustificatif({
  ligne,
  nomCategorie,
  onOuvrir,
}: {
  ligne: LigneJustificatif;
  nomCategorie: string | undefined;
  onOuvrir: () => void;
}) {
  const url = useApercuPhoto(ligne);

  return (
    <button className="justificatif-ligne" onClick={onOuvrir}>
      <span className="justificatif-vignette">
        {url ? <img src={url} alt="Ticket" /> : <span className="justificatif-vignette-attente">…</span>}
      </span>
      <span className="justificatif-corps">
        <span className="justificatif-tete">
          <span>{ligne.transaction ? montant(ligne.transaction.montant) : '—'}</span>
          <Etiquette ton={TON_STATUT[ligne.statut]}>{LIBELLE_STATUT[ligne.statut]}</Etiquette>
        </span>
        <span className="justificatif-meta">
          {ligne.transaction ? dateCourte(ligne.transaction.date) : ''}
          {nomCategorie ? ` · ${nomCategorie}` : ''}
        </span>
      </span>
    </button>
  );
}

function Visualiseur({ ligne, onFermer }: { ligne: LigneJustificatif; onFermer: () => void }) {
  const url = useApercuPhoto(ligne);
  return (
    <div className="feuille" role="dialog" aria-label="Ticket">
      <div className="feuille-contenu">
        <header className="feuille-tete">
          <h2>Ticket</h2>
          <button className="lien" onClick={onFermer}>Fermer</button>
        </header>
        {url ? <img className="justificatif-plein" src={url} alt="Ticket" /> : <Vide message="Téléchargement…" />}
      </div>
    </div>
  );
}

/** Objet URL de l'aperçu — télécharge la photo à la demande si elle n'est pas encore locale (voir `televergerPhoto`). */
function useApercuPhoto(ligne: LigneJustificatif): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    let urlCreee: string | null = null;

    const charger = (blob: Blob) => {
      if (annule) return;
      urlCreee = URL.createObjectURL(blob);
      setUrl(urlCreee);
    };

    if (ligne.justificatif.blob) {
      charger(ligne.justificatif.blob);
    } else {
      void televergerPhoto(ligne.justificatif.id).then((blob) => {
        if (blob) charger(blob);
      });
    }

    return () => {
      annule = true;
      if (urlCreee) URL.revokeObjectURL(urlCreee);
    };
  }, [ligne.justificatif.id, ligne.justificatif.blob]);

  return url;
}
