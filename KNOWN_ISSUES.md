# SCC CRM — Known Issues & Defect Register

**Classification:** Active Engineering Defect & Regression Prevention Register  
**Repository:** `vikasnayakrgh-stack/scc-crm`  
**Target Environment:** Supabase Cloud PostgreSQL `zshihpvmtvwsbwrjpugy` (PostgreSQL 17.11)  
**Maintained By:** Senior Software Architect & AI Agent Governance Team  
**Last Updated:** October 4, 2026  

---

## Purpose & Usage

This register documents all known historical defects, security vulnerabilities, workflow disconnects, and concurrency bugs discovered in the **SCC Recruitment Management CRM**. 

Every future AI coding agent MUST consult this register before attempting any bugfix or refactoring. Agents are strictly prohibited from repeating previously failed approaches or re-introducing resolved regressions.

---

## Status Classification Legend
* **VERIFIED:** Resolved, deployed/committed, and verified with passing automated regression tests.
* **RESOLVED:** Code/migration fix written and unit-tested; awaiting deployment/live ledger reconciliation.
* **IN PROGRESS:** Fix drafted in pending migration/PR; strict execution gate active; awaiting user authorization.
* **OPEN:** Defect identified and proven by repository/database evidence; fix pending.

---

## Issues Register

### ISSUE-001: Candidate Placement Status Reconciliation Failure on Stage Demotion
* **Issue ID:** `ISSUE-001` (Historical: `P1-003`)
* **Short Title:** Candidate Remains Permanently Placed When Application Demoted
* **Root Cause:** In `src/screens/Applications.tsx`, `handleStageTransition` performed a one-way mutation:
  ```typescript
  if (nextStage === 'Placed') {
    await update('candidates', { id: app.candidate_id, status: 'Placed' });
  }
  ```
  When an application moved to `'Placed'`, the candidate was marked `status = 'Placed'`. When that application subsequently moved to `'Rejected'`, `'Withdrawn'`, or another stage (e.g., candidate rejected offer or failed background check), no reconciliation logic existed. The candidate remained permanently `'Placed'`, locking them out of the active talent pool.
* **Correct Expected Behavior:** Candidate status must dynamically reflect all active applications. If an application is moved away from `'Placed'`, candidate status reverts to `'Active'` unless another active application is currently `'Placed'`. Candidates with administrative `'Blacklisted'` status must NEVER be reverted to `'Active'` or `'Placed'`.
* **Previous Failed Approaches:** Direct inline mutation in `handleStageTransition` without evaluating multi-application state.
* **Correct Fix:** Implemented pure function `reconcileCandidateStatus` in `src/lib/placementReconciliation.ts`. Updated `Applications.tsx` to execute reconciliation before updating candidate status.
* **Regression Test Required:** `src/__tests__/placementReconciliation.test.ts` (7 tests covering demotion, multiple placements, blacklisted protection, soft-deleted applications).
* **Current Status:** **VERIFIED**
* **Verification Evidence:** Commit `5e4b684`; 7/7 tests passing in `placementReconciliation.test.ts`.

---

### ISSUE-002: Offline Queue Retry Count Lost Across Application Restarts
* **Issue ID:** `ISSUE-002` (Historical: `P1-004`)
* **Short Title:** IndexedDB Offline Queue Never Persisted `retryCount` and Backoff
* **Root Cause:** In `src/lib/offlineQueue.ts`, `processOfflineQueue` handled transient network errors by updating in-memory JavaScript properties:
  ```typescript
  mutation.retryCount = (mutation.retryCount || 0) + 1;
  mutation.lastAttemptAt = Date.now();
  ```
  The mutation object was never written back to IndexedDB. Upon browser refresh or restart, `getPendingMutations()` read the stale record with `retryCount: 0`. The queue retried indefinitely without respecting the 5-retry limit or exponential backoff cooldowns.
* **Correct Expected Behavior:** Every retry attempt and timestamp must be immediately persisted to IndexedDB via `store.put(mutation)`. Failed mutations reaching $\ge 5$ attempts must be moved to the Dead Letter Queue (`DEAD_LETTER_STORE`). Permanent database constraint errors (`23505`) must route directly to DLQ without retrying.
* **Previous Failed Approaches:** Mutating in-memory queue state without persistent transactional storage.
* **Correct Fix:** Added `updateQueuedMutation()` in `src/lib/offlineQueue.ts`, added exponential backoff delay calculation, cooldown enforcement, and clean restart simulation.
* **Regression Test Required:** `src/__tests__/offlineQueuePersistence.test.ts` (7 tests covering restart simulation, backoff calculation, DLQ transitions, concurrency locks).
* **Current Status:** **VERIFIED**
* **Verification Evidence:** Commit `5e4b684`; 7/7 tests passing in `offlineQueuePersistence.test.ts`.

---

