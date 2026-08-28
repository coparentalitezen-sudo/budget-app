import { useEffect, useState } from 'react';
import { eur } from '@budget/core/src/money.ts';
import type { Transaction, TypeTransaction } from '@budget/core/src/types.ts';
import { enregistrerJustificatif, enregistrerTransaction } from '../db/dexie.ts';
import { redimensionnerEtCompresser } from '../lib/image.ts';
import { moteurOcr } from '../lib/ocr/index.ts';
import { lireTicket } from '../import/ticket.ts';
import { aujourdhuiISO } from '../lib/format.ts';
import { useConfiguration } from '../state/useDonnees.ts';

/**
 * Saisie rapide. Écrit dans IndexedDB puis dans la file de synchronisation :
 * fonctionne intégralement hors ligne.
 */
export function SaisieRapide({ onFerme }: { onFerme: () => void }) {
  const { config } = useConfiguration();
  const variables = config.categories.filter((c) => c.nature === 'variable');

  const [montantTexte, setMontantTexte] = useState('');
  const [categorieId, setCategorieId] = useState(variables[0]?.id ?? '');
  const [type, setType] = useState<TypeTransaction>('depense');

  // Un revenu ne propose que des catégories de revenu, tout le reste que
  // des catégories de dépense — jamais les deux mélangées dans la même
  // liste (une catégorie de revenu assignée à une dépense fausserait le
  // calcul des dépenses variables, voir `calculerRealise`).
  const categoriesProposees = config.categories.filter((c) =>
    type === 'revenu' ? c.nature === 'revenu' : c.nature !== 'revenu',
  );

  const changerType = (nouveauType: TypeTransaction) => {
    setType(nouveauType);
    const nouvellesCategories = config.categories.filter((c) =>
      nouveauType === 'revenu' ? c.nature === 'revenu' : c.nature !== 'revenu',
    );
    // La catégorie déjà choisie reste sélectionnée si elle est toujours
    // proposée (ex. dépense -> facture) ; sinon, la première disponible.
    if (!nouvellesCategories.some((c) => c.id === categorieId)) {
      setCategorieId(nouvellesCategories[0]?.id ?? '');
    }
  };
  const [libelle, setLibelle] = useState('');
  const [date, setDate] = useState(aujourdhuiISO());
  // Facultative : prendre un ticket en photo est un raccourci, jamais une
  // étape obligatoire — la validation ne porte que sur montant + catégorie.
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoEnCours, setPhotoEnCours] = useState(false);
  const [apercu, setApercu] = useState<string | null>(null);

  // L'URL d'objet doit être révoquée dès qu'elle n'est plus affichée, sous
  // peine de fuite mémoire — le navigateur ne le fait jamais tout seul.
  useEffect(() => {
    if (!photo) { setApercu(null); return; }
    const url = URL.createObjectURL(photo);
    setApercu(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const capturerPhoto = async (fichier: File) => {
    setPhotoEnCours(true);
    try {
      const compresse = await redimensionnerEtCompresser(fichier);
      setPhoto(compresse);
      // Lecture OCR du ticket (voir lib/ocr/) : ne préremplit que ce qui a
      // été lu avec fiabilité, ne touche jamais à un champ sans résultat —
      // jamais bloquant non plus, la photo reste utilisable si ça échoue.
      try {
        const { montant: montantLu, date: dateLue } = await lireTicket(moteurOcr, compresse);
        if (montantLu !== null) setMontantTexte((montantLu / 100).toFixed(2).replace('.', ','));
        if (dateLue !== null) setDate(dateLue);
      } catch {
        // Le montant et la date restent à saisir à la main.
      }
    } finally {
      setPhotoEnCours(false);
    }
  };

  const valeur = Number(montantTexte.replace(',', '.'));
  const valide = Number.isFinite(valeur) && valeur > 0 && categorieId !== '';

  const valider = async () => {
    if (!valide) return;
    const compte = config.comptes.find((c) => c.type === 'courant');
    if (!compte) return;

    const transaction: Transaction = {
      // UUID généré CÔTÉ CLIENT : l'identité est définitive dès la saisie
      // hors ligne, ce qui rend la synchronisation idempotente.
      id: crypto.randomUUID(),
      date,
      montant: eur(valeur),
      type,
      categorieId,
      compteId: compte.id,
      description: libelle || undefined,
      commercant: libelle || undefined,
      source: 'manual',
      statut: 'validated',
      // Une saisie manuelle n'est pas encore confirmée par le relevé
      // bancaire : elle ne devient « pointed » que si un import ultérieur
      // la retrouve (voir `apparierOperationImportee`), ou si l'utilisateur
      // la pointe lui-même.
      pointage: 'unpointed',
    };
    await enregistrerTransaction(transaction);
    if (photo) await enregistrerJustificatif(transaction.id, photo, 'image/jpeg');
    onFerme();
  };

  return (
    <div className="feuille" role="dialog" aria-label="Saisie rapide">
      <div className="feuille-contenu">
        <header className="feuille-tete">
          <h2>Nouvelle transaction</h2>
          <button className="lien" onClick={onFerme}>Annuler</button>
        </header>

        {apercu ? (
          <div className="photo-apercu">
            <img src={apercu} alt="Ticket photographié" />
            <button className="lien" onClick={() => setPhoto(null)}>Retirer la photo</button>
          </div>
        ) : (
          <label className="bouton" style={{ display: 'block', textAlign: 'center' }}>
            {photoEnCours ? 'Analyse du ticket…' : '📷 Photographier le ticket'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              disabled={photoEnCours}
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                if (fichier) void capturerPhoto(fichier);
              }}
            />
          </label>
        )}

        <input
          className="champ champ-montant"
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          value={montantTexte}
          onChange={(e) => setMontantTexte(e.target.value)}
          autoFocus
        />

        <select className="champ" value={type} onChange={(e) => changerType(e.target.value as TypeTransaction)}>
          <option value="depense">Dépense</option>
          <option value="revenu">Revenu</option>
          <option value="facture">Facture</option>
          <option value="remboursement">Remboursement</option>
        </select>

        <select className="champ" value={categorieId} onChange={(e) => setCategorieId(e.target.value)}>
          {categoriesProposees.map((c) => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>

        <input
          className="champ"
          type="text"
          placeholder="Commerçant ou description"
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
        />

        <input
          className="champ"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <button className="bouton bouton-principal" onClick={valider} disabled={!valide}>
          Enregistrer
        </button>
        <p className="note">
          Enregistré localement d’abord : la saisie fonctionne sans réseau et sera
          synchronisée automatiquement au retour de la connexion.
        </p>
      </div>
    </div>
  );
}
