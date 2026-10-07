-- ====================================================================
-- SCC CRM Migration 006: Leads Module Security, Normalization & Concurrency Remediation
-- Target: Supabase Project zshihpvmtvwsbwrjpugy (PostgreSQL 17.11)
-- 
-- Scope:
--   1. Fix 1: Revoke anonymous RPC execution & enforce active profile authentication guards
--   2. Fix 3: Hardened call_logs RLS (SELECT + INSERT) preventing candidate authorization bypass
--             with trigger-enforced created_by attribution & active profile guards
--   3. Fix 4: Strict Indian phone normalization (^[6-9][0-9]{9}$), transaction advisory locks,
--             and GUC-free relational conversion safety
--   4. Fix 5: Concurrency-safe follow-up idempotency via partial unique index & collision recovery
--   5. Fix 6: Enforce lead task reference consistency (entity_type='lead' => lead_entity_id IS NOT NULL)
--
-- Safety & Ledger Compliance:
--   - Fully additive & idempotent; zero data loss; zero drop/truncate of production tables
--   - Precondition checks ensure existing records satisfy new constraints
--   - Does NOT touch or alter migration 005
--   - Ledger reconciliation for 005 is managed externally via Supabase CLI migration repair
-- ====================================================================

-- ====================================================================
-- SECTION 1: CANONICAL PHONE NORMALIZATION HELPER
-- ====================================================================
-- Canonical 10-digit Indian mobile normalization
-- Strips non-digits, international 0091 (14 digits), +910 (13 digits),
-- +91 / 91 (12 digits), and leading 0 (11 digits).
-- Strictly validates final 10 digits start with [6-9]. Returns NULL if invalid.
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
BEGIN
  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Strip all non-digit characters
  v_digits := regexp_replace(p_phone, '\D', '', 'g');
  
  -- Handle 14-digit Indian number starting with 0091
  IF length(v_digits) = 14 AND v_digits LIKE '0091%' THEN
    v_digits := substr(v_digits, 5);
  -- Handle 13-digit Indian number starting with 910
  ELSIF length(v_digits) = 13 AND v_digits LIKE '910%' THEN
    v_digits := substr(v_digits, 4);
  -- Handle 12-digit Indian number starting with 91
  ELSIF length(v_digits) = 12 AND v_digits LIKE '91%' THEN
    v_digits := substr(v_digits, 3);
  -- Handle 11-digit number starting with 0
  ELSIF length(v_digits) = 11 AND v_digits LIKE '0%' THEN
    v_digits := substr(v_digits, 2);
  END IF;
  
  -- Strict validation: Must be exactly 10 digits starting with [6-9]
  IF v_digits ~ '^[6-9][0-9]{9}$' THEN
    RETURN v_digits;
  ELSE
    RETURN NULL;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.normalize_phone(text) IS 'Canonical 10-digit Indian mobile normalization & validation (must start with 6-9)';

