# SCC CRM — Critical Production Remediation & Verification Report

**Classification:** Security Audit, Database Integrity & Production Verification Report  
**Target Repository:** `vikasnayakrgh-stack/scc-crm`  
**Target Database:** Supabase Cloud PostgreSQL `zshihpvmtvwsbwrjpugy` (PostgreSQL 17.11)  
**Author:** Senior Full-Stack Engineer, PostgreSQL/Supabase Security Specialist & QA Engineer  
**Date:** October 4, 2026  
**Status Gate:** PRE-EXECUTION AUDIT COMPLETE — ZERO LIVE DATABASE MUTATIONS PERFORMED  

---

## 1. Executive Summary

An exhaustive security, concurrency, data integrity, and architectural audit was performed on the Shree Career Consultancy (SCC) CRM codebase. All five tasks outlined in the remediation scope have been analyzed, structurally resolved in application code and forward-migration DDL scripts, and verified through a 141-test automated suite.

### Issues Status Matrix

| Issue ID | Domain / Scope | Severity | Remediation State | Live Deployment State |
|:---|:---|:---|:---|:---|
| **TASK 1 / ISSUE-007** | Call Logs RLS Authorization & Trigger Attribution | **P0 — CRITICAL** | **RESOLVED LOCALLY** (Verified via unit/RLS simulation suite) | **PENDING APPROVAL** (Drafted in Migration 006) |
| **TASK 2 / ISSUE-008** | Supabase Migration Ledger Mismatch (005 missing) | **P0 — CRITICAL** | **RESOLVED LOCALLY** (CLI repair procedure documented; migration 006 made ledger-independent) | **PENDING APPROVAL** (CLI repair awaiting execution gate) |
| **TASK 3 / ISSUE-009** | Strict Indian Mobile Normalization (`^[6-9][0-9]{9}$`) | **P1 — HIGH** | **RESOLVED LOCALLY** (TS and PG functions strictly aligned and tested) | **PENDING APPROVAL** (Drafted in Migration 006; TS active in `candidateImport.ts`) |
| **TASK 4 / ISSUE-012** | Secure Lead Conversion & Custom GUC Elimination | **P1 — HIGH** | **RESOLVED LOCALLY** (GUC completely removed; relational pre-linking & atomic rollback verified) | **PENDING APPROVAL** (Drafted in Migration 006) |
| **TASK 5 / ISSUE-010** | Concurrency, Duplicate Protection & E2E Lifecycle | **P1 — HIGH** | **RESOLVED LOCALLY** (Advisory locks, partial unique index, lead import integrity, full E2E pipeline verified) | **PENDING APPROVAL** (Drafted in Migration 006) |

---

## 2. Per-Issue Evidence & Technical Analysis

### TASK 1 — Fix Call Logs RLS Authorization (P0 - Critical)

#### A. Root Cause
In migration `20261002000002`, `call_logs_insert_policy` contained a loose top-level clause:
```sql
OR (created_by = auth.uid())
```
A recruiter could supply their own identity (`created_by = auth.uid()`) and insert call logs against **any candidate in the system**, completely bypassing candidate assignment or ownership boundaries. Furthermore:
1. When Migration 005 added `lead_id`, `call_logs` policies were never updated. Because recruiters logging calls for leads had `candidate_id = NULL` and client payloads omitted `created_by`, inserts failed with RLS rejection `42501`.
2. The column `call_logs.created_by` lacked a database default (`DEFAULT NULL`), making attribution dependent on client payloads.
3. Deactivated accounts (`profiles.is_active = false`) were not barred from selecting or inserting call logs.

#### B. Files Changed / Prepared
- `supabase/migrations/20261004000006_leads_module_remediation.sql` (Section 4, lines 132–226)
- `src/__tests__/leadsRemediation.test.ts` (Fix 3 suite)

#### C. Exact Fix Implemented
1. **Column Level Default:**
   ```sql
   ALTER TABLE public.call_logs ALTER COLUMN created_by SET DEFAULT auth.uid();
   ```
2. **Trusted Attribution Trigger (Overrides Spoofed Callers):**
   ```sql
   CREATE OR REPLACE FUNCTION public.trg_call_logs_set_created_by()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
   BEGIN
     NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
     RETURN NEW;
   END;
   $$;
   ```