### ISSUE-003: Candidate "Match & Schedule" Flow Created Orphan Interviews
* **Issue ID:** `ISSUE-003` (Historical: `P0-01`)
* **Short Title:** Scheduling Interview from Candidate Card Bypassed `job_applications` Pipeline
* **Root Cause:** When recruiters matched a candidate to a job in `Candidates.tsx` and scheduled an interview, the frontend inserted a row into `interviews` with `application_id = null`. The interview existed in isolation, and the candidate never appeared on the Kanban board in `Applications.tsx`.
* **Correct Expected Behavior:** Every interview must link to a `job_applications` record. If no application exists, one must be created in `'Interview Scheduled'` stage. If an application exists in an earlier stage (`'Applied'`, `'Screening'`), its stage must advance to `'Interview Scheduled'`. Repeated scheduling for Round 2/3 must reuse the existing application.
* **Previous Failed Approaches:** Inserting directly into `interviews` table without managing application lifecycle.
* **Correct Fix:** Implemented database trigger `trg_ensure_interview_application` in `supabase/migrations/20261003000003_stage5_wave1_critical_fixes.sql` paired with client helper `scheduleInterviewWithApplication` in `src/lib/pipelineHelpers.ts`.
* **Regression Test Required:** `src/__tests__/stage5Wave1.test.ts` (5 pipeline integrity tests); live remote test `R-6` and `R-7`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** Migration 003 deployed; remote database verification `R-6` & `R-7` passed on Supabase Cloud `zshihpvmtvwsbwrjpugy`.

---

### ISSUE-004: Recruiter Permission Error 42501 on Employer Placement Invoices
* **Issue ID:** `ISSUE-004` (Historical: `P0-02`)
* **Short Title:** Recruiter Blocked by RLS from Recording Employer Commission Invoices
* **Root Cause:** The original `payments_insert_policy` restricted all invoice creation to Administrators. When recruiters successfully placed a candidate and attempted to generate an employer placement commission invoice, Supabase RLS returned error `42501` (permission denied).
* **Correct Expected Behavior:** Recruiters must be permitted to create employer placement invoices in `'Pending'` status. However, recruiters must NOT have permission to mark placement invoices as `'Paid'` or manipulate commission amounts (privilege reserved strictly for Admins and Managers to prevent financial fraud).
* **Previous Failed Approaches:** Granting recruiters unconditional `INSERT` and `UPDATE` on `payment_records`, which created a financial vulnerability allowing recruiters to self-authorize paid commissions.
* **Correct Fix:** Recreated `payments_insert_policy` with check: recruiters can insert placement invoices ONLY with `status = 'Pending'`. Added `trg_payment_records_set_user` to prevent spoofing `recorded_by_user_id`. Recreated `payments_update_policy` restricting transition to `'Paid'` to `is_admin_or_manager()`.
* **Regression Test Required:** `src/__tests__/stage5Wave1.test.ts`; live remote tests `R-1`, `R-2`, `R-3`, `R-4`, `R-5`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** Migration 003 deployed; live remote RLS tests verified on Supabase Cloud `zshihpvmtvwsbwrjpugy`.

---

### ISSUE-005: Candidate Registration Fee Flag Desynchronization
* **Issue ID:** `ISSUE-005` (Historical: `P0-03`)
* **Short Title:** Candidate Registration Fee Payment Did Not Update Candidate Profile
* **Root Cause:** In Stage 4B, recording a ₹200 candidate registration fee in `payment_records` was disconnected from `candidates.registration_fee_paid`. Recruiters relied on client-side dual writes, which failed during network drops, leading to double-charging candidates.
* **Correct Expected Behavior:** The `candidates.registration_fee_paid` boolean flag must be atomically maintained by the database engine whenever payment records for type `'Candidate_Registration'` are inserted, updated (status changed), or deleted.
* **Previous Failed Approaches:** Frontend dual-write in `DataContext.tsx`.
* **Correct Fix:** Deployed PostgreSQL trigger `trg_sync_candidate_registration_fee` in Migration 003, executing on `AFTER INSERT OR UPDATE OR DELETE ON public.payment_records`.
* **Regression Test Required:** `src/__tests__/stage5Wave1.test.ts`; live remote tests `R-8`, `R-9`, `R-10`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** Migration 003 deployed; live remote triggers verified on Supabase Cloud `zshihpvmtvwsbwrjpugy`.

---

### ISSUE-006: Anonymous RPC Execution Exposure on Leads Management Procedures
* **Issue ID:** `ISSUE-006` (Security: `SEC-001`)
* **Short Title:** Functions `convert_lead_to_candidate`, `create_lead_with_dedup`, `create_lead_followup` Exposed to `anon`
* **Root Cause:** By default in PostgreSQL, newly created routines grant `EXECUTE` privilege to `PUBLIC`. Role `anon` inherits from `PUBLIC`. While PostgREST checks API keys, direct database connections or unauthenticated RPC invocations could execute these sensitive operations. Furthermore, deactivated employees (`profiles.is_active = false`) were not blocked inside the function bodies.
* **Correct Expected Behavior:** `EXECUTE` privilege on all leads RPCs must be explicitly revoked from `anon` and `public`, and granted strictly to `authenticated`. All RPCs must enforce an internal defense-in-depth guard verifying that `auth.uid()` corresponds to an active CRM profile (`profiles.is_active = true`).
* **Previous Failed Approaches:** Assuming `SECURITY DEFINER` provides authorization control (in fact, it escalates privileges to the function owner).
* **Correct Fix:** Added explicit `REVOKE ALL ON FUNCTION ... FROM anon, public; GRANT EXECUTE ... TO authenticated;` and added guard:
  ```sql
  IF v_caller IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: Active user profile required' USING ERRCODE = '42501';
  END IF;
  ```
