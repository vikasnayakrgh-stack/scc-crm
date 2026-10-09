# 🛡️ SCC CRM — Final Production Migration Preflight Report

**Document Version:** 4.0.0 (Remediated Preflight Standard)  
**Target Database:** Supabase Cloud PostgreSQL `zshihpvmtvwsbwrjpugy` (PostgreSQL 17.11)  
**Target Repository:** `vikasnayakrgh-stack/scc-crm`  
**Production Application:** [scc-crm.vercel.app](https://scc-crm.vercel.app/)  
**Auditor Roles:** Principal PostgreSQL Security Engineer & Supabase Production DBA  
**Governance Standard:** [AGENTS.md](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/AGENTS.md) Mandatory Constitution  
**Preflight Timestamp:** October 9, 2026  
**Execution Boundary:** **LOCAL REMEDIATION COMPLETED. ZERO REMOTE MUTATIONS EXECUTED.**

---

## 📋 1. Executive Preflight Verdicts (Post-Remediation)

Following local code and migration remediation, both migration files on disk have been patched, hardened, and verified with 230 passing automated tests:

| Migration Identifier | Name | Final Verdict | Core Evidence & Justification | Pre-Execution Gate |
|:---|:---|:---:|:---|:---|
| **Migration 008** | `20261009000008_office_screening_and_reschedule_history.sql` | 🟢 **READY FOR DEPLOYMENT**<br>*(Remediated & Verified)* | • **Active Profile Check:** `screenings_select_policy`, `screenings_insert_policy`, and `screenings_update_policy` all strictly verify `profiles.is_active = true`. Deactivated staff blocked.<br>• **Update Restriction:** Updates restricted to record creator (`created_by = auth.uid()`) or admin/manager.<br>• **Attribution Default:** `created_by` has `DEFAULT auth.uid()`; client-side `DataContext.insert` also auto-populates `created_by`.<br>• **Decimal Rating Type:** `overall_rating` set to `numeric(3,1)` supporting fractional ratings (`4.5`).<br>• **Refund Constraint:** `payment_records_status_check` safely expanded to include `'Refunded'`. | **Approval Gate:** Requires explicit human owner authorization before applying remotely. |
| **Migration 009** | `20261009000009_tasks_attribution_and_candidate_visibility.sql` | 🟢 **READY FOR DEPLOYMENT**<br>*(Remediated & Verified)* | • **Native Attribution:** `ALTER TABLE tasks ALTER COLUMN created_by SET DEFAULT auth.uid()` natively fixes P0 `ISSUE-017`.<br>• **Trigger Anti-Spoofing:** `trg_tasks_set_created_by` is `SECURITY DEFINER` with locked search path; zero conflicting triggers.<br>• **Privilege Hardening:** Explicit `REVOKE ALL ON FUNCTION ... FROM anon, public; GRANT EXECUTE ... TO authenticated;` added per AGENTS.md Section C.2.<br>• **Candidate Visibility:** `candidates_select_policy` implements Invariant 1 without widening `UPDATE` or `DELETE`.<br>• **Sequencing Control:** Must execute immediately after Migration 008 in the same deployment window. | **Approval Gate:** Requires explicit human owner authorization before applying remotely. |

---

## 🔬 2. Independent Audit Findings by Agent Delegation

### 2.1 Agent A: Audit of Migration 008 (Schema, Constraints & RLS)
**File Remediated:** [supabase/migrations/20261009000008_office_screening_and_reschedule_history.sql](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/supabase/migrations/20261009000008_office_screening_and_reschedule_history.sql)

#### A. Table `public.candidate_screenings`
1. **Primary & Foreign Keys:**
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`: Valid.
   - `candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE`: Valid. Verified that `public.candidates(id)` is the primary key.
   - `created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid()`: Valid. Verified that `public.profiles(id)` is the primary key.
2. **Attribution Column Default:**
   - Remediated with `DEFAULT auth.uid()`. When the frontend or API inserts a screening record without specifying `created_by`, PostgreSQL automatically binds the authenticated user ID.
3. **Data Type Correction (`overall_rating`):**
   - Remediated to `overall_rating numeric(3,1) CHECK (overall_rating IS NULL OR (overall_rating >= 1.0 AND overall_rating <= 5.0))`. Supports fractional ratings like `4.5` without integer syntax errors.
4. **Indexes:**
   - `idx_screenings_candidate_id`, `idx_screenings_time`, `idx_screenings_result` all use partial predicate `WHERE is_active = true`. Valid for active records.
5. **Hardened RLS Policies (AGENTS.md Constitution Compliant):**
   - **`screenings_select_policy`:**
     ```sql
     USING (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true));
     ```
     Deactivated staff (`is_active = false`) are strictly blocked.
   - **`screenings_insert_policy`:**
     ```sql
     WITH CHECK (
       auth.uid() IS NOT NULL 
       AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true)
       AND (created_by IS NULL OR created_by = auth.uid() OR public.is_admin())
     );
     ```
     Non-admin users cannot forge screening creator attribution.
   - **`screenings_update_policy`:**
     ```sql
     USING (
       auth.uid() IS NOT NULL 
       AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true)
       AND (created_by = auth.uid() OR public.is_admin_or_manager())
     );
     ```
     Screening updates are restricted to the author or operational managers/administrators.
   - **Permissions Grant:** `GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_screenings TO authenticated;`.
     Zero DELETE policies exist. Under PostgreSQL RLS, lack of a DELETE policy defaults to DENY ALL for authenticated users.

#### B. Column Additions & Existing Constraints
1. **`candidates.screening_status`:** Additive column with default `'Pending'` and check constraint `('Pending', 'Scheduled', 'Pass', 'Hold', 'Fail')`.
2. **`interviews.reschedule_history`:** Additive column with default `'[]'::jsonb`.
3. **`tasks_status_check` Constraint:** Expanded to support Kanban states: `('Pending', 'To Do', 'In Progress', 'Waiting', 'Completed', 'Cancelled')`. Live query verified zero existing row violations.
4. **`payment_records_status_check` Constraint:**
   - Expanded to `CHECK (status IN ('Paid', 'Partial', 'Pending', 'Refunded'))`.
   - Supports registration fee refund tracking in [CandidateProfileDrawer.tsx:84](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/src/components/CandidateProfileDrawer.tsx#L84) without PostgreSQL constraint violation `23514`.

---

### 2.2 Agent B: Audit of Migration 009 (Trigger, Attribution & Candidate Visibility)
**File Remediated:** [supabase/migrations/20261009000009_tasks_attribution_and_candidate_visibility.sql](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/supabase/migrations/20261009000009_tasks_attribution_and_candidate_visibility.sql)

#### A. Column Default on `tasks.created_by`
- `ALTER TABLE public.tasks ALTER COLUMN created_by SET DEFAULT auth.uid();`
- Evaluated natively at PostgreSQL engine level during INSERT. Eliminates RLS failure when client payloads omit `created_by`.

#### B. Anti-Spoofing Trigger & Function (`trg_tasks_set_created_by`)
- **Trigger Definition:** `BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.trg_tasks_set_created_by_fn();`
- **Security Definer & Locked Search Path:**
  ```sql
  CREATE OR REPLACE FUNCTION public.trg_tasks_set_created_by_fn()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  BEGIN
    IF NEW.created_by IS NULL THEN
      NEW.created_by := auth.uid();
    ELSIF NEW.created_by <> auth.uid() AND NOT public.is_admin() THEN
      NEW.created_by := auth.uid(); -- Forcibly override spoofed attribution
    END IF;
    RETURN NEW;
  END;
  $$;
  ```
- **Privilege Hardening:** Appended explicit revocation and grant per [AGENTS.md](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/AGENTS.md) Section C.2:
  ```sql
  REVOKE ALL ON FUNCTION public.trg_tasks_set_created_by_fn() FROM anon, public;
  GRANT EXECUTE ON FUNCTION public.trg_tasks_set_created_by_fn() TO authenticated;
  ```
- **Trigger Isolation:** Verified on live catalog that zero `BEFORE INSERT` triggers exist on `public.tasks`.

#### C. Candidate Visibility Policy Audit (Invariant 1 Compliance)
- **Implemented Policy:**
  ```sql
  CREATE POLICY candidates_select_policy ON public.candidates
    FOR SELECT TO authenticated
    USING (
      auth.uid() IS NOT NULL 
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true)
    );
  ```
- **Permissions Width Audit:**
  - `candidates_update_policy` is untouched and restricted to creator/assigned/manager.
  - Zero DELETE policies exist on `public.candidates`; candidate deletion remains universally blocked.

---

### 2.3 Agent C: Audit of Application Compatibility, Sequencing & Rollback
**Components Audited:** [DataContext.tsx](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/src/context/DataContext.tsx), [CandidateProfileDrawer.tsx](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/src/components/CandidateProfileDrawer.tsx), [offlineQueue.ts](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/src/lib/offlineQueue.ts)

#### A. Application Compatibility & Defense-in-Depth
- In `DataContext.tsx:395`, the client-side attribution guard was expanded:
  ```typescript
  if ((table === 'tasks' || table === 'candidate_screenings') && !fullRecord.created_by && currentUserId) {
    fullRecord.created_by = currentUserId;
  }
  ```
- Screenings and tasks are protected at both the client runtime and database engine level.

#### B. Migration Sequencing & Dependencies
- **Order of Execution:** Must be strictly **Migration 008 followed by Migration 009** in a single transactional maintenance window.

#### C. Rollback Implications & Destructive Classifications
- **Destructive Changes Identified:**
  - Dropping `candidate_screenings` permanently expunges post-migration screening assessments.
  - Dropping `reschedule_history` permanently deletes reschedule logs.
  - Converting `'Refunded'` payments to `'Pending'` alters financial ledgers.
  - *Instruction:* Rollback scripts must **NOT** be executed unless disaster recovery is explicitly required.

---

## 🔒 3. Final Remediated SQL Migration Files (Local Disk State)

### 3.1 Migration 008 (`supabase/migrations/20261009000008_office_screening_and_reschedule_history.sql`)
```sql
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

