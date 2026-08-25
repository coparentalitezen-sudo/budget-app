/**
 * Génère `supabase/seed.sql` à partir de la fixture VALIDÉE du moteur.
 *
 * Recopier 40 montants à la main dans du SQL serait la meilleure façon
 * d'introduire un écart silencieux entre le moteur testé et la base. Le
 * seed est donc dérivé, jamais transcrit.
 *
 * Usage : node --experimental-strip-types supabase/scripts/generer-seed.ts
 */
import { writeFileSync } from 'node:fs';
import { foyer2026 } from '../../packages/core/src/fixtures/foyer2026.ts';
import { REGLES_INITIALES } from '../../apps/web/src/import/regles.ts';

const uuid = (graine: string): string => {
  // UUID déterministe dérivé du nom : rejouer le seed est idempotent.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const c of graine) {
    h1 = Math.imul(h1 ^ c.charCodeAt(0), 16777619) >>> 0;
    h2 = Math.imul(h2 + c.charCodeAt(0), 2654435761) >>> 0;
  }
  // `>>> 0` est indispensable : en JavaScript, `a ^ b` renvoie un entier
  // SIGNÉ sur 32 bits, et un nombre négatif produit un « - » en base 16,
  // donc un UUID invalide. Bug attrapé par l'exécution réelle du seed.
  const hex = (v: number, taille: number) =>
    (v >>> 0).toString(16).padStart(8, '0').slice(0, taille);
  return [
    hex(h1, 8),
    hex(h2, 4),
    `4${hex(h1 ^ h2, 3)}`,
    `8${hex(h2 ^ 0x5bf03635, 3)}`,
    hex(h1 + h2, 8) + hex(Math.imul(h1, 3), 4),
  ].join('-');
};

/** Une valeur inconnue devient NULL, jamais 0 ni une chaîne vide. */
const n = (v: number | null | undefined) => (v === null || v === undefined ? 'null' : String(v));
const s = (v: string | null | undefined) =>
  v === null || v === undefined ? 'null' : `'${v.replace(/'/g, "''")}'`;
const b = (v: boolean | undefined) => (v ? 'true' : 'false');
const tableau = (v: string[]) => `array[${v.map((x) => s(x)).join(', ')}]::text[]`;

const c = foyer2026;
const lignes: string[] = [];

lignes.push(`-- =====================================================================
-- seed.sql — GÉNÉRÉ depuis packages/core/src/fixtures/foyer2026.ts
-- Ne pas éditer à la main : relancer
--   node --experimental-strip-types supabase/scripts/generer-seed.ts
--
-- Idempotent : les UUID sont déterministes et les insertions utilisent
-- ON CONFLICT DO UPDATE. Rejouer le seed ne duplique rien.
--
-- Usage :
--   psql "$DATABASE_URL" -v user_id="'<votre-uuid-auth>'" -f supabase/seed.sql
-- =====================================================================

\\set uid :user_id

begin;

insert into public.users (id, display_name, safety_buffer_cents, savings_target_cents, savings_manual_caps, pending_parameters)
values (:uid, 'Moi', ${c.reglageTresorerie.seuilSecurite}, ${c.reglageEpargne.objectif},
        '${JSON.stringify(c.reglageEpargne.plafondsManuels)}'::jsonb,
        ${tableau(c.parametresAConfirmer)})
on conflict (id) do update set
  safety_buffer_cents = excluded.safety_buffer_cents,
  savings_target_cents = excluded.savings_target_cents,
  pending_parameters = excluded.pending_parameters;
`);

lignes.push('\n-- Comptes (soldes inconnus = NULL)');
for (const compte of c.comptes) {
  lignes.push(
    `insert into public.accounts (id, user_id, name, type, balance_cents, balance_as_of) values ` +
      `('${uuid(compte.id)}', :uid, ${s(compte.nom)}, '${compte.type}', ${n(compte.solde)}, null) ` +
      `on conflict (id) do update set name = excluded.name;`,
  );
}