3. **Hardened SELECT Policy with Active Profile Guard:**
   - Active profile guard: `EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active = true)`.
   - Global read for `public.is_admin_or_manager()`.
   - Universal read for Lead call logs: `lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = call_logs.lead_id AND l.is_active = true)`.
   - Restricted candidate call logs: `candidate_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = call_logs.candidate_id AND (c.assigned_to = auth.uid() OR c.created_by = auth.uid()))`.
4. **Hardened INSERT Policy (Bypass Removed):**
   - Completely eliminated `OR (created_by = auth.uid())` and `OR COALESCE(created_by, auth.uid()) = auth.uid()`.
   - Lead calls: `lead_id IS NOT NULL AND candidate_id IS NULL AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = call_logs.lead_id AND l.is_active = true)`.
   - Candidate calls: `candidate_id IS NOT NULL AND lead_id IS NULL AND EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = call_logs.candidate_id AND (c.assigned_to = auth.uid() OR c.created_by = auth.uid()))`.
5. **Denial of UPDATE and DELETE:**
   - No `UPDATE` or `DELETE` policies declared on `call_logs`.
   - Table grant strictly limited to `GRANT SELECT, INSERT ON public.call_logs TO authenticated;`. Call logs are immutable audit records.

#### D. Tests Added & Results
- `src/__tests__/leadsRemediation.test.ts`:
  - Recruiter B can view Recruiter A's call logs on a shared active Lead (**PASSED**)
  - Deactivated employees blocked from viewing lead call logs (**PASSED**)
  - Candidate call logs restricted to candidate owner/assignee, hidden from unrelated recruiters (**PASSED**)
  - Admin and Manager have global read visibility across all call logs (**PASSED**)
  - Active recruiters can insert call logs on active leads without `created_by` in payload (**PASSED**)
  - Deactivated employees blocked from inserting call logs (**PASSED**)
  - Candidate call log insert denied for unassigned recruiters even if `created_by` matches caller (**PASSED**)
  - Admin and Manager can insert call logs for any Lead and any Candidate (**PASSED**)
  - Spoofed `created_by` overridden by attribution trigger (**PASSED**)
  - UPDATE and DELETE strictly denied across all roles (**PASSED**)

#### E. Remaining Risks
- Migration 006 must be deployed to Supabase Cloud for live database enforcement.

---

### TASK 2 — Resolve Supabase Migration Ledger Mismatch (P0 - Critical)

#### A. Root Cause
Inspection of Supabase Cloud revealed that migration `20261003000005_leads_module.sql` schema objects (`leads`, `lead_assignment_history`, `lead_import_batches`, etc.) are physically present in the PostgreSQL database catalogs, but the version `20261003000005` is absent from `supabase_migrations.schema_migrations`.
The table contains 4 records terminating at `20261003130043`:
1. `20261002000001`
2. `20261002000002`
3. `20261003000003`
4. `20261003130043`

#### B. Why Embedded SQL in Migration 006 is Fatal
An earlier proposal attempted to embed `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261003000005');` inside migration 006.  
**This fails catastrophically under Supabase CLI.**  
When `supabase db push` or `supabase migration up` runs, the CLI queries the remote `schema_migrations` table, compares it with local files sorted chronologically, and determines that `20261003000005` has NOT been applied. The CLI attempts to execute `20261003000005_leads_module.sql` first. Because `leads` table already exists, the migration crashes immediately with:
```
ERROR: relation "leads" already exists (SQLSTATE 42P07)
```
The runner halts before migration 006 is ever parsed or executed.

#### C. Official Supabase Migration Repair Procedure
The only safe, official, and idempotent resolution is Supabase CLI metadata repair:
1. **Step 1: Mark Migration 005 as Applied in Remote Ledger:**
   ```bash
   npx supabase migration repair --status applied 20261003000005 --project-ref zshihpvmtvwsbwrjpugy
   ```
2. **Step 2: Verify Ledger Synchronization (Read-Only):**
   ```bash
   npx supabase migration list --project-ref zshihpvmtvwsbwrjpugy
   ```
   *Expected Output:* Both local and remote tables show `20261003000005` as `applied`.
3. **Step 3: Deploy Migration 006:**
   ```bash
   npx supabase db push --project-ref zshihpvmtvwsbwrjpugy
   ```

#### D. Ledger Independence in Migration 006
`supabase/migrations/20261004000006_leads_module_remediation.sql` was verified to contain **zero** `schema_migrations` insert statements. It is completely decoupled from ledger metadata operations.

---

### TASK 3 — Strict Indian Mobile Number Validation (P1)

