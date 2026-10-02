-- ====================================================================
-- SCC CRM Migration 002: Core Recruitment Entities
-- Tables: employers, applications, tasks, payments
-- Classification: Additive & Non-Destructive
-- ====================================================================

-- 1. Table: employers (Hiring Companies & Corporate Clients)
CREATE TABLE IF NOT EXISTS public.employers (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  company_name text NOT NULL,
  contact_person text NOT NULL,
  phone text NOT NULL,
  email text,
  location text NOT NULL,
  address text,
  industry text,
  status text CHECK (status IN ('Active', 'Inactive', 'Prospect')) DEFAULT 'Active',
  notes text,
  is_active boolean DEFAULT true
);

-- Foreign Key: jobs.employer_id -> employers.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_jobs_employer'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT fk_jobs_employer
      FOREIGN KEY (employer_id) REFERENCES public.employers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Table: applications (Candidate-Job Pipeline Stages)
CREATE TABLE IF NOT EXISTS public.applications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  stage text CHECK (stage IN (
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
  )) DEFAULT 'Applied',
  notes text,
  offered_salary numeric,
  joining_date timestamp with time zone,
  placed_date timestamp with time zone,
  assigned_to text,
  is_active boolean DEFAULT true,
  CONSTRAINT unique_candidate_job_application UNIQUE (candidate_id, job_id)
);

-- 3. Table: tasks (Recruiter Follow-up & Work Queue)
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  due_date date NOT NULL,
  title text NOT NULL,
  notes text,
  entity_type text CHECK (entity_type IN ('candidate', 'employer', 'application')) NOT NULL,
  entity_id text NOT NULL,
  assigned_to text NOT NULL,
  priority text CHECK (priority IN ('Low', 'Medium', 'High')) DEFAULT 'Medium',
  status text CHECK (status IN ('Pending', 'Completed', 'Cancelled')) DEFAULT 'Pending',
  completed_at timestamp with time zone,
  is_active boolean DEFAULT true
);

-- 4. Table: payments (Candidate Registration Fees & Placement Commission Invoices)
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  type text CHECK (type IN ('Candidate_Registration', 'Employer_Placement', 'Other')) NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text CHECK (payment_method IN ('UPI', 'Cash', 'Bank_Transfer', 'Cheque')) NOT NULL,
  status text CHECK (status IN ('Paid', 'Partial', 'Pending')) DEFAULT 'Paid',
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  employer_id uuid REFERENCES public.employers(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  reference_no text,
  notes text,
  due_date date,
  paid_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  recorded_by text NOT NULL,
  is_active boolean DEFAULT true
);

-- 5. Operational Indexes
CREATE INDEX IF NOT EXISTS idx_employers_status ON public.employers(status);
CREATE INDEX IF NOT EXISTS idx_applications_stage ON public.applications(stage);
CREATE INDEX IF NOT EXISTS idx_tasks_due_assigned ON public.tasks(assigned_to, due_date) WHERE status = 'Pending';
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- 6. Attach updated_at triggers
CREATE TRIGGER trigger_employers_updated_at
  BEFORE UPDATE ON public.employers
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER trigger_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Enable Realtime for new operational tables
ALTER PUBLICATION supabase_realtime ADD TABLE employers, applications, tasks, payments;

-- ====================================================================
-- ROLLBACK INSTRUCTIONS:
-- ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS payments, tasks, applications, employers;
-- DROP TABLE IF EXISTS public.payments;
-- DROP TABLE IF EXISTS public.tasks;
-- DROP TABLE IF EXISTS public.applications;
-- ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS fk_jobs_employer;
-- DROP TABLE IF EXISTS public.employers;
-- ====================================================================
