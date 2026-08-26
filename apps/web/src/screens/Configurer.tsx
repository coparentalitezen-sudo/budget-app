import { useEffect, useState } from 'react';
import { eur } from '@budget/core/src/money.ts';
import { periodeDe } from '@budget/core/src/periode.ts';
import type { Categorie, NatureCategorie } from '@budget/core/src/types.ts';
import {
  activerRecurrent, archiverCategorie, chargerRegles, definirEnveloppe,
  enregistrerCategorie, enregistrerChargeRecurrente, enregistrerRegle,
  enregistrerRevenuRecurrent, supprimerEnveloppe, supprimerRecurrent, supprimerRegle,
} from '../db/configuration.ts';
import type { RegleCategorisation, TypeCorrespondance } from '../import/regles.ts';
import { Carte, Etiquette, Vide } from '../components/ui.tsx';
import { aujourdhuiISO, montant } from '../lib/format.ts';
import { useConfiguration } from '../state/useDonnees.ts';

const CRITICITES: (Categorie['criticite'] | 'non_classee')[] = [
  'essentielle', 'semi_essentielle', 'non_essentielle', 'non_classee',
];

export function Configurer() {
  const { config } = useConfiguration();
  const periode = periodeDe(aujourdhuiISO());
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [regles, setRegles] = useState<RegleCategorisation[]>([]);
  const [section, setSection] = useState<'categories' | 'enveloppes' | 'recurrents' | 'regles'>('categories');

  useEffect(() => { void chargerRegles().then(setRegles); }, []);

  const executer = async (action: () => Promise<string>) => {
    setErreur(null);
    setMessage(null);
    try {
      setMessage(await action());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };

  const nomCategorie = (id: string) =>
    config.categories.find((c) => c.id === id)?.nom ?? 'Catégorie inconnue';

  const totalEnveloppes = config.budgetVariable.reduce((a, l) => a + l.montantPrevu, 0);

  return (
    <div className="ecran">
      <div className="filtres">
        {(['categories', 'enveloppes', 'recurrents', 'regles'] as const).map((s) => (
          <button
            key={s}
            className={`bascule-item${section === s ? ' actif' : ''}`}
            onClick={() => setSection(s)}
          >
            {{ categories: 'Catégories', enveloppes: 'Enveloppes', recurrents: 'Récurrents', regles: 'Règles' }[s]}
          </button>
        ))}
      </div>

      {erreur && <p className="note note-attention">{erreur}</p>}
      {message && <p className="note">{message}</p>}

      {section === 'categories' && (
        <>
          <Carte titre="Catégories">
            <p className="note">
              La criticité sert au calcul du fonds d’urgence. Une catégorie{' '}
              <strong>non classée est exclue du calcul et signalée</strong> — jamais
              présumée non essentielle.
            </p>
          </Carte>
          {config.categories.map((c) => (
            <Carte key={c.id}>
              <div className="scenario-tete">
                <strong>{c.nom}</strong>
                <Etiquette>{c.nature}</Etiquette>
              </div>
              {c.nature !== 'revenu' && (
                <select
                  className="champ"
                  value={c.criticite ?? 'non_classee'}
                  onChange={(e) =>
                    void executer(async () => {
                      const valeur = e.target.value;
                      await enregistrerCategorie({
                        id: c.id,
                        nom: c.nom,
                        nature: c.nature,
                        criticite: valeur === 'non_classee' ? null : (valeur as Categorie['criticite'])!,
                      });
                      return `Criticité de « ${c.nom} » enregistrée.`;
                    })
                  }
                >
                  {CRITICITES.map((v) => (
                    <option key={v} value={v ?? 'non_classee'}>
                      {v === 'non_classee' ? 'Non classée (exclue du calcul)' : v}
                    </option>
                  ))}
                </select>
              )}
              {c.nature === 'revenu' && (
                <p className="note">
                  Catégorie de revenu : pas de criticité, elle ne fait pas partie
                  des dépenses du fonds d’urgence.
                </p>
              )}
              {(c.nature === 'variable' || c.nature === 'revenu') && (
                <button
                  className="bouton"
                  onClick={() =>
                    void executer(async () => {
                      await archiverCategorie(c.id);
                      return `« ${c.nom} » archivée. Les transactions passées la conservent.`;
                    })
                  }
                >
                  Archiver
                </button>
              )}
            </Carte>
          ))}
          <NouvelleCategorie onEnregistrer={(c) => executer(async () => {
            await enregistrerCategorie(c);
            return `Catégorie « ${c.nom} » créée.`;
          })} />
        </>
      )}

      {section === 'enveloppes' && (
        <>
          <Carte titre={`Enveloppes — total ${montant(totalEnveloppes)}`}>
            <p className="note">
              Une modification s’applique au mois en cours et aux suivants : c’est
              presque toujours l’intention réelle quand on ajuste un budget récurrent.
            </p>
          </Carte>
          {config.budgetVariable.map((l) => (
            <Enveloppe
              key={l.categorieId}
              nom={nomCategorie(l.categorieId)}
              valeur={l.montantPrevu}
              onValider={(v, suivants) =>
                executer(async () => {
                  const n = await definirEnveloppe(periode, l.categorieId, v, suivants);
                  return `${nomCategorie(l.categorieId)} : ${montant(v)} sur ${n} période(s).`;
                })
              }
              onSupprimer={(suivants) =>
                executer(async () => {
                  const n = await supprimerEnveloppe(periode, l.categorieId, suivants);
                  return `Enveloppe « ${nomCategorie(l.categorieId)} » retirée de ${n} période(s).`;
                })
              }
            />
          ))}
          <NouvelleEnveloppe
            categoriesDisponibles={config.categories.filter(
              (c) => c.nature === 'variable' && !config.budgetVariable.some((l) => l.categorieId === c.id),
            )}
            onEnregistrer={(categorieId, v, suivants) =>
              executer(async () => {
                const n = await definirEnveloppe(periode, categorieId, v, suivants);
                return `${nomCategorie(categorieId)} : ${montant(v)} sur ${n} période(s).`;
              })
            }
          />
        </>
      )}

      {section === 'recurrents' && (
        <>
          <Carte titre="Revenus récurrents">
            <p className="note">
              Désactiver un élément le retire des calculs du mois en cours sans rien
              supprimer. Supprimer est définitif : ne l’utilisez que pour une erreur de
              saisie, pas pour un revenu qui s’arrête.
            </p>
            {config.revenus.map((r) => (
              <Bascule
                key={r.id}
                libelle={`${r.nom} — ${montant(r.montant)}`}
                detail={r.jour === null ? 'Jour de versement inconnu' : `Le ${r.jour}`}
                onDesactiver={() =>
                  executer(async () => {
                    await activerRecurrent('recurring_incomes', r.id, false);
                    return `${r.nom} désactivé.`;
                  })
                }
                onSupprimer={() =>
                  executer(async () => {
                    await supprimerRecurrent('recurring_incomes', r.id);
                    return `${r.nom} supprimé.`;
                  })
                }
              />
            ))}
          </Carte>
          <NouveauRevenu
            onEnregistrer={(r) =>
              executer(async () => {
                await enregistrerRevenuRecurrent(r);
                return `Revenu « ${r.nom} » créé.`;
              })
            }
          />

          <Carte titre="Charges récurrentes">
            {config.charges.map((c) => (
              <Bascule
                key={c.id}
                libelle={`${c.nom} — ${montant(c.montant)}`}
                detail={c.fin ? `Dernière échéance ${c.fin}` : c.jour === null ? 'Jour inconnu' : `Le ${c.jour}`}
                onDesactiver={() =>
                  executer(async () => {
                    await activerRecurrent('recurring_expenses', c.id, false);
                    return `${c.nom} désactivée.`;
                  })
                }
                onSupprimer={() =>
                  executer(async () => {
                    await supprimerRecurrent('recurring_expenses', c.id);
                    return `${c.nom} supprimée.`;
                  })
                }
              />
            ))}
          </Carte>
          <NouvelleCharge
            categories={config.categories.filter((c) => c.nature !== 'revenu')}
            onEnregistrer={(c) =>
              executer(async () => {
                await enregistrerChargeRecurrente(c);
                return `Charge « ${c.nom} » créée.`;
              })
            }
          />
        </>
      )}

      {section === 'regles' && (
        <>
          <Carte titre="Catégorisation automatique">
            <p className="note">
              Une règle <strong>propose</strong> une catégorie ; la transaction reste
              en attente de votre validation. Attention aux motifs trop courts :
              « TOTAL » attraperait aussi bien TOTALENERGIES que les stations-service.
            </p>
          </Carte>
          {regles.length === 0 && <Vide message="Aucune règle. Ajoutez-en une ci-dessous." />}
          {regles.map((r) => (
            <Carte key={r.id}>
              <div className="scenario-tete">
                <strong>{r.motif}</strong>
                <Etiquette ton={r.active ? 'ok' : 'attente'}>
                  {r.active ? 'Active' : 'Inactive'}
                </Etiquette>
              </div>
              <p className="alerte-detail">
                {r.typeCorrespondance} → {nomCategorie(r.categorieId)} · priorité {r.priorite}
                {r.autoValider ? ' · validation automatique' : ''}
              </p>
              <div className="bascule">
                <button
                  onClick={() =>
                    void executer(async () => {
                      await enregistrerRegle({ ...r, active: !r.active });
                      setRegles(await chargerRegles());
                      return `Règle « ${r.motif} » ${r.active ? 'désactivée' : 'activée'}.`;
                    })
                  }
                >
                  {r.active ? 'Désactiver' : 'Activer'}
                </button>
                <button
                  onClick={() =>
                    void executer(async () => {
                      await supprimerRegle(r.id);
                      setRegles(await chargerRegles());
                      return `Règle « ${r.motif} » supprimée.`;
                    })
                  }
                >
                  Supprimer
                </button>
              </div>
            </Carte>
          ))}
          <NouvelleRegle
            categories={config.categories}
            onEnregistrer={(r) =>
              executer(async () => {
                await enregistrerRegle(r);
                setRegles(await chargerRegles());
                return `Règle « ${r.motif} » créée.`;
              })
            }
          />
        </>
      )}
    </div>
  );
}

function Enveloppe({
  nom, valeur, onValider, onSupprimer,
}: {
  nom: string;
  valeur: number;
  onValider: (v: number, suivants: boolean) => Promise<void>;
  onSupprimer: (suivants: boolean) => Promise<void>;
}) {
  const [texte, setTexte] = useState(String(valeur / 100));
  const [suivants, setSuivants] = useState(true);
  return (
    <Carte>
      <div className="scenario-tete">
        <strong>{nom}</strong>
        <span>{montant(valeur)}</span>
      </div>
      <input
        className="champ"
        type="text"
        inputMode="decimal"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
      />
      <label className="puce">
        <input type="checkbox" checked={suivants} onChange={(e) => setSuivants(e.target.checked)} />{' '}
        Appliquer aussi aux mois suivants
      </label>
      <div className="bascule">
        <button
          className="bouton bouton-principal"
          onClick={() => {
            const v = Number(texte.replace(',', '.'));
            if (Number.isFinite(v) && v >= 0) void onValider(eur(v), suivants);
          }}
        >
          Enregistrer
        </button>
        <button
          className="bouton"
          onClick={() => {
            if (window.confirm(`Retirer l’enveloppe « ${nom} » ?`)) void onSupprimer(suivants);
          }}
        >
          Supprimer
        </button>
      </div>
    </Carte>
  );
}

function NouvelleEnveloppe({
  categoriesDisponibles, onEnregistrer,
}: {
  categoriesDisponibles: Categorie[];
  onEnregistrer: (categorieId: string, v: number, suivants: boolean) => Promise<void>;
}) {
  const [categorieId, setCategorieId] = useState('');
  const [texte, setTexte] = useState('');
  const [suivants, setSuivants] = useState(true);

  if (categoriesDisponibles.length === 0) return null;

  return (
    <Carte titre="Nouvelle enveloppe">
      <select
        className="champ"
        value={categorieId}
        onChange={(e) => setCategorieId(e.target.value)}
      >
        <option value="">Choisir une catégorie…</option>
        {categoriesDisponibles.map((c) => (
          <option key={c.id} value={c.id}>{c.nom}</option>
        ))}
      </select>
      <input
        className="champ"
        type="text"
        inputMode="decimal"
        placeholder="Montant mensuel"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
      />
      <label className="puce">
        <input type="checkbox" checked={suivants} onChange={(e) => setSuivants(e.target.checked)} />{' '}
        Appliquer aussi aux mois suivants
      </label>
      <button
        className="bouton bouton-principal"
        disabled={categorieId === ''}
        onClick={() => {
          const v = Number(texte.replace(',', '.'));
          if (categorieId !== '' && Number.isFinite(v) && v >= 0) {
            void onEnregistrer(categorieId, eur(v), suivants);
            setCategorieId('');
            setTexte('');
          }
        }}
      >
        Ajouter
      </button>
    </Carte>
  );
}

function Bascule({
  libelle, detail, onDesactiver, onSupprimer,
}: {
  libelle: string;
  detail: string;
  onDesactiver: () => Promise<void>;
  onSupprimer: () => Promise<void>;
}) {
  return (
    <div className="scenario">
      <div className="scenario-tete">
        <span>{libelle}</span>
        <span>
          <button className="lien" onClick={() => void onDesactiver()}>Désactiver</button>{' '}
          <button
            className="lien lien-detail"
            onClick={() => {
              if (window.confirm(`Supprimer « ${libelle} » ? Cette action est définitive.`)) {
                void onSupprimer();
              }
            }}
          >
            Supprimer
          </button>
        </span>
      </div>
      <p className="alerte-detail">{detail}</p>
    </div>
  );
}

function NouveauRevenu({
  onEnregistrer,
}: {
  onEnregistrer: (r: { nom: string; montant: number; jour: number | null }) => Promise<void>;
}) {
  const [nom, setNom] = useState('');
  const [texte, setTexte] = useState('');
  const [jourTexte, setJourTexte] = useState('');

  const valider = () => {
    const v = Number(texte.replace(',', '.'));
    if (nom.trim() === '' || !Number.isFinite(v) || v <= 0) return;
    const jour = jourTexte.trim() === '' ? null : Number(jourTexte);
    void onEnregistrer({ nom: nom.trim(), montant: eur(v), jour });
    setNom(''); setTexte(''); setJourTexte('');
  };

  return (
    <Carte titre="Nouveau revenu récurrent">
      <input className="champ" placeholder="Nom (ex. Salaire)" value={nom} onChange={(e) => setNom(e.target.value)} />
      <input
        className="champ"
        type="text"
        inputMode="decimal"
        placeholder="Montant mensuel"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
      />
      <input
        className="champ"
        type="text"
        inputMode="numeric"
        placeholder="Jour de versement (facultatif, 1-31)"
        value={jourTexte}
        onChange={(e) => setJourTexte(e.target.value)}
      />
      <button className="bouton bouton-principal" disabled={nom.trim() === ''} onClick={valider}>
        Ajouter
      </button>
      <p className="note">
        Jour laissé vide = non confirmé : le revenu est alors exclu des
        encaissements à venir plutôt que deviné.
      </p>
    </Carte>
  );
}

function NouvelleCharge({
  categories, onEnregistrer,
}: {
  categories: Categorie[];
  onEnregistrer: (c: { nom: string; montant: number; jour: number | null; categorieId: string }) => Promise<void>;
}) {
  const [nom, setNom] = useState('');
  const [texte, setTexte] = useState('');
  const [jourTexte, setJourTexte] = useState('');
  const [categorieId, setCategorieId] = useState(categories[0]?.id ?? '');

  const valider = () => {
    const v = Number(texte.replace(',', '.'));
    if (nom.trim() === '' || categorieId === '' || !Number.isFinite(v) || v <= 0) return;
    const jour = jourTexte.trim() === '' ? null : Number(jourTexte);
    void onEnregistrer({ nom: nom.trim(), montant: eur(v), jour, categorieId });
    setNom(''); setTexte(''); setJourTexte('');
  };

  return (
    <Carte titre="Nouvelle charge récurrente">
      <input className="champ" placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} />
      <select className="champ" value={categorieId} onChange={(e) => setCategorieId(e.target.value)}>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.nom}</option>
        ))}
      </select>
      <input
        className="champ"
        type="text"
        inputMode="decimal"
        placeholder="Montant mensuel"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
      />
      <input
        className="champ"
        type="text"
        inputMode="numeric"
        placeholder="Jour de prélèvement (facultatif, 1-31)"
        value={jourTexte}
        onChange={(e) => setJourTexte(e.target.value)}
      />
      <button className="bouton bouton-principal" disabled={nom.trim() === '' || categorieId === ''} onClick={valider}>
        Ajouter
      </button>
      <p className="note">
        Jour laissé vide = non confirmé : la charge est alors comptée comme
        restant à décaisser plutôt que devinée.
      </p>
    </Carte>
  );
}