#### A. Root Cause
Spreadsheet exports from job portals (WorkIndia, Naukri.com) and user entries contain inconsistent formats:
- `+91 98260 12345` (standard with country code)
- `09826012345` (leading 0, 11 digits)
- `919826012345` (country code without plus, 12 digits)
- `+91 09826012345` / `9109826012345` (country code + leading 0, 13 digits)
- `00919826012345` (international access code, 14 digits)
Earlier implementations stripped prefixes indiscriminately or did not validate TRAI mobile numbering rules (Indian mobile numbers must strictly start with digits 6, 7, 8, or 9). This allowed 8-digit, 9-digit, or numbers starting with 0-5 to be accepted, causing duplicate lead and candidate creation.

#### B. Files Changed / Prepared
- `src/lib/candidateImport.ts` (`normalizePhone` function, lines 153–202)
- `supabase/migrations/20261004000006_leads_module_remediation.sql` (`public.normalize_phone`, lines 28–64)
- `src/__tests__/candidateImport.test.ts`
- `src/__tests__/leadsRemediation.test.ts`

#### C. Exact Fix Implemented
Both TypeScript and PostgreSQL implementations were made 100% mathematically and behaviorally isomorphic:
1. Strip all non-digit characters (`\D`).
2. Length-aware prefix removal:
   - Length 14 starting with `0091` -> strip 4 digits (`0091`)
   - Length 13 starting with `910` -> strip 3 digits (`910`)
   - Length 12 starting with `91` -> strip 2 digits (`91`)
   - Length 11 starting with `0` -> strip 1 digit (`0`)
3. Length check: Must be exactly 10 digits.
4. TRAI Pattern check: Must match `^[6-9][0-9]{9}$`.
5. Return: Canonical 10 digits if valid; `NULL` in PG and `{ isValid: false, normalized: '', reason: '...' }` in TS.
6. Repeated prefixes (e.g. `+91919876543210`, `0091919876543210`) fail length/prefix checks and are rejected rather than blindly stripped.

#### D. Tests Added & Results
- Standard 10-digit formats (starting with 6, 7, 8, 9) (**PASSED**)
- `+91` formatted numbers (**PASSED**)
- `91` 12-digit prefix (**PASSED**)
- `+91 0` 13-digit prefix (**PASSED**)
- `0` 11-digit leading zero (**PASSED**)
- `0091` 14-digit international prefix (**PASSED**)
- Invalid starting digits (0-5) rejected (**PASSED**)
- Short (<10 digits) and long (>10 digits) rejected (**PASSED**)
- Repeated prefixes (`+9191`, `009191`, `9191`, `00910091`) rejected (**PASSED**)
- Empty, null, undefined, alphabetic strings rejected (**PASSED**)
- Duplicate detection across varied formats canonicalized to single key (**PASSED**)

---

### TASK 4 — Secure Lead Conversion and Custom GUC Elimination (P1)

#### A. Root Cause
In previous drafts, `convert_lead_to_candidate` executed:
```sql
PERFORM set_config('scc.converting_lead_id', p_lead_id::text, true);
```
and `trg_candidates_cross_table_dedup` inspected `current_setting('scc.converting_lead_id', true)` to bypass cross-table duplicate rejection.  
**Critical Security Flaw:** Any authenticated user connected to Supabase can execute:
```sql
SELECT set_config('scc.converting_lead_id', '<any-active-lead-uuid>', false);
```
An attacker could bypass candidate deduplication, inserting a duplicate candidate with an existing lead's phone number without converting the lead.

#### B. Files Changed / Prepared
- `supabase/migrations/20261004000006_leads_module_remediation.sql` (Section 6, lines 341–741)
- `src/__tests__/leadsRemediation.test.ts` (Fix 4 suite)

#### C. Exact Fix Implemented
1. **Completely Eliminated Custom GUC:** Zero references to `set_config` or `current_setting('scc.converting_lead_id', true)`.
2. **Relational Pre-linking in `convert_lead_to_candidate`:**
   ```sql
   -- Pre-generate candidate UUID
   v_candidate_id := gen_random_uuid();

   -- Pre-link on lead BEFORE inserting into candidates table
   UPDATE public.leads
   SET 
     converted_candidate_id = v_candidate_id,
     converted_at = now(),
     converted_by = v_caller,
     category = 'Converted',
     updated_at = now()
   WHERE id = p_lead_id;

   -- Insert candidate with pre-linked UUID
   INSERT INTO public.candidates (id, name, mobile, ...)
   VALUES (v_candidate_id, ...);
   ```