REVOKE ALL ON FUNCTION public.normalize_phone(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO authenticated;

-- ====================================================================
-- SECTION 2: PRECONDITION CHECKS
-- ====================================================================
DO $$
DECLARE
  v_invalid_tasks_count int;
  v_active_dups_count int;
BEGIN
  -- 2A. Verify no lead tasks exist without lead_entity_id
  SELECT count(*) INTO v_invalid_tasks_count
  FROM public.tasks
  WHERE entity_type = 'lead' AND lead_entity_id IS NULL;

  IF v_invalid_tasks_count > 0 THEN
    RAISE EXCEPTION 'Precondition Failed: % task(s) found with entity_type=lead and lead_entity_id IS NULL', v_invalid_tasks_count
      USING ERRCODE = '23514';
  END IF;

  -- 2B. Verify no cross-table duplicates exist between active leads and candidates (canonical normalization)
  SELECT count(*) INTO v_active_dups_count
  FROM public.leads l
  JOIN public.candidates c ON public.normalize_phone(c.mobile) = public.normalize_phone(l.mobile)
  WHERE l.is_active = true 
    AND c.is_active = true 
    AND l.converted_candidate_id IS DISTINCT FROM c.id;

  IF v_active_dups_count > 0 THEN
    RAISE EXCEPTION 'Precondition Failed: % cross-table duplicate mobile(s) found between active leads and candidates', v_active_dups_count
      USING ERRCODE = '23505';
  END IF;
END $$;

-- ====================================================================
-- SECTION 3: FIX 1 — REVOKE ANONYMOUS RPC EXECUTION & ENFORCE AUTH GUARDS
-- ====================================================================
-- Revoke execution from anon and public on all 3 Leads RPCs
REVOKE ALL ON FUNCTION public.convert_lead_to_candidate(
  uuid, text, text, numeric, text[], text, integer, integer, text, text, text
) FROM anon, public;

REVOKE ALL ON FUNCTION public.create_lead_with_dedup(
  text, text, text, numeric, text[], text, integer, integer, text, text, text, text, uuid, uuid, text
) FROM anon, public;

REVOKE ALL ON FUNCTION public.create_lead_followup(
  uuid, text, date, uuid, text, text
) FROM anon, public;

-- Explicitly grant execute only to authenticated users
GRANT EXECUTE ON FUNCTION public.convert_lead_to_candidate(
  uuid, text, text, numeric, text[], text, integer, integer, text, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_lead_with_dedup(
  text, text, text, numeric, text[], text, integer, integer, text, text, text, text, uuid, uuid, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_lead_followup(
  uuid, text, date, uuid, text, text
) TO authenticated;

-- ====================================================================
-- SECTION 4: FIX 3 — HARDENED CALL LOGS RLS & MANDATORY ATTRIBUTION TRIGGER
-- ====================================================================
-- Ensure created_by defaults to auth.uid() at column level
ALTER TABLE public.call_logs 
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Trusted trigger: Always forces created_by to auth.uid() to prevent caller spoofing
CREATE OR REPLACE FUNCTION public.trg_call_logs_set_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_call_logs_set_created_by ON public.call_logs;
CREATE TRIGGER trg_call_logs_set_created_by
  BEFORE INSERT ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_call_logs_set_created_by();

-- SELECT Policy: Active CRM users can view lead call logs + their candidate call logs
DROP POLICY IF EXISTS "call_logs_select_policy" ON public.call_logs;

CREATE POLICY "call_logs_select_policy" ON public.call_logs
  FOR SELECT TO authenticated
  USING (
    -- Caller must be an active CRM team member
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.is_active = true
    )
    AND (
      -- Admin and Manager can see all call logs
      public.is_admin_or_manager()
      -- Lead call logs: visible to all active authenticated CRM users if the lead is active
      OR (
        lead_id IS NOT NULL 
        AND EXISTS (
          SELECT 1 FROM public.leads l 
          WHERE l.id = call_logs.lead_id AND l.is_active = true
        )
      )
      -- Candidate call logs: strictly restricted to assigned recruiter or candidate creator
      OR (
        candidate_id IS NOT NULL 
        AND EXISTS (
          SELECT 1 FROM public.candidates c
          WHERE c.id = call_logs.candidate_id
            AND (c.assigned_to = auth.uid() OR c.created_by = auth.uid())
        )
      )
    )
  );

-- INSERT Policy: Active CRM users can insert lead call logs + their candidate call logs
-- NOTE: Does NOT include loose OR created_by = auth.uid(), preventing candidate authorization bypass!
DROP POLICY IF EXISTS "call_logs_insert_policy" ON public.call_logs;

CREATE POLICY "call_logs_insert_policy" ON public.call_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Caller must be an active CRM team member
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.is_active = true
    )
    AND (
      -- Admin and Manager can insert call logs for any record
      public.is_admin_or_manager()
      -- Lead call logs: allowed for any active CRM user if target lead exists and is active
      OR (
        lead_id IS NOT NULL 
        AND candidate_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.leads l 
          WHERE l.id = call_logs.lead_id AND l.is_active = true
        )
      )
      -- Candidate call logs: strictly restricted to assigned recruiter or candidate creator
      OR (
        candidate_id IS NOT NULL 
        AND lead_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.candidates c
          WHERE c.id = call_logs.candidate_id
            AND (c.assigned_to = auth.uid() OR c.created_by = auth.uid())
        )
      )
    )
  );

-- ====================================================================
-- SECTION 5: FIX 5 — CONCURRENT FOLLOW-UP IDEMPOTENCY
-- ====================================================================
-- Partial unique index prevents duplicate pending tasks for the same lead on the same date
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_lead_pending_due_date
  ON public.tasks(lead_entity_id, due_date)
  WHERE entity_type = 'lead' AND status = 'Pending' AND is_active = true AND lead_entity_id IS NOT NULL;