function NouvelleCategorie({
  onEnregistrer,
}: {
  onEnregistrer: (c: {
    nom: string;
    nature: NatureCategorie;
    // `undefined` (non classée dans le moteur) est ramené à `null` ici :
    // en base, une criticité absente est un NULL explicite.
    criticite: 'essentielle' | 'semi_essentielle' | 'non_essentielle' | null;
  }) => void;
}) {
  const [nom, setNom] = useState('');
  // Seules ces deux natures sont créables depuis l'écran : fixe/provision/
  // epargne restent structurelles (issues de la fixture/du seed), mais
  // dépense variable et revenu sont les deux familles libres au quotidien —
  // sans « revenu », une transaction de crédit (salaire, CAF...) n'avait
  // aucune catégorie cohérente à proposer.
  const [nature, setNature] = useState<'variable' | 'revenu'>('variable');
  return (
    <Carte titre="Nouvelle catégorie">
      <input className="champ" placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} />
      <select className="champ" value={nature} onChange={(e) => setNature(e.target.value as 'variable' | 'revenu')}>
        <option value="variable">Dépense</option>
        <option value="revenu">Revenu</option>
      </select>
      <button
        className="bouton bouton-principal"
        disabled={nom.trim() === ''}
        onClick={() => {
          onEnregistrer({ nom: nom.trim(), nature, criticite: null });
          setNom('');
        }}
      >
        Créer ({nature === 'revenu' ? 'revenu' : 'dépense variable, non classée'})
      </button>
      <p className="note">
        {nature === 'revenu'
          ? 'Catégorie de revenu, proposée pour les transactions créditées (salaire, CAF, remboursements reçus…).'
          : 'Créée non classée : à vous de définir sa criticité, elle ne sera pas devinée.'}
      </p>
    </Carte>
  );
}

