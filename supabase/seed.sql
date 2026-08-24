-- =====================================================================
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

\set uid :user_id

begin;

insert into public.users (id, display_name, safety_buffer_cents, savings_target_cents, savings_manual_caps, pending_parameters)
values (:uid, 'Moi', 15000, 20000,
        '[]'::jsonb,
        array['Soldes réels des comptes courants', 'Solde réel du fonds d’urgence', 'Solde réel de l’épargne vacances', 'Date de versement du salaire', 'Date de versement de la CAF', 'Date de versement des allocations enfants', 'Impôt sur le revenu : calendrier exact (10 ou 12 mois)', 'Taxe foncière 2026 : montant exact', 'Taxe foncière 2026 : date exacte / mise en recouvrement', 'Assurance auto : date d’échéance', 'Prêt immobilier : capital restant dû', 'Prêt immobilier : taux', 'Prêt immobilier : date de fin', 'Prêt cuisine : capital restant exact', 'Objectif du budget vacances']::text[])
on conflict (id) do update set
  safety_buffer_cents = excluded.safety_buffer_cents,
  savings_target_cents = excluded.savings_target_cents,
  pending_parameters = excluded.pending_parameters;


-- Comptes (soldes inconnus = NULL)
insert into public.accounts (id, user_id, name, type, balance_cents, balance_as_of) values ('4b084b6f-43da-408d-8182-8ee2af54e118', :uid, 'Compte courant', 'courant', null, null) on conflict (id) do update set name = excluded.name;
insert into public.accounts (id, user_id, name, type, balance_cents, balance_as_of) values ('2dce54f3-7acd-4570-8213-a89c03e8896a', :uid, 'Compte provisions', 'provisions', null, null) on conflict (id) do update set name = excluded.name;
insert into public.accounts (id, user_id, name, type, balance_cents, balance_as_of) values ('8b97ec02-377c-4bce-86c8-c3140954a2c7', :uid, 'Épargne urgence', 'epargne', null, null) on conflict (id) do update set name = excluded.name;
insert into public.accounts (id, user_id, name, type, balance_cents, balance_as_of) values ('bf478e6d-094d-4b60-852b-c8955dfa3dd6', :uid, 'Épargne vacances', 'epargne', null, null) on conflict (id) do update set name = excluded.name;

-- Catégories
insert into public.categories (id, user_id, name, nature, criticality) values ('e76a3f06-7d56-49a3-826a-64c0661cb63e', :uid, 'Prêt immobilier', 'fixe', null) on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('35b70849-c73b-4f28-89cc-fcf26526a125', :uid, 'Prêt personnel', 'fixe', null) on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('dfdec612-ecbd-4336-8b74-cc9c7f669f9c', :uid, 'Prêt cuisine', 'fixe', null) on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('9e569fd5-bdd7-4238-8e62-5c2e85f8db03', :uid, 'Impôt sur le revenu', 'fixe', null) on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('accfdd0a-d289-47e4-8897-7f58f880066f', :uid, 'Taxe foncière', 'provision', null) on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('8e377629-9452-41a6-8cfa-2289facaaaa6', :uid, 'Assurance habitation', 'provision', null) on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('c91e2719-936a-45a7-8c89-5c88a2305b5a', :uid, 'Assurance auto', 'provision', null) on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('9378554a-5a1e-4c96-801e-ed96e918ba68', :uid, 'Courses', 'variable', 'essentielle') on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('bde44515-6e85-4d36-8357-2c69aebc39ac', :uid, 'Électricité', 'variable', 'essentielle') on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('52fc5765-4ebb-41c4-8154-a1b848e8f8f5', :uid, 'Internet / TV', 'variable', 'essentielle') on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('21be9124-2ca4-40d1-8775-4e637e92653b', :uid, 'Téléphone', 'variable', 'essentielle') on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('166c2382-489d-45ef-8136-5f094a024344', :uid, 'Essence / voiture', 'variable', 'essentielle') on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('477a88e9-7d04-43a7-826f-c47ee922d66f', :uid, 'Enfants / école', 'variable', 'essentielle') on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('bebd4674-11fe-4af4-84a0-d0bbb9ea3c37', :uid, 'Restaurants', 'variable', 'non_essentielle') on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('f272fb6f-33d9-4c1a-8682-264c55d2d758', :uid, 'Sorties / loisirs', 'variable', 'non_essentielle') on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('b80ae10d-dc43-4644-887b-944ec2f22820', :uid, 'Santé', 'variable', 'essentielle') on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('e7d8f79b-0226-4e5f-859d-e9ff6640b78a', :uid, 'Vêtements', 'variable', 'semi_essentielle') on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('e7391cf9-2831-4cf0-873c-0f6a3460b5ab', :uid, 'Divers / achats plaisir', 'variable', 'non_essentielle') on conflict (id) do update set criticality = excluded.criticality;
insert into public.categories (id, user_id, name, nature, criticality) values ('0aede16a-5c11-456f-807e-66ff3e1620c9', :uid, 'Épargne', 'epargne', null) on conflict (id) do update set criticality = excluded.criticality;

