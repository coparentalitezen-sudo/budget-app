/**
 * Exécute réellement les migrations contre PostgreSQL (PGlite, WASM),
 * puis vérifie que les contraintes protègent bien les invariants du moteur.
 */
import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MIGRATIONS = new URL('../migrations/', import.meta.url).pathname;
const db = await PGlite.create();

let pass = 0;
let fail = 0;
const echec = [];

async function verifie(nom, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ok   ${nom}`);
  } catch (e) {
    fail++;
    echec.push(`${nom} :: ${e.message}`);
    console.log(`  FAIL ${nom}\n         ${e.message}`);
  }
}

/** Attend qu'une requête soit REJETÉE par la base. */
async function doitEchouer(sql, motif) {
  try {
    await db.exec(sql);
  } catch (e) {
    if (motif && !new RegExp(motif, 'i').test(e.message)) {
      throw new Error(`rejetée, mais pas pour la raison attendue : ${e.message}`);
    }
    return;
  }
  throw new Error('la base a ACCEPTÉ une donnée qui aurait dû être rejetée');
}

// --- Simulation de l'environnement Supabase ---------------------------
await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key, email text);
  create role authenticated;
  create role anon;
  create or replace function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);

// --- Application des migrations, dans l'ordre -------------------------
const fichiers = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
console.log(`\n=== Application de ${fichiers.length} migrations ===`);
for (const f of fichiers) {
  const sql = await readFile(join(MIGRATIONS, f), 'utf8');
  try {
    await db.exec(sql);
    console.log(`  ok   ${f}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL ${f}\n         ${e.message}`);
    fail++;
    echec.push(`${f} :: ${e.message}`);
    break; // inutile de continuer sur un schéma incomplet
  }
}

if (fail === 0) {
  const UID = '11111111-1111-1111-1111-111111111111';
  await db.exec(`
    insert into auth.users (id, email) values ('${UID}', 'moi@example.test');
    insert into public.users (id, display_name, safety_buffer_cents)
      values ('${UID}', 'Moi', 15000);
    insert into public.accounts (id, user_id, name, type, balance_cents, balance_as_of) values
      ('22222222-0000-0000-0000-000000000001', '${UID}', 'Compte courant', 'courant', null, null),
      ('22222222-0000-0000-0000-000000000002', '${UID}', 'Compte provisions', 'provisions', null, null);
    insert into public.categories (id, user_id, name, nature, criticality) values
      ('33333333-0000-0000-0000-000000000001', '${UID}', 'Courses', 'variable', 'essentielle'),
      ('33333333-0000-0000-0000-000000000002', '${UID}', 'Santé', 'variable', 'essentielle'),
      ('33333333-0000-0000-0000-000000000003', '${UID}', 'Vêtements', 'variable', 'semi_essentielle'),
      ('33333333-0000-0000-0000-000000000004', '${UID}', 'Divers / achats plaisir', 'variable', 'non_essentielle'),
      ('33333333-0000-0000-0000-000000000005', '${UID}', 'Taxe foncière', 'provision', null);
  `);

  console.log('\n=== Invariants « inconnu ≠ zéro » ===');

  await verifie('un solde de compte peut rester NULL', async () => {
    const r = await db.query(
      `select balance_cents from public.accounts where name = 'Compte courant'`,
    );
    if (r.rows[0].balance_cents !== null) throw new Error('le solde a été transformé');
  });

  await verifie('aucune colonne financière nullable n’a de DEFAULT 0', async () => {
    const r = await db.query(`
      select table_name, column_name, column_default
      from information_schema.columns
      where table_schema = 'public'
        and is_nullable = 'YES'
        and (column_name like '%_cents' or column_name like '%date')
        and column_default is not null
    `);
    if (r.rows.length > 0) {
      throw new Error(`DEFAULT interdit sur : ${r.rows.map((x) => `${x.table_name}.${x.column_name}`).join(', ')}`);
    }
  });

  await verifie('un solde renseigné sans date est rejeté', async () => {
    await doitEchouer(
      `insert into public.accounts (user_id, name, type, balance_cents)
       values ('${UID}', 'Sans date', 'courant', 120000)`,
      'accounts_balance_needs_date',
    );
  });

  await verifie('un objectif d’épargne accepte un solde inconnu', async () => {
    await db.exec(`
      insert into public.savings_goals (id, user_id, name, type, target_cents, current_amount_cents, current_amount_as_of, monthly_target_cents)
      values ('44444444-0000-0000-0000-000000000001', '${UID}', 'Fonds d''urgence', 'urgence', null, null, null, 15000)
    `);
    const r = await db.query(`select target_cents, current_amount_cents from public.savings_goals`);
    if (r.rows[0].target_cents !== null || r.rows[0].current_amount_cents !== null) {
      throw new Error('valeurs fabriquées');
    }
  });

  await verifie('la cible du fonds d’urgence n’est pas figée en base', async () => {
    const r = await db.query(
      `select target_cents from public.savings_goals where type = 'urgence'`,
    );
    if (r.rows[0].target_cents !== null) throw new Error('cible figée');
  });

  console.log('\n=== Intégrité comptable ===');

  await verifie('un montant négatif est rejeté', async () => {
    await doitEchouer(
      `insert into public.transactions (user_id, account_id, occurred_on, amount_cents, type)
       values ('${UID}', '22222222-0000-0000-0000-000000000001', '2026-09-01', -500, 'depense')`,
      'amount_cents',
    );
  });

  await verifie('un virement sans compte de destination est rejeté', async () => {
    await doitEchouer(
      `insert into public.transactions (user_id, account_id, occurred_on, amount_cents, type)
       values ('${UID}', '22222222-0000-0000-0000-000000000001', '2026-09-01', 25362, 'transfert')`,
      'transfer_needs_destination',
    );
  });

  await verifie('un virement vers le même compte est rejeté', async () => {
    await doitEchouer(
      `insert into public.transactions (user_id, account_id, destination_account_id, occurred_on, amount_cents, type)
       values ('${UID}', '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '2026-09-01', 25362, 'transfert')`,
      'no_self_transfer',
    );
  });

  console.log('\n=== Idempotence des imports ===');

  await verifie('la même ligne source ne peut pas entrer deux fois', async () => {
    await db.exec(`
      insert into public.transactions (user_id, account_id, occurred_on, amount_cents, type, source, external_id)
      values ('${UID}', '22222222-0000-0000-0000-000000000001', '2026-09-03', 4520, 'depense', 'csv_import', 'LIGNE-42')
    `);
    await doitEchouer(
      `insert into public.transactions (user_id, account_id, occurred_on, amount_cents, type, source, external_id)
       values ('${UID}', '22222222-0000-0000-0000-000000000001', '2026-09-03', 4520, 'depense', 'csv_import', 'LIGNE-42')`,
      'transactions_source_external_unique',
    );
  });

  await verifie('deux dépenses identiques SANS external_id restent permises', async () => {
    // Deux cafés au même montant le même jour : légitime, jamais bloqué.
    await db.exec(`
      insert into public.transactions (user_id, account_id, occurred_on, amount_cents, type, source, dedup_hash)
      values ('${UID}', '22222222-0000-0000-0000-000000000001', '2026-09-04', 350, 'depense', 'manual', 'abc'),
             ('${UID}', '22222222-0000-0000-0000-000000000001', '2026-09-04', 350, 'depense', 'manual', 'abc')
    `);
  });

  await verifie('un même fichier ne peut pas être importé deux fois avec succès', async () => {
    await db.exec(`
      insert into public.import_jobs (user_id, source, file_name, file_hash, status)
      values ('${UID}', 'csv_import', 'releve.csv', 'sha-aaa', 'succeeded')
    `);
    await doitEchouer(
      `insert into public.import_jobs (user_id, source, file_name, file_hash, status)
       values ('${UID}', 'csv_import', 'releve.csv', 'sha-aaa', 'succeeded')`,
      'import_jobs_file_hash_unique',
    );
  });

  console.log('\n=== Provisions vs dettes ponctuelles ===');

  await verifie('provision et dette sont deux tables distinctes', async () => {
    await db.exec(`
      insert into public.annual_provisions (user_id, name, annual_amount_cents, amount_is_estimate, monthly_amount_cents, next_due_date, provisioned_cents, provisioned_as_of)
      values ('${UID}', 'Taxe foncière (2027 et suivantes)', 160000, true, 13333, null, null, null);
      insert into public.one_off_liabilities (user_id, name, amount_cents, amount_is_estimate, due_date, already_set_aside_cents, already_set_aside_as_of, note)
      values ('${UID}', 'Taxe foncière 2026', 160000, true, null, null, null, 'Mensualisation inapplicable à 2026.');
    `);
    const p = await db.query(`select next_due_date, provisioned_cents from public.annual_provisions`);
    const d = await db.query(`select due_date, already_set_aside_cents from public.one_off_liabilities`);
    if (p.rows[0].next_due_date !== null || d.rows[0].due_date !== null) {
      throw new Error('une date a été fabriquée');
    }
    if (d.rows[0].already_set_aside_cents !== null) throw new Error('montant fabriqué');
  });

  console.log('\n=== Crédits ===');

  await verifie('un prêt sans capital restant connu est accepté', async () => {
    await db.exec(`
      insert into public.loans (user_id, name, monthly_payment_cents, remaining_principal_cents, remaining_principal_as_of, annual_rate, end_date)
      values ('${UID}', 'Prêt immobilier', 120000, null, null, null, null)
    `);
    const r = await db.query(`select remaining_principal_cents from public.loans where name = 'Prêt immobilier'`);
    if (r.rows[0].remaining_principal_cents !== null) throw new Error('capital fabriqué');
  });

  await verifie('un taux hors bornes est rejeté', async () => {
    await doitEchouer(
      `insert into public.loans (user_id, name, monthly_payment_cents, annual_rate)
       values ('${UID}', 'Taux absurde', 10000, 1.5)`,
      'annual_rate',
    );
  });

  console.log('\n=== Calendrier de charge récurrente ===');

  await verifie('excluded_months distingue NULL (non confirmé) de {} (12 mois)', async () => {
    await db.exec(`
      insert into public.recurring_expenses (user_id, category_id, name, amount_cents, day_of_month, excluded_months)
      values ('${UID}', '33333333-0000-0000-0000-000000000005', 'Impôt sur le revenu', 39300, null, null)
    `);
    const r = await db.query(`select excluded_months, day_of_month from public.recurring_expenses`);
    if (r.rows[0].excluded_months !== null) throw new Error('calendrier supposé');
    if (r.rows[0].day_of_month !== null) throw new Error('jour supposé');
  });

  console.log('\n=== Sécurité ===');

  await verifie('RLS activée ET forcée sur toutes les tables métier', async () => {
    const r = await db.query(`
      select relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and (not c.relrowsecurity or not c.relforcerowsecurity)
    `);
    if (r.rows.length > 0) {
      throw new Error(`sans RLS forcée : ${r.rows.map((x) => x.relname).join(', ')}`);
    }
  });

  await verifie('chaque table métier a exactement une politique propriétaire', async () => {
    const r = await db.query(`
      select tablename, count(*) as n from pg_policies
      where schemaname = 'public' group by tablename having count(*) <> 1
    `);
    if (r.rows.length > 0) throw new Error(JSON.stringify(r.rows));
  });

  await verifie('les vues d’assistance n’exposent ni raw_label ni external_id', async () => {
    const r = await db.query(`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public'
        and table_name like 'v_ai_%'
        and column_name in ('raw_label', 'external_id', 'provider_connection_id', 'file_hash', 'dedup_hash')
    `);
    if (r.rows.length > 0) throw new Error(JSON.stringify(r.rows));
  });

  await verifie('les vues d’assistance respectent la RLS (security_invoker)', async () => {
    const r = await db.query(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and c.relname like 'v_ai_%'
        and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%'
    `);
    if (r.rows.length > 0) {
      throw new Error(`vues sans security_invoker : ${r.rows.map((x) => x.relname).join(', ')}`);
    }
  });

  await verifie('aucune colonne ne peut contenir un secret bancaire', async () => {
    const r = await db.query(`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public'
        and (column_name ~* '(password|secret|token|credential|api_key|iban|bic)')
    `);
    if (r.rows.length > 0) throw new Error(JSON.stringify(r.rows));
  });

  console.log('\n=== Revenus récurrents (migration 0009) ===');

  await verifie('un revenu sans jour de versement est accepté', async () => {
    await db.exec(`
      insert into public.recurring_incomes (user_id, name, amount_cents, day_of_month)
      values ('${UID}', 'Salaire', 271900, null)
    `);
    const r = await db.query(`select day_of_month from public.recurring_incomes`);
    if (r.rows[0].day_of_month !== null) throw new Error('jour fabriqué');
  });

  await verifie('l’objectif d’épargne par défaut vaut bien 200 €', async () => {
    const r = await db.query(`select savings_target_cents, pending_parameters from public.users where id = '${UID}'`);
    if (Number(r.rows[0].savings_target_cents) !== 20000) throw new Error('objectif inattendu');
  });

  console.log('\n=== Isolation réelle entre utilisateurs ===');

  const AUTRE = '99999999-9999-9999-9999-999999999999';
  await db.exec(`
    insert into auth.users (id, email) values ('${AUTRE}', 'autre@example.test');
    insert into public.users (id, display_name) values ('${AUTRE}', 'Autre');
    insert into public.accounts (user_id, name, type) values ('${AUTRE}', 'Compte de l''autre', 'courant');
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `);

  /** Exécute une requête sous l'identité d'un utilisateur donné. */
  async function sousIdentite(uid, sql) {
    await db.exec(`set local role authenticated;`);
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', true);`);
    const r = await db.query(sql);
    await db.exec('reset role;');
    return r;
  }

  await verifie('un utilisateur ne voit QUE ses propres comptes', async () => {
    await db.exec('begin;');
    const mien = await sousIdentite(UID, 'select name from public.accounts');
    await db.exec('rollback;');
    const noms = mien.rows.map((x) => x.name);
    if (noms.includes("Compte de l'autre")) {
      throw new Error('FUITE : les comptes d’un autre utilisateur sont visibles');
    }
    if (!noms.includes('Compte courant')) throw new Error('ses propres comptes sont masqués');
  });

  await verifie('un utilisateur ne voit QUE ses propres transactions', async () => {
    await db.exec('begin;');
    const r = await sousIdentite(AUTRE, 'select count(*)::int as n from public.transactions');
    await db.exec('rollback;');
    if (r.rows[0].n !== 0) throw new Error(`FUITE : ${r.rows[0].n} transactions visibles`);
  });

  await verifie('écrire pour le compte d’un autre utilisateur est rejeté', async () => {
    await db.exec('begin;');
    let fuite = false;
    try {
      await sousIdentite(
        AUTRE,
        `insert into public.accounts (user_id, name, type) values ('${UID}', 'Injection', 'courant')`,
      );
      fuite = true;
    } catch {
      // rejet attendu par la clause WITH CHECK
    }
    await db.exec('rollback;');
    if (fuite) throw new Error('FUITE : écriture acceptée pour un autre utilisateur');
  });

  await verifie('les vues d’assistance filtrent aussi par utilisateur', async () => {
    await db.exec('begin;');
    const r = await sousIdentite(AUTRE, 'select count(*)::int as n from public.v_ai_transactions');
    await db.exec('rollback;');
    if (r.rows[0].n !== 0) throw new Error(`FUITE via la vue : ${r.rows[0].n} lignes`);
  });

  console.log('\n=== Seed généré depuis la fixture du moteur ===');

  const SEED_UID = '77777777-7777-7777-7777-777777777777';
  let seedApplique = false;
  await verifie('seed.sql s’applique sans erreur', async () => {
    const brut = await readFile(new URL('../seed.sql', import.meta.url).pathname, 'utf8');
    // PGlite n'interprète pas les méta-commandes psql : on substitue :uid.
    const sql = brut
      .replace(/^\\set .*$/gm, '')
      .replaceAll(':uid', `'${SEED_UID}'`);
    await db.exec(`insert into auth.users (id, email) values ('${SEED_UID}', 'seed@example.test');`);
    await db.exec(sql);
    seedApplique = true;
  });

  await verifie('seed.sql est idempotent : le rejouer ne duplique rien', async () => {
    if (!seedApplique) throw new Error('seed non appliqué');
    const avant = await db.query(
      `select count(*)::int as n from public.categories where user_id = '${SEED_UID}'`,
    );
    const brut = await readFile(new URL('../seed.sql', import.meta.url).pathname, 'utf8');
    await db.exec(brut.replace(/^\\set .*$/gm, '').replaceAll(':uid', `'${SEED_UID}'`));
    const apres = await db.query(
      `select count(*)::int as n from public.categories where user_id = '${SEED_UID}'`,
    );
    if (avant.rows[0].n !== apres.rows[0].n) {
      throw new Error(`duplication : ${avant.rows[0].n} -> ${apres.rows[0].n}`);
    }
  });

  await verifie('les enveloppes rechargées totalisent exactement 1 130 €', async () => {
    const r = await db.query(`
      select sum(b.planned_cents)::bigint as total
      from public.budgets b
      join public.budget_periods p on p.id = b.period_id
      where b.user_id = '${SEED_UID}'
        and p.year = extract(year from current_date)::int
        and p.month = extract(month from current_date)::int
    `);
    if (Number(r.rows[0].total) !== 113000) {
      throw new Error(`total ${r.rows[0].total} au lieu de 113000`);
    }
  });

  await verifie('les revenus rechargés totalisent exactement 3 352,80 €', async () => {
    const r = await db.query(
      `select sum(amount_cents)::bigint as total from public.recurring_incomes where user_id = '${SEED_UID}'`,
    );
    if (Number(r.rows[0].total) !== 335280) throw new Error(`total ${r.rows[0].total}`);
  });

  await verifie('les charges de septembre 2026 totalisent 1 958,39 €', async () => {
    const r = await db.query(`
      select sum(amount_cents)::bigint as total from public.recurring_expenses
      where user_id = '${SEED_UID}'
        and (ends_on is null or ends_on >= '2026-09-01')
    `);
    if (Number(r.rows[0].total) !== 195839) throw new Error(`total ${r.rows[0].total}`);
  });

  await verifie('les charges d’octobre 2026 tombent à 1 768,89 € (fin du prêt cuisine)', async () => {
    const r = await db.query(`
      select sum(amount_cents)::bigint as total from public.recurring_expenses
      where user_id = '${SEED_UID}'
        and (ends_on is null or ends_on >= '2026-10-01')
    `);
    if (Number(r.rows[0].total) !== 176889) throw new Error(`total ${r.rows[0].total}`);
  });

  await verifie('le seed n’a fabriqué AUCUNE valeur inconnue', async () => {
    const controles = [
      [`select count(*)::int as n from public.accounts where user_id = '${SEED_UID}' and balance_cents is not null`, 0, 'soldes de comptes'],
      [`select count(*)::int as n from public.savings_goals where user_id = '${SEED_UID}' and current_amount_cents is not null`, 0, 'soldes d’épargne'],
      [`select count(*)::int as n from public.one_off_liabilities where user_id = '${SEED_UID}' and due_date is not null`, 0, 'date taxe foncière 2026'],
      [`select count(*)::int as n from public.recurring_incomes where user_id = '${SEED_UID}' and day_of_month is not null`, 0, 'jours de versement'],
      [`select count(*)::int as n from public.loans where user_id = '${SEED_UID}' and remaining_principal_cents is null`, 1, 'prêt immobilier sans capital'],
    ];
    for (const [sql, attendu, libelle] of controles) {
      const r = await db.query(sql);
      if (r.rows[0].n !== attendu) throw new Error(`${libelle} : ${r.rows[0].n} au lieu de ${attendu}`);
    }
  });

  await verifie('la cible du fonds d’urgence n’est pas figée par le seed', async () => {
    const r = await db.query(
      `select target_cents from public.savings_goals where user_id = '${SEED_UID}' and type = 'urgence'`,
    );
    if (r.rows[0].target_cents !== null) throw new Error('cible figée en base');
  });

  await verifie('les règles de catégorisation initiales sont chargées', async () => {
    const r = await db.query(
      `select count(*)::int as n from public.categorization_rules where user_id = '${SEED_UID}'`,
    );
    if (r.rows[0].n < 10) throw new Error(`${r.rows[0].n} règles seulement`);
  });

  await verifie('aucune règle initiale ne valide automatiquement', async () => {
    const r = await db.query(
      `select count(*)::int as n from public.categorization_rules where user_id = '${SEED_UID}' and auto_validate`,
    );
    if (r.rows[0].n !== 0) throw new Error('validation automatique activée par défaut');
  });

  await verifie('le motif « TOTAL » seul n’existe pas (piège des stations-service)', async () => {
    const r = await db.query(
      `select count(*)::int as n from public.categorization_rules where user_id = '${SEED_UID}' and upper(pattern) = 'TOTAL'`,
    );
    if (r.rows[0].n !== 0) throw new Error('motif ambigu présent');
  });

  console.log('\n=== Vues d’assistance : portée utilisateur ===');

  await verifie('chaque vue v_ai_* expose user_id pour un filtre explicite', async () => {
    const r = await db.query(`
      select table_name from information_schema.views v
      where table_schema = 'public' and table_name like 'v_ai_%'
        and not exists (
          select 1 from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = v.table_name
            and c.column_name = 'user_id'
        )
    `);
    if (r.rows.length > 0) {
      throw new Error(`sans user_id : ${r.rows.map((x) => x.table_name).join(', ')}`);
    }
  });

  await verifie('un filtre explicite sur user_id isole bien les données', async () => {
    const mien = await db.query(
      `select count(*)::int as n from public.v_ai_transactions where user_id = '${UID}'`,
    );
    const autre = await db.query(
      `select count(*)::int as n from public.v_ai_transactions where user_id = '${AUTRE}'`,
    );
    if (mien.rows[0].n === 0) throw new Error('aucune transaction visible pour le propriétaire');
    if (autre.rows[0].n !== 0) throw new Error('FUITE : données visibles pour un autre user_id');
  });

  await verifie('les vues n’exposent toujours aucun champ sensible', async () => {
    const r = await db.query(`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and table_name like 'v_ai_%'
        and column_name in ('raw_label', 'external_id', 'provider_connection_id', 'file_hash', 'dedup_hash')
    `);
    if (r.rows.length > 0) throw new Error(JSON.stringify(r.rows));
  });

  console.log('\n=== Couverture des tables attendues ===');
  await verifie('les 16 tables prévues existent', async () => {
    const attendues = [
      'users', 'accounts', 'transactions', 'categories', 'budget_periods', 'budgets',
      'savings_goals', 'savings_transactions', 'loans', 'recurring_expenses',
      'annual_provisions', 'one_off_liabilities', 'bank_connections', 'bank_sync_logs',
      'import_jobs', 'categorization_rules', 'recurring_incomes',
    ];
    const r = await db.query(`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `);
    const presentes = new Set(r.rows.map((x) => x.table_name));
    const manquantes = attendues.filter((t) => !presentes.has(t));
    if (manquantes.length > 0) throw new Error(`manquantes : ${manquantes.join(', ')}`);
  });
}

console.log(`\n===== ${pass} vérifications OK, ${fail} en échec =====`);
if (fail > 0) {
  console.log('\nÉchecs :');
  for (const e of echec) console.log(`  - ${e}`);
  process.exit(1);
}