lignes.push('\n-- Catégories');
for (const cat of c.categories) {
  lignes.push(
    `insert into public.categories (id, user_id, name, nature, criticality) values ` +
      `('${uuid(cat.id)}', :uid, ${s(cat.nom)}, '${cat.nature}', ` +
      `${cat.criticite ? `'${cat.criticite}'` : 'null'}) ` +
      `on conflict (id) do update set criticality = excluded.criticality;`,
  );
}

lignes.push('\n-- Revenus récurrents (jours de versement inconnus = NULL)');
for (const r of c.revenus) {
  lignes.push(
    `insert into public.recurring_incomes (id, user_id, name, amount_cents, day_of_month) values ` +
      `('${uuid(r.id)}', :uid, ${s(r.nom)}, ${r.montant}, ${n(r.jour)}) ` +
      `on conflict (id) do update set amount_cents = excluded.amount_cents;`,
  );
}

lignes.push('\n-- Charges récurrentes (excluded_months NULL = calendrier non confirmé)');
for (const ch of c.charges) {
  const fin = ch.fin ? `'${ch.fin}-01'::date + interval '1 month' - interval '1 day'` : 'null';
  lignes.push(
    `insert into public.recurring_expenses (id, user_id, category_id, name, amount_cents, day_of_month, excluded_months, ends_on) values ` +
      `('${uuid(ch.id)}', :uid, '${uuid(ch.categorieId)}', ${s(ch.nom)}, ${ch.montant}, ${n(ch.jour)}, ` +
      `${ch.moisExclus ? `array[${ch.moisExclus.join(',')}]::smallint[]` : 'null'}, ${fin}) ` +
      `on conflict (id) do update set amount_cents = excluded.amount_cents, ends_on = excluded.ends_on;`,
  );
}

lignes.push('\n-- Provisions annuelles FUTURES');
for (const p of c.provisions) {
  lignes.push(
    `insert into public.annual_provisions (id, user_id, name, annual_amount_cents, amount_is_estimate, monthly_amount_cents, next_due_date, provisioned_cents, provisioned_as_of, day_of_transfer) values ` +
      `('${uuid(p.id)}', :uid, ${s(p.nom)}, ${p.montantAnnuel}, ${b(p.montantEstime)}, ${p.dotationMensuelle}, ` +
      `${s(p.prochaineEcheance)}, ${n(p.montantProvisionne)}, null, ${n(p.jourDotation)}) ` +
      `on conflict (id) do update set monthly_amount_cents = excluded.monthly_amount_cents;`,
  );
}

lignes.push('\n-- Échéances exceptionnelles — DISTINCTES des provisions');
for (const e of c.echeancesExceptionnelles) {
  lignes.push(
    `insert into public.one_off_liabilities (id, user_id, name, amount_cents, amount_is_estimate, due_date, already_set_aside_cents, already_set_aside_as_of, note) values ` +
      `('${uuid(e.id)}', :uid, ${s(e.nom)}, ${e.montant}, ${b(e.montantEstime)}, ${s(e.dateEcheance)}, ` +
      `${n(e.dejaProvisionne)}, null, ${s(e.note)}) ` +
      `on conflict (id) do update set note = excluded.note;`,
  );
}

lignes.push('\n-- Objectifs d’épargne (cible urgence NON figée, soldes inconnus)');
for (const o of c.objectifsEpargne) {
  lignes.push(
    `insert into public.savings_goals (id, user_id, name, type, target_cents, current_amount_cents, current_amount_as_of, monthly_target_cents, priority) values ` +
      `('${uuid(o.id)}', :uid, ${s(o.nom)}, '${o.type}', ${n(o.objectifTotal)}, ${n(o.montantActuel)}, null, ` +
      `${o.versementMensuelCible}, ${o.priorite}) ` +
      `on conflict (id) do update set monthly_target_cents = excluded.monthly_target_cents;`,
  );
}