CREATE INDEX IF NOT EXISTS idx_screenings_candidate_id ON public.candidate_screenings(candidate_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_screenings_time ON public.candidate_screenings(screening_time DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_screenings_result ON public.candidate_screenings(result) WHERE is_active = true;

ALTER TABLE public.candidate_screenings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_screenings TO authenticated;

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
END $$;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS screening_status text DEFAULT 'Pending' 
  CHECK (screening_status IS NULL OR screening_status IN ('Pending', 'Scheduled', 'Pass', 'Hold', 'Fail'));

ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS reschedule_history jsonb DEFAULT '[]'::jsonb;

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
```

---

### 3.2 Migration 009 (`supabase/migrations/20261009000009_tasks_attribution_and_candidate_visibility.sql`)
```sql
-- ============================================================================
-- SCC CRM Migration 009: Tasks Attribution Defense & Candidate Visibility Hardening
-- Target Database: Supabase Cloud PostgreSQL (zshihpvmtvwsbwrjpugy)
-- Version: 20261009000009
-- ============================================================================

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
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_tasks_set_created_by_fn() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.trg_tasks_set_created_by_fn() TO authenticated;

DROP TRIGGER IF EXISTS trg_tasks_set_created_by ON public.tasks;
CREATE TRIGGER trg_tasks_set_created_by
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_tasks_set_created_by_fn();
```

---

## 📊 4. Evidence Classification Ledger

### 4.1 Verified Facts (Empirically Proven on Live Database `zshihpvmtvwsbwrjpugy`)
1. **Migration Ledger State:** Remote `schema_migrations` terminates at `20261009071718` (`interview_intelligence_and_remarks`). Migrations 008 and 009 are 100% unapplied.
2. **Missing Catalog Objects:** `public.candidate_screenings` table does not exist. Columns `candidates.screening_status` and `interviews.reschedule_history` do not exist.
3. **Current Constraints:** `tasks_status_check` currently permits only `('Pending', 'Completed', 'Cancelled')`. `payment_records_status_check` currently permits only `('Paid', 'Partial', 'Pending')`.
4. **Current Default:** `tasks.created_by` column default is `NULL`.
5. **Trigger Isolation:** Zero `BEFORE INSERT` triggers exist on `public.tasks`; only `trg_tasks_updated_at` exists on `BEFORE UPDATE`.
6. **Authorization Functions:** `is_admin()` and `is_admin_or_manager()` are `STABLE SECURITY DEFINER` procedures with search path `public, pg_catalog`. They evaluate `public.profiles` because `auth.users.raw_app_meta_data` omits `'role'`.
7. **Candidate Deletion Immutability:** `public.candidates` has zero DELETE policies. Deletions are universally blocked for authenticated users.
8. **Auth Users:** Exactly two accounts exist: `admin@sccjobs.in` (admin, active) and `telecaller@sccjobs.in` (recruiter, active). Owner `vikasnayakrgh@gmail.com` is absent from both `auth.users` and `public.profiles`.

### 4.2 Test & Compilation Evidence (100% Passing)
1. **Automated Vitest Suite:** **230/230 tests passed across 15 test files (100% pass rate)** in 3.74s (`npm test -- --run`).
   - `src/__tests__/migrationSafetyAndRemediation.test.ts`: **31 passed**
   - `src/__tests__/remediationPhase1.test.ts`: 12 passed
   - `src/__tests__/candidateImport.test.ts`: 30 passed
   - `src/__tests__/leadsRemediation.test.ts`: 26 passed
   - `src/__tests__/leadsModule.test.ts`: 26 passed
   - `src/__tests__/stage5Wave1.test.ts`: 16 passed
   - `src/__tests__/stage5Wave2a.test.ts`: 15 passed
   - `src/__tests__/recruitmentWorkflowEnhancements.test.ts`: 15 passed
   - `src/__tests__/recruitmentWorkflowIntelligence.test.ts`: 15 passed
   - `src/__tests__/authFlow.test.ts`: 9 passed
   - `src/__tests__/recruitment.test.ts`: 8 passed
   - `src/__tests__/authAwareSync.test.ts`: 7 passed
   - `src/__tests__/offlineQueuePersistence.test.ts`: 7 passed
   - `src/__tests__/placementReconciliation.test.ts`: 7 passed
   - `src/__tests__/authAndSecurity.test.ts`: 6 passed
2. **Strict TypeScript Compilation:** **0 errors across 2,387 modules** (`tsc --noEmit`).
3. **Production Vite Bundle Build:** **Successfully compiled in 29.91s** (`vite build`).

---

## 🔍 5. Exact Post-Migration Verification Queries

Execute these read-only queries in the Supabase SQL Editor immediately following deployment:

```sql
-- 1. Verify candidate_screenings table existence and RLS status
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'candidate_screenings';
-- Expected: 1 row | rowsecurity = true

-- 2. Verify candidate_screenings RLS policies evaluate active profiles
SELECT policyname, qual, with_check FROM pg_policies WHERE tablename = 'candidate_screenings';
-- Expected: 3 policies (select, insert, update) all checking profiles.is_active = true

-- 3. Verify new columns exist
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND ((table_name = 'candidates' AND column_name = 'screening_status')
    OR (table_name = 'interviews' AND column_name = 'reschedule_history'));
-- Expected: 2 rows returned

-- 4. Verify expanded check constraints
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname IN ('tasks_status_check', 'payment_records_status_check');
-- Expected: tasks_status_check includes 6 Kanban states; payment_records_status_check includes 'Refunded'

-- 5. Verify tasks attribution default and anti-spoofing trigger
SELECT column_name, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'created_by';
-- Expected: column_default = 'auth.uid()'

SELECT tgname, proname FROM pg_trigger t JOIN pg_proc p ON t.tgfoid = p.oid WHERE tgname = 'trg_tasks_set_created_by';
-- Expected: 1 row | proname = 'trg_tasks_set_created_by_fn'
```

---

## 🔄 6. Rollback Playbook (Disaster Recovery Only)

```sql
BEGIN;

-- 1. Revert tasks attribution trigger and default
DROP TRIGGER IF EXISTS trg_tasks_set_created_by ON public.tasks;
DROP FUNCTION IF EXISTS public.trg_tasks_set_created_by_fn();
ALTER TABLE public.tasks ALTER COLUMN created_by DROP DEFAULT;

-- 2. Sanitize tasks before reverting constraint (MANDATORY - PREVENTS ERROR 23514)
UPDATE public.tasks 
SET status = 'Pending', notes = COALESCE(notes || ' ', '') || '[Reverted from ' || status || ']'
WHERE status IN ('To Do', 'In Progress', 'Waiting');

-- 3. Revert tasks_status_check
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check 
  CHECK (status IN ('Pending', 'Completed', 'Cancelled'));

-- 4. Revert payment_records_status_check
UPDATE public.payment_records SET status = 'Pending' WHERE status = 'Refunded';
ALTER TABLE public.payment_records DROP CONSTRAINT IF EXISTS payment_records_status_check;
ALTER TABLE public.payment_records ADD CONSTRAINT payment_records_status_check 
  CHECK (status IN ('Paid', 'Partial', 'Pending'));

-- 5. Revert candidate & interview additive columns
ALTER TABLE public.interviews DROP COLUMN IF EXISTS reschedule_history;
ALTER TABLE public.candidates DROP COLUMN IF EXISTS screening_status;

-- 6. Drop candidate_screenings table (CAUTION: PERMANENT DATA LOSS)
DROP TABLE IF EXISTS public.candidate_screenings CASCADE;

-- 7. Restore previous candidate visibility policy
DROP POLICY IF EXISTS candidates_select_policy ON public.candidates;
CREATE POLICY candidates_select_policy ON public.candidates
  FOR SELECT TO authenticated
  USING (
    is_admin_or_manager() 
    OR (assigned_to = auth.uid()) 
    OR (created_by = auth.uid()) 
    OR ((owner_id IS NOT NULL) AND (owner_id = (SELECT profiles.display_name FROM profiles WHERE profiles.id = auth.uid())))
  );

COMMIT;
```

---

## 🏁 7. What Remains Before Production Execution

To deploy safely, the following sequence remains:
1. **Owner Action (Dashboard):** Invite `vikasnayakrgh@gmail.com` via Supabase Auth Dashboard (**Authentication** → **Users** → **Invite User**).
2. **Apply Patched Migration 008:** Run Section 3.1 of this report in Supabase Cloud SQL Editor.
3. **Apply Patched Migration 009:** Run Section 3.2 of this report immediately following 008.
4. **Post-Migration Verification:** Run Section 5 verification queries in Supabase Cloud SQL Editor.
5. **Git Push & Deployment:** Authorize git commit and push to `origin main` to trigger Vercel deployment.

*Awaiting explicit owner authorization before any remote write operations.*
