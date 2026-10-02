-- ====================================================================
-- SCC CRM Migration 003: Row Level Security (RLS) & Access Control
-- Target: Protect Candidate PII, Financials & Role Isolation
-- Prerequisite: Active Supabase Auth project
-- ====================================================================

-- 1. Helper Function: Extract User Role from JWT
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text AS $$
BEGIN
  -- Reads app_metadata -> role from Supabase auth token (e.g. 'Admin', 'Telecaller')
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
    'Telecaller'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Enable RLS on all CRM tables
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 3. Candidates Policies
-- Authenticated users can view active candidates
CREATE POLICY "candidates_select_policy" ON public.candidates
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Authenticated users can register candidates
CREATE POLICY "candidates_insert_policy" ON public.candidates
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Telecallers can update their assigned candidates; Admins can update all
CREATE POLICY "candidates_update_policy" ON public.candidates
  FOR UPDATE TO authenticated
  USING (public.get_auth_role() = 'Admin' OR owner_id = auth.uid()::text);

-- 4. Employers & Jobs Policies
CREATE POLICY "employers_all_policy" ON public.employers
  FOR ALL TO authenticated
  USING (true);

CREATE POLICY "jobs_all_policy" ON public.jobs
  FOR ALL TO authenticated
  USING (true);

-- 5. Applications & Interviews Policies
CREATE POLICY "applications_all_policy" ON public.applications
  FOR ALL TO authenticated
  USING (true);

CREATE POLICY "interviews_all_policy" ON public.interviews
  FOR ALL TO authenticated
  USING (true);

-- 6. Tasks Policies
CREATE POLICY "tasks_select_policy" ON public.tasks
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tasks_modify_policy" ON public.tasks
  FOR ALL TO authenticated
  USING (public.get_auth_role() = 'Admin' OR assigned_to = public.get_auth_role() OR assigned_to = 'Telecaller-1' OR assigned_to = 'Telecaller-2');

-- 7. Payments Policies (FINANCIAL LOCKDOWN)
-- Telecallers can view payments; only Admin can delete or modify records
CREATE POLICY "payments_select_policy" ON public.payments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payments_insert_policy" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "payments_admin_modify_policy" ON public.payments
  FOR UPDATE TO authenticated
  USING (public.get_auth_role() = 'Admin');

-- ====================================================================
-- SAFE DEVELOPMENT FALLBACK / BYPASS POLICY:
-- If running locally or without full Supabase Auth, you can temporarily disable RLS:
-- ALTER TABLE public.candidates DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.employers DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.jobs DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.applications DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.interviews DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.call_logs DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;
-- ====================================================================