function NouvelleRegle({
  categories, onEnregistrer,
}: {
  categories: Categorie[];
  onEnregistrer: (r: Omit<RegleCategorisation, 'id'>) => void;
}) {
  const [motif, setMotif] = useState('');
  const [categorieId, setCategorieId] = useState(categories[0]?.id ?? '');
  const [type, setType] = useState<TypeCorrespondance>('contains');
  const court = motif.trim().length > 0 && motif.trim().length < 3;

  return (
    <Carte titre="Nouvelle règle">
      <input
        className="champ"
        placeholder="Motif, ex. TOTALENERGIES"
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
      />
      {court && (
        <p className="note note-attention">
          Motif très court : il risque d’attraper des libellés sans rapport.
        </p>
      )}
      <select className="champ" value={type} onChange={(e) => setType(e.target.value as TypeCorrespondance)}>
        <option value="contains">contient</option>
        <option value="starts_with">commence par</option>
        <option value="exact">exactement</option>
        <option value="regex">expression régulière</option>
      </select>
      <select className="champ" value={categorieId} onChange={(e) => setCategorieId(e.target.value)}>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.nom}</option>
        ))}
      </select>
      <button
        className="bouton bouton-principal"
        disabled={motif.trim().length < 2 || categorieId === ''}
        onClick={() => {
          onEnregistrer({
            motif: motif.trim(),
            typeCorrespondance: type,
            categorieId,
            priorite: 100,
            // Jamais de validation automatique par défaut : un libellé
            // bancaire est trop instable pour engager les comptes seul.
            autoValider: false,
            active: true,
          });
          setMotif('');
        }}
      >
        Créer la règle
      </button>
    </Carte>
  );
}