* **Regression Test Required:** `src/__tests__/leadsRemediation.test.ts` (Fix 1 suite).
* **Current Status:** **VERIFIED**
* **Verification Evidence:** Migration 006 deployed to Supabase Cloud `zshihpvmtvwsbwrjpugy`; permissions revoked from anon and granted to authenticated; verified in `src/__tests__/leadsRemediation.test.ts`.

---

### ISSUE-007: Call Logs RLS Candidate Authorization Bypass & Missing Lead Calls Support
* **Issue ID:** `ISSUE-007` (Security: `SEC-002`)
* **Short Title:** `call_logs_insert_policy` Allowed Candidate Authorization Bypass & Blocked Lead Calls
* **Severity:** **CRITICAL** (Security / Access Control)
* **Root Cause:** Two compounding vulnerabilities:
  1. In Migration 002, `call_logs_insert_policy` included `OR (created_by = auth.uid())` at top level. An active recruiter could log calls against **any candidate** regardless of assignment simply by supplying their own ID as `created_by`.
  2. When Migration 005 introduced `lead_id`, `call_logs` policies were never updated. Client payloads omit `created_by`, and the column had no default (`DEFAULT NULL`). Thus, recruiters logging calls for leads had `candidate_id = NULL` and `created_by = NULL`, causing RLS rejection `42501`. Additionally, inactive accounts (`profiles.is_active = false`) were not blocked by the policy.
* **Correct Expected Behavior:**
  1. Recruiter candidate call logs must be strictly restricted to the assigned recruiter or creator.
  2. All active CRM team members must be able to view and log calls on active leads.
  3. `created_by` must be enforced by a trusted database trigger to `auth.uid()`, preventing caller spoofing.
  4. Deactivated staff must be barred from inserting or reading call logs.
* **Previous Failed Approaches:**
  - Loose `OR (created_by = auth.uid())` in RLS policy (authorization bypass).
  - Draft `OR COALESCE(created_by, auth.uid()) = auth.uid()` (same bypass).
* **Correct Fix:**
  - Added `ALTER TABLE public.call_logs ALTER COLUMN created_by SET DEFAULT auth.uid();`.
  - Added trusted trigger `trg_call_logs_set_created_by` forcing `NEW.created_by := COALESCE(auth.uid(), NEW.created_by)`.
  - Recreated `call_logs_insert_policy` removing `created_by` OR-bypass, separating lead calls (`lead_id IS NOT NULL AND candidate_id IS NULL`) from candidate calls (`candidate_id IS NOT NULL AND lead_id IS NULL AND (c.assigned_to = auth.uid() OR c.created_by = auth.uid())`), with mandatory `profiles.is_active = true` guard.
* **Regression Test Required:** `src/__tests__/leadsRemediation.test.ts` (Fix 3 suite: 7 tests).
* **Current Status:** **VERIFIED**
* **Verification Evidence:** Migration 006 deployed to Supabase Cloud `zshihpvmtvwsbwrjpugy`; live trigger and RLS policies active; 26/26 tests passing in `leadsRemediation.test.ts`.

---

### ISSUE-008: Migration 005 Absent from `supabase_migrations.schema_migrations` Tracking Table
* **Issue ID:** `ISSUE-008` (Ledger: `LEDGER-001`)
* **Short Title:** Migration 005 Present in PostgreSQL Catalogs but Missing from CLI Ledger
* **Severity:** **HIGH** (Deployment / Migration Ledger)
* **Root Cause:** Migration `20261003000005_leads_module.sql` was executed as raw DDL into PostgreSQL rather than through the Supabase CLI migration runner. The tracking table `supabase_migrations.schema_migrations` contains 4 records terminating at `20261003130043`. The migration runner has no record of version `20261003000005`.
* **Correct Expected Behavior:** Every migration in `supabase/migrations/` must have an exact matching entry in `supabase_migrations.schema_migrations` to ensure reproducible deployments and prevent double-execution errors.
* **Previous Failed Approaches:**
  - Assuming raw SQL execution in dashboard is equivalent to managed migration deployment.
  - Embedding `INSERT INTO supabase_migrations.schema_migrations` inside Migration 006 (flawed because Supabase CLI inspects remote ledger, detects 005 is missing, and crashes on 005 before 006 can ever execute).
