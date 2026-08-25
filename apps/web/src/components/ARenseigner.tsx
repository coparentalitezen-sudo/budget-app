import { useState } from 'react';
import type { Categorie, Transaction } from '@budget/core/src/types.ts';
import { enregistrerTransaction, supprimerTransaction } from '../db/dexie.ts';
import { enregistrerRegle } from '../db/configuration.ts';
import { motifDepuisLibelle } from '../import/regles.ts';
import { Carte, Etiquette } from './ui.tsx';
import { dateCourte, montant } from '../lib/format.ts';

/**
 * Rapprochement après import : une opération à la fois, avec le minimum
 * de décisions à prendre.
 *
 * « Plus tard » ne modifie rien : l'opération reste dans la liste À
 * renseigner. C'est volontaire — on ne doit jamais perdre une opération
 * parce qu'on a hésité.
 */
export function OperationARenseigner({
  transaction,
  categories,
  onTraitee,
}: {
  transaction: Transaction;
  categories: Categorie[];
  onTraitee: () => void;
}) {
  const libelle = transaction.commercant ?? transaction.description ?? '';
  const [categorieId, setCategorieId] = useState('');
  // Coché par défaut : classer une opération doit enrichir la base de règles
  // pour que ce commerçant ne redevienne pas « à renseigner » le mois
  // suivant. Reste décochable pour un achat ponctuel qu'on ne veut pas
  // généraliser — la décision reste toujours modifiable par l'utilisateur.
  const [creerRegle, setCreerRegle] = useState(true);
  const [motif, setMotif] = useState(() => motifDepuisLibelle(libelle));
  const [enCours, setEnCours] = useState(false);
  const [avertissement, setAvertissement] = useState<string | null>(null);

  const supprimer = async () => {
    if (!window.confirm(`Supprimer « ${libelle || 'cette opération'} » ?`)) return;
    setEnCours(true);
    try {
      await supprimerTransaction(transaction.id);
      onTraitee();
    } finally {
      setEnCours(false);
    }
  };

  const valider = async () => {
    if (categorieId === '') return;
    setEnCours(true);
    setAvertissement(null);
    try {
      // La transaction est enregistrée AVANT la règle : si la création de
      // règle échoue (hors ligne), la validation de l'opération reste acquise.
      await enregistrerTransaction({
        ...transaction,
        categorieId,
        statut: 'validated',
      });

      if (creerRegle && motif.trim().length >= 2) {
        try {
          await enregistrerRegle({
            motif: motif.trim(),
            typeCorrespondance: 'contains',
            categorieId,
            priorite: 100,
            // L'application propose, elle ne valide jamais à votre place.
            autoValider: false,
            active: true,
          });
        } catch (e) {
          setAvertissement(
            `Opération classée, mais la règle n’a pas pu être enregistrée : ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      }
      onTraitee();
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Carte>
      <div className="transaction-principal">
        <span className="transaction-libelle">{libelle || 'Sans libellé'}</span>
        <span className={`transaction-montant ton-${transaction.type === 'revenu' ? 'positif' : 'neutre'}`}>
          {transaction.type === 'revenu' ? '+' : '−'} {montant(transaction.montant)}
        </span>
      </div>
      <div className="transaction-meta">
        <Etiquette>{dateCourte(transaction.date)}</Etiquette>
        <Etiquette ton={transaction.type === 'revenu' ? 'ok' : undefined}>
          {transaction.type === 'revenu' ? 'Revenu' : 'Dépense'}
        </Etiquette>
        <Etiquette ton="attente">Non renseigné</Etiquette>
      </div>

      <select
        className="champ"
        value={categorieId}
        onChange={(e) => setCategorieId(e.target.value)}
      >
        <option value="">Choisir une catégorie…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.nom}</option>
        ))}
      </select>

      {categorieId !== '' && (
        <>
          <label className="puce">
            <input
              type="checkbox"
              checked={creerRegle}
              onChange={(e) => setCreerRegle(e.target.checked)}
            />{' '}
            Toujours classer ce libellé dans cette catégorie
          </label>
          {creerRegle && (
            <>
              <input
                className="champ"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Motif de la règle"
              />
              <p className="note">
                Motif proposé à partir du libellé, sans la date ni le numéro de
                carte qui changent à chaque opération. Modifiable.
              </p>
            </>
          )}
        </>
      )}

      {avertissement && <p className="note note-attention">{avertissement}</p>}

      <div className="bascule">
        <button onClick={onTraitee} disabled={enCours}>Plus tard</button>
        <button
          className="actif"
          onClick={() => void valider()}
          disabled={categorieId === '' || enCours}
        >
          {enCours ? 'Enregistrement…' : 'Valider'}
        </button>
      </div>
      <button className="lien lien-detail" disabled={enCours} onClick={() => void supprimer()}>
        Supprimer cette opération
      </button>
    </Carte>
  );
}
