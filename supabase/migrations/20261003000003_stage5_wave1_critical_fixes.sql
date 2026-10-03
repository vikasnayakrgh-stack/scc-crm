-- ====================================================================
-- SCC CRM Migration 003: Stage 5 Wave 1 Critical Workflow & Security Fixes
-- Target: Supabase Project zshihpvmtvwsbwrjpugy (PostgreSQL 17.11)
-- Fixes:
--   P0-01: Auto-link/create job_application on interview scheduling (no orphan interviews)
--   P0-02: Recruiter draft placement invoice permission + Admin/Manager Paid approval guard
--   P0-03: Atomic candidate registration fee sync trigger
-- Security Hardening:
--   - Explicit search_path on all functions
--   - Revocation of execute privileges from anon/public on trigger functions
--   - Reassigned candidate_id recalculation handling on updates
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. P0-01: Database Trigger to Ensure Interviews Always Link to Applications
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_ensure_interview_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_app_id uuid;
  v_current_stage text;
BEGIN
  -- 0. Populate created_by from auth.uid() if omitted
  IF NEW.created_by IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  -- 1. If an application_id was explicitly provided, verify it exists and matches
  IF NEW.application_id IS NOT NULL THEN
    SELECT id, stage INTO v_app_id, v_current_stage
    FROM public.job_applications
    WHERE id = NEW.application_id
      AND candidate_id = NEW.candidate_id
      AND job_id = NEW.job_id
      AND is_active = true;
  END IF;

  -- 2. If no valid application_id provided, look up existing active application
  IF v_app_id IS NULL THEN
    SELECT id, stage INTO v_app_id, v_current_stage
    FROM public.job_applications
    WHERE candidate_id = NEW.candidate_id
      AND job_id = NEW.job_id
      AND is_active = true
    LIMIT 1;
  END IF;

  -- 3. If no application exists, create one atomically in 'Interview Scheduled' stage
  IF v_app_id IS NULL THEN
    INSERT INTO public.job_applications (
      candidate_id,
      job_id,
      stage,
      assigned_to,
      is_active
    ) VALUES (
      NEW.candidate_id,
      NEW.job_id,
      'Interview Scheduled',
      COALESCE(NEW.created_by, auth.uid()),
      true
    )
    RETURNING id, stage INTO v_app_id, v_current_stage;
  ELSE
    -- If application exists but is in an earlier stage, advance it
    IF v_current_stage IN ('Applied', 'Screening', 'Shortlisted', 'Employer Submitted') THEN
      UPDATE public.job_applications
      SET stage = 'Interview Scheduled', updated_at = now()
      WHERE id = v_app_id;
    END IF;
  END IF;

  -- 4. Guarantee interview references the valid application
  NEW.application_id := v_app_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_interviews_ensure_application
  BEFORE INSERT ON public.interviews
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ensure_interview_application();

REVOKE EXECUTE ON FUNCTION public.trg_ensure_interview_application() FROM public, anon;


-- --------------------------------------------------------------------
-- 2. P0-02: Payment Records RLS & Auto User Attribution
-- --------------------------------------------------------------------

-- Auto-populate recorded_by_user_id from auth.uid() if omitted
CREATE OR REPLACE FUNCTION public.trg_payment_records_set_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.recorded_by_user_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.recorded_by_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_payment_records_user_attribution
  BEFORE INSERT ON public.payment_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_payment_records_set_user();

REVOKE EXECUTE ON FUNCTION public.trg_payment_records_set_user() FROM public, anon;

-- Update payment RLS policies
ALTER POLICY "payments_select_policy" ON public.payment_records
  USING (
    public.is_admin_or_manager()
    OR recorded_by_user_id = auth.uid()
    OR type = 'Candidate_Registration'
  );

ALTER POLICY "payments_insert_policy" ON public.payment_records
  WITH CHECK (
    public.is_admin_or_manager()
    OR (
      (recorded_by_user_id = auth.uid() OR recorded_by_user_id IS NULL)
      AND (
        type = 'Candidate_Registration'
        OR (type = 'Employer_Placement' AND status = 'Pending')
        OR (type = 'Other' AND status = 'Pending')
      )
    )
  );

ALTER POLICY "payments_update_policy" ON public.payment_records
  USING (
    public.is_admin_or_manager()
    OR (recorded_by_user_id = auth.uid() AND status = 'Pending')
  )
  WITH CHECK (
    public.is_admin_or_manager()
    OR (recorded_by_user_id = auth.uid() AND status = 'Pending')
  );


-- --------------------------------------------------------------------
-- 3. P0-03: Atomic Candidate Registration Fee Synchronization Trigger
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sync_candidate_registration_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_cand_id uuid;
BEGIN
  v_cand_id := COALESCE(NEW.candidate_id, OLD.candidate_id);

  IF v_cand_id IS NOT NULL THEN
    UPDATE public.candidates
    SET registration_fee_paid = EXISTS (
      SELECT 1 FROM public.payment_records
      WHERE candidate_id = v_cand_id
        AND type = 'Candidate_Registration'
        AND status = 'Paid'
        AND is_active = true
    ),
    updated_at = now()
    WHERE id = v_cand_id;
  END IF;

  -- If candidate_id changed on UPDATE, recalculate for OLD.candidate_id as well
  IF TG_OP = 'UPDATE' AND OLD.candidate_id IS DISTINCT FROM NEW.candidate_id AND OLD.candidate_id IS NOT NULL THEN
    UPDATE public.candidates
    SET registration_fee_paid = EXISTS (
      SELECT 1 FROM public.payment_records
      WHERE candidate_id = OLD.candidate_id
        AND type = 'Candidate_Registration'
        AND status = 'Paid'
        AND is_active = true
    ),
    updated_at = now()
    WHERE id = OLD.candidate_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE TRIGGER trg_sync_registration_fee
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_candidate_registration_fee();

REVOKE EXECUTE ON FUNCTION public.trg_sync_candidate_registration_fee() FROM public, anon;