-- Revenus récurrents (jours de versement inconnus = NULL)
insert into public.recurring_incomes (id, user_id, name, amount_cents, day_of_month) values ('f51aa9fa-8542-4705-8deb-7a5d6a3adf4f', :uid, 'Salaire', 271900, null) on conflict (id) do update set amount_cents = excluded.amount_cents;
insert into public.recurring_incomes (id, user_id, name, amount_cents, day_of_month) values ('948d2c53-f32d-467a-8a8d-87baabfcbda7', :uid, 'CAF', 17366, null) on conflict (id) do update set amount_cents = excluded.amount_cents;
insert into public.recurring_incomes (id, user_id, name, amount_cents, day_of_month) values ('5f75ea5e-9c33-4c34-8c7c-fba93f661e61', :uid, 'Allocation enfants', 46014, null) on conflict (id) do update set amount_cents = excluded.amount_cents;

-- Charges récurrentes (excluded_months NULL = calendrier non confirmé)
insert into public.recurring_expenses (id, user_id, category_id, name, amount_cents, day_of_month, excluded_months, ends_on) values ('841b41ba-7b30-4ff2-820c-ff4bd1408c51', :uid, 'e76a3f06-7d56-49a3-826a-64c0661cb63e', 'Prêt immobilier', 120000, null, null, null) on conflict (id) do update set amount_cents = excluded.amount_cents, ends_on = excluded.ends_on;
insert into public.recurring_expenses (id, user_id, category_id, name, amount_cents, day_of_month, excluded_months, ends_on) values ('f66ecd3d-16aa-4e0c-84d5-0d194f8ae34c', :uid, '35b70849-c73b-4f28-89cc-fcf26526a125', 'Prêt personnel', 17589, 4, null, '2028-12-01'::date + interval '1 month' - interval '1 day') on conflict (id) do update set amount_cents = excluded.amount_cents, ends_on = excluded.ends_on;
insert into public.recurring_expenses (id, user_id, category_id, name, amount_cents, day_of_month, excluded_months, ends_on) values ('51be1f4e-ca50-49be-891a-1c0e4812f53a', :uid, 'dfdec612-ecbd-4336-8b74-cc9c7f669f9c', 'Prêt cuisine', 18950, null, null, '2026-09-01'::date + interval '1 month' - interval '1 day') on conflict (id) do update set amount_cents = excluded.amount_cents, ends_on = excluded.ends_on;
insert into public.recurring_expenses (id, user_id, category_id, name, amount_cents, day_of_month, excluded_months, ends_on) values ('656b7f99-bf63-4da0-8e49-24ceada63042', :uid, '9e569fd5-bdd7-4238-8e62-5c2e85f8db03', 'Impôt sur le revenu', 39300, null, null, null) on conflict (id) do update set amount_cents = excluded.amount_cents, ends_on = excluded.ends_on;

-- Provisions annuelles FUTURES
insert into public.annual_provisions (id, user_id, name, annual_amount_cents, amount_is_estimate, monthly_amount_cents, next_due_date, provisioned_cents, provisioned_as_of, day_of_transfer) values ('f2816f87-65eb-4976-83e1-586cfd8cd784', :uid, 'Taxe foncière (2027 et suivantes)', 160000, true, 13333, null, null, null, null) on conflict (id) do update set monthly_amount_cents = excluded.monthly_amount_cents;
insert into public.annual_provisions (id, user_id, name, annual_amount_cents, amount_is_estimate, monthly_amount_cents, next_due_date, provisioned_cents, provisioned_as_of, day_of_transfer) values ('e83303b6-a350-44b6-8f8a-8b835f16b899', :uid, 'Assurance habitation', 76530, false, 6378, '2027-01-01', null, null, null) on conflict (id) do update set monthly_amount_cents = excluded.monthly_amount_cents;
insert into public.annual_provisions (id, user_id, name, annual_amount_cents, amount_is_estimate, monthly_amount_cents, next_due_date, provisioned_cents, provisioned_as_of, day_of_transfer) values ('3e245276-e15a-4df7-8baa-1f7e996cba6c', :uid, 'Assurance auto', 67813, false, 5651, null, null, null, null) on conflict (id) do update set monthly_amount_cents = excluded.monthly_amount_cents;