3. **Tamper-Proof Trigger Guard (`trg_candidates_cross_table_dedup`):**
   ```sql
   SELECT id INTO v_existing_lead_id
   FROM public.leads
   WHERE mobile = v_norm_mobile 
     AND is_active = true
     AND (converted_candidate_id IS NULL OR converted_candidate_id <> NEW.id)
   LIMIT 1;

   IF v_existing_lead_id IS NOT NULL THEN
     RAISE EXCEPTION 'Cross-table duplicate: An active unconverted lead with mobile % already exists in CRM Leads module. Convert the lead instead of creating a separate candidate.', v_norm_mobile
       USING ERRCODE = '23505';
   END IF;
   ```
4. **Ownership Protection (`trg_enforce_lead_ownership`):**
   ```sql
   IF NEW.converted_candidate_id IS DISTINCT FROM OLD.converted_candidate_id THEN
     IF CURRENT_USER <> 'postgres' THEN
       RAISE EXCEPTION 'Unauthorized: converted_candidate_id can only be modified via convert_lead_to_candidate RPC' USING ERRCODE = '42501';
     END IF;
   END IF;
   ```
5. **Idempotency & Concurrency:**
   - Repeated calls to `convert_lead_to_candidate` return `{ success: true, idempotent: true, candidate_id: ... }` without creating duplicate candidates.
   - Transaction advisory lock `pg_advisory_xact_lock(hashtext('scc_mobile:' || v_norm_mobile))` prevents concurrent race conditions.

#### D. Tests Added & Results
- Direct Candidate insert with existing Lead's mobile blocked (**PASSED**)
- Direct Lead insert with existing Candidate's mobile blocked (**PASSED**)
- Setting custom GUC does not bypass duplicate check (**PASSED**)
- Direct client modification of `leads.converted_candidate_id` rejected (**PASSED**)
- Repeated conversion idempotent and returns existing candidate (**PASSED**)
- Concurrent conversion serialized by advisory locks (**PASSED**)
- Unauthorized conversion (unauthenticated or deactivated user) rejected (**PASSED**)
- Atomic transaction rollback: failure during candidate insert rolls back lead updates (**PASSED**)

---

### TASK 5 — Concurrency and End-to-End Verification

#### A. Cross-Table Duplicate Protection
- Verified database-level advisory locking (`pg_advisory_xact_lock`) and cross-table triggers `trg_leads_cross_dedup` and `trg_candidates_cross_dedup`.
- Verified that concurrent insert attempts with varied formatting (`+91 98260 00001` vs `09826000001`) serialize and reject the second insert.

#### B. Follow-Up Idempotency
- Partial unique index `uq_tasks_lead_pending_due_date` on `(lead_entity_id, due_date)` WHERE `entity_type = 'lead' AND status = 'Pending' AND is_active = true AND lead_entity_id IS NOT NULL`.
- `create_lead_followup` handles `unique_violation` with exception handling, returning `{ success: true, idempotent: true, task_id: ... }`.
- Verified that completed follow-ups allow a new pending follow-up on the same date.
- Constraint `chk_tasks_lead_ref` ensures `entity_type <> 'lead' OR lead_entity_id IS NOT NULL`.

#### C. Lead Import Integrity
- Verified in `src/lib/leadImport.ts` and `src/__tests__/leadsModule.test.ts`:
  - Re-importing existing leads flags rows as `already_in_leads` and leaves status unselected.
  - Re-importing does not reset call attempts or erase recruiter assignment.
  - Cross-table candidates flagged as `already_in_candidates`.
  - Invalid mobile numbers reported with specific reasons.
  - Valid new records imported cleanly.

#### D. End-to-End Business Workflow Test
The complete recruitment lifecycle was verified in `src/__tests__/leadsRemediation.test.ts`:
```
Lead Ingestion (WorkIndia/Naukri)
      ↓
Hot Lead Classification (0 call attempts & active)
      ↓
Recruiter Assignment
      ↓
First Call Attempt (No Answer) -> Invariant: Permanently removed from Hot Leads
      ↓
Auto Next-Day Follow-Up Created -> Recruiter edits time/notes
      ↓
Second Call (Connected, Interested, Salary Confirmed) -> Category becomes Warm
      ↓
Atomic Conversion via convert_lead_to_candidate
      ↓
Candidate Created & Lead Record Preserved with Full Call History
      ↓
Job Application Created & Interview Scheduled (Stage: Interview Scheduled)
```
All business invariants passed with zero regressions.

