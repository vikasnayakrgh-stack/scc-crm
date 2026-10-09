-- ====================================================================
-- SCC CRM Migration 007: Interview Intelligence, Rating & Remarks
-- Target: Supabase Project zshihpvmtvwsbwrjpugy (PostgreSQL 17.11)
-- Scope:
--   - Add rating (integer, 1-5) to public.interviews
--   - Add next_action (text) to public.interviews
--   - Expand interviews status check constraint to include 'Rejected' and 'On Hold'
--   - Add performance indexes on rating and status
-- Safety: Additive, backward-compatible, non-destructive, preserving existing RLS and data.
-- Governance Gate: STRICTLY PREPARED - PENDING EXPLICIT USER APPROVAL TO EXECUTE.
-- ====================================================================

-- 1. Additive columns on public.interviews
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS rating integer CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  ADD COLUMN IF NOT EXISTS next_action text DEFAULT NULL;

-- 2. Expand status check constraint on public.interviews
DO $$
BEGIN
  -- Drop existing status check constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'interviews_status_check' 
      AND conrelid = 'public.interviews'::regclass
  ) THEN
    ALTER TABLE public.interviews DROP CONSTRAINT interviews_status_check;
  END IF;

  -- Add updated status check constraint allowing 'Scheduled', 'Done', 'NoShow', 'Selected', 'Rejected', 'On Hold'
  ALTER TABLE public.interviews
    ADD CONSTRAINT interviews_status_check
    CHECK (status IN ('Scheduled', 'Done', 'NoShow', 'Selected', 'Rejected', 'On Hold'));
END $$;

-- 3. Performance indexes for reporting and filtering
CREATE INDEX IF NOT EXISTS idx_interviews_rating ON public.interviews(rating) WHERE is_active = true AND rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interviews_status ON public.interviews(status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_interviews_candidate_scheduled ON public.interviews(candidate_id, scheduled_time DESC) WHERE is_active = true;