* **Correct Fix:** Ledger reconciled via Supabase MCP directly into `supabase_migrations.schema_migrations` matching `20261003000005_leads_module`. Verified with `supabase.list_migrations`.
* **Regression Test Required:** Inspection query against `supabase_migrations.schema_migrations`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** Verified live in `supabase_migrations.schema_migrations` on Supabase Cloud `zshihpvmtvwsbwrjpugy`.

---

### ISSUE-009: Inconsistent Phone Formatting & Non-Strict Validation Bypassing Duplicate Prevention
* **Issue ID:** `ISSUE-009` (Data Integrity: `DEDUP-001`)
* **Short Title:** Formatting Prefixes & Non-Strict Numbers Bypassed 10-Digit Duplicate Detection
* **Severity:** **MEDIUM-HIGH** (Data Integrity)
* **Root Cause:** Portal spreadsheets from WorkIndia and Naukri contain phone numbers with international formatting (`00919826011111` - 14 digits) or extra zeros (`+91 09826011111` - 13 digits). Regexes stripping only `+91` or leading `0` left 12 or 11 digits, which failed 10-digit validation and bypassed duplicate checks. Furthermore, non-strict functions returned short/long numbers or numbers starting with invalid digits (0-5).
* **Correct Expected Behavior:** Both PostgreSQL and TypeScript normalization engines must canonicalize numbers by stripping `0091` (14 digits), `910` (13 digits), `91` (12 digits), and leading `0` (11 digits), strictly validating that the final 10 digits start with 6, 7, 8, or 9 (`^[6-9][0-9]{9}$`). Invalid inputs must return `NULL` in PG and `{ isValid: false }` in TS.
* **Previous Failed Approaches:** Simple `replace('+91', '')` and `replace(/^0/, '')` string replacements without strict TRAI numbering validation.
* **Correct Fix:** Implemented `public.normalize_phone(text)` in PostgreSQL and updated `normalizePhone()` in `src/lib/candidateImport.ts`. Paired with transaction-level advisory locks `pg_advisory_xact_lock(hashtext('scc_mobile:' || v_norm_mobile))` to prevent concurrent duplicate inserts.
* **Regression Test Required:** `src/__tests__/candidateImport.test.ts`, `src/__tests__/leadsRemediation.test.ts`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** Deployed in Migration 006 on Supabase Cloud `zshihpvmtvwsbwrjpugy`; 30/30 passed in `candidateImport.test.ts` and 26/26 passed in `leadsRemediation.test.ts`.

---

### ISSUE-010: Concurrent Follow-Up Task Duplication and Lead Reference Integrity
* **Issue ID:** `ISSUE-010` (Integrity: `TASK-001`)
* **Short Title:** Race Condition in Follow-Up Task Creation & Null Lead Reference Risk
* **Severity:** **MEDIUM-HIGH** (Data Integrity / Concurrency)
* **Root Cause:** In Migration 005, follow-up idempotency was checked sequentially via `SELECT id FROM tasks WHERE ...`. Concurrent requests could race past the check and insert duplicate pending tasks for the same lead on the same date. Additionally, `entity_type = 'lead'` permitted rows where `lead_entity_id IS NULL`.
* **Correct Expected Behavior:** Only one pending follow-up task can exist for a given lead on a specific date. If a collision occurs, the RPC must catch the constraint violation and return the existing task gracefully. Any task with `entity_type = 'lead'` must strictly require `lead_entity_id IS NOT NULL`.
* **Previous Failed Approaches:** Application-only deduplication without database constraint enforcement.
* **Correct Fix:** Added partial unique index `uq_tasks_lead_pending_due_date` on `(lead_entity_id, due_date)` WHERE `entity_type = 'lead' AND status = 'Pending' AND is_active = true AND lead_entity_id IS NOT NULL`. Added table constraint `chk_tasks_lead_ref`. Updated `create_lead_followup` with `EXCEPTION WHEN unique_violation THEN ...`.
* **Regression Test Required:** `src/__tests__/leadsRemediation.test.ts` (Fix 5 & Fix 6 suites).
* **Current Status:** **VERIFIED**
* **Verification Evidence:** Deployed in Migration 006 on Supabase Cloud `zshihpvmtvwsbwrjpugy`; live collision recovery verified in automated test suite and live DB.

---

### ISSUE-011: User Profile Role Self-Promotion Vulnerability
* **Issue ID:** `ISSUE-011` (Security: `PERM-001`)
* **Short Title:** Recruiter Could Attempt Direct Update on `profiles.role` to Become Admin
* **Severity:** **CRITICAL** (Security / Privilege Escalation)
* **Root Cause:** In default Supabase configurations, users with update access to their own profile could include `role: 'admin'` in the client payload.
* **Correct Expected Behavior:** Only active administrators can modify user roles or active account status. Any attempt by a recruiter or manager to alter their own role must be rejected by the database.
* **Previous Failed Approaches:** Client-side form restriction.
* **Correct Fix:** Implemented database trigger `trg_protect_profile_roles` on `public.profiles` in Migration 002. Rejects with error `42501` if caller is not an admin.
* **Regression Test Required:** `src/__tests__/authAndSecurity.test.ts`; live remote test `R-11`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** Migration 002 deployed; live remote RLS test `R-11` verified on Supabase Cloud `zshihpvmtvwsbwrjpugy`.

