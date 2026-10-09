# 📋 SCC CRM — Remediation Baseline & Evidence Verification Report (SCC_REMEDIATION_BASELINE.md)

**Document Classification:** MANDATORY PRE-REMEDIATION AUDIT & EVIDENCE BASELINE  
**Repository:** `vikasnayakrgh-stack/scc-crm`  
**Target Environment:** Supabase Cloud PostgreSQL `zshihpvmtvwsbwrjpugy` (PostgreSQL 17.11)  
**Primary Owner Requirement:** `vikasnayakrgh@gmail.com`  
**Authoritative Standard:** Principal Software Architect, Security Specialist & Recruitment Operations Systems Analyst  
**Date of Baseline:** October 9, 2026  

---

## 1. Baseline Environment & Quality Gate Verification

| Verification Dimension | Command Executed | Result | Exact Evidence / Metrics |
|:---|:---|:---|:---|
| **Git Working Branch** | `git status -s` | Clean Branch / Uncommitted Diffs | `main` branch. Uncommitted modified: `src/context/DataContext.tsx`, `src/types.ts`. Untracked: `supabase/migrations/20261009000008_office_screening_and_reschedule_history.sql`. |
| **Git Commit Reference** | `git log -n 1 --oneline` | Verified Release Commit | `65c5cd9` (*feat: production release of interview intelligence, drawers, and auth workflows*). |
| **Automated Test Suite** | `npm test -- --run` | **100% PASS (172/172)** | 12 test files passed in 2.56s. All existing placement, dedup, offline queue, and leads tests pass cleanly. |
| **TypeScript Strict Check** | `npm run typecheck` (`tsc --noEmit`) | **0 ERRORS (Code 0)** | Zero type errors across entire codebase. |
| **Vite Production Build** | `npm run build` (`vite build`) | **SUCCESS (18.36s)** | Output: `dist/assets/index-Bu7b_nDr.js` (1,186.86 kB minified / 336.73 kB gzip). |
| **ESLint Static Analysis** | `npm run lint` (`eslint src`) | **16 Errors / 294 Warnings** | Mostly `@typescript-eslint/no-explicit-any` and unused import warnings in legacy files. |
| **Remote Database Ledger** | Supabase `list_migrations` | **7 Applied Migrations** | Versions 001–006 plus Migration 007 (`interview_intelligence_and_remarks`). Migration 008 is **NOT** in the remote ledger. |

---

## 2. Phase 0 Audit Claims Verification Matrix

Each finding from the preliminary technical audits has been empirically evaluated against the live Supabase database catalogs (`zshihpvmtvwsbwrjpugy`) and actual TypeScript source files:

| # | Audit Claim | Status | Live Evidence / Root Cause | Severity |
|:---:|:---|:---:|:---|:---:|
| **1** | Recruiter task creation fails due to `created_by` attribution or RLS | **CONFIRMED** | `public.tasks.created_by` has default `NULL`. `tasks_insert_policy` enforces `WITH CHECK (created_by = auth.uid() OR is_admin_or_manager())`. `Tasks.tsx` line 75 omits `created_by`, and `DataContext.insert` does not inject it. Active recruiters trigger PostgreSQL error `42501` (permission denied). | 🔴 **P0** |
| **2** | Migration 008 is not applied to production database | **CONFIRMED** | Remote `supabase_migrations.schema_migrations` contains 7 rows terminating at `interview_intelligence_and_remarks` (Migration 007). Version `20261009000008` is completely absent from the remote ledger. | 🟠 **P1** |
| **3** | `candidate_screenings` table exists remotely | **CONFIRMED ABSENT** | Remote query `information_schema.tables` for `candidate_screenings` returns empty set `[]`. Table does not exist on Supabase Cloud. | 🟠 **P1** |
| **4** | `interviews.reschedule_history` column exists remotely | **CONFIRMED ABSENT** | Remote query `information_schema.columns` for `reschedule_history` returns empty set `[]`. Column does not exist on Supabase Cloud. | 🟠 **P1** |
| **5** | `tasks_status_check` permits required Kanban states | **CONFIRMED FAILS** | Constraint definition: `CHECK (status IN ('Pending', 'Completed', 'Cancelled'))`. Attempting to save Kanban status `'To Do'`, `'In Progress'`, or `'Waiting'` fails at the database constraint level. | 🟠 **P1** |
| **6** | Owner email `vikasnayakrgh@gmail.com` exists in Supabase Auth & profiles | **CONFIRMED MISSING** | Read-only inspection of `auth.users` shows only `admin@sccjobs.in` and `telecaller@sccjobs.in`. Required owner email does not exist in Auth or `public.profiles`. | 🟠 **P1** |
| **7** | Candidate and client notes persist after reload | **CONFIRMED GAP** | Notes update is restricted by RLS on `employers` (`created_by = auth.uid() OR is_admin_or_manager()`) and `candidates` (`assigned_to = auth.uid() OR created_by = auth.uid()`). Recruiters cannot edit notes on records created by Admin. | 🟠 **P1** |
| **8** | Login, logout, and inactive-account restrictions work correctly | **CONFIRMED GAP** | `App.tsx` (lines 39–41) checks only `if (!user) return <Login />` without checking `profile?.is_active`. Inactive staff (`is_active = false`) can log in and view CRM records. | 🟡 **P2** |
| **9** | Lead call, status, and follow-up operations can partially succeed | **CONFIRMED** | `handleSaveCallLog` in `Leads.tsx` executes 3 separate sequential client-side calls (`recordLeadCall` $\to$ `update('leads')` $\to$ `createLeadFollowupTask`). If follow-up creation fails, the call is recorded but follow-up is silently omitted. | 🟡 **P2** |
| **10** | Selected follow-up time is persisted | **CONFIRMED DEFECT** | `Leads.tsx` lines 331 & 420 captures `autoFollowupTime = '11:00'`, but passes only `due_date: autoFollowupDate` (YYYY-MM-DD) to `createLeadFollowupTask`. Time is dropped completely. | 🟡 **P2** |
| **11** | Interview/application outcome synchronization is correct | **CONFIRMED GAP** | `Interviews.tsx` line 71 and `InterviewUpdateModal.tsx` line 138 only synchronize `if (status === 'Selected')`. If an interview is marked `'Rejected'` or `'NoShow'`, the linked application remains in `'Interview Scheduled'`. | 🟡 **P2** |
| **12** | Client history linked using correct employer ID | **CONFIRMED** | `ClientProfileDrawer.tsx` line 74 matches `j.employer_id === activeEmployer.id` with fallback to `j.company_name`. Valid relational linkage. | 🟢 **P3** |
| **13** | Candidate call actions record truthful outcomes | **CONFIRMED DEFECT** | `CandidateProfileDrawer.tsx` line 267 hardcodes `call_type: 'Connected'` on clicking dialer link, without prompting recruiter for call outcome (Busy, SwitchOff, No Answer). | 🟡 **P2** |
| **14** | Offline replay cannot recreate deleted records or execute under wrong user | **CONFIRMED DEFECT** | `QueuedMutation` lacks `userId` actor attribution (mutations execute under whoever is currently logged in). In `DataContext.tsx` line 212, OCC fallback upserts records if `remoteExisting` is null, resurrecting deleted records. | 🟠 **P1** |

