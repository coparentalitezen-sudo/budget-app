import { useState } from 'react';
import { eur } from '@budget/core/src/money.ts';
import type { Transaction, TypeTransaction } from '@budget/core/src/types.ts';
import { enregistrerTransaction } from '../db/dexie.ts';
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
    };
    await enregistrerTransaction(transaction);
    onFerme();
  };

  return (
    <div className="feuille" role="dialog" aria-label="Saisie rapide">
      <div className="feuille-contenu">
        <header className="feuille-tete">
          <h2>Nouvelle transaction</h2>
          <button className="lien" onClick={onFerme}>Annuler</button>
        </header>

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
