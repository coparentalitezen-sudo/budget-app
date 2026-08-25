import { useEffect, useState } from 'react';
import { Dashboard } from './screens/Dashboard.tsx';
import { Transactions } from './screens/Transactions.tsx';
import { Budget } from './screens/Budget.tsx';
import { Epargne } from './screens/Epargne.tsx';
import { Credits } from './screens/Credits.tsx';
import { Provisions } from './screens/Provisions.tsx';
import { Parametres } from './screens/Parametres.tsx';
import { Import } from './screens/Import.tsx';
import { Configurer } from './screens/Configurer.tsx';
import { Plus } from './screens/Plus.tsx';
import { SaisieRapide } from './components/SaisieRapide.tsx';
import { installerSyncAutomatique } from './db/sync.ts';
import { useOutboxCount } from './state/useDonnees.ts';
import { Connexion, FournisseurSession, useSession } from './lib/session.tsx';
import { supabaseConfigure } from './lib/supabase.ts';

type Onglet =
  | 'accueil' | 'transactions' | 'budget' | 'epargne'
  | 'credits' | 'provisions' | 'import' | 'configurer' | 'parametres' | 'plus';

/** Sections regroupées sous « Plus », pour que la navigation reste à 5 entrées. */
const SOUS_PLUS: Onglet[] = ['credits', 'provisions', 'import', 'configurer', 'parametres'];

const ONGLETS: { cle: Onglet; libelle: string; icone: string }[] = [
  { cle: 'accueil', libelle: 'Accueil', icone: '🏠' },
  { cle: 'transactions', libelle: 'Opérations', icone: '📋' },
  { cle: 'budget', libelle: 'Budget', icone: '📊' },
  { cle: 'epargne', libelle: 'Épargne', icone: '🐷' },
  { cle: 'plus', libelle: 'Plus', icone: '⋯' },
];

export default function App() {
  return (
    <FournisseurSession>
      <Application />
    </FournisseurSession>
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
    window.addEventListener('online', majEtat);
    window.addEventListener('offline', majEtat);
    const detacher = installerSyncAutomatique(() => {});
    return () => {
      window.removeEventListener('online', majEtat);
      window.removeEventListener('offline', majEtat);
      detacher();
    };
  }, []);

  // Tant que Supabase n'est pas configuré, l'application reste pleinement
  // utilisable en local : la connexion n'est exigée que pour synchroniser.
  // La connexion n'est jamais imposée : l'application fonctionne en local.
  const connexionRequise = supabaseConfigure && pret && !userId && !modeLocal;

  if (connexionRequise) {
    return (
      <div className="app">
        <header className="entete"><h1>Budget</h1></header>
        <main className="contenu"><Connexion /></main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="entete">
        <h1>Budget</h1>
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
        {onglet === 'configurer' && <Configurer />}
        {onglet === 'parametres' && <Parametres />}
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
