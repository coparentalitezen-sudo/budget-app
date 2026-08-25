import { useState } from 'react';
import { inventaireInconnues } from '@budget/core/src/inconnues.ts';
import { Carte, Etiquette, Ligne } from '../components/ui.tsx';
import { montant } from '../lib/format.ts';
import { useConfiguration, useOutboxCount } from '../state/useDonnees.ts';
import { definirSoldeCompte, definirSoldeObjectif } from '../db/repository.ts';
import { useSession } from '../lib/session.tsx';
import { eur } from '@budget/core/src/money.ts';
import { aujourdhuiISO } from '../lib/format.ts';
import { synchroniser, type ResultatSync } from '../db/sync.ts';
import { supabaseConfigure } from '../lib/supabase.ts';

export function Parametres() {
  const { config } = useConfiguration();
  const enAttente = useOutboxCount();
  const [resultat, setResultat] = useState<ResultatSync | null>(null);
  const [enCours, setEnCours] = useState(false);

  const inconnues = inventaireInconnues(config);
  const { email: courriel, deconnecter, modeLocal } = useSession();

  const lancerSync = async () => {
    setEnCours(true);
    try {
      setResultat(await synchroniser());
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="ecran">
      <Carte titre="Synchronisation">
        <Ligne libelle="Supabase" valeur={supabaseConfigure ? 'Configuré' : 'Non configuré'} />
        <Ligne libelle="Réseau" valeur={navigator.onLine ? 'En ligne' : 'Hors ligne'} />
        <Ligne libelle="Opérations en attente" valeur={String(enAttente)} />
        <button className="bouton" onClick={lancerSync} disabled={enCours}>
          {enCours ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
        {resultat && (
          <p className={`note${resultat.etat === 'erreur' ? ' note-attention' : ''}`}>
            {resultat.etat} — {resultat.envoyees} envoyée(s), {resultat.recues} reçue(s),{' '}
            {resultat.enAttente} en attente.
            {resultat.message ? ` ${resultat.message}` : ''}
          </p>
        )}
        <p className="note">
          Une opération qui échoue est conservée et signalée, jamais supprimée en
          silence : une file bloquée visible vaut mieux qu’une saisie perdue.
        </p>
      </Carte>

      <Carte titre={`Données inconnues (${inconnues.length})`}>
        <p className="note">
          Aucune n’est remplacée par 0. Tant qu’une donnée manque, le calcul qui en
          dépend reste indisponible plutôt que faux.
        </p>
        {inconnues.map((i) => (
          <div key={i.chemin} className="inconnue">
            <div className="scenario-tete">
              <span>{i.libelle}</span>
              <Etiquette ton="attente">Inconnu</Etiquette>
            </div>
            <p className="alerte-detail">{i.consequence}</p>
            <code className="chemin">{i.chemin}</code>
          </div>
        ))}
      </Carte>

      <Carte titre={`Paramètres à confirmer (${config.parametresAConfirmer.length})`}>
        {config.parametresAConfirmer.map((p) => (
          <p key={p} className="puce">{p}</p>
        ))}
      </Carte>

      <Carte titre="Réglages actifs">
        <Ligne libelle="Objectif d’épargne" valeur={montant(config.reglageEpargne.objectif)} />
        <Ligne libelle="Seuil de sécurité" valeur={montant(config.reglageTresorerie.seuilSecurite)} />
        <Ligne libelle="Mode fonds d’urgence" valeur={config.reglageFondUrgence.mode} />
        {config.reglageFondUrgence.mode !== 'manuel' && (
          <Ligne libelle="Nombre de mois" valeur={String(config.reglageFondUrgence.nombreDeMois)} />
        )}
      </Carte>

      <Carte titre="Comptes">
        <p className="note">
          Renseigner un solde débloque les projections et le montant réellement
          transférable. Un solde inconnu s’affiche « Inconnu », jamais « 0,00 € ».
        </p>
        {config.comptes.map((c) => (
          <SaisieSolde
            key={c.id}
            libelle={c.nom}
            valeur={c.solde}
            onValider={(v) => definirSoldeCompte(c.id, v, aujourdhuiISO())}
          />
        ))}
      </Carte>

      <Carte titre="Soldes d’épargne">
        <p className="note">
          Tant qu’un solde est inconnu, ni le reste à constituer ni la date
          d’atteinte ne sont calculés.
        </p>
        {config.objectifsEpargne.map((o) => (
          <SaisieSolde
            key={o.id}
            libelle={o.nom}
            valeur={o.montantActuel}
            onValider={(v) => definirSoldeObjectif(o.id, v, aujourdhuiISO())}
          />
        ))}
      </Carte>

      <Carte titre="Session">
        <Ligne libelle="Compte" valeur={courriel ?? (modeLocal ? 'Mode local' : 'Non connecté')} />
        {!courriel && (
          <p className="note">
            Sans compte, vos données restent sur cet appareil. Créez-en un quand vous
            voulez : les saisies déjà faites partiront à la première synchronisation.
          </p>
        )}
        {courriel && (
          <button className="bouton" onClick={() => void deconnecter()}>Se déconnecter</button>
        )}
      </Carte>

      <Carte titre="À propos">
        <Ligne libelle="Version" valeur={__APP_VERSION__} />
        <Ligne libelle="Construit le" valeur={new Date(__BUILD_TIME__).toLocaleString('fr-FR')} />
      </Carte>
    </div>
  );
}

/** Saisie d'un solde. Le champ vidé remet la valeur à `null`, pas à 0. */
function SaisieSolde({
  libelle,
  valeur,
  onValider,
}: {
  libelle: string;
  valeur: number | null;
  onValider: (v: number | null) => Promise<void>;
}) {
  const [texte, setTexte] = useState(valeur === null ? '' : String(valeur / 100));
  const [enregistre, setEnregistre] = useState(false);

  const valider = async () => {
    const nettoye = texte.replace(',', '.').trim();
    // Champ vide = inconnu. C'est un état distinct de « zéro euro ».
    const nouvelle = nettoye === '' ? null : eur(Number(nettoye));
    if (nouvelle !== null && !Number.isFinite(nouvelle)) return;
    await onValider(nouvelle);
    setEnregistre(true);
    setTimeout(() => setEnregistre(false), 1500);
  };

  return (
    <div className="ligne">
      <span className="ligne-libelle">{libelle}</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          className="champ"
          style={{ width: 120, minHeight: 38, textAlign: 'right' }}
          type="text"
          inputMode="decimal"
          placeholder="Inconnu"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={() => void valider()}
        />
        {enregistre && <Etiquette ton="ok">OK</Etiquette>}
      </span>
    </div>
  );
}