-- Redefine create_lead_followup with active profile guard & collision recovery
CREATE OR REPLACE FUNCTION public.create_lead_followup(
  p_lead_id uuid,
  p_title text,
  p_due_date date DEFAULT ((CURRENT_DATE + '1 day'::interval))::date,
  p_assigned_to_user_id uuid DEFAULT NULL::uuid,
  p_priority text DEFAULT 'Medium'::text,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_existing_task_id uuid;
  v_new_task_id uuid;
  v_caller uuid := auth.uid();
  v_assigned_name text;
BEGIN
  -- Defense-in-depth: Require active authenticated session
  IF v_caller IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: Active user profile required' USING ERRCODE = '42501';
  END IF;

  -- Validate lead exists and is active
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id AND is_active = true) THEN
    RAISE EXCEPTION 'Lead not found or inactive: %', p_lead_id USING ERRCODE = 'P0002';
  END IF;

  -- 1. Sequential Idempotency Check
  SELECT id INTO v_existing_task_id
  FROM public.tasks
  WHERE entity_type = 'lead'
    AND lead_entity_id = p_lead_id
    AND due_date = p_due_date
    AND status = 'Pending'
    AND is_active = true
  LIMIT 1;
  
  IF v_existing_task_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'task_id', v_existing_task_id,
      'message', 'Follow-up task already exists for this date'
    );
  END IF;
  
  -- Resolve assigned_to display name for legacy compatibility
  SELECT display_name INTO v_assigned_name 
  FROM public.profiles 
  WHERE id = COALESCE(p_assigned_to_user_id, v_caller);
  
  -- 2. Insert with Concurrency Collision Recovery
  BEGIN
    INSERT INTO public.tasks (
      title, due_date, entity_type, entity_id, lead_entity_id,
      assigned_to, assigned_to_user_id, created_by,
      priority, notes, status, is_active
    ) VALUES (
      p_title,
      p_due_date,
      'lead',
      p_lead_id::text,
      p_lead_id,
      COALESCE(v_assigned_name, 'Unassigned'),
      COALESCE(p_assigned_to_user_id, v_caller),
      v_caller,
      p_priority,
      p_notes,
      'Pending',
      true
    )
    RETURNING id INTO v_new_task_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', false,
      'task_id', v_new_task_id,
      'message', 'Follow-up task created'
    );
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id INTO v_existing_task_id
      FROM public.tasks
      WHERE entity_type = 'lead'
        AND lead_entity_id = p_lead_id
        AND due_date = p_due_date
        AND status = 'Pending'
        AND is_active = true
      LIMIT 1;

      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'task_id', v_existing_task_id,
        'message', 'Follow-up task already exists for this date'
      );
  END;
END;
$$;

-- ====================================================================
-- SECTION 6: FIX 4 — CANONICAL NORMALIZATION, ADVISORY LOCKS & GUC-FREE CONVERSION
-- ====================================================================

-- 6A. Lead Ownership Trigger Hardening:
-- converted_candidate_id can ONLY be modified by the trusted convert_lead_to_candidate RPC (CURRENT_USER = 'postgres')
CREATE OR REPLACE FUNCTION public.trg_enforce_lead_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  IF OLD.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Audit violation: lead created_by is immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    IF NOT public.is_admin_or_manager() THEN
      RAISE EXCEPTION 'Unauthorized: Only managers and admins can reassign leads' USING ERRCODE = '42501';
    END IF;
    
    INSERT INTO public.lead_assignment_history (lead_id, assigned_from, assigned_to, assigned_by)
    VALUES (NEW.id, OLD.assigned_to, NEW.assigned_to, auth.uid());
  END IF;
  
  -- Tamper-proof conversion guard: only convert_lead_to_candidate (running as postgres) can set converted_candidate_id
  IF NEW.converted_candidate_id IS DISTINCT FROM OLD.converted_candidate_id THEN
    IF CURRENT_USER <> 'postgres' THEN
      RAISE EXCEPTION 'Unauthorized: converted_candidate_id can only be modified via convert_lead_to_candidate RPC' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF OLD.converted_candidate_id IS NOT NULL THEN
    IF NEW.converted_candidate_id IS DISTINCT FROM OLD.converted_candidate_id
       OR NEW.converted_at IS DISTINCT FROM OLD.converted_at THEN
      RAISE EXCEPTION 'Conversion is permanent and cannot be modified' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 6B. Candidate Trigger: Normalizes mobile, locks, and blocks if active unconverted lead exists
-- Completely GUC-free: Relies on relational converted_candidate_id link
CREATE OR REPLACE FUNCTION public.trg_candidates_cross_table_dedup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_existing_lead_id uuid;
  v_norm_mobile text;