-- Échéances exceptionnelles — DISTINCTES des provisions
insert into public.one_off_liabilities (id, user_id, name, amount_cents, amount_is_estimate, due_date, already_set_aside_cents, already_set_aside_as_of, note) values ('d9f80ec0-c94a-410b-892b-a342b7588de8', :uid, 'Taxe foncière 2026', 160000, true, null, null, null, 'Payée en une fois. La mensualisation demandée après le 30 juin 2026 ne prendrait effet qu’en 2027 : elle ne peut pas résoudre l’échéance 2026.') on conflict (id) do update set note = excluded.note;

-- Objectifs d’épargne (cible urgence NON figée, soldes inconnus)
insert into public.savings_goals (id, user_id, name, type, target_cents, current_amount_cents, current_amount_as_of, monthly_target_cents, priority) values ('e92a2bb6-1044-4f96-84bb-f96eb99cbb7e', :uid, 'Fonds d’urgence', 'urgence', null, null, null, 15000, 1) on conflict (id) do update set monthly_target_cents = excluded.monthly_target_cents;
insert into public.savings_goals (id, user_id, name, type, target_cents, current_amount_cents, current_amount_as_of, monthly_target_cents, priority) values ('93fdc659-30e5-4a31-86b1-c4e3603abbf9', :uid, 'Vacances', 'vacances', null, null, null, 5000, 2) on conflict (id) do update set monthly_target_cents = excluded.monthly_target_cents;

-- Mode de calcul de la cible du fonds d’urgence
insert into public.emergency_fund_settings (user_id, mode, months_count, manual_target_cents, include_semi_essential, reference_year, reference_month) values
  (:uid, 'depenses_essentielles', 3, null, false, 2026, 10)
on conflict (user_id) do update set mode = excluded.mode, months_count = excluded.months_count;

-- Crédits dont le capital restant est CONNU. Les autres sont
-- volontairement absents : aucun amortissement ne doit être extrapolé.
insert into public.loans (id, user_id, name, monthly_payment_cents, remaining_principal_cents, remaining_principal_as_of, annual_rate, end_date) values ('c671d213-7595-4b3e-82e6-3c06f65c5355', :uid, 'Prêt personnel', 17589, 451925, '2026-08-23', 0.0593, '2028-12-04') on conflict (id) do update set remaining_principal_cents = excluded.remaining_principal_cents;
insert into public.loans (id, user_id, name, monthly_payment_cents, remaining_principal_cents, remaining_principal_as_of, annual_rate, end_date) values ('861ef834-52ff-4d4e-8090-d91e0c76925c', :uid, 'Prêt immobilier', 120000, null, null, null, null) on conflict (id) do nothing;

-- Règles de catégorisation initiales. Modifiables et supprimables
-- depuis l’écran Configuration : ce sont des valeurs de départ.
insert into public.categorization_rules (id, user_id, category_id, pattern, match_type, priority, auto_validate, is_active) values ('532ccbc0-2544-4766-87eb-7870f2f6f986', :uid, '9378554a-5a1e-4c96-801e-ed96e918ba68', 'LIDL', 'contains', 100, false, true) on conflict (id) do update set pattern = excluded.pattern;
insert into public.categorization_rules (id, user_id, category_id, pattern, match_type, priority, auto_validate, is_active) values ('fe79a9e6-572e-4a95-80cd-55a8a790fb6c', :uid, '9378554a-5a1e-4c96-801e-ed96e918ba68', 'CARREFOUR', 'contains', 100, false, true) on conflict (id) do update set pattern = excluded.pattern;
insert into public.categorization_rules (id, user_id, category_id, pattern, match_type, priority, auto_validate, is_active) values ('5904edd9-8f50-4d65-8d4a-e855bcfc0b0e', :uid, '9378554a-5a1e-4c96-801e-ed96e918ba68', 'INTERMARCHE', 'contains', 100, false, true) on conflict (id) do update set pattern = excluded.pattern;
insert into public.categorization_rules (id, user_id, category_id, pattern, match_type, priority, auto_validate, is_active) values ('5b3409dd-4103-41a3-81af-9c37a5b0119c', :uid, '52fc5765-4ebb-41c4-8154-a1b848e8f8f5', 'FREE', 'contains', 100, false, true) on conflict (id) do update set pattern = excluded.pattern;
insert into public.categorization_rules (id, user_id, category_id, pattern, match_type, priority, auto_validate, is_active) values ('a07b9793-2df6-48d8-8760-ce72115ae172', :uid, 'bde44515-6e85-4d36-8357-2c69aebc39ac', 'TOTALENERGIES', 'contains', 100, false, true) on conflict (id) do update set pattern = excluded.pattern;
insert into public.categorization_rules (id, user_id, category_id, pattern, match_type, priority, auto_validate, is_active) values ('97999868-34e5-4a37-86f1-cc7ec738c6cc', :uid, 'bde44515-6e85-4d36-8357-2c69aebc39ac', 'EDF', 'contains', 100, false, true) on conflict (id) do update set pattern = excluded.pattern;
insert into public.categorization_rules (id, user_id, category_id, pattern, match_type, priority, auto_validate, is_active) values ('cbd3db8b-c95a-4028-892a-952e4888637b', :uid, '21be9124-2ca4-40d1-8775-4e637e92653b', 'BOUYGUES TELECOM', 'contains', 100, false, true) on conflict (id) do update set pattern = excluded.pattern;
insert into public.categorization_rules (id, user_id, category_id, pattern, match_type, priority, auto_validate, is_active) values ('a1a3a5e2-5380-4f22-8087-f5247bbce4ea', :uid, '8e377629-9452-41a6-8cfa-2289facaaaa6', 'CARDIF', 'contains', 100, false, true) on conflict (id) do update set pattern = excluded.pattern;
insert into public.categorization_rules (id, user_id, category_id, pattern, match_type, priority, auto_validate, is_active) values ('9828b72b-bcec-424c-8e71-5514ea12c87a', :uid, '166c2382-489d-45ef-8136-5f094a024344', 'TOTAL ACCESS', 'contains', 100, false, true) on conflict (id) do update set pattern = excluded.pattern;
insert into public.categorization_rules (id, user_id, category_id, pattern, match_type, priority, auto_validate, is_active) values ('ac749529-2ef5-4828-8750-db69a964055d', :uid, 'b80ae10d-dc43-4644-887b-944ec2f22820', 'PHARMACIE', 'contains', 100, false, true) on conflict (id) do update set pattern = excluded.pattern;