---

## 3. Detailed Baseline Issue Specifications

### Issue BASELINE-01: Recruiter Task Attribution Failure (P0)
* **Severity:** 🔴 **P0** (Core Operations Blocked)
* **Affected Files:**
  * [src/screens/Tasks.tsx](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/src/screens/Tasks.tsx#L75-L85)
  * [src/context/DataContext.tsx](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/src/context/DataContext.tsx#L362-L375)
  * [supabase/migrations/20261002000002_rls_and_security.sql](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/supabase/migrations/20261002000002_rls_and_security.sql#L488)
* **Reproduction:** Log in as `telecaller@sccjobs.in`, open `/tasks`, click "+ New Follow-up", fill title and due date, click "Schedule Task". Toast displays: `new row violates row-level security policy for table "tasks"` (Code 42501).
* **Root Cause:** `tasks.created_by` is nullable with no default. `Tasks.tsx` omits `created_by` from payload. `tasks_insert_policy` rejects `created_by IS NULL` for non-admins.
* **Safe Application Fix:**
  1. In `DataContext.tsx` `insert()`: when `table === 'tasks'`, auto-inject `created_by: user.id` if `created_by` is not provided.
  2. In `Tasks.tsx`: explicitly supply `created_by: userId` from `useUser()` or `useAuth()`.
* **Database Dependency:** A database migration setting `ALTER TABLE public.tasks ALTER COLUMN created_by SET DEFAULT auth.uid();` is recommended as defense-in-depth, but requires approval gate.
* **Approval Required for Code Fix:** No (pure application fix).
* **Approval Required for DDL:** Yes.

---

### Issue BASELINE-02: Unapplied Migration 008 & Silent Queue Dead-Lettering (P1)
* **Severity:** 🟠 **P1** (Data Loss Risk)
* **Affected Files:**
  * [supabase/migrations/20261009000008_office_screening_and_reschedule_history.sql](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/supabase/migrations/20261009000008_office_screening_and_reschedule_history.sql)
  * [src/context/DataContext.tsx](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/src/context/DataContext.tsx#L384-L392)
* **Reproduction:** In `CandidateProfileDrawer.tsx`, submit an office preliminary screening. `DataContext.insert` catches `42P01` and diverts record into IndexedDB. Background queue processor retries 5 times and permanently abandons record in Dead Letter Queue.
* **Root Cause:** Table `candidate_screenings`, column `interviews.reschedule_history`, and expanded constraint `tasks_status_check` do not exist in production Supabase database.
* **Safe Application Fix:** Keep client state safe, but surface truthful warning if table is unmigrated rather than silently dead-lettering records.
* **Database Dependency:** Requires executing Migration 008 on Supabase Cloud `zshihpvmtvwsbwrjpugy`.
* **Approval Required:** **YES (Database Migration Approval Gate Active)**.

---

### Issue BASELINE-03: Missing Primary Owner Account in Supabase Auth (P1)
* **Severity:** 🟠 **P1** (Access Control)
* **Affected Area:** Supabase Auth (`auth.users`) and `public.profiles`
* **Reproduction:** Attempt login using `vikasnayakrgh@gmail.com`. Returns `Invalid login credentials`.
* **Root Cause:** Owner account was never provisioned on Supabase Cloud. Current admin account is `admin@sccjobs.in`.
* **Action Required:** Operator must invite `vikasnayakrgh@gmail.com` with `role = 'admin'` via Supabase Dashboard.
* **Approval Required:** **YES (User Provisioning Approval Gate Active)**.

---

### Issue BASELINE-04: Inactive Account Login Pass-Through (P2)
* **Severity:** 🟡 **P2** (Security Vulnerability)
* **Affected Files:**
  * [src/App.tsx](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/src/App.tsx#L28-L42)
  * [src/context/AuthContext.tsx](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/src/context/AuthContext.tsx#L30-L45)
* **Reproduction:** Set `profiles.is_active = false` on an active user. User can log in and browse CRM screens without error until they attempt a database mutation.
* **Root Cause:** `AppContent` in `App.tsx` checks only `if (!user) return <Login />` and ignores `profile?.is_active`.
* **Safe Application Fix:** Add guard in `App.tsx`: if `profile && !profile.is_active`, render a dedicated "Account Deactivated" screen that blocks all workspace routes and allows clean logout.
* **Approval Required:** No.

---

### Issue BASELINE-05: Follow-Up Time Dropped on Lead Calls (P2)
* **Severity:** 🟡 **P2** (Workflow Defect)
* **Affected Files:**
  * [src/screens/Leads.tsx](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/src/screens/Leads.tsx#L420-L425)
* **Reproduction:** In Leads calling modal, select outcome "Call Back Later", pick time "03:30 PM", save call. Open Tasks screen: task due date is tomorrow, but the 03:30 PM callback time is nowhere to be found.
* **Root Cause:** `autoFollowupTime` state is never appended to the task title or task notes when calling `createLeadFollowupTask`.
* **Safe Application Fix:** Append scheduled callback time into task title and task notes (e.g., `Follow-up callback @ 03:30 PM`).
* **Approval Required:** No.

---

### Issue BASELINE-06: Hardcoded "Connected" Call Outcome in Candidate Drawer (P2)
* **Severity:** 🟡 **P2** (Data Integrity)
* **Affected Files:**
  * [src/components/CandidateProfileDrawer.tsx](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/src/components/CandidateProfileDrawer.tsx#L264-L279)
* **Reproduction:** In Candidate Profile Drawer, click phone icon. Phone dialer opens and a call log with `call_type = 'Connected'` is immediately recorded, even if candidate never picked up.
* **Root Cause:** `handleCall` calls `insert('call_logs', { call_type: 'Connected', ... })` unconditionally.
* **Safe Application Fix:** Add an interactive call logging prompt/dialog in `CandidateProfileDrawer` allowing recruiter to select actual outcome (Connected, Busy, No Answer, SwitchOff) and enter call remarks.
* **Approval Required:** No.

---

### Issue BASELINE-07: Offline Queue Actor Scoping & Resurrected Deleted Records (P1)
* **Severity:** 🟠 **P1** (Data Integrity & Concurrency)
* **Affected Files:**
  * [src/lib/offlineQueue.ts](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/src/lib/offlineQueue.ts#L1-L15)
  * [src/context/DataContext.tsx](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/src/context/DataContext.tsx#L200-L225)
* **Reproduction:**
  1. Queue an update while offline.
  2. If the record is deleted on server during offline period, `remoteExisting` is null.
  3. Code executes `upsert(payload)`, recreating the deleted record on the server.
  4. Also, if a different user signs in before queue processes, mutations replay under the new user's JWT.
* **Safe Application Fix:**
  1. Add `userId?: string` to `QueuedMutation`. Skip replaying mutations that belong to a different user until that user signs back in.
  2. If an update mutation targets a record that no longer exists remotely (`remoteExisting === null`), do NOT blindly upsert; route it to Dead Letter Queue as a concurrency conflict so the deleted record is not resurrected.
* **Approval Required:** No.

---

## 4. Phase 1 Remediation Execution Plan

In accordance with user rules and Phase 1 objectives:
1. **Fix Authentication Guard (`App.tsx`):** Enforce `profile?.is_active === true` before granting workspace access.
2. **Fix Recruiter Task Attribution (`Tasks.tsx` & `DataContext.tsx`):** Ensure `created_by` is set to the authenticated user's verified UUID.
3. **Fix Lead Call Follow-Up Time (`Leads.tsx`):** Ensure selected `autoFollowupTime` is preserved in follow-up task notes.
4. **Fix Candidate Call Outcome (`CandidateProfileDrawer.tsx`):** Prompt for truthful call outcome rather than hardcoding "Connected".
5. **Fix Offline Mutation Safety (`DataContext.tsx` & `offlineQueue.ts`):** Prevent deleted record resurrection and enforce user-scoped replay.
6. **Prepare Migration 008 & 009 SQL:** Strictly staged and reviewed; await user authorization before execution.