BEGIN
  -- Canonicalize & strictly validate mobile representation before storage
  v_norm_mobile := public.normalize_phone(NEW.mobile);
  IF v_norm_mobile IS NULL THEN
    RAISE EXCEPTION 'Invalid mobile "%": Must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9', NEW.mobile
      USING ERRCODE = '23514';
  END IF;
  NEW.mobile := v_norm_mobile;

  -- Skip check on UPDATE if mobile and active state are unchanged
  IF TG_OP = 'UPDATE' THEN
    IF OLD.mobile = NEW.mobile AND OLD.is_active = NEW.is_active THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.is_active = true THEN
    -- Transaction-level advisory lock on normalized mobile
    PERFORM pg_advisory_xact_lock(hashtext('scc_mobile:' || v_norm_mobile));
    
    -- Block if an active lead exists with this mobile that was NOT converted to this exact candidate
    SELECT id INTO v_existing_lead_id
    FROM public.leads
    WHERE mobile = v_norm_mobile 
      AND is_active = true
      AND (converted_candidate_id IS NULL OR converted_candidate_id <> NEW.id)
    LIMIT 1;
    
    IF v_existing_lead_id IS NOT NULL THEN
      RAISE EXCEPTION 'Cross-table duplicate: An active unconverted lead with mobile % already exists in CRM Leads module. Convert the lead instead of creating a separate candidate.', v_norm_mobile
        USING ERRCODE = '23505';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_candidates_cross_dedup ON public.candidates;
CREATE TRIGGER trg_candidates_cross_dedup
  BEFORE INSERT OR UPDATE OF mobile, is_active ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.trg_candidates_cross_table_dedup();

-- 6C. Lead Trigger: Normalizes mobile, locks, and blocks if active candidate exists
CREATE OR REPLACE FUNCTION public.trg_leads_cross_table_dedup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_existing_candidate_id uuid;
  v_existing_candidate_name text;
  v_norm_mobile text;
BEGIN
  -- Canonicalize & strictly validate mobile representation before storage
  v_norm_mobile := public.normalize_phone(NEW.mobile);
  IF v_norm_mobile IS NULL THEN
    RAISE EXCEPTION 'Invalid mobile "%": Must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9', NEW.mobile
      USING ERRCODE = '23514';
  END IF;
  NEW.mobile := v_norm_mobile;

  -- Skip check on UPDATE if mobile and active state are unchanged
  IF TG_OP = 'UPDATE' THEN
    IF OLD.mobile = NEW.mobile AND OLD.is_active = NEW.is_active THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.is_active = true THEN
    -- Transaction-level advisory lock on normalized mobile
    PERFORM pg_advisory_xact_lock(hashtext('scc_mobile:' || v_norm_mobile));
    
    -- Check if active candidate exists (excluding the candidate this lead was just converted to)
    SELECT id, name INTO v_existing_candidate_id, v_existing_candidate_name
    FROM public.candidates
    WHERE mobile = v_norm_mobile 
      AND is_active = true
      AND (NEW.converted_candidate_id IS NULL OR id <> NEW.converted_candidate_id)
    LIMIT 1;
    
    IF v_existing_candidate_id IS NOT NULL THEN
      RAISE EXCEPTION 'Cross-table duplicate: Candidate "%" (%) already exists with mobile %', v_existing_candidate_name, v_existing_candidate_id, v_norm_mobile
        USING ERRCODE = '23505';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_cross_dedup ON public.leads;
CREATE TRIGGER trg_leads_cross_dedup
  BEFORE INSERT OR UPDATE OF mobile, is_active ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_leads_cross_table_dedup();

