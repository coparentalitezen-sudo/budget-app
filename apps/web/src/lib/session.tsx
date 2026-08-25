import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { obtenirSupabase, supabaseConfigure } from './supabase.ts';

/**
 * Session.
 *
 * Deux décisions issues d'un échec concret :
 *
 * 1. PLUS DE LIEN MAGIQUE. Dans une PWA installée sur iPhone, le lien
 *    reçu par courriel s'ouvre dans Safari, dont le stockage est isolé de
 *    celui de l'application ajoutée à l'écran d'accueil. La session
 *    atterrit donc au mauvais endroit et l'app reste déconnectée, sans
 *    message d'erreur. Un mot de passe se saisit dans l'application
 *    elle-même : aucun aller-retour, rien à configurer côté redirections.
 *
 * 2. LA CONNEXION N'EST PAS OBLIGATOIRE. L'application fonctionne
 *    entièrement en local (IndexedDB). Le compte ne sert qu'à
 *    synchroniser entre appareils et à sauvegarder. On peut donc s'en
 *    passer et se connecter plus tard : les données saisies hors compte
 *    seront envoyées à la première synchronisation.
 */
interface EtatSession {
  userId: string | null;
  email: string | null;
  pret: boolean;
  modeLocal: boolean;
  activerModeLocal: () => void;
  connecter: (email: string, motDePasse: string) => Promise<string | null>;
  creerCompte: (email: string, motDePasse: string) => Promise<string | null>;
  deconnecter: () => Promise<void>;
}

const CLE_MODE_LOCAL = 'budget.modeLocal';
const Contexte = createContext<EtatSession | null>(null);

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [pret, setPret] = useState(false);
  const [modeLocal, setModeLocal] = useState(
    () => localStorage.getItem(CLE_MODE_LOCAL) === 'oui',
  );

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

  const activerModeLocal = () => {
    localStorage.setItem(CLE_MODE_LOCAL, 'oui');
    setModeLocal(true);
  };

  /** Renvoie un message d'erreur, ou `null` si tout s'est bien passé. */
  const connecter = async (adresse: string, motDePasse: string): Promise<string | null> => {
    const supabase = await obtenirSupabase();
    if (!supabase) return 'Supabase n’est pas configuré sur ce déploiement.';
    const { error } = await supabase.auth.signInWithPassword({
      email: adresse.trim(),
      password: motDePasse,
    });
    if (!error) {
      localStorage.removeItem(CLE_MODE_LOCAL);
      setModeLocal(false);
      return null;
    }
    return /invalid login/i.test(error.message)
      ? 'Adresse ou mot de passe incorrect.'
      : error.message;
  };

  const creerCompte = async (adresse: string, motDePasse: string): Promise<string | null> => {
    const supabase = await obtenirSupabase();
    if (!supabase) return 'Supabase n’est pas configuré sur ce déploiement.';
    const { error } = await supabase.auth.signUp({
      email: adresse.trim(),
      password: motDePasse,
    });
    if (!error) {
      localStorage.removeItem(CLE_MODE_LOCAL);
      setModeLocal(false);
      return null;
    }
    return error.message;
  };

  const deconnecter = async () => {
    const supabase = await obtenirSupabase();
    await supabase?.auth.signOut();
  };

  return (
    <Contexte.Provider
      value={{ userId, email, pret, modeLocal, activerModeLocal, connecter, creerCompte, deconnecter }}
    >
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
  const { connecter, creerCompte, activerModeLocal } = useSession();
  const [adresse, setAdresse] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const valide = adresse.includes('@') && motDePasse.length >= 6;

  const lancer = async (action: () => Promise<string | null>) => {
    setOccupe(true);
    setErreur(null);
    const message = await action();
    if (message) setErreur(message);
    setOccupe(false);
  };

  return (
    <div className="ecran">
      <div className="carte">
        <h2>Budget</h2>
        <p className="note">
          Vous pouvez utiliser l’application <strong>sans compte</strong>. Vos données
          restent alors sur cet appareil. Le compte ne sert qu’à synchroniser entre
          appareils et à sauvegarder — vous pourrez le créer plus tard sans rien perdre.
        </p>
        <button className="bouton bouton-principal" onClick={activerModeLocal}>
          Commencer sans compte
        </button>
      </div>

      {supabaseConfigure && (
        <div className="carte">
          <h2>Se connecter</h2>
          <input
            className="champ"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="Adresse électronique"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
          />
          <input
            className="champ"
            type="password"
            autoComplete="current-password"
            placeholder="Mot de passe (6 caractères minimum)"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
          <button
            className="bouton bouton-principal"
            disabled={!valide || occupe}
            onClick={() => void lancer(() => connecter(adresse, motDePasse))}
          >
            {occupe ? 'Connexion…' : 'Se connecter'}
          </button>
          <button
            className="bouton"
            disabled={!valide || occupe}
            onClick={() => void lancer(() => creerCompte(adresse, motDePasse))}
          >
            Créer un compte
          </button>
          {erreur && <p className="note note-attention">{erreur}</p>}
          <p className="note">
            Mot de passe plutôt que lien par courriel : dans une application installée
            sur l’écran d’accueil, un lien reçu par courriel s’ouvre dans Safari, dont
            le stockage est séparé — la connexion n’arriverait jamais jusqu’ici.
          </p>
        </div>
      )}
    </div>
  );
}
