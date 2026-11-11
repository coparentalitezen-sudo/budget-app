import { useEffect, useState } from 'react';

/**
 * Thème d'affichage : clair (crème, par défaut), sombre, ou celui du téléphone.
 *
 * Préférence purement locale à l'appareil (localStorage), jamais
 * synchronisée : ce n'est pas une donnée budgétaire. Toute lecture/écriture
 * est protégée — en navigation privée le stockage peut lever une erreur, et
 * l'app reste alors simplement en clair.
 */
export type PreferenceTheme = 'auto' | 'clair' | 'sombre';

const CLE = 'budget.theme';
const COULEUR_BARRE = { clair: '#f6f1e7', sombre: '#2a2620' } as const;
const requeteSombre = () => window.matchMedia('(prefers-color-scheme: dark)');

export function lirePreferenceTheme(): PreferenceTheme {
  try {
    const v = localStorage.getItem(CLE);
    return v === 'auto' || v === 'sombre' ? v : 'clair';
  } catch {
    return 'clair';
  }
}

function appliquer(preference: PreferenceTheme): void {
  const effectif = preference === 'auto' ? (requeteSombre().matches ? 'sombre' : 'clair') : preference;
  document.documentElement.dataset.theme = effectif;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COULEUR_BARRE[effectif]);
}

/** À appeler une fois au démarrage, avant le premier rendu (évite un flash). */
export function installerTheme(): void {
  appliquer(lirePreferenceTheme());
  requeteSombre().addEventListener('change', () => {
    if (lirePreferenceTheme() === 'auto') appliquer('auto');
  });
}

export function useTheme(): [PreferenceTheme, (p: PreferenceTheme) => void] {
  const [preference, setPreference] = useState<PreferenceTheme>(lirePreferenceTheme);
  useEffect(() => {
    try {
      if (preference === 'clair') localStorage.removeItem(CLE);
      else localStorage.setItem(CLE, preference);
    } catch {
      // Stockage indisponible : le choix vaut pour cette session seulement.
    }
    appliquer(preference);
  }, [preference]);
  return [preference, setPreference];
}