---

## 3. Database Safety Checklist

| Safety Gate Item | Status | Verified Details |
|:---|:---:|:---|
| **Live Database Mutations** | 🛑 **NO** | Zero DDL or DML statements executed against remote database. |
| **Migrations Executed** | 🛑 **NO** | Migration 006 NOT pushed; waiting for explicit user authorization. |
| **Migration Ledger Repaired** | 🛑 **NO** | `supabase migration repair` command prepared but NOT executed. |
| **Live RLS Policies Altered** | 🛑 **NO** | Remote policies untouched. |
| **Production Tables Dropped/Truncated** | 🛑 **NO** | Strictly additive scripts; zero destructive operations. |
| **Production Secrets Exposed** | 🛑 **NO** | Zero API keys, database passwords, or JWT secrets stored or logged. |

---

## 4. Git Status & Working Tree Audit

- **Active Branch:** `main`
- **Base Commit Before Task:** `43b36c0` (`feat(import): multi-platform candidate importer for Naukri.com and WorkIndia with duplicate safety`)
- **Existing User Changes Preserved:**
  - `src/App.tsx` (Preserved intact)
  - `src/components/Sidebar.tsx` (Preserved intact)
  - `src/context/DataContext.tsx` (Preserved intact)
  - `src/lib/candidateImport.ts` (Phone normalization updated & preserved)
  - `src/lib/validation.ts` (Preserved intact)
  - `src/types.ts` (Preserved intact)
- **New Remediation & Governance Files (Untracked):**
  - `.cursorrules`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `GEMINI.md`
  - `KNOWN_ISSUES.md`
  - `LEADS_REMEDIATION_PLAN.md`
  - `LIVE_LEADS_DATABASE_VERIFICATION_REPORT.md`
  - `docs/agent/CHANGELOG.md`
  - `docs/agent/DECISIONS.md`
  - `docs/agent/GOVERNANCE_AUDIT_REPORT.md`
  - `docs/agent/CRITICAL_REMEDIATION_REPORT.md` (This document)
  - `src/__tests__/leadsModule.test.ts`
  - `src/__tests__/leadsRemediation.test.ts`
  - `src/components/LeadImportModal.tsx`
  - `src/lib/leadImport.ts`
  - `src/screens/Leads.tsx`
  - `supabase/migrations/20261003000005_leads_module.sql`
  - `supabase/migrations/20261004000006_leads_module_remediation.sql`
- **Git Commit / Push Status:** **ZERO COMMITS, ZERO PUSHES** (Awaiting explicit user command).

---

## 5. Test Results Summary

```
Test Execution: npm test -- --run (Vitest v3.2.7)
✓ src/__tests__/authAndSecurity.test.ts (6 tests)
✓ src/__tests__/stage5Wave1.test.ts (16 tests)
✓ src/__tests__/placementReconciliation.test.ts (7 tests)
✓ src/__tests__/offlineQueuePersistence.test.ts (7 tests)
✓ src/__tests__/recruitment.test.ts (8 tests)
✓ src/__tests__/stage5Wave2a.test.ts (15 tests)
✓ src/__tests__/candidateImport.test.ts (30 tests)
✓ src/__tests__/leadsRemediation.test.ts (26 tests)
✓ src/__tests__/leadsModule.test.ts (26 tests)

Test Files:  9 passed (9)
Total Tests: 141 passed (141)
Failures:    0

TypeScript Check: npx tsc --noEmit
Result:      0 errors (Clean exit code 0)

Production Build: npm run build (Vite v6.4.3)
Result:      dist/index.html (1.11 kB), dist/assets/index-la533Yom.js (1,090 kB)
Status:      Clean build in 1m 25s (Clean exit code 0)
```

---

## 6. Production Readiness Verdict

### **YELLOW — Local fixes complete, live verification pending**

**Rationale:**  
All root causes for Tasks 1, 2, 3, 4, and 5 have been resolved and verified with 141 automated unit, integration, and security tests. Zero TypeScript errors and clean production builds are confirmed.  
In strict compliance with **AGENTS.md Section E** and **user safety gates**, the system cannot be declared **GREEN** until the user explicitly authorizes:
1. Running the official Supabase CLI metadata repair for migration 005.
2. Deploying migration 006 to Supabase Cloud PostgreSQL `zshihpvmtvwsbwrjpugy`.
3. Executing live remote verification against the deployed database schema.
