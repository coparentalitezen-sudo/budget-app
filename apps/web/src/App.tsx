import { useEffect, useState } from 'react';
import { Dashboard } from './screens/Dashboard.tsx';
import { Transactions } from './screens/Transactions.tsx';
import { Budget } from './screens/Budget.tsx';
import { Epargne } from './screens/Epargne.tsx';
import { Credits } from './screens/Credits.tsx';
import { Provisions } from './screens/Provisions.tsx';
import { Parametres } from './screens/Parametres.tsx';
import { Import } from './screens/Import.tsx';
import { Rapprochement } from './screens/Rapprochement.tsx';
import { Configurer } from './screens/Configurer.tsx';
import { Plus } from './screens/Plus.tsx';
import { Confidentialite } from './screens/Confidentialite.tsx';
import { Justificatifs } from './screens/Justificatifs.tsx';
import { features } from './config/features.config.ts';
import { BandeauMiseAJour } from './components/BandeauMiseAJour.tsx';
import { SaisieRapide } from './components/SaisieRapide.tsx';
import { installerSyncAutomatique, synchroniser } from './db/sync.ts';
import { receptionnerJustificatifs, televerserJustificatifs } from './db/syncJustificatifs.ts';
import { genererOperationsRecurrentesEnAttente } from './db/repository.ts';
import { useOutboxCount } from './state/useDonnees.ts';
import { Connexion, FournisseurSession, useSession } from './lib/session.tsx';
import { supabaseConfigure } from './lib/supabase.ts';
import { app, type CleOnglet } from './config/app.config.ts';

type Onglet = CleOnglet;

const ONGLETS = app.navigation.principale;
// Élargi explicitement : `app` étant `as const`, `sousPlus` s'infère comme un
// tuple de littéraux étroit, incompatible avec `.includes(onglet)` où
// `onglet` porte le type complet `Onglet`.
const SOUS_PLUS: readonly CleOnglet[] = app.navigation.sousPlus;

export default function App() {
  return (
    <>
      <BandeauMiseAJour />
      <FournisseurSession>
        <Application />
      </FournisseurSession>
    </>
  );
}

function Application() {
  const [onglet, setOnglet] = useState<Onglet>('accueil');
  const [saisieOuverte, setSaisieOuverte] = useState(false);
  // Permet d'ouvrir directement la liste « À renseigner » depuis l'accueil.
  const [vueTransactions, setVueTransactions] = useState<'a_renseigner' | undefined>(undefined);
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const enAttente = useOutboxCount();
  const { userId, pret, modeLocal } = useSession();

  useEffect(() => {
    const majEtat = () => setEnLigne(navigator.onLine);
    const declencherJustificatifs = () => {
      void receptionnerJustificatifs().then(() => televerserJustificatifs());
    };
    window.addEventListener('online', majEtat);
    window.addEventListener('offline', majEtat);
    window.addEventListener('online', declencherJustificatifs);
    const detacher = installerSyncAutomatique(() => {});
    return () => {
      window.removeEventListener('online', majEtat);
      window.removeEventListener('offline', majEtat);
      window.removeEventListener('online', declencherJustificatifs);
      detacher();
    };
  }, []);

  // Synchronise dès que la session est confirmée : `installerSyncAutomatique`
  // tente déjà un premier passage au montage, mais celui-ci peut précéder la
  // restauration de session (lecture asynchrone). Sans ce second
  // déclenchement, la file d'attente ne se viderait qu'au prochain appui
  // manuel sur « Synchroniser maintenant » ou à une vraie coupure réseau.
  useEffect(() => {
    if (userId) void synchroniser();
  }, [userId]);

  // Justificatifs : file d'envoi/réception séparée de `synchroniser()` (voir
  // `syncJustificatifs.ts`) — un envoi de photo qui échoue ne doit jamais
  // bloquer la synchro des transactions, ni l'inverse.
  useEffect(() => {
    if (userId) {
      void receptionnerJustificatifs().then(() => televerserJustificatifs());
    }
  }, [userId]);

  // Matérialise les récurrentes échues (voir `genererOperationsRecurrentesEnAttente`) :
  // au montage, et à chaque retour au premier plan — un jour peut être
  // franchi pendant que l'app reste ouverte en arrière-plan sur mobile.
  // Idempotent : rejouer ne crée jamais de doublon.
  useEffect(() => {
    void genererOperationsRecurrentesEnAttente();
    const declencher = () => {
      if (document.visibilityState === 'visible') void genererOperationsRecurrentesEnAttente();
    };
    document.addEventListener('visibilitychange', declencher);
    return () => document.removeEventListener('visibilitychange', declencher);
  }, []);

  // Tant que Supabase n'est pas configuré, l'application reste pleinement
  // utilisable en local : la connexion n'est exigée que pour synchroniser.
  // La connexion n'est jamais imposée : l'application fonctionne en local.
  const connexionRequise = supabaseConfigure && pret && !userId && !modeLocal;

  if (connexionRequise) {
    return (
      <div className="app">
        <header className="entete"><h1>{app.identite.nom}</h1></header>
        <main className="contenu"><Connexion /></main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="entete">
        <h1>{app.identite.nom}</h1>
        <span className="version-tag" title={`Construit le ${new Date(__BUILD_TIME__).toLocaleString('fr-FR')}`}>
          {__APP_VERSION__}
        </span>
        {!enLigne && <span className="badge badge-hors-ligne">Hors ligne</span>}
        {enAttente > 0 && <span className="badge">{enAttente} en attente</span>}
      </header>

      <main className="contenu">
        {onglet === 'accueil' && (
          <Dashboard
            onOuvrirARenseigner={() => {
              setVueTransactions('a_renseigner');
              setOnglet('transactions');
            }}
            onNaviguer={(cible) => setOnglet(cible)}
          />
        )}
        {onglet === 'transactions' && <Transactions vueInitiale={vueTransactions} />}
        {onglet === 'budget' && <Budget />}
        {onglet === 'epargne' && <Epargne />}
        {onglet === 'credits' && <Credits />}
        {onglet === 'provisions' && <Provisions />}
        {onglet === 'import' && <Import />}
        {onglet === 'rapprochement' && <Rapprochement />}
        {onglet === 'configurer' && <Configurer />}
        {onglet === 'parametres' && <Parametres />}
        {onglet === 'justificatifs' && features.justificatifs && <Justificatifs />}
        {onglet === 'confidentialite' && features.rgpd && <Confidentialite />}
        {onglet === 'plus' && <Plus onOuvrir={(cle) => setOnglet(cle as Onglet)} />}
      </main>

      <button
        className="bouton-flottant"
        onClick={() => setSaisieOuverte(true)}
        aria-label="Ajouter une transaction"
      >
        +
      </button>

      {saisieOuverte && <SaisieRapide onFerme={() => setSaisieOuverte(false)} />}

      <nav className="navigation">
        {ONGLETS.map((o) => {
          const actif = o.cle === 'plus' ? SOUS_PLUS.includes(onglet) || onglet === 'plus' : onglet === o.cle;
          return (
            <button
              key={o.cle}
              className={actif ? 'actif' : ''}
              onClick={() => {
                if (o.cle !== 'transactions') setVueTransactions(undefined);
                setOnglet(o.cle);
              }}
            >
              <span className="navigation-icone">{o.icone}</span>
              <span className="navigation-libelle">{o.libelle}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