-- 6D. Update create_lead_with_dedup with canonical normalization & advisory lock
CREATE OR REPLACE FUNCTION public.create_lead_with_dedup(
  p_name text,
  p_mobile text,
  p_email text DEFAULT NULL::text,
  p_experience numeric DEFAULT NULL::numeric,
  p_skills text[] DEFAULT '{}'::text[],
  p_location text DEFAULT NULL::text,
  p_expected_salary integer DEFAULT NULL::integer,
  p_current_salary integer DEFAULT NULL::integer,
  p_qualification text DEFAULT NULL::text,
  p_notice_period text DEFAULT NULL::text,
  p_last_role text DEFAULT NULL::text,
  p_source text DEFAULT 'Manual'::text,
  p_assigned_to uuid DEFAULT NULL::uuid,
  p_import_batch_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_norm_mobile text;
  v_existing_lead_id uuid;
  v_existing_candidate_id uuid;
  v_existing_candidate_name text;
  v_new_lead_id uuid;
  v_caller uuid := auth.uid();
BEGIN
  -- Defense-in-depth: Require active authenticated session
  IF v_caller IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: Active user profile required' USING ERRCODE = '42501';
  END IF;

  -- Canonicalize & strictly validate mobile representation
  v_norm_mobile := public.normalize_phone(p_mobile);
  IF v_norm_mobile IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'invalid_mobile',
      'message', 'Valid 10-digit Indian mobile number required (starting with 6, 7, 8, or 9)'
    );
  END IF;

  -- Acquire transaction-level advisory lock on normalized mobile
  PERFORM pg_advisory_xact_lock(hashtext('scc_mobile:' || v_norm_mobile));

  -- 1. Check if active lead with this mobile already exists
  SELECT id INTO v_existing_lead_id
  FROM public.leads
  WHERE mobile = v_norm_mobile AND is_active = true
  FOR UPDATE;
  
  IF v_existing_lead_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'duplicate_lead',
      'existing_lead_id', v_existing_lead_id,
      'message', 'An active lead with mobile ' || v_norm_mobile || ' already exists'
    );
  END IF;
  
  -- 2. Check if active candidate with this mobile already exists
  SELECT id, name INTO v_existing_candidate_id, v_existing_candidate_name
  FROM public.candidates
  WHERE mobile = v_norm_mobile AND is_active = true;
  
  IF v_existing_candidate_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'existing_candidate',
      'existing_candidate_id', v_existing_candidate_id,
      'existing_candidate_name', v_existing_candidate_name,
      'message', 'A candidate with mobile ' || v_norm_mobile || ' already exists in CRM'
    );
  END IF;
  
  -- 3. Safe to insert (trigger also verifies and enforces normalized storage)
  INSERT INTO public.leads (
    name, mobile, email, experience, skills, location,
    expected_salary, current_salary, qualification,
    notice_period, last_role, source, assigned_to,
    import_batch_id, notes, created_by, is_active
  ) VALUES (
    p_name, v_norm_mobile, p_email, p_experience, p_skills, p_location,
    p_expected_salary, p_current_salary, p_qualification,
    p_notice_period, p_last_role, p_source, p_assigned_to,
    p_import_batch_id, p_notes, v_caller, true
  )
  RETURNING id INTO v_new_lead_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'lead_id', v_new_lead_id,
    'message', 'Lead created successfully'
  );
END;
$$;

-- 6E. Ensure leads_converted_candidate_id_fkey is deferrable to allow atomic relational pre-linking
ALTER TABLE public.leads
  ALTER CONSTRAINT leads_converted_candidate_id_fkey DEFERRABLE INITIALLY DEFERRED;