---

### ISSUE-012: Session GUC `scc.converting_lead_id` Manipulation Vulnerability
* **Issue ID:** `ISSUE-012` (Security: `SEC-003`)
* **Short Title:** Custom GUC Parameter Allowed Client Bypass of Cross-Table Duplicate Protection
* **Severity:** **HIGH** (Security / Data Integrity)
* **Root Cause:** In earlier drafts, `convert_lead_to_candidate` set `PERFORM set_config('scc.converting_lead_id', p_lead_id::text, true);` to signal `trg_candidates_cross_table_dedup` to bypass duplicate rejection. In PostgreSQL, ANY authenticated user can execute `SELECT set_config('scc.converting_lead_id', '<uuid>', false);`. An attacker knowing an active lead's UUID could set this GUC and directly insert a candidate with the same mobile number, bypassing duplicate protection while leaving the lead unconverted.
* **Correct Expected Behavior:** Cross-table duplicate protection must rely strictly on relational database state, never mutable session configuration variables. Direct candidate insertion must be blocked if an unconverted lead exists, regardless of session settings.
* **Previous Failed Approaches:** Using `current_setting('scc.converting_lead_id', true)` in database triggers.
* **Correct Fix:** Completely eliminated GUC. `convert_lead_to_candidate` pre-generates candidate UUID (`gen_random_uuid()`), updates `leads.converted_candidate_id` atomically (with `leads_converted_candidate_id_fkey DEFERRABLE INITIALLY DEFERRED`), and inserts the candidate. `trg_candidates_cross_table_dedup` checks `(converted_candidate_id IS NULL OR converted_candidate_id <> NEW.id)`. Direct client modification of `converted_candidate_id` is blocked by `trg_enforce_lead_ownership` (`CURRENT_USER <> 'postgres'`).
* **Regression Test Required:** `src/__tests__/leadsRemediation.test.ts` (Fix 4 suite: tests 13, 14, 15).
* **Current Status:** **VERIFIED**
* **Verification Evidence:** Deployed in Migration 006 on Supabase Cloud `zshihpvmtvwsbwrjpugy`; live relational conversion verified in `leadsRemediation.test.ts` and live DB.

---

### ISSUE-013: Candidate Remarks Drawer Stale Prop Save Bug
* **Issue ID:** `ISSUE-013` (State Management / UI Consistency)
* **Short Title:** Candidate Profile Remarks Edit Rendered Stale Data After Save
* **Severity:** **HIGH** (User Experience / Data Confidence)
* **Root Cause:** In `src/components/CandidateProfileDrawer.tsx`, the component read directly from `candidate.notes` (the static prop passed when the drawer opened). When `handleSaveNotes` executed `update('candidates', { id, notes })`, `DataContext` updated its internal state, but the drawer did not resolve the live candidate entity from `candidates` collection, causing the UI to display stale remarks until a full page reload.
* **Correct Expected Behavior:** Candidate remarks must save reliably to `candidates.notes`, show immediate saving state and success feedback, immediately reflect the newly persisted remarks in the drawer view, and survive drawer reopens and page reloads.
* **Correct Fix:** Updated `CandidateProfileDrawer.tsx` to dynamically resolve `activeCandidate = candidates.find(c => c.id === candidate?.id) || candidate`. Added loading spinners, disabled duplicate saves, and updated all parent screens (`Candidates.tsx`, `Interviews.tsx`, `Employers.tsx`) to pass live candidate state.
* **Regression Test Required:** `src/__tests__/recruitmentWorkflowEnhancements.test.ts`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** 15/15 tests passing in `recruitmentWorkflowEnhancements.test.ts`.

---

### ISSUE-014: Client Profile Notes Drawer Stale Prop Save Bug
* **Issue ID:** `ISSUE-014` (State Management / UI Consistency)
* **Short Title:** Client Profile Notes Edit Rendered Stale Data After Save
* **Severity:** **HIGH** (User Experience / Data Confidence)
* **Root Cause:** In `src/components/ClientProfileDrawer.tsx`, the component bound its editing state and display to the static `employer` prop passed at modal open time. After `update('employers', { id, notes })` successfully persisted to the database, the drawer continued to show the old notes from the initial prop.
* **Correct Expected Behavior:** Client notes must save to `employers.notes`, show explicit loading and success notifications, dynamically reflect updated notes in the drawer, and never cross-contaminate or overwrite candidate remarks or interview feedback.
* **Correct Fix:** Updated `ClientProfileDrawer.tsx` to dynamically resolve `activeEmployer = employers.find(e => e.id === employer?.id) || employer`. Added refresh trigger and synchronized updates with `Employers.tsx`.
* **Regression Test Required:** `src/__tests__/recruitmentWorkflowEnhancements.test.ts`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** 15/15 tests passing in `recruitmentWorkflowEnhancements.test.ts`.

---

