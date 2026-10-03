-- ====================================================================
-- SCC CRM Migration 002: Row Level Security, RBAC & Hardened Procedures
-- Target: Fresh Supabase Project (zshihpvmtvwsbwrjpugy)
-- Policies: Role-based isolation for Admin, Manager, and Recruiter
-- Triggers: Auto-profile creation, role protection, ownership immutability
-- ====================================================================

-- ====================================================================
-- 1. Helper Functions (SECURITY DEFINER with safe explicit search_path)
-- ====================================================================

-- Read verified role for current authenticated user
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    (SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true),
    'recruiter'
  );
$$;

-- Check if authenticated caller is an active administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );
$$;

-- Check if authenticated caller is an active administrator or manager
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager'),
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager') AND is_active = true
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_manager() FROM public;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager() TO authenticated;

-- ====================================================================
-- 2. Profile Lifecycle Triggers
-- ====================================================================

-- Auto-provision profile on auth.users creation (default role: recruiter)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    'recruiter', -- Default role is strictly recruiter. Admin elevation is explicit.
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Safety Trigger: Prevent self-promotion, unauthorized role updates, and last-admin lockout
CREATE OR REPLACE FUNCTION public.trg_check_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  -- Prevent altering immutable identity columns
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Profile ID is immutable' USING ERRCODE = '42501';
  END IF;

  -- Role modification guard
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Caller must be a verified administrator
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify user roles'
        USING ERRCODE = '42501';
    END IF;

    -- Safety check: Prevent demoting the last active administrator
    IF OLD.id = auth.uid() AND NEW.role <> 'admin' THEN
      IF (SELECT count(*) FROM public.profiles WHERE role = 'admin' AND is_active = true) <= 1 THEN
        RAISE EXCEPTION 'Safety violation: Cannot remove the last active administrator'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_update_safety ON public.profiles;
CREATE TRIGGER trg_profiles_update_safety
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_profile_update();

-- ====================================================================
-- 3. Ownership Immutability & Reassignment Triggers
-- ====================================================================

-- Candidate ownership guard
CREATE OR REPLACE FUNCTION public.trg_enforce_candidate_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  -- created_by is immutable once assigned
  IF OLD.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Audit violation: created_by is immutable' USING ERRCODE = '42501';
  END IF;

  -- Only admins and managers can reassign assigned_to
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    IF NOT public.is_admin_or_manager() THEN
      RAISE EXCEPTION 'Unauthorized: Only managers and admins can reassign candidates' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_candidates_ownership_safety ON public.candidates;
CREATE TRIGGER trg_candidates_ownership_safety
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_candidate_ownership();

-- Job Application ownership guard
CREATE OR REPLACE FUNCTION public.trg_enforce_application_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.candidate_id <> OLD.candidate_id OR NEW.job_id <> OLD.job_id THEN
    RAISE EXCEPTION 'Audit violation: application candidate_id and job_id are immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    IF NOT public.is_admin_or_manager() THEN
      RAISE EXCEPTION 'Unauthorized: Only managers and admins can reassign applications' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_applications_ownership_safety ON public.job_applications;
CREATE TRIGGER trg_applications_ownership_safety
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_application_ownership();

-- Interview ownership guard
CREATE OR REPLACE FUNCTION public.trg_enforce_interview_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  IF OLD.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Audit violation: interview created_by is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_interviews_ownership_safety ON public.interviews;
CREATE TRIGGER trg_interviews_ownership_safety
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_interview_ownership();

-- ====================================================================
-- 4. Controlled Admin Role Change RPC
-- ====================================================================
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  target_user_id uuid,
  new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_old_role text;
  v_admin_count int;
