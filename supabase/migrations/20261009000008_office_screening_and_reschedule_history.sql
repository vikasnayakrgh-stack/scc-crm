-- ====================================================================
-- SCC CRM Migration 008: Office Screening, Interview Reschedule Audit,
-- Tasks Workflow & Registration Fee Refunds
-- Target: Supabase Project zshihpvmtvwsbwrjpugy (PostgreSQL 17.11)
-- Scope:
--   - Create public.candidate_screenings table for SCC in-office preliminary assessments
--   - Add screening_status column to public.candidates ('Pending', 'Scheduled', 'Pass', 'Hold', 'Fail')
--   - Add reschedule_history column (jsonb) to public.interviews for audit tracking
--   - Expand tasks_status_check on public.tasks to support Kanban states ('Pending', 'To Do', 'In Progress', 'Waiting', 'Completed', 'Cancelled')
--   - Expand payment_records_status_check on public.payment_records to support ('Paid', 'Partial', 'Pending', 'Refunded')
-- Safety: Additive, non-destructive, preserving existing RLS and data.
-- Governance Gate: STRICTLY PREPARED - PENDING EXPLICIT OPERATOR APPROVAL TO EXECUTE.
-- ====================================================================

-- 1. Create candidate_screenings table with hardened RLS and attribution default
CREATE TABLE IF NOT EXISTS public.candidate_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  screening_time timestamptz NOT NULL,
  venue text NOT NULL DEFAULT 'SCC Raipur Head Office',
  skills_assessment text DEFAULT NULL,
  communication_rating integer CHECK (communication_rating IS NULL OR (communication_rating >= 1 AND communication_rating <= 5)),
  confidence_rating integer CHECK (confidence_rating IS NULL OR (confidence_rating >= 1 AND confidence_rating <= 5)),
  overall_rating numeric(3,1) CHECK (overall_rating IS NULL OR (overall_rating >= 1.0 AND overall_rating <= 5.0)),
  remarks text DEFAULT NULL,
  result text NOT NULL DEFAULT 'Hold' CHECK (result IN ('Pass', 'Hold', 'Fail')),
  next_action text DEFAULT NULL,
  followup_date date DEFAULT NULL,
  screening_staff text NOT NULL DEFAULT 'Recruiter',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_active boolean NOT NULL DEFAULT true
);

-- Ensure created_by column default if table already existed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'candidate_screenings' 
      AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.candidate_screenings ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
END $$;

-- Indexes for candidate_screenings
CREATE INDEX IF NOT EXISTS idx_screenings_candidate_id ON public.candidate_screenings(candidate_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_screenings_time ON public.candidate_screenings(screening_time DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_screenings_result ON public.candidate_screenings(result) WHERE is_active = true;

-- Enable RLS on candidate_screenings
ALTER TABLE public.candidate_screenings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_screenings TO authenticated;

-- Policies for candidate_screenings (Hardened & Constitution Compliant)
DO $$
BEGIN
  DROP POLICY IF EXISTS screenings_select_policy ON public.candidate_screenings;
  CREATE POLICY screenings_select_policy ON public.candidate_screenings
    FOR SELECT TO authenticated
    USING (
      auth.uid() IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_active = true
      )
    );

  DROP POLICY IF EXISTS screenings_insert_policy ON public.candidate_screenings;
  CREATE POLICY screenings_insert_policy ON public.candidate_screenings
    FOR INSERT TO authenticated
    WITH CHECK (
      auth.uid() IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_active = true
      )
      AND (
        created_by IS NULL
        OR created_by = auth.uid()
        OR public.is_admin()
      )
    );

  DROP POLICY IF EXISTS screenings_update_policy ON public.candidate_screenings;
  CREATE POLICY screenings_update_policy ON public.candidate_screenings
    FOR UPDATE TO authenticated
    USING (
      auth.uid() IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_active = true
      )
      AND (
        created_by = auth.uid() 
        OR public.is_admin_or_manager()
      )
    )
    WITH CHECK (
      auth.uid() IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_active = true
      )
      AND (
        created_by = auth.uid() 
        OR public.is_admin_or_manager()
      )
    );

  DROP POLICY IF EXISTS screenings_delete_policy ON public.candidate_screenings;
  CREATE POLICY screenings_delete_policy ON public.candidate_screenings
    FOR DELETE TO authenticated
    USING (
      auth.uid() IS NOT NULL 
      AND public.is_admin()
    );