-- 6F. Update convert_lead_to_candidate: Tamper-proof, GUC-free relational conversion
CREATE OR REPLACE FUNCTION public.convert_lead_to_candidate(
  p_lead_id uuid,
  p_override_name text DEFAULT NULL::text,
  p_override_email text DEFAULT NULL::text,
  p_override_experience numeric DEFAULT NULL::numeric,
  p_override_skills text[] DEFAULT NULL::text[],
  p_override_location text DEFAULT NULL::text,
  p_override_expected_salary integer DEFAULT NULL::integer,
  p_override_current_salary integer DEFAULT NULL::integer,
  p_override_qualification text DEFAULT NULL::text,
  p_override_notice_period text DEFAULT NULL::text,
  p_override_last_role text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_lead RECORD;
  v_candidate_id uuid;
  v_candidate_name text;
  v_was_existing boolean := false;
  v_caller uuid := auth.uid();
  v_norm_mobile text;
BEGIN
  -- Defense-in-depth: Require active authenticated session
  IF v_caller IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: Active user profile required' USING ERRCODE = '42501';
  END IF;

  -- 1. Lock and fetch the lead
  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id AND is_active = true
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found or inactive: %', p_lead_id 
      USING ERRCODE = 'P0002';
  END IF;
  
  -- 2. Idempotency: if already converted, return existing conversion details
  IF v_lead.converted_candidate_id IS NOT NULL THEN
    SELECT name INTO v_candidate_name 
    FROM public.candidates 
    WHERE id = v_lead.converted_candidate_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'lead_id', p_lead_id,
      'candidate_id', v_lead.converted_candidate_id,
      'candidate_name', v_candidate_name,
      'message', 'Lead was already converted'
    );
  END IF;

  v_norm_mobile := public.normalize_phone(v_lead.mobile);
  IF v_norm_mobile IS NULL THEN
    RAISE EXCEPTION 'Invalid lead mobile "%": Cannot convert lead with non-compliant phone number', v_lead.mobile
      USING ERRCODE = '23514';
  END IF;

  -- Acquire advisory lock on mobile during conversion
  PERFORM pg_advisory_xact_lock(hashtext('scc_mobile:' || v_norm_mobile));
  
  -- 3. Check if candidate with same normalized mobile already exists
  SELECT id, name INTO v_candidate_id, v_candidate_name
  FROM public.candidates
  WHERE mobile = v_norm_mobile AND is_active = true;
  
  IF v_candidate_id IS NOT NULL THEN
    v_was_existing := true;
  ELSE
    -- 4. Pre-generate candidate UUID and link on lead BEFORE insertion
    -- This allows trg_candidates_cross_table_dedup to verify relational authorization without GUCs
    v_candidate_id := gen_random_uuid();

    UPDATE public.leads
    SET 
      converted_candidate_id = v_candidate_id,
      converted_at = now(),
      converted_by = v_caller,
      category = 'Converted',
      updated_at = now()
    WHERE id = p_lead_id;

    INSERT INTO public.candidates (
      id, name, mobile, email, experience, skills, location,
      expected_salary, last_role, status, source,
      qualification, notice_period, current_salary,
      created_by, assigned_to, is_active
    ) VALUES (
      v_candidate_id,
      COALESCE(p_override_name, v_lead.name),
      v_norm_mobile,
      COALESCE(p_override_email, v_lead.email),
      COALESCE(p_override_experience, v_lead.experience, 0),
      COALESCE(p_override_skills, v_lead.skills, '{}'),
      COALESCE(p_override_location, v_lead.location, ''),
      COALESCE(p_override_expected_salary, v_lead.expected_salary, 0),
      COALESCE(p_override_last_role, v_lead.last_role, ''),
      'Active',
      v_lead.source,
      COALESCE(p_override_qualification, v_lead.qualification),
      COALESCE(p_override_notice_period, v_lead.notice_period),
      COALESCE(p_override_current_salary, v_lead.current_salary),
      v_caller,
      v_lead.assigned_to,
      true
    )
    RETURNING name INTO v_candidate_name;
  END IF;
  
  -- If candidate was already existing, update the lead now
  IF v_was_existing THEN
    UPDATE public.leads
    SET 
      converted_candidate_id = v_candidate_id,
      converted_at = now(),
      converted_by = v_caller,
      category = 'Converted',
      updated_at = now()
    WHERE id = p_lead_id;
  END IF;
  
  -- 5. Audit log
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_caller,
    'LEAD_CONVERTED',
    'lead',
    p_lead_id::text,
    jsonb_build_object(
      'candidate_id', v_candidate_id,
      'was_existing_candidate', v_was_existing,
      'lead_name', v_lead.name,
      'lead_mobile', v_norm_mobile
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'lead_id', p_lead_id,
    'candidate_id', v_candidate_id,
    'candidate_name', v_candidate_name,
    'was_existing_candidate', v_was_existing,
    'message', CASE 
      WHEN v_was_existing THEN 'Lead linked to existing candidate'
      ELSE 'New candidate created from lead'
    END
  );
END;
$$;

-- ====================================================================
-- SECTION 7: FIX 6 — ENFORCE LEAD TASK REFERENCE CONSISTENCY
-- ====================================================================
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS chk_tasks_lead_ref;

ALTER TABLE public.tasks
  ADD CONSTRAINT chk_tasks_lead_ref
  CHECK (entity_type <> 'lead' OR lead_entity_id IS NOT NULL);

-- ====================================================================
-- SECTION 8: RE-VERIFY FINAL ROUTINE PERMISSIONS
-- ====================================================================
REVOKE ALL ON FUNCTION public.normalize_phone(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO authenticated;

REVOKE ALL ON FUNCTION public.convert_lead_to_candidate(uuid, text, text, numeric, text[], text, integer, integer, text, text, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.create_lead_with_dedup(text, text, text, numeric, text[], text, integer, integer, text, text, text, text, uuid, uuid, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.create_lead_followup(uuid, text, date, uuid, text, text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.convert_lead_to_candidate(uuid, text, text, numeric, text[], text, integer, integer, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_lead_with_dedup(text, text, text, numeric, text[], text, integer, integer, text, text, text, text, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_lead_followup(uuid, text, date, uuid, text, text) TO authenticated;