BEGIN
  -- Verify caller is administrator
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an administrator' USING ERRCODE = '42501';
  END IF;

  -- Validate role whitelist
  IF new_role NOT IN ('admin', 'manager', 'recruiter') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role USING ERRCODE = '22023';
  END IF;

  -- Fetch existing role
  SELECT role INTO v_old_role FROM public.profiles WHERE id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found for ID %', target_user_id USING ERRCODE = 'P0002';
  END IF;

  -- Prevent last-admin lockout
  IF target_user_id = auth.uid() AND new_role <> 'admin' THEN
    SELECT count(*) INTO v_admin_count FROM public.profiles WHERE role = 'admin' AND is_active = true;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Safety violation: Cannot demote the last remaining active administrator' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Apply update
  UPDATE public.profiles
  SET role = new_role, updated_at = now()
  WHERE id = target_user_id;

  -- Log action in audit trail
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'ROLE_UPDATED',
    'profile',
    target_user_id,
    jsonb_build_object('old_role', v_old_role, 'new_role', new_role)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'old_role', v_old_role,
    'new_role', new_role
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;

-- ====================================================================
-- 5. Enable Row Level Security on all 10 Tables
-- ====================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- 6. Table Policies: profiles
-- ====================================================================
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT TO authenticated
  USING (is_active = true); -- All authenticated users can view active team profiles

CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- ====================================================================
-- 7. Table Policies: employers
-- ====================================================================
CREATE POLICY "employers_select_policy" ON public.employers
  FOR SELECT TO authenticated
  USING (is_active = true); -- Shared client directory

CREATE POLICY "employers_insert_policy" ON public.employers
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL OR public.is_admin_or_manager());

CREATE POLICY "employers_update_policy" ON public.employers
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager() OR created_by = auth.uid())
  WITH CHECK (public.is_admin_or_manager() OR created_by = auth.uid());

-- ====================================================================
-- 8. Table Policies: candidates
-- ====================================================================
CREATE POLICY "candidates_select_policy" ON public.candidates
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager()
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR (owner_id IS NOT NULL AND owner_id = (SELECT display_name FROM public.profiles WHERE id = auth.uid()))
  );

CREATE POLICY "candidates_insert_policy" ON public.candidates
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR public.is_admin_or_manager()
    OR (created_by IS NULL AND public.is_admin())
  );

CREATE POLICY "candidates_update_policy" ON public.candidates
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

-- ====================================================================
-- 9. Table Policies: jobs
-- ====================================================================
CREATE POLICY "jobs_select_policy" ON public.jobs
  FOR SELECT TO authenticated
  USING (is_active = true); -- Open jobs visible to all recruiters

CREATE POLICY "jobs_insert_policy" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL OR public.is_admin_or_manager());

CREATE POLICY "jobs_update_policy" ON public.jobs
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager() OR created_by = auth.uid())
  WITH CHECK (public.is_admin_or_manager() OR created_by = auth.uid());

-- ====================================================================
-- 10. Table Policies: job_applications
-- ====================================================================
CREATE POLICY "applications_select_policy" ON public.job_applications
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager()
    OR assigned_to = auth.uid()
    OR candidate_id IN (
      SELECT id FROM public.candidates
      WHERE assigned_to = auth.uid() OR created_by = auth.uid()
    )
  );

CREATE POLICY "applications_insert_policy" ON public.job_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    assigned_to = auth.uid()
    OR public.is_admin_or_manager()
    OR candidate_id IN (
      SELECT id FROM public.candidates
      WHERE assigned_to = auth.uid() OR created_by = auth.uid()
    )
  );

CREATE POLICY "applications_update_policy" ON public.job_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_or_manager()
    OR assigned_to = auth.uid()
    OR candidate_id IN (
      SELECT id FROM public.candidates
      WHERE assigned_to = auth.uid() OR created_by = auth.uid()
    )
  );

-- ====================================================================
-- 11. Table Policies: interviews
-- ====================================================================
CREATE POLICY "interviews_select_policy" ON public.interviews
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager()
    OR created_by = auth.uid()
    OR candidate_id IN (
      SELECT id FROM public.candidates
      WHERE assigned_to = auth.uid() OR created_by = auth.uid()
    )
  );

CREATE POLICY "interviews_insert_policy" ON public.interviews
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.is_admin_or_manager());

