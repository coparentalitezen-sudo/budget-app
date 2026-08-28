import { useState } from 'react';
import { Carte } from '../components/ui.tsx';
import { app } from '../config/app.config.ts';
import { identiteEditeur, etatIdentite } from '../lib/legal.ts';

/**
 * Pages légales — GABARITS, pas des textes prêts à publier. Chaque section
 * marquée `[À COMPLÉTER]` doit être rédigée puis relue par un professionnel
 * avant toute mise à disposition du public. Voir docs fournis
 * (09-RGPD-JURIDIQUE.md) pour le détail des obligations.
 */
export function Confidentialite() {
  const [section, setSection] = useState<'confidentialite' | 'cgu' | 'mentions'>('confidentialite');
  const etat = etatIdentite();

  return (
    <div className="ecran">
      <Carte titre="Textes légaux">
        <p className="note note-attention">
          ⚠️ Gabarits non publiables tels quels. Faites relire par un professionnel
          avant toute mise en ligne publique — voir aussi l’état de l’identité éditeur
          ci-dessous.
        </p>
        <div className="filtres">
          {(['confidentialite', 'cgu', 'mentions'] as const).map((s) => (
            <button
              key={s}
              className={`bascule-item${section === s ? ' actif' : ''}`}
              onClick={() => setSection(s)}
            >
              {{ confidentialite: 'Confidentialité', cgu: 'CGU', mentions: 'Mentions légales' }[s]}
            </button>
          ))}
        </div>
      </Carte>

      {section === 'confidentialite' && (
        <Carte titre={`Politique de confidentialité — version ${identiteEditeur.versionTextes}`}>
          <p className="note">[À COMPLÉTER] Préambule : objet du traitement, éditeur responsable.</p>
          <h3>Données collectées</h3>
          <p className="note">
            [À COMPLÉTER] Lister précisément : identifiants de compte, transactions
            bancaires saisies ou importées, catégories et règles de catégorisation,
            objectifs d’épargne. Aucune donnée non nécessaire ({app.identite.nom} ne
            collecte que ce que l’utilisateur saisit lui-même).
          </p>
          <h3>Finalités et bases légales</h3>
          <p className="note">
            [À COMPLÉTER] Ex. : exécution du contrat (fonctionnement de
            l’application), intérêt légitime (sécurité), consentement (le cas
            échéant, pour un canal marketing).
          </p>
          <h3>Durées de conservation</h3>
          <p className="note">
            Compte actif : tant que le compte existe. Compte inactif :{' '}
            {app.legal.conservation.compteInactif}. Journaux techniques :{' '}
            {app.legal.conservation.journauxTechniques}.
          </p>
          <h3>Sous-traitants</h3>
          <p className="note">
            [À COMPLÉTER] Supabase (base de données, authentification), Vercel
            (hébergement). Un contrat de sous-traitance (DPA) est requis avec chacun
            avant commercialisation — voir la checklist juridique.
          </p>
          <h3>Vos droits</h3>
          <p className="note">
            Accès, rectification, effacement, portabilité : voir « Mes données » dans
            Réglages, qui applique ces droits directement. Pour toute autre demande :{' '}
            {identiteEditeur.contact ?? '[À COMPLÉTER]'}.
          </p>
          <h3>Cookies</h3>
          <p className="note">
            Seuls des cookies strictement nécessaires (session) sont utilisés à ce
            stade — aucun bandeau de consentement requis pour ceux-là. Tout outil de
            mesure ou publicitaire ajouté plus tard en exigerait un.
          </p>
        </Carte>
      )}

      {section === 'cgu' && (
        <Carte titre={`Conditions générales d’utilisation — version ${identiteEditeur.versionTextes}`}>
          <p className="note">[À COMPLÉTER] Objet : description du service {app.identite.nom}.</p>
          <h3>Compte</h3>
          <p className="note">[À COMPLÉTER] Création, exactitude des informations, confidentialité du mot de passe.</p>
          <h3>Obligations de l’utilisateur</h3>
          <p className="note">[À COMPLÉTER] Usage personnel, exactitude des données saisies.</p>
          <h3>Responsabilité</h3>
          <p className="note">
            [À COMPLÉTER] {app.identite.nom} aide à visualiser un budget ; les décisions
            financières restent celles de l’utilisateur. Aucune garantie de résultat.
          </p>
          <h3>Résiliation</h3>
          <p className="note">[À COMPLÉTER] Résiliation à tout moment, voir « Mes données » dans Réglages.</p>
        </Carte>
      )}

      {section === 'mentions' && (
        <Carte titre="Mentions légales">
          <ChampLegal libelle="Dénomination" valeur={identiteEditeur.denomination} etat={etat.denomination} />
          <ChampLegal libelle="Forme juridique" valeur={identiteEditeur.forme} etat="renseigne" />
          <ChampLegal libelle="SIREN" valeur={identiteEditeur.siren} etat={etat.siren} />
          <ChampLegal libelle="Adresse" valeur={identiteEditeur.adresse} etat={etat.adresse} />
          <ChampLegal
            libelle="Responsable de publication"
            valeur={identiteEditeur.responsablePublication}
            etat={identiteEditeur.responsablePublication ? 'renseigne' : 'manquant'}
          />
          <ChampLegal
            libelle="Contact"
            valeur={identiteEditeur.contact}
            etat={identiteEditeur.contact ? 'renseigne' : 'manquant'}
          />
          <ChampLegal libelle="Médiateur de la consommation" valeur={identiteEditeur.mediateur} etat={etat.mediateur} />
          <p className="note">[À COMPLÉTER] Hébergeur : nom et adresse.</p>
          {etat.mediateur === 'manquant' && (
            <p className="note note-attention">
              ⚠️ L’article L612-1 du code de la consommation impose l’adhésion à un
              médiateur avant toute vente à des particuliers en France — bloquant pour
              la commercialisation, pas seulement recommandé.
            </p>
          )}
        </Carte>
      )}
    </div>
  );
}

function ChampLegal({
  libelle, valeur, etat,
}: {
  libelle: string;
  valeur: string | null;
  etat: 'renseigne' | 'manquant' | 'valeur_invalide';
}) {
  return (
    <div className="ligne">
      <span className="ligne-libelle">{libelle}</span>
      <span className={`ligne-valeur${etat !== 'renseigne' ? ' ton-negatif' : ''}`}>
        {etat === 'manquant' ? 'À compléter' : etat === 'valeur_invalide' ? 'Valeur invalide' : valeur}
      </span>
    </div>
  );
}