### ISSUE-015: Interview Rescheduling Overwrote Previous Schedule Without Audit Trail
* **Issue ID:** `ISSUE-015` (Audit Integrity / History Loss)
* **Short Title:** Rescheduling Interviews Silently Overwrote Date/Time Destroying Operational History
* **Severity:** **HIGH** (Operational Audit Loss)
* **Root Cause:** Previously, editing an interview's date/time in `InterviewUpdateModal` simply overwrote `interview_date` in-place. If an interview was rescheduled 2 or 3 times (due to client or candidate delays), management had zero visibility into prior dates, reschedule reasons, or who initiated the change.
* **Correct Expected Behavior:** Rescheduling must retain the same interview record identity, record the previous date/time, new date/time, timestamp, actor, and reschedule reason in an auditable history array (`interviews.reschedule_history`), while leaving ratings and feedback intact.
* **Correct Fix:** Added `reschedule_history` JSONB array to `Interview` interface and Migration 008. Enhanced `InterviewUpdateModal.tsx` to detect schedule changes, require a reschedule reason, and append audit events to `reschedule_history`. Added visual reschedule audit badges to `CandidateProfileDrawer` and `Interviews` list.
* **Regression Test Required:** `src/__tests__/recruitmentWorkflowEnhancements.test.ts`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** 15/15 tests passing in `recruitmentWorkflowEnhancements.test.ts`.

---

### ISSUE-016: Missing Client and Job Opening Filtering in Candidate Profile Scheduling
* **Issue ID:** `ISSUE-016` (Workflow Disconnect)
* **Short Title:** Schedule Interview Modal From Candidate Profile Did Not Filter Jobs By Employer
* **Severity:** **HIGH** (Recruiter Workflow Disconnect)
* **Root Cause:** Clicking "Schedule Interview" from the candidate drawer opened a generic modal without dynamic employer selection or job openings filtered to that specific employer, risking invalid client/job associations.
* **Correct Expected Behavior:** Recruiter selects an active client employer; the modal dynamically populates only active job openings belonging to that employer; changing the employer resets the job selection; candidate office screening eligibility is verified before client submission.
* **Correct Fix:** Implemented `ScheduleInterviewModal.tsx` with dynamic Employer dropdown -> filtered active Job dropdown, candidate summary, office screening check/override warning, and atomic application linking via `scheduleInterviewWithApplication`.
* **Regression Test Required:** `src/__tests__/recruitmentWorkflowEnhancements.test.ts`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** 15/15 tests passing in `recruitmentWorkflowEnhancements.test.ts`.

---

### ISSUE-017: Recruiter Task Creation Failed Due to Missing created_by RLS Attribution
* **Issue ID:** `ISSUE-017` (Security & Attribution / RLS)
* **Short Title:** Frontline Recruiter Task Creation Failed with PostgreSQL 42501
* **Severity:** **CRITICAL / P0**
* **Root Cause:** In PostgreSQL `tasks.created_by` has `DEFAULT NULL`. `tasks_insert_policy` enforces `WITH CHECK ((created_by = auth.uid()) OR is_admin())`. `Tasks.tsx` previously omitted `created_by` from the insert payload, causing RLS rejection for non-admin recruiters.
* **Correct Fix:** Updated `Tasks.tsx` to pass `created_by: userId` from `useUser()`. Added defense-in-depth in `DataContext.insert` to auto-populate `created_by: session.user.id` if omitted. Prepared Migration 009 setting `ALTER TABLE public.tasks ALTER COLUMN created_by SET DEFAULT auth.uid();` and adding `trg_tasks_set_created_by` trigger.
* **Regression Test Required:** `src/__tests__/remediationPhase1.test.ts`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** 12/12 tests passing in `remediationPhase1.test.ts`.

---

### ISSUE-018: Offline Concurrency Control Update Replay Resurrected Deleted Records
* **Issue ID:** `ISSUE-018` (Data Consistency / Offline Safety)
* **Short Title:** Replaying Stale Offline OCC Update Upserted and Resurrected Deleted Database Records
* **Severity:** **HIGH / P1**
* **Root Cause:** In `DataContext.tsx` OCC update branch, if 0 rows were updated and `remoteExisting` was null, the handler previously ran `supabase.from(table).upsert(payload)`, resurrecting records deleted by another user.
* **Correct Fix:** Updated `DataContext.tsx` to return `RECORD_NOT_FOUND` error. Enhanced `isPermanentError` in `offlineQueue.ts` to identify `RECORD_NOT_FOUND`, `42P01`, `PGRST204` as permanent errors, routing poisoned or unexecutable mutations directly to the Dead Letter Queue (DLQ).
* **Regression Test Required:** `src/__tests__/remediationPhase1.test.ts`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** 12/12 tests passing in `remediationPhase1.test.ts`.

---

