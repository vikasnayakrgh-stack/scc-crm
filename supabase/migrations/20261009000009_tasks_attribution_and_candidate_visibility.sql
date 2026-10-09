-- ============================================================================
-- SCC CRM Migration 009: Tasks Attribution Defense & Candidate Visibility Hardening
-- Target Database: Supabase Cloud PostgreSQL (zshihpvmtvwsbwrjpugy)
-- Version: 20261009000009
-- Classification: REVIEWED - REQUIRES HUMAN OWNER APPROVAL BEFORE REMOTE EXECUTION
-- Authoritative Standard: SCC CRM Operating Constitution (AGENTS.md)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DEFENSE-IN-DEPTH ATTRIBUTION: tasks.created_by DEFAULT auth.uid()
-- ----------------------------------------------------------------------------
-- Prevents RLS violation (42501) when frontline telecallers/recruiters create tasks
-- without client-provided created_by parameter.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'tasks' 
      AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.tasks ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. HARDENED TASKS INSERT POLICY (RLS)
-- ----------------------------------------------------------------------------
-- Grants active recruiters ability to create tasks attributed to themselves,
-- and allows administrators to create tasks attributed to any user.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tasks'
  ) THEN
    DROP POLICY IF EXISTS tasks_insert_policy ON public.tasks;
    
    CREATE POLICY tasks_insert_policy ON public.tasks
      FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() IS NOT NULL 
        AND EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE id = auth.uid() AND is_active = true
        )
        AND (
          created_by = auth.uid() 
          OR public.is_admin()
        )
      );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. CANDIDATE VISIBILITY STANDARD (INVARIANT 1)
-- ----------------------------------------------------------------------------
-- Invariant 1: Universal Lead & Candidate Pool Visibility across active team members.
-- Active CRM users can view candidate profiles to match vacancies across employers.
-- Does NOT modify candidates_update_policy or grant any DELETE privileges.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'candidates'
  ) THEN
    DROP POLICY IF EXISTS candidates_select_policy ON public.candidates;
    
    CREATE POLICY candidates_select_policy ON public.candidates
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() IS NOT NULL 
        AND EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE id = auth.uid() AND is_active = true
        )
      );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. ATTRIBUTION TRIGGER FOR AUDIT LEDGER INTEGRITY
-- ----------------------------------------------------------------------------
-- Ensures tasks.created_by can never be spoofed to another user by non-admins,
-- while preserving administrative delegation and background service_role attribution.
CREATE OR REPLACE FUNCTION public.trg_tasks_set_created_by_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  ELSIF NEW.created_by <> auth.uid() AND NOT public.is_admin() THEN
    -- Non-admin cannot forge attribution
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Privilege Hardening (AGENTS.md Section C.2 Standard)
REVOKE ALL ON FUNCTION public.trg_tasks_set_created_by_fn() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.trg_tasks_set_created_by_fn() TO authenticated;

DROP TRIGGER IF EXISTS trg_tasks_set_created_by ON public.tasks;
CREATE TRIGGER trg_tasks_set_created_by
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_tasks_set_created_by_fn();

-- ----------------------------------------------------------------------------
-- 5. OWNER ACCOUNT PROVISIONING VERIFICATION & SAFETY NOTICE
-- ----------------------------------------------------------------------------
-- NOTICE: Owner account 'vikasnayakrgh@gmail.com' must be invited via Supabase Auth
-- Dashboard. This script does NOT fabricate passwords or insert mock auth credentials.