END $$;

-- 2. Add screening_status to public.candidates
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS screening_status text DEFAULT 'Pending' 
  CHECK (screening_status IS NULL OR screening_status IN ('Pending', 'Scheduled', 'Pass', 'Hold', 'Fail'));

-- 3. Add reschedule_history to public.interviews
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS reschedule_history jsonb DEFAULT '[]'::jsonb;

-- 4. Expand status check constraint on public.tasks for Kanban workflow
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'tasks_status_check' 
      AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE public.tasks DROP CONSTRAINT tasks_status_check;
  END IF;

  ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_status_check
    CHECK (status IN ('Pending', 'To Do', 'In Progress', 'Waiting', 'Completed', 'Cancelled'));
END $$;

-- 5. Expand status check constraint on public.payment_records for fee refunds
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'payment_records_status_check' 
      AND conrelid = 'public.payment_records'::regclass
  ) THEN
    ALTER TABLE public.payment_records DROP CONSTRAINT payment_records_status_check;
  END IF;

  ALTER TABLE public.payment_records
    ADD CONSTRAINT payment_records_status_check
    CHECK (status IN ('Paid', 'Partial', 'Pending', 'Refunded'));
END $$;

-- 6. Attribution trigger and timestamp triggers for public.candidate_screenings
CREATE OR REPLACE FUNCTION public.trg_screenings_set_created_by_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  ELSIF NEW.created_by <> auth.uid() AND NOT public.is_admin() THEN
    -- Non-admin callers cannot spoof screening attribution
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Privilege Hardening (AGENTS.md Section C.2 Standard)
REVOKE ALL ON FUNCTION public.trg_screenings_set_created_by_fn() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.trg_screenings_set_created_by_fn() TO authenticated;

DROP TRIGGER IF EXISTS trg_screenings_set_created_by ON public.candidate_screenings;
CREATE TRIGGER trg_screenings_set_created_by
  BEFORE INSERT ON public.candidate_screenings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_screenings_set_created_by_fn();

DROP TRIGGER IF EXISTS trg_candidate_screenings_updated_at ON public.candidate_screenings;
CREATE TRIGGER trg_candidate_screenings_updated_at
  BEFORE UPDATE ON public.candidate_screenings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Net registration fee sync trigger on payment_records (receipts minus refunds)
-- Synchronizes candidates.registration_fee_paid with net received fee balance
CREATE OR REPLACE FUNCTION public.trg_sync_candidate_registration_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_cand_id uuid;
  v_net_paid integer;
BEGIN
  v_cand_id := COALESCE(NEW.candidate_id, OLD.candidate_id);

  IF v_cand_id IS NOT NULL THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN status IN ('Paid', 'Partial') THEN amount
        WHEN status = 'Refunded' THEN -amount
        ELSE 0
      END
    ), 0) INTO v_net_paid
    FROM public.payment_records
    WHERE candidate_id = v_cand_id
      AND type = 'Candidate_Registration'
      AND is_active = true;

    UPDATE public.candidates
    SET registration_fee_paid = (v_net_paid >= 200),
        updated_at = now()
    WHERE id = v_cand_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.candidate_id IS DISTINCT FROM NEW.candidate_id AND OLD.candidate_id IS NOT NULL THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN status IN ('Paid', 'Partial') THEN amount
        WHEN status = 'Refunded' THEN -amount
        ELSE 0
      END
    ), 0) INTO v_net_paid
    FROM public.payment_records
    WHERE candidate_id = OLD.candidate_id
      AND type = 'Candidate_Registration'
      AND is_active = true;

    UPDATE public.candidates
    SET registration_fee_paid = (v_net_paid >= 200),
        updated_at = now()
    WHERE id = OLD.candidate_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_registration_fee ON public.payment_records;
CREATE TRIGGER trg_sync_registration_fee
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_candidate_registration_fee();

REVOKE EXECUTE ON FUNCTION public.trg_sync_candidate_registration_fee() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trg_sync_candidate_registration_fee() TO authenticated;

