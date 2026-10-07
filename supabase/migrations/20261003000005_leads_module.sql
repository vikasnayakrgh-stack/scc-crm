-- ====================================================================
-- SCC CRM Migration 005: Leads Management Module
-- Target: Supabase Project zshihpvmtvwsbwrjpugy (PostgreSQL 17.11)
-- 
-- Scope:
--   1. leads table (separate from candidates)
--   2. lead_import_batches table (batch tracking)
--   3. lead_assignment_history table (audit trail)
--   4. lead_categories type
--   5. Extended call_logs to support lead calls
--   6. Extended tasks to support lead entity_type
--   7. RPC functions for atomic operations
--   8. RLS policies
--
-- Safety: 
--   - Additive only; no existing table/column/constraint is dropped or renamed
--   - Existing call_logs and tasks backward-compatible
--   - All new functions use SECURITY DEFINER with explicit search_path
-- ====================================================================

-- ====================================================================
-- 1. LEAD CATEGORIES
-- ====================================================================
-- Using TEXT with CHECK constraint (same pattern as existing tables)
-- rather than CREATE TYPE, for easier future extension without migration.

-- ====================================================================
-- 2. LEAD IMPORT BATCHES (tracks each upload)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.lead_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Who uploaded
  imported_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  
  -- File metadata (for audit, not for re-import)
  file_name text NOT NULL,
  file_hash text,  -- SHA-256 of file content for duplicate upload detection
  detected_platform text NOT NULL DEFAULT 'Generic'
    CHECK (detected_platform IN ('Naukri.com', 'WorkIndia', 'Generic')),
  
  -- Batch statistics (snapshot at import time)
  total_rows integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  skipped_duplicate_count integer NOT NULL DEFAULT 0,
  skipped_invalid_count integer NOT NULL DEFAULT 0,
  
  -- Optional: default assignee for batch
  default_assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  notes text
);

CREATE INDEX IF NOT EXISTS idx_lead_import_batches_imported_by 
  ON public.lead_import_batches(imported_by);
CREATE INDEX IF NOT EXISTS idx_lead_import_batches_created_at 
  ON public.lead_import_batches(created_at DESC);

-- ====================================================================
-- 3. LEADS TABLE
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Core identity
  name text NOT NULL,
  mobile text NOT NULL,  -- Normalized 10-digit Indian mobile
  email text,
  
  -- Professional profile (nullable = unknown, not invented)
  experience numeric(4,1),        -- NULL = unknown (NOT DEFAULT 0)
  skills text[] NOT NULL DEFAULT '{}',
  location text,                  -- NULL = unknown (NOT DEFAULT 'Raipur')
  expected_salary integer,        -- NULL = unknown (NOT DEFAULT 0)
  current_salary integer,         -- NULL = unknown
  qualification text,
  notice_period text,
  last_role text,
  
  -- Lead management
  source text NOT NULL DEFAULT 'Manual'
    CHECK (source IN (
      'WorkIndia', 'Naukri.com', 'Indeed', 'LinkedIn',
      'WhatsApp', 'Walk-in', 'Referral', 'Website', 'Manual', 'Other'
    )),
  category text NOT NULL DEFAULT 'New'
    CHECK (category IN ('New', 'Hot', 'Warm', 'Cold', 'Converted', 'Rejected', 'Do Not Contact')),
  
  -- Assignment: single FK to profiles, no redundant text field
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Import provenance
  import_batch_id uuid REFERENCES public.lead_import_batches(id) ON DELETE SET NULL,
  
  -- Conversion tracking (NULL = not yet converted)
  converted_candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  converted_at timestamptz,
  converted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Audit
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  
  -- Constraints
  CHECK (current_salary IS NULL OR current_salary >= 0),
  CHECK (expected_salary IS NULL OR expected_salary >= 0)
);

-- Active mobile uniqueness (same pattern as candidates)
-- Prevents duplicate active leads with the same phone number
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_mobile_active 
  ON public.leads(mobile) WHERE is_active = true;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_leads_category 
  ON public.leads(category) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_leads_source 
  ON public.leads(source) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to 
  ON public.leads(assigned_to) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_leads_created_by 
  ON public.leads(created_by) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_leads_created_at 
  ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_import_batch 
  ON public.leads(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_converted_candidate 
  ON public.leads(converted_candidate_id) WHERE converted_candidate_id IS NOT NULL;

-- ====================================================================
-- 4. LEAD ASSIGNMENT HISTORY (immutable audit trail)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.lead_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_from uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason text
);

