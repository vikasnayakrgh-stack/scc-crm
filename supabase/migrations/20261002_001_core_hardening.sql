-- ====================================================================
-- SCC CRM Migration 001: Core Hardening & Indexes
-- Date: 2026-10-02
-- Classification: Additive & Non-Destructive
-- ====================================================================

-- 1. Create updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Additive columns for candidates table (Safe: IF NOT EXISTS)
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS registration_fee_paid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

-- 3. Additive columns for jobs table
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS employer_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

-- 4. High-performance operational indexes
CREATE INDEX IF NOT EXISTS idx_candidates_mobile ON public.candidates(mobile);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON public.candidates(status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON public.candidates(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_jobs_location ON public.jobs(location);

CREATE INDEX IF NOT EXISTS idx_interviews_scheduled ON public.interviews(scheduled_time) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_interviews_candidate_job ON public.interviews(candidate_id, job_id);

CREATE INDEX IF NOT EXISTS idx_call_logs_candidate ON public.call_logs(candidate_id, timestamp DESC);

-- 5. Attach updated_at triggers
DROP TRIGGER IF EXISTS trigger_candidates_updated_at ON public.candidates;
CREATE TRIGGER trigger_candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS trigger_jobs_updated_at ON public.jobs;
CREATE TRIGGER trigger_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ====================================================================
-- ROLLBACK INSTRUCTIONS:
-- DROP TRIGGER IF EXISTS trigger_candidates_updated_at ON public.candidates;
-- DROP TRIGGER IF EXISTS trigger_jobs_updated_at ON public.jobs;
-- DROP INDEX IF EXISTS idx_candidates_mobile;
-- DROP INDEX IF EXISTS idx_candidates_status;
-- DROP INDEX IF EXISTS idx_jobs_status;
-- DROP INDEX IF EXISTS idx_interviews_scheduled;
-- ====================================================================