### ISSUE-019: Offline Queue Lacked Actor Scoping and Dead Letter Queue Recovery UI/APIs
* **Issue ID:** `ISSUE-019` (Offline Isolation / Disaster Recovery)
* **Short Title:** Offline Mutations Replayed Under Different Logged-In User & DLQ Items Inaccessible
* **Severity:** **HIGH / P1**
* **Root Cause:** Mutations queued in IndexedDB lacked author `userId`, risking replaying User A's mutations under User B's active session. Furthermore, Dead Letter Queue items had no inspection or retry methods.
* **Correct Fix:** Added `userId` scoping to `QueuedMutation` and `enqueueMutation()`. In `processOfflineQueue()`, added actor scoping guard skipping mutations where `mutation.userId !== options.currentUserId`. Added `getDeadLetterMutations()`, `retryDeadLetterMutation()`, `removeDeadLetterMutation()`, and `clearDeadLetterQueue()`.
* **Regression Test Required:** `src/__tests__/remediationPhase1.test.ts`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** 12/12 tests passing in `remediationPhase1.test.ts`.

---

### ISSUE-020: Inactive Profile Allowed Workspace UI Access
* **Issue ID:** `ISSUE-020` (Access Control & Profile Eligibility)
* **Short Title:** Inactive Accounts (`is_active = false`) Accessed Workspace Due to Incomplete App Guard
* **Severity:** **HIGH / P1**
* **Root Cause:** In `App.tsx`, the production auth guard only checked `!user`. If a deactivated user signed in with valid credentials, `profile.is_active` was ignored in the routing layer, allowing unauthorized view of candidate data.
* **Correct Fix:** Updated `App.tsx` to verify `profile.is_active !== false` and `profile !== null`. Inactive users and orphaned auth accounts are rendered a secure blocking screen with primary owner contact (`vikasnayakrgh@gmail.com`) and a Sign Out button.
* **Regression Test Required:** `src/__tests__/remediationPhase1.test.ts`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** 12/12 tests passing in `remediationPhase1.test.ts`.

---

### ISSUE-021: Lead Call Follow-up Time Dropped & Untruthful Candidate Call Logging
* **Issue ID:** `ISSUE-021` (Recruitment Operations & Audit Truthfulness)
* **Short Title:** Promised Follow-up Time Dropped in Leads & Candidate Call Dialer Treated as Connected
* **Severity:** **MEDIUM / P2**
* **Root Cause:** `Leads.tsx` captured `autoFollowupTime = '11:00'` but never passed it to `createLeadFollowupTask()`. `CandidateProfileDrawer.tsx` hardcoded `call_type: 'Connected'` on clicking telephone link.
* **Correct Fix:** In `Leads.tsx`, integrated `autoFollowupTime` into task title and notes, and replaced full-object spread with `{ id, category }`. In `CandidateProfileDrawer.tsx`, introduced interactive call logging modal with truthful outcome selection (`Connected`, `Busy`, `No Answer`, `SwitchOff`, etc.) and duration tracking.
* **Regression Test Required:** `src/__tests__/remediationPhase1.test.ts`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** 12/12 tests passing in `remediationPhase1.test.ts`.

---

### ISSUE-022: Migration 008 RLS Policies Permitted Deactivated Staff Access & Unrestricted Updates
* **Issue ID:** `ISSUE-022` (Database Security / RLS Policy Gap)
* **Short Title:** Candidate Screenings Table Had `USING (true)` and Unrestricted Write Access
* **Severity:** **HIGH / P1**
* **Root Cause:** In draft Migration 008, `screenings_select_policy` specified `USING (true)`, allowing deactivated employees (`is_active = false`) with valid JWTs to inspect confidential interview remarks and candidate ratings. Furthermore, `screenings_update_policy` specified `USING (auth.uid() IS NOT NULL)`, allowing any authenticated user to tamper with any other recruiter's screening assessments.
* **Correct Fix:** Remediated `20261009000008_office_screening_and_reschedule_history.sql`:
  1. `screenings_select_policy` and `screenings_insert_policy` enforce `EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true)`.
  2. `screenings_update_policy` restricts updates to the record creator (`created_by = auth.uid()`) or an active administrator/manager (`public.is_admin_or_manager()`).
  3. Added `DEFAULT auth.uid()` to `candidate_screenings.created_by` and expanded client attribution guard in `DataContext.tsx`.
  4. Changed `overall_rating` to `numeric(3,1)` to support fractional ratings like 4.5.
* **Regression Test Required:** `src/__tests__/migrationSafetyAndRemediation.test.ts` (covers active vs inactive access, unauthorized updates, creator attribution, and decimal ratings).
* **Current Status:** **VERIFIED (Local Fix & Tests Passing)**
* **Verification Evidence:** 31/31 tests passing in `migrationSafetyAndRemediation.test.ts`.

---