CREATE INDEX IF NOT EXISTS idx_lead_assignment_history_lead 
  ON public.lead_assignment_history(lead_id, created_at DESC);

-- ====================================================================
-- 5. EXTEND call_logs FOR LEADS (backward-compatible)
-- ====================================================================
-- Add optional lead_id column. Existing call_logs with only candidate_id
-- continue to work unchanged. New lead calls use lead_id instead.

ALTER TABLE public.call_logs
  ALTER COLUMN candidate_id DROP NOT NULL;

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;

-- Ensure every call log references either a candidate OR a lead (not both, not neither)
ALTER TABLE public.call_logs
  DROP CONSTRAINT IF EXISTS chk_call_logs_entity_ref;

ALTER TABLE public.call_logs
  ADD CONSTRAINT chk_call_logs_entity_ref 
    CHECK (
      (candidate_id IS NOT NULL AND lead_id IS NULL)
      OR
      (candidate_id IS NULL AND lead_id IS NOT NULL)
    );

-- Index for lead call lookups
CREATE INDEX IF NOT EXISTS idx_call_logs_lead_id 
  ON public.call_logs(lead_id, timestamp DESC) WHERE lead_id IS NOT NULL;

-- ====================================================================
-- 6. CANONICAL CALL OUTCOME MODEL
-- ====================================================================
-- Current call_type: 'Connected', 'Busy', 'SwitchOff'
-- We add new outcomes for leads. The CHECK constraint is replaced (wider).
-- Old values remain valid. This is a BACKWARD-COMPATIBLE extension.

ALTER TABLE public.call_logs
  DROP CONSTRAINT IF EXISTS call_logs_call_type_check;

ALTER TABLE public.call_logs
  ADD CONSTRAINT call_logs_call_type_check 
    CHECK (call_type IN (
      -- Original candidate outcomes (unchanged)
      'Connected', 'Busy', 'SwitchOff',
      -- New lead-specific outcomes
      'No Answer', 'Not Interested', 'Wrong Number',
      'Call Back Later', 'Interested', 'Converted'
    ));

-- ====================================================================
-- 7. EXTEND tasks FOR LEADS (backward-compatible)
-- ====================================================================
-- Add 'lead' to entity_type enum and add lead_entity_id FK.

-- Drop old CHECK and recreate with extended values
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_entity_type_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_entity_type_check
    CHECK (entity_type IN ('candidate', 'employer', 'application', 'general', 'lead'));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS lead_entity_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_lead_entity 
  ON public.tasks(lead_entity_id) WHERE lead_entity_id IS NOT NULL;

-- ====================================================================
-- 8. UPDATED_AT TRIGGER FOR LEADS
-- ====================================================================
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ====================================================================
-- 9. LEAD OWNERSHIP IMMUTABILITY TRIGGER
-- ====================================================================
CREATE OR REPLACE FUNCTION public.trg_enforce_lead_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  -- created_by is immutable once set
  IF OLD.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Audit violation: lead created_by is immutable' USING ERRCODE = '42501';
  END IF;

  -- Only admin/manager can reassign leads
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    IF NOT public.is_admin_or_manager() THEN
      RAISE EXCEPTION 'Unauthorized: Only managers and admins can reassign leads' USING ERRCODE = '42501';
    END IF;
    
    -- Auto-record assignment change
    INSERT INTO public.lead_assignment_history (lead_id, assigned_from, assigned_to, assigned_by)
    VALUES (NEW.id, OLD.assigned_to, NEW.assigned_to, auth.uid());
  END IF;
  
  -- Prevent modifying conversion fields after conversion
  IF OLD.converted_candidate_id IS NOT NULL THEN
    IF NEW.converted_candidate_id IS DISTINCT FROM OLD.converted_candidate_id
       OR NEW.converted_at IS DISTINCT FROM OLD.converted_at THEN
      RAISE EXCEPTION 'Conversion is permanent and cannot be modified' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leads_ownership_safety
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_lead_ownership();

REVOKE EXECUTE ON FUNCTION public.trg_enforce_lead_ownership() FROM public, anon;

