/**
 * Rapport lisible de la situation budgétaire, calculé par le moteur.
 * Usage : npm run rapport
 */

import { formatEUR } from '../src/money.ts';
import {
  budgetVariableTotal,
  chargesFixesPrevues,
  dotationsProvisions,
  revenusPrevus,
  situationEpargne,
  synthetiserSemaine,
} from '../src/budget.ts';
import { repartitionDuMois } from '../src/epargne.ts';
import { synthetiserCredit } from '../src/credits.ts';
import { etatProvisions } from '../src/provisions.ts';
import { genererAlertes } from '../src/alertes.ts';
import { cibleFondUrgence } from '../src/fondUrgence.ts';
import { analyserEcheances } from '../src/echeances.ts';
import { situationVirement } from '../src/tresorerie.ts';
import { inventaireInconnues } from '../src/inconnues.ts';
import { projeterTousLesObjectifs } from '../src/epargne.ts';
import { foyer2026 } from '../src/fixtures/foyer2026.ts';

const AUJOURDHUI = '2026-08-23';
const ligne = (l: string, v: string) => console.log(`  ${l.padEnd(38, '.')} ${v.padStart(12)}`);

for (const p of ['2026-09', '2026-10']) {
  const etiquette = p === '2026-09' ? '(prêt cuisine en cours)' : '(prêt cuisine soldé)';
  console.log(`\n=== ${p} ${etiquette} ===`);
  ligne('Revenus réguliers', formatEUR(revenusPrevus(foyer2026, p)));
  ligne('Charges fixes', formatEUR(-chargesFixesPrevues(foyer2026, p)));
  ligne('Dotations provisions', formatEUR(-dotationsProvisions(foyer2026)));
  ligne(
    'Disponible',
    formatEUR(
      revenusPrevus(foyer2026, p) -
        chargesFixesPrevues(foyer2026, p) -
        dotationsProvisions(foyer2026),
    ),
  );
  ligne('Enveloppes variables', formatEUR(-budgetVariableTotal(foyer2026)));
  const e = situationEpargne(foyer2026, p);
  ligne('Objectif d’épargne (théorique)', formatEUR(e.objectifEpargne));
  ligne('Capacité d’épargne calculée', formatEUR(e.capaciteEpargneBudgetaire));
  ligne('Écart à l’objectif', formatEUR(e.ecartObjectif));
  ligne('Objectif atteignable', e.atteignable ? 'oui' : 'NON');
  ligne('Versement autorisé par le budget', formatEUR(e.versementBudgetaire));
  for (const r of repartitionDuMois(foyer2026, p)) {
    ligne(`  → ${r.nom}`, formatEUR(r.montant));
  }
}

console.log('\n=== Capacité budgétaire vs trésorerie (23/08/2026) ===');
const v = situationVirement(foyer2026, [], AUJOURDHUI);
ligne('Capacité d’épargne budgétaire', formatEUR(v.capaciteEpargneBudgetaire));
ligne('Montant transférable maintenant', v.montantTransferableMaintenant === null ? 'INCONNU' : formatEUR(v.montantTransferableMaintenant));
ligne('Versement réel', v.versementReel === null ? 'INCONNU' : formatEUR(v.versementReel));
for (const b of v.blocages) console.log(`    ⚠ ${b}`);

console.log('\n=== Vue hebdomadaire au 23/08/2026 ===');
const h = synthetiserSemaine(foyer2026, [], AUJOURDHUI);
ligne('Jours restants dans le mois', String(h.joursRestantsMois));
ligne('Allocation quotidienne', formatEUR(h.allocationQuotidienne));
ligne('Disponible d’ici dimanche', formatEUR(h.disponibleCetteSemaine));

console.log('\n=== Fonds d’urgence ===');
const cible = cibleFondUrgence(foyer2026, '2026-10');
ligne('Base mensuelle essentielle', formatEUR(cible.baseMensuelle!));
ligne(`Cible (${cible.nombreDeMois} mois)`, formatEUR(cible.cible));
console.log(`  ${cible.explication}`);
for (const mode of [
  { mode: 'depenses_essentielles', nombreDeMois: 6 },
  { mode: 'revenus', nombreDeMois: 3 },
] as const) {
  const alt = cibleFondUrgence(foyer2026, '2026-10', mode);
  ligne(`  alternative ${alt.mode} ${alt.nombreDeMois} mois`, formatEUR(alt.cible));
}

for (const o of projeterTousLesObjectifs(foyer2026, '2026-10')) {
  console.log(
    `  ${o.nom} : cible ${o.objectifTotal === null ? 'non définie' : formatEUR(o.objectifTotal)}, ` +
      `solde ${o.montantActuel === null ? 'INCONNU' : formatEUR(o.montantActuel)}, ` +
      `reste ${o.restantAConstituer === null ? 'INCONNU' : formatEUR(o.restantAConstituer)}, ` +
      `atteinte ${o.dateAtteinte ?? 'INCONNUE'}`,
  );
}

console.log('\n=== Provisions ===');
for (const e of etatProvisions(foyer2026.provisions, AUJOURDHUI)) {
  const statut =
    e.couverte === null
      ? `couverture INDÉTERMINÉE (échéance : ${e.prochaineEcheance ?? 'inconnue'}, ` +
        `déjà provisionné : ${e.montantProvisionne === null ? 'inconnu' : formatEUR(e.montantProvisionne)})`
      : e.couverte
        ? 'couverte'
        : `manque ${formatEUR(e.deficitPrevisionnel!)} d’ici le ${e.prochaineEcheance}`;
  console.log(
    `  ${e.nom} : dotation ${formatEUR(e.dotationMensuelle)}/mois vers ` +
      `${formatEUR(e.montantAnnuel)}${e.montantEstime ? ' (estimé)' : ''} — ${statut}`,
  );
}

console.log('\n=== Échéances exceptionnelles ===');
for (const a of analyserEcheances(foyer2026, AUJOURDHUI)) {
  console.log(
    `  ${a.nom} : ${formatEUR(a.montant)}${a.montantEstime ? ' (estimé)' : ''} — ` +
      `date ${a.dateEcheance ?? 'À CONFIRMER'} — reste à décaisser ` +
      `${a.resteADecaisser === null ? 'INCONNU' : formatEUR(a.resteADecaisser)}` +
      `${a.baseEstBorneSuperieure ? ` (scénarios chiffrés sur ${formatEUR(a.baseFinancement)} au plus)` : ''}`,
  );
  if (a.note) console.log(`    ⓘ ${a.note}`);
  for (const sc of a.scenarios) {
    console.log(`    • [${sc.faisabilite}] ${sc.libelle}\n        ${sc.detail}`);
  }
}

console.log('\n=== Crédits ===');
for (const c of foyer2026.credits) {
  const s = synthetiserCredit(c);
  console.log(
    `  ${s.nom} : ${formatEUR(s.capitalRestant)} restants, ${s.echeancesRestantes} échéances, ` +
      `${formatEUR(s.interetsRestants)} d’intérêts à venir`,
  );
}

console.log('\n=== Données financières inconnues ===');
for (const i of inventaireInconnues(foyer2026)) {
  console.log(`  • ${i.libelle}\n      → ${i.consequence}`);
}

console.log('\n=== Alertes ===');
for (const a of genererAlertes(foyer2026, [], AUJOURDHUI)) {
  console.log(`  [${a.niveau.toUpperCase()}] ${a.titre}\n      ${a.detail}`);
}
console.log();
