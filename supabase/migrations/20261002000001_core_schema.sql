-- ====================================================================
-- SCC CRM Migration 001: Production Core Schema
-- Target: Fresh Supabase Project (zshihpvmtvwsbwrjpugy)
-- Entities: profiles, candidates, employers, jobs, job_applications,
--           interviews, call_logs, tasks, payment_records, activity_logs
-- Compatibility Views: applications -> job_applications, payments -> payment_records
-- ====================================================================

-- 0. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Helper trigger function for automated updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ====================================================================
-- 2. Entity: profiles (Extends auth.users for RBAC & user metadata)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'manager', 'recruiter')) DEFAULT 'recruiter',
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ====================================================================
-- 3. Entity: employers (Corporate Hiring Clients)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.employers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_name text NOT NULL,
  contact_person text NOT NULL,
  phone text NOT NULL,
  email text,
  location text NOT NULL DEFAULT '',
  address text,
  industry text,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Prospect')),
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_employers_company_name ON public.employers(company_name);
CREATE INDEX IF NOT EXISTS idx_employers_status ON public.employers(status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_employers_created_by ON public.employers(created_by);

-- ====================================================================
-- 4. Entity: candidates (Job Seekers & Talent Pool)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  mobile text NOT NULL,
  email text,
  experience numeric(4,1) NOT NULL DEFAULT 0,
  skills text[] NOT NULL DEFAULT '{}',
  location text NOT NULL DEFAULT '',
  expected_salary integer NOT NULL DEFAULT 0,
  last_role text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Placed', 'Blacklisted')),
  registration_fee_paid boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_id text, -- Preserved for legacy mapping & offline local compatibility
  is_active boolean NOT NULL DEFAULT true
);

-- Active mobile uniqueness (allows soft-deleted duplicates, prevents active duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_mobile_active ON public.candidates(mobile) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_candidates_status ON public.candidates(status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_candidates_assigned_to ON public.candidates(assigned_to) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_candidates_created_by ON public.candidates(created_by) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON public.candidates(created_at DESC);

-- ====================================================================
-- 5. Entity: jobs (Client Job Openings & Requirements)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  employer_id uuid REFERENCES public.employers(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  role text NOT NULL,
  location text NOT NULL DEFAULT '',
  min_exp integer NOT NULL DEFAULT 0,
  max_exp integer NOT NULL DEFAULT 0,
  salary_min integer NOT NULL DEFAULT 0,
  salary_max integer NOT NULL DEFAULT 0,
  skills_req text[] NOT NULL DEFAULT '{}',
  urgency integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_jobs_employer_id ON public.jobs(employer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON public.jobs(location);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON public.jobs(created_by);

-- ====================================================================
-- 6. Entity: job_applications (Pipeline Submissions & Stages)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  stage text NOT NULL DEFAULT 'Applied' CHECK (stage IN (
    'Applied',
    'Screening',
    'Shortlisted',
    'Employer Submitted',
    'Interview Scheduled',
    'Interview Completed',
    'Selected',
    'Offer',
    'Joined',
    'Placed',
    'Rejected',
    'Withdrawn',
    'On Hold'
  )),
  notes text,
  offered_salary integer,
  joining_date date,
  placed_date date,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_active_candidate_job_application UNIQUE (candidate_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_applications_candidate_id ON public.job_applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_job_id ON public.job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_stage ON public.job_applications(stage) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_job_applications_assigned_to ON public.job_applications(assigned_to) WHERE is_active = true;

-- Compatibility view for existing frontend queries using .from('applications')
CREATE OR REPLACE VIEW public.applications AS
  SELECT * FROM public.job_applications;

-- ====================================================================
-- 7. Entity: interviews (Scheduled Assessments & Feedback)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE RESTRICT,
  application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,
  scheduled_time timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Done', 'NoShow', 'Selected')),
  feedback text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_time ON public.interviews(scheduled_time) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_interviews_candidate_id ON public.interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_job_id ON public.interviews(job_id);
CREATE INDEX IF NOT EXISTS idx_interviews_created_by ON public.interviews(created_by);

-- ====================================================================
-- 8. Entity: call_logs (Telecaller Candidate Engagement Logs)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  telecaller_name text NOT NULL,
  call_type text NOT NULL CHECK (call_type IN ('Connected', 'Busy', 'SwitchOff')),
  duration integer NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '',
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_call_logs_candidate_id ON public.call_logs(candidate_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_by ON public.call_logs(created_by);

-- ====================================================================
-- 9. Entity: tasks (Work Queues & Follow-up Reminders)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  due_date date NOT NULL,
  title text NOT NULL,
  notes text,
  entity_type text NOT NULL CHECK (entity_type IN ('candidate', 'employer', 'application', 'general')),
  entity_id text NOT NULL DEFAULT 'general',
  candidate_entity_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  employer_entity_id uuid REFERENCES public.employers(id) ON DELETE SET NULL,
  application_entity_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,
  assigned_to text NOT NULL,
  assigned_to_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High')),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed', 'Cancelled')),
  completed_at timestamptz,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user ON public.tasks(assigned_to_user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);

-- ====================================================================
-- 10. Entity: payment_records (Financial Invoices & Receipts)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('Candidate_Registration', 'Employer_Placement', 'Other')),
  amount integer NOT NULL CHECK (amount >= 0), -- Whole INR Rupees
  payment_method text NOT NULL CHECK (payment_method IN ('UPI', 'Cash', 'Bank_Transfer', 'Cheque')),
  status text NOT NULL DEFAULT 'Paid' CHECK (status IN ('Paid', 'Partial', 'Pending')),
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  employer_id uuid REFERENCES public.employers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,
  reference_no text,
  notes text,
  due_date date,
  paid_at timestamptz, -- NULL when payment is pending
  recorded_by text NOT NULL,
  recorded_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_records_reference_no
  ON public.payment_records(reference_no)
  WHERE reference_no IS NOT NULL AND reference_no <> '';
CREATE INDEX IF NOT EXISTS idx_payment_records_candidate_id ON public.payment_records(candidate_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_status ON public.payment_records(status);
CREATE INDEX IF NOT EXISTS idx_payment_records_recorded_user ON public.payment_records(recorded_by_user_id);

-- Compatibility view for existing frontend queries using .from('payments')
CREATE OR REPLACE VIEW public.payments AS
  SELECT * FROM public.payment_records;

-- ====================================================================
-- 11. Entity: activity_logs (Immutable System Audit Trail)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);

-- ====================================================================
-- 12. Attach updated_at triggers to all mutable tables
-- ====================================================================
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER trg_employers_updated_at
  BEFORE UPDATE ON public.employers
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER trg_candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER trg_job_applications_updated_at
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER trg_interviews_updated_at
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER trg_payment_records_updated_at
  BEFORE UPDATE ON public.payment_records
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