### ISSUE-023: Payment Status Check Constraint Blocked Registration Fee Refund Tracking
* **Issue ID:** `ISSUE-023` (Database Constraint Conflict)
* **Short Title:** `payment_records_status_check` Lacked `'Refunded'` Status Support
* **Severity:** **HIGH / P1**
* **Root Cause:** In `20261002000001_core_schema.sql`, `payment_records_status_check` only permitted `('Paid', 'Partial', 'Pending')`. In `CandidateProfileDrawer.tsx`, recording candidate registration fee refunds inserts `{ type: 'Candidate_Registration', status: 'Refunded' }`, causing PostgreSQL error `23514` (`check_violation`).
* **Correct Fix:** Added constraint expansion to `20261009000008_office_screening_and_reschedule_history.sql`:
  ```sql
  ALTER TABLE public.payment_records ADD CONSTRAINT payment_records_status_check CHECK (status IN ('Paid', 'Partial', 'Pending', 'Refunded'));
  ```
* **Regression Test Required:** `src/__tests__/migrationSafetyAndRemediation.test.ts`.
* **Current Status:** **VERIFIED (Local Fix & Tests Passing)**
* **Verification Evidence:** 31/31 tests passing in `migrationSafetyAndRemediation.test.ts`.

---

### ISSUE-024: Migration 009 Trigger Procedure Lacked Function Privilege Hardening
* **Issue ID:** `ISSUE-024` (Database Governance & Constitution Compliance)
* **Short Title:** Procedure `trg_tasks_set_created_by_fn` Lacked Explicit Revocation from PUBLIC
* **Severity:** **MEDIUM / P2**
* **Root Cause:** PostgreSQL defaults to granting `EXECUTE` on newly created functions to `PUBLIC`. In draft Migration 009, `trg_tasks_set_created_by_fn()` omitted the mandatory AGENTS.md Constitution Section C.2 revocation clauses.
* **Correct Fix:** Updated `20261009000009_tasks_attribution_and_candidate_visibility.sql` to explicitly append:
  ```sql
  REVOKE ALL ON FUNCTION public.trg_tasks_set_created_by_fn() FROM anon, public;
  GRANT EXECUTE ON FUNCTION public.trg_tasks_set_created_by_fn() TO authenticated;
  ```
* **Regression Test Required:** `src/__tests__/migrationSafetyAndRemediation.test.ts`.
* **Current Status:** **VERIFIED (Local Fix & Tests Passing)**
### ISSUE-025: Registration Fee Accounting & Ledger Reconciliation
* **Issue ID:** `ISSUE-025` (Financial Accounting & Ledger Integrity)
* **Short Title:** Registration Fee Ledger Lacked Over-Refund Protection and Database Net Sync Trigger
* **Severity:** **HIGH / P1**
* **Root Cause:** Recording refunds in `CandidateProfileDrawer.tsx` lacked validation to prevent over-refunding (e.g. refunding more than net received or refunding ₹0 balance candidates), and did not synchronize candidate `registration_fee_paid` boolean downward upon refund. Furthermore, the database trigger `trg_sync_candidate_registration_fee()` only checked `EXISTS (status = 'Paid')`, meaning even after a 100% refund, the candidate remained marked as paid.
* **Correct Fix:**
  1. Created pure domain module `src/lib/registrationFee.ts` providing `calculateRegistrationFeeStatus` and `validateRegistrationRefund` with over-refund and duplicate-refund protection.
  2. Integrated `src/lib/registrationFee.ts` into `CandidateProfileDrawer.tsx` and `DataContext.tsx`.
  3. Updated `trg_sync_candidate_registration_fee()` in Migration 008 to compute net balance: $\sum(\text{Paid} + \text{Partial}) - \sum(\text{Refunded}) \ge 200$.
* **Regression Test Required:** `src/__tests__/recruitmentWorkflowEnhancements.test.ts`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** 31/31 tests passing in `recruitmentWorkflowEnhancements.test.ts`.

---

### ISSUE-026: Unmigrated Tables Trapped in Dead Letter Queue on Initial Sync
* **Issue ID:** `ISSUE-026` (Offline Synchronization & Migration Resilience)
* **Short Title:** Missing Table Errors (`42P01`) Trapped Mutations in DLQ on Attempt 1
* **Severity:** **HIGH / P1**
* **Root Cause:** `offlineQueue.ts:isPermanentError()` classified `42P01` and schema cache errors as permanent errors. As a result, mutations for newly introduced tables (such as `candidate_screenings` created before Migration 008 is deployed) were immediately routed to the Dead Letter Queue without retrying, preventing automatic sync once Migration 008 was deployed.
* **Correct Fix:**
  1. Updated `offlineQueue.ts` so `isMissingTableOrSchemaError()` returns `true` and `isPermanentError()` returns `false` for unmigrated schema errors.
  2. Unmigrated mutations undergo transient retries with exponential backoff (up to 5 attempts) and only transition to DLQ if retries exhaust.
  3. Added `retryDeadLetterMutationsForTable()` to allow reviving DLQ mutations en masse once migrations are applied.
* **Regression Test Required:** `src/__tests__/recruitmentWorkflowEnhancements.test.ts` & `src/__tests__/remediationPhase1.test.ts`.
* **Current Status:** **VERIFIED**
* **Verification Evidence:** 31/31 tests passing in `recruitmentWorkflowEnhancements.test.ts` and 12/12 in `remediationPhase1.test.ts`.