const rf = c.reglageFondUrgence;
const ref = rf.mode !== 'manuel' ? rf.periodeReference?.split('-').map(Number) : undefined;
lignes.push(`\n-- Mode de calcul de la cible du fonds d’urgence
insert into public.emergency_fund_settings (user_id, mode, months_count, manual_target_cents, include_semi_essential, reference_year, reference_month) values
  (:uid, '${rf.mode}', ${rf.mode === 'manuel' ? 'null' : rf.nombreDeMois}, ${rf.mode === 'manuel' ? rf.montant : 'null'}, ` +
  `${rf.mode !== 'manuel' ? b(rf.inclureSemiEssentielles) : 'false'}, ${ref ? ref[0] : 'null'}, ${ref ? ref[1] : 'null'})
on conflict (user_id) do update set mode = excluded.mode, months_count = excluded.months_count;`);

lignes.push('\n-- Crédits dont le capital restant est CONNU. Les autres sont');
lignes.push('-- volontairement absents : aucun amortissement ne doit être extrapolé.');
for (const cr of c.credits) {
  lignes.push(
    `insert into public.loans (id, user_id, name, monthly_payment_cents, remaining_principal_cents, remaining_principal_as_of, annual_rate, end_date) values ` +
      `('${uuid(cr.id)}', :uid, ${s(cr.nom)}, ${cr.mensualite}, ${cr.capitalRestant}, '2026-08-23', ` +
      `${cr.tauxAnnuel}, ${s(cr.dateFinPrevue)}) ` +
      `on conflict (id) do update set remaining_principal_cents = excluded.remaining_principal_cents;`,
  );
}
lignes.push(
  `insert into public.loans (id, user_id, name, monthly_payment_cents, remaining_principal_cents, remaining_principal_as_of, annual_rate, end_date) values ` +
    `('${uuid('cred_immo')}', :uid, 'Prêt immobilier', 120000, null, null, null, null) ` +
    `on conflict (id) do nothing;`,
);

lignes.push('\n-- Règles de catégorisation initiales. Modifiables et supprimables');
lignes.push('-- depuis l’écran Configuration : ce sont des valeurs de départ.');
lignes.push('-- Source unique : apps/web/src/import/regles.ts (REGLES_INITIALES).');
for (const { motif, categorie } of REGLES_INITIALES) {
  const cat = c.categories.find((cc) => cc.nom === categorie);
  if (!cat) {
    throw new Error(
      `Règle "${motif}" : catégorie "${categorie}" introuvable dans la configuration foyer2026.`,
    );
  }
  lignes.push(
    `insert into public.categorization_rules (id, user_id, category_id, pattern, match_type, priority, auto_validate, is_active) values ` +
      `('${uuid('regle_' + motif)}', :uid, '${uuid(cat.id)}', ${s(motif)}, 'contains', 100, false, true) ` +
      `on conflict (id) do update set pattern = excluded.pattern;`,
  );
}

lignes.push('\n-- Enveloppes variables des 12 prochains mois (total 1 130 €)');
lignes.push(`do $$
declare
  v_period uuid;
  v_year int;
  v_month int;
  v_date date := date_trunc('month', current_date);
begin
  for i in 0..11 loop
    v_year := extract(year from v_date)::int;
    v_month := extract(month from v_date)::int;

    insert into public.budget_periods (user_id, year, month)
    values (:uid, v_year, v_month)
    on conflict (user_id, year, month) do nothing;

    select id into v_period from public.budget_periods
      where user_id = :uid and year = v_year and month = v_month;
`);
for (const l of c.budgetVariable) {
  lignes.push(
    `    insert into public.budgets (user_id, period_id, category_id, planned_cents) values ` +
      `(:uid, v_period, '${uuid(l.categorieId)}', ${l.montantPrevu}) ` +
      `on conflict (period_id, category_id) do update set planned_cents = excluded.planned_cents;`,
  );
}
lignes.push(`
    v_date := v_date + interval '1 month';
  end loop;
end;
$$;

commit;
`);

const sortie = new URL('../seed.sql', import.meta.url).pathname;
writeFileSync(sortie, lignes.join('\n') + '\n', 'utf8');
console.log(`seed.sql généré : ${lignes.length} instructions`);
