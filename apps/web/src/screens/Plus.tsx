import { Carte } from '../components/ui.tsx';

export interface EntreePlus {
  cle: string;
  libelle: string;
  description: string;
  emoji: string;
}

const ENTREES: EntreePlus[] = [
  { cle: 'credits', libelle: 'Crédits', description: 'Amortissement, remboursement anticipé', emoji: '🏦' },
  { cle: 'provisions', libelle: 'Provisions', description: 'Charges annuelles lissées', emoji: '📅' },
  { cle: 'import', libelle: 'Import', description: 'Relevés bancaires, rapprochement', emoji: '📥' },
  { cle: 'configurer', libelle: 'Configuration', description: 'Revenus, charges, enveloppes', emoji: '⚙️' },
  { cle: 'parametres', libelle: 'Réglages', description: 'Synchronisation, comptes, session', emoji: '🔧' },
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