-- Enveloppes variables des 12 prochains mois (total 1 130 €)
do $$
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

    insert into public.budgets (user_id, period_id, category_id, planned_cents) values (:uid, v_period, '9378554a-5a1e-4c96-801e-ed96e918ba68', 50000) on conflict (period_id, category_id) do update set planned_cents = excluded.planned_cents;
    insert into public.budgets (user_id, period_id, category_id, planned_cents) values (:uid, v_period, 'bde44515-6e85-4d36-8357-2c69aebc39ac', 10000) on conflict (period_id, category_id) do update set planned_cents = excluded.planned_cents;
    insert into public.budgets (user_id, period_id, category_id, planned_cents) values (:uid, v_period, '52fc5765-4ebb-41c4-8154-a1b848e8f8f5', 6000) on conflict (period_id, category_id) do update set planned_cents = excluded.planned_cents;
    insert into public.budgets (user_id, period_id, category_id, planned_cents) values (:uid, v_period, '21be9124-2ca4-40d1-8775-4e637e92653b', 1500) on conflict (period_id, category_id) do update set planned_cents = excluded.planned_cents;
    insert into public.budgets (user_id, period_id, category_id, planned_cents) values (:uid, v_period, '166c2382-489d-45ef-8136-5f094a024344', 12000) on conflict (period_id, category_id) do update set planned_cents = excluded.planned_cents;
    insert into public.budgets (user_id, period_id, category_id, planned_cents) values (:uid, v_period, '477a88e9-7d04-43a7-826f-c47ee922d66f', 12000) on conflict (period_id, category_id) do update set planned_cents = excluded.planned_cents;
    insert into public.budgets (user_id, period_id, category_id, planned_cents) values (:uid, v_period, 'bebd4674-11fe-4af4-84a0-d0bbb9ea3c37', 9000) on conflict (period_id, category_id) do update set planned_cents = excluded.planned_cents;
    insert into public.budgets (user_id, period_id, category_id, planned_cents) values (:uid, v_period, 'f272fb6f-33d9-4c1a-8682-264c55d2d758', 7000) on conflict (period_id, category_id) do update set planned_cents = excluded.planned_cents;
    insert into public.budgets (user_id, period_id, category_id, planned_cents) values (:uid, v_period, 'b80ae10d-dc43-4644-887b-944ec2f22820', 2500) on conflict (period_id, category_id) do update set planned_cents = excluded.planned_cents;
    insert into public.budgets (user_id, period_id, category_id, planned_cents) values (:uid, v_period, 'e7d8f79b-0226-4e5f-859d-e9ff6640b78a', 2000) on conflict (period_id, category_id) do update set planned_cents = excluded.planned_cents;
    insert into public.budgets (user_id, period_id, category_id, planned_cents) values (:uid, v_period, 'e7391cf9-2831-4cf0-873c-0f6a3460b5ab', 1000) on conflict (period_id, category_id) do update set planned_cents = excluded.planned_cents;

    v_date := v_date + interval '1 month';
  end loop;
end;
$$;

commit;

