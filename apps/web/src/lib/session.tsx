import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { obtenirSupabase, supabaseConfigure } from './supabase.ts';

/**
 * Session Supabase.
 *
 * Connexion par code OTP à 6 chiffres, saisi directement dans la PWA.
 * Le lien magique envoyé dans le même courriel ouvre Safari et y crée sa
 * propre session : rien ne garantit qu'elle rejoigne le stockage de la PWA
 * installée (deux origines de stockage distinctes sur iOS). Le code, lui,
 * est vérifié via `verifyOtp()` dans l'application elle-même : la session
 * est donc créée directement là où `persistSession` la conservera.
 *
 * `persistSession: true` + `autoRefreshToken: true` (voir `supabase.ts`)
 * font le reste : aux ouvertures suivantes, `getSession()` retrouve la
 * session sans redemander l'e-mail tant qu'elle est valide.
 */
interface ResultatAuth {
  ok: boolean;
  message: string;
}

interface EtatSession {
  userId: string | null;
  email: string | null;
  pret: boolean;
  envoyerCode: (email: string) => Promise<ResultatAuth>;
  verifierCode: (email: string, code: string) => Promise<ResultatAuth>;
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
      // Session déjà persistée (ouverture précédente) : retrouvée sans
      // aucune interaction, avant même d'afficher un écran de connexion.
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

  const envoyerCode = async (adresse: string): Promise<ResultatAuth> => {
    const supabase = await obtenirSupabase();
    if (!supabase) return { ok: false, message: 'Supabase n’est pas configuré.' };
    const { error } = await supabase.auth.signInWithOtp({ email: adresse });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: `Code envoyé à ${adresse}. Vérifiez votre messagerie.` };
  };

  /**
   * Vérifie le code à 6 chiffres et crée la session DANS la PWA — la
   * requête part directement de l'application, jamais du navigateur ouvert
   * par un lien externe.
   */
  const verifierCode = async (adresse: string, code: string): Promise<ResultatAuth> => {
    const supabase = await obtenirSupabase();
    if (!supabase) return { ok: false, message: 'Supabase n’est pas configuré.' };
    const { error } = await supabase.auth.verifyOtp({ email: adresse, token: code, type: 'email' });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: 'Connexion réussie.' };
  };

  const deconnecter = async () => {
    const supabase = await obtenirSupabase();
    await supabase?.auth.signOut();
  };

  return (
    <Contexte.Provider value={{ userId, email, pret, envoyerCode, verifierCode, deconnecter }}>
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
  const { envoyerCode, verifierCode } = useSession();
  const [etape, setEtape] = useState<'email' | 'code'>('email');
  const [adresse, setAdresse] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  // Anti-rafale : chaque appel à `signInWithOtp` consomme le quota d'envoi
  // (très bas par défaut chez Supabase, voir SMTP personnalisé). Un délai
  // avant de pouvoir renvoyer un code évite qu'un double-clic ou une
  // impatience ne l'épuise en quelques secondes.
  const [attenteRenvoi, setAttenteRenvoi] = useState(0);

  useEffect(() => {
    if (attenteRenvoi <= 0) return;
    const minuteur = setTimeout(() => setAttenteRenvoi((s) => s - 1), 1000);
    return () => clearTimeout(minuteur);
  }, [attenteRenvoi]);

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

  const demanderCode = async () => {
    setEnCours(true);
    const resultat = await envoyerCode(adresse.trim());
    setMessage(resultat.message);
    if (resultat.ok) {
      setEtape('code');
      setAttenteRenvoi(60);
    }
    setEnCours(false);
  };

  const validerCode = async () => {
    setEnCours(true);
    const resultat = await verifierCode(adresse.trim(), code);
    setMessage(resultat.message);
    setEnCours(false);
    // Pas d'action supplémentaire ici : `onAuthStateChange` met à jour la
    // session, et l'application quitte cet écran d'elle-même.
  };

  const changerAdresse = () => {
    setEtape('email');
    setCode('');
    setMessage(null);
    setAttenteRenvoi(0);
  };

  return (
    <div className="ecran">
      <div className="carte">
        <h2>Connexion</h2>

        {etape === 'email' ? (
          <>
            <p className="note">
              Un code à 6 chiffres vous est envoyé par courriel. Aucun mot de passe à
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
              disabled={enCours || !adresse.includes('@')}
              onClick={() => void demanderCode()}
            >
              {enCours ? 'Envoi…' : 'Recevoir le code'}
            </button>
          </>
        ) : (
          <>
            <p className="note">
              Code envoyé à {adresse}. Saisissez les 6 chiffres reçus par courriel.
            </p>
            <input
              className="champ champ-montant"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <button
              className="bouton bouton-principal"
              disabled={enCours || code.length !== 6}
              onClick={() => void validerCode()}
            >
              {enCours ? 'Vérification…' : 'Se connecter'}
            </button>
            <div className="connexion-actions">
              <button
                className="lien"
                disabled={enCours || attenteRenvoi > 0}
                onClick={() => void demanderCode()}
              >
                {attenteRenvoi > 0 ? `Renvoyer le code (${attenteRenvoi}s)` : 'Renvoyer le code'}
              </button>
              <button className="lien" onClick={changerAdresse}>
                Changer d’adresse
              </button>
            </div>
          </>
        )}

        {message && <p className="note">{message}</p>}
      </div>
    </div>
  );
}