-- ====================================================================
-- 10. RPC: ATOMIC LEAD-TO-CANDIDATE CONVERSION
-- ====================================================================
-- This function:
--   1. Validates the lead exists and is not already converted
--   2. Checks if a candidate with same mobile already exists
--   3. If candidate exists: links lead to existing candidate (no duplicate)
--   4. If no candidate exists: creates new candidate from lead data
--   5. Marks lead as converted
--   All in a single SERIALIZABLE transaction
CREATE OR REPLACE FUNCTION public.convert_lead_to_candidate(
  p_lead_id uuid,
  p_override_name text DEFAULT NULL,
  p_override_email text DEFAULT NULL,
  p_override_experience numeric DEFAULT NULL,
  p_override_skills text[] DEFAULT NULL,
  p_override_location text DEFAULT NULL,
  p_override_expected_salary integer DEFAULT NULL,
  p_override_current_salary integer DEFAULT NULL,
  p_override_qualification text DEFAULT NULL,
  p_override_notice_period text DEFAULT NULL,
  p_override_last_role text DEFAULT NULL
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
BEGIN
  -- 1. Lock and fetch the lead (SELECT FOR UPDATE prevents concurrent conversion)
  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id AND is_active = true
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found or inactive: %', p_lead_id 
      USING ERRCODE = 'P0002';
  END IF;
  
  -- 2. Idempotency: if already converted, return the existing conversion
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
  
  -- 3. Check if candidate with same normalized mobile already exists
  SELECT id, name INTO v_candidate_id, v_candidate_name
  FROM public.candidates
  WHERE mobile = v_lead.mobile AND is_active = true;
  
  IF v_candidate_id IS NOT NULL THEN
    -- Candidate already exists — link, don't duplicate
    v_was_existing := true;
  ELSE
    -- 4. Create new candidate from lead data (respecting overrides)
    INSERT INTO public.candidates (
      name, mobile, email, experience, skills, location,
      expected_salary, last_role, status, source,
      qualification, notice_period, current_salary,
      created_by, assigned_to, is_active
    ) VALUES (
      COALESCE(p_override_name, v_lead.name),
      v_lead.mobile,
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
    RETURNING id, name INTO v_candidate_id, v_candidate_name;
  END IF;
  
  -- 5. Mark lead as converted (trigger prevents future modification of these fields)
  UPDATE public.leads
  SET 
    converted_candidate_id = v_candidate_id,
    converted_at = now(),
    converted_by = v_caller,
    category = 'Converted',
    updated_at = now()
  WHERE id = p_lead_id;
  
  -- 6. Audit log
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
      'lead_mobile', v_lead.mobile
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

REVOKE EXECUTE ON FUNCTION public.convert_lead_to_candidate(
  uuid, text, text, numeric, text[], text, integer, integer, text, text, text
) FROM public;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_candidate(
  uuid, text, text, numeric, text[], text, integer, integer, text, text, text
) TO authenticated;

-- ====================================================================
-- 11. RPC: TRANSACTION-SAFE LEAD CREATION WITH CROSS-TABLE DEDUP
-- ====================================================================
-- This is the ONLY safe way to create a lead when you need to check
-- against both leads AND candidates tables atomically.
CREATE OR REPLACE FUNCTION public.create_lead_with_dedup(
  p_name text,
  p_mobile text,
  p_email text DEFAULT NULL,
  p_experience numeric DEFAULT NULL,
  p_skills text[] DEFAULT '{}',
  p_location text DEFAULT NULL,
  p_expected_salary integer DEFAULT NULL,
  p_current_salary integer DEFAULT NULL,
  p_qualification text DEFAULT NULL,
  p_notice_period text DEFAULT NULL,
  p_last_role text DEFAULT NULL,
  p_source text DEFAULT 'Manual',
  p_assigned_to uuid DEFAULT NULL,
  p_import_batch_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_existing_lead_id uuid;
  v_existing_candidate_id uuid;
  v_existing_candidate_name text;
  v_new_lead_id uuid;
  v_caller uuid := auth.uid();
BEGIN
  -- 1. Check if active lead with this mobile already exists
  SELECT id INTO v_existing_lead_id
  FROM public.leads
  WHERE mobile = p_mobile AND is_active = true
  FOR UPDATE;  -- Lock to prevent race condition
  
  IF v_existing_lead_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'duplicate_lead',
      'existing_lead_id', v_existing_lead_id,
      'message', 'An active lead with mobile ' || p_mobile || ' already exists'
    );
  END IF;
  
  -- 2. Check if active candidate with this mobile already exists
  SELECT id, name INTO v_existing_candidate_id, v_existing_candidate_name
  FROM public.candidates
  WHERE mobile = p_mobile AND is_active = true;
  
  IF v_existing_candidate_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'existing_candidate',
      'existing_candidate_id', v_existing_candidate_id,
      'existing_candidate_name', v_existing_candidate_name,
      'message', 'A candidate with mobile ' || p_mobile || ' already exists in CRM'
    );
  END IF;
  
  -- 3. Safe to insert
  INSERT INTO public.leads (
    name, mobile, email, experience, skills, location,
    expected_salary, current_salary, qualification,
    notice_period, last_role, source, assigned_to,
    import_batch_id, notes, created_by, is_active
  ) VALUES (
    p_name, p_mobile, p_email, p_experience, p_skills, p_location,
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

REVOKE EXECUTE ON FUNCTION public.create_lead_with_dedup(
  text, text, text, numeric, text[], text, integer, integer, text, text, text, text, uuid, uuid, text
) FROM public;
GRANT EXECUTE ON FUNCTION public.create_lead_with_dedup(
  text, text, text, numeric, text[], text, integer, integer, text, text, text, text, uuid, uuid, text
) TO authenticated;

-- ====================================================================
-- 12. RPC: IDEMPOTENT FOLLOW-UP TASK CREATION
-- ====================================================================
-- Creates a next-day follow-up task for a lead after No Answer/Busy/SwitchOff.
-- Idempotent: if a pending task for the same lead on the same due_date exists, 
-- it returns the existing task instead of creating a duplicate.
CREATE OR REPLACE FUNCTION public.create_lead_followup(
  p_lead_id uuid,
  p_title text,
  p_due_date date DEFAULT (CURRENT_DATE + INTERVAL '1 day')::date,
  p_assigned_to_user_id uuid DEFAULT NULL,
  p_priority text DEFAULT 'Medium',
  p_notes text DEFAULT NULL
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
  -- Validate lead exists
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id AND is_active = true) THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id USING ERRCODE = 'P0002';
  END IF;

  -- Check for existing pending task for this lead on this date
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_lead_followup(uuid, text, date, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_lead_followup(uuid, text, date, uuid, text, text) TO authenticated;

-- ====================================================================
-- 13. ENABLE RLS ON NEW TABLES
-- ====================================================================
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_assignment_history ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- 14. RLS POLICIES: leads
-- ====================================================================
-- All authenticated users can VIEW all leads (confirmed business requirement)
CREATE POLICY "leads_select_policy" ON public.leads
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: own leads or admin/manager
CREATE POLICY "leads_insert_policy" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR created_by IS NULL
    OR public.is_admin_or_manager()
  );

-- UPDATE: admin/manager OR assigned recruiter (for notes, category changes)
CREATE POLICY "leads_update_policy" ON public.leads
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_or_manager()
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  )
  WITH CHECK (
    public.is_admin_or_manager()
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

-- DELETE: admin only (soft delete preferred, but grant for cleanup)
CREATE POLICY "leads_delete_policy" ON public.leads
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ====================================================================
-- 15. RLS POLICIES: lead_import_batches
-- ====================================================================
-- All authenticated can view import history
CREATE POLICY "lead_import_batches_select_policy" ON public.lead_import_batches
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: anyone can upload
CREATE POLICY "lead_import_batches_insert_policy" ON public.lead_import_batches
  FOR INSERT TO authenticated
  WITH CHECK (imported_by = auth.uid() OR public.is_admin_or_manager());

-- No UPDATE/DELETE: import records are immutable audit trail

-- ====================================================================
-- 16. RLS POLICIES: lead_assignment_history
-- ====================================================================
-- All authenticated can view assignment history
CREATE POLICY "lead_assignment_history_select_policy" ON public.lead_assignment_history
  FOR SELECT TO authenticated
  USING (true);

-- INSERT only via trigger (trg_enforce_lead_ownership) — no direct client INSERT
-- No UPDATE/DELETE: immutable audit trail

-- ====================================================================
-- 17. RLS POLICIES: call_logs (updated for lead calls)
-- ====================================================================
-- Existing policies check created_by or admin/manager.
-- The existing SELECT/INSERT policies already cover lead calls since
-- the policy conditions are on created_by/admin, not on candidate_id.
-- No policy changes needed — existing policies are entity-agnostic.

-- ====================================================================
-- 18. TABLE-LEVEL GRANTS
-- ====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT SELECT, INSERT ON public.lead_import_batches TO authenticated;
GRANT SELECT ON public.lead_assignment_history TO authenticated;
-- call_logs and tasks already have appropriate grants

-- Sequence permissions
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