CREATE POLICY "interviews_update_policy" ON public.interviews
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager() OR created_by = auth.uid());

-- ====================================================================
-- 12. Table Policies: call_logs
-- ====================================================================
CREATE POLICY "call_logs_select_policy" ON public.call_logs
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager() OR created_by = auth.uid());

CREATE POLICY "call_logs_insert_policy" ON public.call_logs
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.is_admin_or_manager());

-- No UPDATE or DELETE policy on call_logs: immutable telecaller audit trail

-- ====================================================================
-- 13. Table Policies: tasks
-- ====================================================================
CREATE POLICY "tasks_select_policy" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager()
    OR assigned_to_user_id = auth.uid()
    OR created_by = auth.uid()
    OR assigned_to = (SELECT display_name FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "tasks_insert_policy" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.is_admin_or_manager());

CREATE POLICY "tasks_update_policy" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_or_manager()
    OR assigned_to_user_id = auth.uid()
    OR created_by = auth.uid()
    OR assigned_to = (SELECT display_name FROM public.profiles WHERE id = auth.uid())
  );

-- ====================================================================
-- 14. Table Policies: payment_records
-- ====================================================================
CREATE POLICY "payments_select_policy" ON public.payment_records
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager() OR recorded_by_user_id = auth.uid());

CREATE POLICY "payments_insert_policy" ON public.payment_records
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_manager()
    OR (type = 'Candidate_Registration' AND (recorded_by_user_id = auth.uid() OR recorded_by_user_id IS NULL))
  );

CREATE POLICY "payments_update_policy" ON public.payment_records
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager());

-- No DELETE policy on payment_records: financial audit safety

-- ====================================================================
-- 15. Table Policies: activity_logs
-- ====================================================================
CREATE POLICY "activity_logs_select_policy" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- No INSERT, UPDATE, DELETE policies for client API on activity_logs
-- Writes happen strictly via server-side triggers or service-role backend

-- ====================================================================
-- 16. Explicit Table-Level GRANTs (CRITICAL for Supabase Cloud)
-- In fresh Supabase cloud projects, PostgREST requires explicit GRANTs
-- on tables for the authenticated role. RLS policies alone are NOT
-- sufficient — without GRANTs the API denies the request before
-- RLS is even evaluated, returning silent 403/empty results.
-- ====================================================================

-- profiles: anon needs SELECT to validate login state; authenticated manages own profile
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

-- employers: full CRUD for authenticated (RLS restricts by role/ownership)
GRANT SELECT, INSERT, UPDATE ON public.employers TO authenticated;

-- candidates: full CRUD for authenticated
GRANT SELECT, INSERT, UPDATE ON public.candidates TO authenticated;

-- jobs: full CRUD for authenticated
GRANT SELECT, INSERT, UPDATE ON public.jobs TO authenticated;

-- job_applications: full CRUD for authenticated
GRANT SELECT, INSERT, UPDATE ON public.job_applications TO authenticated;

-- applications view: SELECT for authenticated (read-through to job_applications)
GRANT SELECT ON public.applications TO authenticated;

-- interviews: full CRUD for authenticated
GRANT SELECT, INSERT, UPDATE ON public.interviews TO authenticated;

-- call_logs: INSERT + SELECT only (immutable telecaller trail — no UPDATE/DELETE)
GRANT SELECT, INSERT ON public.call_logs TO authenticated;

-- tasks: full CRUD for authenticated
GRANT SELECT, INSERT, UPDATE ON public.tasks TO authenticated;

-- payment_records: full CRUD except DELETE (financial audit trail)
GRANT SELECT, INSERT, UPDATE ON public.payment_records TO authenticated;

-- payments view: SELECT for authenticated (read-through to payment_records)
GRANT SELECT ON public.payments TO authenticated;

-- activity_logs: SELECT only for authenticated (admin-gated by RLS policy)
GRANT SELECT ON public.activity_logs TO authenticated;

-- Sequence permissions (needed for DEFAULT gen_random_uuid() to work via API)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
