-- ====================================================================
-- SCC CRM Migration 004: Stage 5 Wave 2A Candidate Extended Fields
-- Target: Supabase Project zshihpvmtvwsbwrjpugy (PostgreSQL 17.11)
-- Scope:
--   - Add qualification (text)
--   - Add notice_period (text)
--   - Add current_salary (integer, non-negative)
--   - Add source (text)
-- Safety: Additive, backward-compatible, preserving existing RLS and data.
-- ====================================================================

-- 1. Additive columns on public.candidates table
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS qualification text,
  ADD COLUMN IF NOT EXISTS notice_period text,
  ADD COLUMN IF NOT EXISTS current_salary integer DEFAULT 0 CHECK (current_salary >= 0),
  ADD COLUMN IF NOT EXISTS source text;

-- 2. Indexes for search and reporting performance
CREATE INDEX IF NOT EXISTS idx_candidates_qualification ON public.candidates(qualification) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_candidates_notice_period ON public.candidates(notice_period) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_candidates_source ON public.candidates(source) WHERE is_active = true;
