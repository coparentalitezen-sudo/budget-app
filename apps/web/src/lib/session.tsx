import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { obtenirSupabase, supabaseConfigure } from './supabase.ts';

/**
 * Session Supabase.
 *
 * Authentification par lien magique : pas de mot de passe à stocker, à
 * saisir sur mobile, ni à réinitialiser. La session persiste, l'application
 * n'exige donc pas de reconnexion à chaque ouverture — ce qui compte pour
 * une PWA lancée plusieurs fois par jour.
 */
interface EtatSession {
  userId: string | null;
  email: string | null;
  pret: boolean;
  connecter: (email: string) => Promise<string>;
  deconnecter: () => Promise<void>;
}

const Contexte = createContext<EtatSession | null>(null);

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      const supabase = await obtenirSupabase();
      if (!supabase) {
        if (!annule) setPret(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!annule) {
        setUserId(data.session?.user.id ?? null);
        setEmail(data.session?.user.email ?? null);
        setPret(true);
      }
      supabase.auth.onAuthStateChange((_evenement, session) => {
        setUserId(session?.user.id ?? null);
        setEmail(session?.user.email ?? null);
      });
    })();
    return () => { annule = true; };
  }, []);

  const connecter = async (adresse: string): Promise<string> => {
    const supabase = await obtenirSupabase();
    if (!supabase) return 'Supabase n’est pas configuré.';
    const { error } = await supabase.auth.signInWithOtp({
      email: adresse,
      options: { emailRedirectTo: window.location.origin },
    });
    return error ? error.message : 'Lien de connexion envoyé. Vérifiez votre messagerie.';
  };

  const deconnecter = async () => {
    const supabase = await obtenirSupabase();
    await supabase?.auth.signOut();
  };

  return (
    <Contexte.Provider value={{ userId, email, pret, connecter, deconnecter }}>
      {children}
    </Contexte.Provider>
  );
}

export function useSession(): EtatSession {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error('useSession hors du fournisseur');
  return valeur;
}

export function Connexion() {
  const { connecter } = useSession();
  const [adresse, setAdresse] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  if (!supabaseConfigure) {
    return (
      <div className="ecran">
        <div className="carte">
          <h2>Mode local</h2>
          <p className="note">
            Supabase n’est pas configuré : renseignez <code>VITE_SUPABASE_URL</code> et{' '}
            <code>VITE_SUPABASE_ANON_KEY</code>. En attendant, l’application fonctionne
            entièrement en local — vos saisies restent dans IndexedDB et seront
            synchronisées dès la configuration renseignée.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ecran">
      <div className="carte">
        <h2>Connexion</h2>
        <p className="note">
          Un lien de connexion vous est envoyé par courriel. Aucun mot de passe à
          retenir ni à saisir sur mobile.
        </p>
        <input
          className="champ"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="votre@adresse.fr"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
        />
        <button
          className="bouton bouton-principal"
          disabled={envoi || !adresse.includes('@')}
          onClick={async () => {
            setEnvoi(true);
            setMessage(await connecter(adresse));
            setEnvoi(false);
          }}
        >
          {envoi ? 'Envoi…' : 'Recevoir le lien'}
        </button>
        {message && <p className="note">{message}</p>}
      </div>
    </div>
  );
}
