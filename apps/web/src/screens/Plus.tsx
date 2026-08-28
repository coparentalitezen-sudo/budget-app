import { Carte } from '../components/ui.tsx';
import { features } from '../config/features.config.ts';

export interface EntreePlus {
  cle: string;
  libelle: string;
  description: string;
  emoji: string;
}

const ENTREES: EntreePlus[] = [
  { cle: 'credits', libelle: 'Crédits', description: 'Amortissement, remboursement anticipé', emoji: '🏦' },
  { cle: 'provisions', libelle: 'Provisions', description: 'Charges annuelles lissées', emoji: '📅' },
  { cle: 'import', libelle: 'Import', description: 'Relevés bancaires (PDF, CSV)', emoji: '📥' },
  { cle: 'rapprochement', libelle: 'Rapprochement', description: 'Vérifier le solde face au relevé', emoji: '🧮' },
  { cle: 'configurer', libelle: 'Configuration', description: 'Revenus, charges, enveloppes', emoji: '⚙️' },
  { cle: 'parametres', libelle: 'Réglages', description: 'Synchronisation, comptes, session', emoji: '🔧' },
  ...(features.rgpd
    ? [{ cle: 'confidentialite', libelle: 'Confidentialité', description: 'CGU, mentions légales, vos droits', emoji: '📜' }]
    : []),
];

/**
 * Menu « Plus » : regroupe les sections secondaires pour garder la
 * navigation basse à cinq entrées maximum sur iPhone.
 */
export function Plus({ onOuvrir }: { onOuvrir: (cle: string) => void }) {
  return (
    <div className="ecran">
      <Carte titre="Plus">
        <ul className="plus-liste">
          {ENTREES.map((e) => (
            <li key={e.cle}>
              <button className="plus-entree" onClick={() => onOuvrir(e.cle)}>
                <span className="icone-badge">{e.emoji}</span>
                <span className="plus-texte">
                  <span className="plus-libelle">{e.libelle}</span>
                  <span className="plus-description">{e.description}</span>
                </span>
                <span className="plus-chevron">›</span>
              </button>
            </li>
          ))}
        </ul>
      </Carte>
    </div>
  );
}
