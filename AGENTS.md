# 🚨 SCC CRM — Permanent AI Coding Agent Operating Rules (AGENTS.md)

**Document Classification:** MANDATORY REPOSITORY OPERATING CONSTITUTION  
**Target Repository:** `vikasnayakrgh-stack/scc-crm`  
**Target Database:** Supabase Cloud PostgreSQL `zshihpvmtvwsbwrjpugy` (PostgreSQL 17.11)  
**Authoritative Standard:** Senior Software Architect & AI Agent Governance Engineering  
**Compliance Requirement:** Every AI coding agent and human developer MUST read and adhere to this document before inspecting, modifying, testing, or documenting code in this repository.

---

## 📋 QUICK SITEMAP & GOVERNANCE POINTERS

* **Architectural Decisions (ADRs):** [docs/agent/DECISIONS.md](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/docs/agent/DECISIONS.md)
* **Defect & Bug Prevention Register:** [KNOWN_ISSUES.md](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/KNOWN_ISSUES.md)
* **Agent Change Audit Log:** [docs/agent/CHANGELOG.md](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/docs/agent/CHANGELOG.md)
* **Pre-Execution Remediation Plan:** [LEADS_REMEDIATION_PLAN.md](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/LEADS_REMEDIATION_PLAN.md)
* **Live Database Ledger Audit:** [LIVE_LEADS_DATABASE_VERIFICATION_REPORT.md](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/LIVE_LEADS_DATABASE_VERIFICATION_REPORT.md)

### ⚙️ Environment & Instruction-File Loading Conventions
This project operates in environments that support AI coding agent conventions (Antigravity, Gemini CLI, Claude Code, Cursor, Copilot Workspace):
1. **Root `AGENTS.md` (This File):** Universal, cross-IDE root instruction contract loaded by all modern agent frameworks.
2. **Workspace Customizations Root (`.agents/`):** Contains workspace skills (`.agents/skills/`) and rules (`.agents/rules/`).
3. **Global Customizations Root (`~/.gemini/config`):** Houses user global rules and shared plugins.
*Note: Any agent operating in this repository must inspect this root `AGENTS.md` file at the onset of every turn. If an environment does not auto-load workspace root instructions, agents must manually read this file.*

---


## SECTION A: PROJECT UNDERSTANDING & SYSTEM ARCHITECTURE

### 1. Recruitment Workflow & Business Domain
Shree Career Consultancy (SCC) is a professional recruitment agency managing high-volume candidate sourcing, client employer vacancies, interviews, and placement billing in Central India. The recruitment lifecycle follows a strict two-tier progression:

```
[Raw Ingestion / Portals] (WorkIndia, Naukri, Indeed, Manual)
         ↓
[Leads Module] (Telecalling outreach, call attempts, initial interest screening)
         ↓ (Atomic Conversion: convert_lead_to_candidate)
[Candidates Pool] (Verified profile, salary/notice expectations, skills verification)
         ↓
[Job Matching Engine] (Multi-parameter weighted scoring algorithm)
         ↓
[Employer Submission & Interview Scheduling] (job_applications + interviews)
         ↓
[Client Selection & Offer Management] (Selected ≠ Placed)
         ↓
[Placement Confirmation] (Application marked 'Placed' -> Candidate status = 'Placed')
         ↓
[Dual-Ledger Billing] (Candidate registration fee ₹200 + Employer placement invoice)
```

### 2. Technology Stack & Foundation
* **Frontend:** React 19, TypeScript 5.8, Tailwind CSS, Vite 6, React Router 6.22, Lucide React icons, React Hook Form + Zod 4.
* **Client Architecture:** Centralized data access via `DataContext.tsx`, authentication via `AuthContext.tsx`, pure business libraries (`src/lib/*`).
* **Offline-First Resilience:** `src/lib/offlineQueue.ts` leveraging IndexedDB (`mutation_queue`, `dead_letter_queue`) with optimistic UI updates, exponential backoff, persistent retry counts, and automatic recovery.
* **Backend Database:** Supabase Cloud PostgreSQL 17.11 (Project `zshihpvmtvwsbwrjpugy`).
* **Security & Access Control:** Native PostgreSQL Row Level Security (RLS), RBAC helper routines, hardened `SECURITY DEFINER` procedures with locked search paths.
* **Automated Testing:** Vitest unit, mock, and integration test suites in `src/__tests__/*`.

### 3. Roles and Permissions Hierarchy
CRM users authenticate through Supabase Auth and map to `public.profiles`. Three roles exist:
1. **`admin`:** Complete authority. Global read/write, user provisioning, role assignments, financial management, migration execution, and system-wide audit access.
2. **`manager`:** Operational leadership. Global read on candidates, jobs, and employers; can mark placement invoices as `Paid`; view all telecaller performance and assignment history.
3. **`recruiter` (Default):** Frontline operations. Universal read access to all leads; read/write access to assigned or self-created candidates; can schedule interviews, log calls, and create `Pending` placement invoices. **Strictly blocked from marking invoices as `Paid` or editing user profiles.**
4. **Account State Guard (`is_active`):** Every profile has an `is_active` boolean flag. Inactive/deactivated users (`is_active = false`) are barred at the database level from executing RPCs, inserting logs, or selecting protected rows, even if they hold a valid JWT.

---

## SECTION B: MANDATORY DEVELOPMENT WORKFLOW

### 1. Mandatory Task Startup Protocol
Before writing, modifying, or proposing any code in this repository, EVERY agent MUST execute this 7-step sequence:
1. **Read Root Operating Rules (`AGENTS.md`):** Re-read this document to reinforce permission boundaries and core invariants.
2. **Inspect Known Issues Register (`KNOWN_ISSUES.md`):** Check relevant sections of [KNOWN_ISSUES.md](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/KNOWN_ISSUES.md) to understand known historical defects and avoid repeating failed approaches.
3. **Review Architecture Decisions (`docs/agent/DECISIONS.md`):** Consult relevant records in [docs/agent/DECISIONS.md](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/docs/agent/DECISIONS.md) to ensure changes respect established architectural consensus.
4. **Check Git Status & Uncommitted Work:** Run `git status` and `git diff` immediately. Inspect existing uncommitted changes and NEVER overwrite, revert, or discard user work in progress.
5. **Inspect Implementation & Test Suites:** View existing source code, schema migrations, and test files before designing changes. Ground decisions in verified facts, not assumptions.
6. **Identify Known Regression Risks:** Cross-reference planned changes against the Defect Register and existing automated regression test suites.
7. **Formulate a Minimal Implementation Plan:** For any multi-file or non-trivial change, outline a small, verifiable step-by-step plan before making edits.

### 2. Systematic Engineering Protocol
Every agent task MUST adhere to this systematic engineering protocol:

```
1. INSPECT  ───>  2. ROOT CAUSE  ───>  3. REUSE  ───>  4. MINIMAL FIX  ───>  5. VERIFY
   Evidence          No symptom           Existing        Smallest reliable     Run actual
   first             masking              contracts       solution              test suites
```

1. **Inspect Before Modifying:**  
   Always view relevant source files, database migrations, and existing test suites before writing or proposing code. Never assume file contents or database state based on assumptions.
2. **Identify Root Cause Before Fixing:**  
   Never apply superficial patches (e.g. wrapping failing code in blanket `try/catch`, suppressing TypeScript errors with `any` or `@ts-ignore`, or hacking around RLS with arbitrary bypasses). Address the structural root cause.
3. **Reuse Existing Architecture:**  
   Extend established patterns (`DataContext.tsx`, `validation.ts`, `candidateImport.ts`, `placementReconciliation.ts`). Do NOT introduce redundant state management libraries, duplicate utility functions, or parallel schemas.
4. **Avoid Unnecessary Rewrites & Overengineering:**  
   Keep changes laser-focused on the specific requirement. Do NOT refactor working modules, touch untouched screens, or add speculative features.
5. **Implement the Smallest Reliable Solution:**  
   Favor deterministic, pure TypeScript functions for business logic paired with defensive database constraints and triggers.
6. **Run Relevant Tests and Verify Actual Results:**  
   Execute `npm test -- --run` and `npm run typecheck` (`tsc --noEmit`). Read the actual command stdout/stderr.
7. **Never Claim Unverified Success:**  
   - TypeScript compilation does NOT prove runtime behavior or RLS compliance.
   - Raw SQL execution in an editor does NOT mean a migration is deployed in the ledger.
   - An agent must explicitly separate **verified facts** from **pending executions**.

---

## SECTION C: DATABASE AND SECURITY STANDARDS

### 1. Row Level Security (RLS) is Mandatory
* Every table created in `public` schema MUST have `ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;`.
* Table-level `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table_name> TO authenticated;` must be explicitly declared.
* RLS policies must evaluate both role permissions (`public.is_admin()`, `public.is_admin_or_manager()`) and active profile state (`profiles.is_active = true`).

### 2. Hardened `SECURITY DEFINER` Procedures
When writing PostgreSQL functions that bypass RLS or execute elevated logic:
* **Explicit Search Path:** MUST declare `SET search_path = public, pg_catalog`. Never omit `search_path` (prevents schema search path hijacking).
* **Revoke Public Execution:** PostgreSQL defaults grant execute to `PUBLIC`. You MUST explicitly run:
  ```sql
  REVOKE ALL ON FUNCTION public.<function_name>(...) FROM anon, public;
  GRANT EXECUTE ON FUNCTION public.<function_name>(...) TO authenticated;
  ```
* **Active Profile Guard:** The procedure body MUST begin with an internal authentication and active-status verification:
  ```sql
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: Active user profile required' USING ERRCODE = '42501';
  END IF;
  ```

### 3. Ownership & Attribution Immutability
* Client payloads must never be trusted to dictate audit attribution (`created_by`, `recorded_by_user_id`).
* Set database column defaults to `DEFAULT auth.uid()`.
* Back critical attribution columns with `BEFORE INSERT` triggers (e.g., `trg_call_logs_set_created_by`, `trg_payment_records_set_user`) that auto-populate `COALESCE(NEW.created_by, auth.uid())`.

### 4. Concurrency & Duplicate Protection
* Unique constraints must be enforced at the database engine level via unique indexes or partial unique indexes (`idx_leads_mobile_active`, `idx_candidates_mobile_active`, `uq_tasks_lead_pending_due_date`).
* Concurrent cross-table operations on phone numbers must acquire transaction-level advisory locks:
  ```sql
  PERFORM pg_advisory_xact_lock(hashtext('scc_mobile:' || v_norm_mobile));
  ```

### 5. Migration-First Discipline & Ledger Integrity
* **Never Silently Modify Historical Migrations:** Once a migration file has been deployed or committed, it is IMMUTABLE. Any subsequent change requires a new sequential numbered migration file.
* **Never Fabricate Ledger Entries:** Do not claim a migration is applied unless verified in `supabase_migrations.schema_migrations`.
* Every new migration must be non-destructive, additive, idempotent, and include precondition checks.

---

## SECTION D: SCC-SPECIFIC BUSINESS RULES (THE INVARIANTS)

These 9 business rules reflect verified operational requirements of Shree Career Consultancy. They must NEVER be violated:

1. **Universal Lead Visibility:**  
   All active CRM users can view all leads across the organization. The `assigned_to` field helps recruiters manage personal queues, but MUST NEVER restrict general read visibility for other active team members.
2. **Call Logs Preserve the Actual Caller:**  
   `telecaller_name` and `created_by` on `call_logs` are immutable historical facts. Reassigning a lead or candidate to another recruiter must NEVER rewrite past call log attribution.
3. **Re-Import Never Resets Existing Status or History:**  
   Re-uploading an Excel/CSV file containing an existing phone number must flag the record as an existing duplicate (`already_in_leads` or `already_in_candidates`). It must NEVER overwrite notes, reset status back to 'New', or erase call history.
4. **Hot Lead Means "Never Called" (Not "Recently Imported"):**  
   A lead is classified as **Hot** if and only if `call_attempts == 0` (zero call logs exist for this lead) and its category is not 'Converted', 'Rejected', or 'Do Not Contact'. A lead imported 45 days ago that was never called is STILL Hot.
5. **First Call Attempt Permanently Removes Lead from Hot Leads:**  
   Logging the very first call attempt—whether it is Connected, Busy, No Answer, or SwitchOff—immediately and permanently removes the lead from Hot Leads.
6. **Lead Conversion Preserves Original Lead & Call History:**  
   Converting a lead to a candidate creates or links the candidate record, marks `leads.category = 'Converted'`, and records `converted_candidate_id` and `converted_at`. The lead record and its entire prior call history are NEVER deleted.
7. **Conversion Must Be Atomic & Idempotent:**  
   Repeatedly clicking or calling `convert_lead_to_candidate` on an already-converted lead must safely return the existing candidate record with `idempotent: true` without creating duplicate candidates or raising unhandled exceptions.
8. **Not Interested Leads Remain Available for Review & Reactivation:**  
   Leads marked 'Rejected' or 'Do Not Contact' are filtered into a dedicated "Not Interested / Archive" view. Telecallers and managers can review them and reactivate them to 'Warm'. Upon reactivation, they retain all past call logs and MUST NOT re-enter Hot Leads.
9. **Selected ≠ Placed (Placement Reconciliation):**  
   Client interview selection does NOT mean placed. A candidate becomes `'Placed'` only upon explicit application placement confirmation. If that placement is subsequently rejected or withdrawn, the candidate automatically reconciles back to `'Active'` (unless another application is Placed), while preserving `'Blacklisted'` status.

---

## SECTION E: PERMISSION BOUNDARIES & RESTRICTIONS

AI coding agents operating in this repository operate under STRICT governance restrictions:

| Operation | Agent Permission | Requirement |
|:---|:---|:---|
| **Code Inspection & Analysis** | ✅ **ALLOWED** | Read-only analysis. |
| **Writing Tests & Documentation** | ✅ **ALLOWED** | Additive test suites and documentation. |
| **Source Code Editing (`src/*`)** | ⚠️ **CONDITIONAL** | Only when authorized by user prompt; minimal scope. |
| **Migration File Creation** | ⚠️ **CONDITIONAL** | Numbered forward-only files in `supabase/migrations/`. |
| **Direct Live Database Mutation (SQL/DDL/DML)** | 🛑 **STRICTLY FORBIDDEN** | **Zero SQL execution without explicit user authorization.** |
| **Running Database Migrations (`supabase db push`)** | 🛑 **STRICTLY FORBIDDEN** | **Requires explicit human approval gate.** |
| **Git Commits & Branch Switching** | 🛑 **STRICTLY FORBIDDEN** | **Do not commit without explicit user command.** |
| **Git Push / Deployment** | 🛑 **STRICTLY FORBIDDEN** | **Zero pushes to GitHub/production without explicit order.** |
| **Service Role / Secret Exposure** | 🛑 **STRICTLY FORBIDDEN** | **Never output service-role keys or production secrets.** |
| **Overwriting Uncommitted Work** | 🛑 **STRICTLY FORBIDDEN** | **Never overwrite, revert, or discard uncommitted user changes.** |

---

## SECTION F: REGRESSION PREVENTION & QUALITY GATES

Before considering any implementation task complete, every agent must verify:
1. **Defect Register Check:** Consult [KNOWN_ISSUES.md](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/KNOWN_ISSUES.md) to ensure the solution does not reintroduce any resolved issue (ISSUE-001 through ISSUE-012).
2. **Automated Unit Testing:** Run `npm test -- --run`. All existing and new regression tests must pass cleanly.
3. **Strict Typechecking:** Run `npm run typecheck` (`tsc --noEmit`). Zero TypeScript errors allowed.
4. **Production Build Validation:** Run `npm run build` (`vite build`). Production bundle must build cleanly.
5. **No Silent Assumptions:** If an edge case or business rule is ambiguous, ask the user or document it as an open item in the final report rather than inventing arbitrary behavior.
6. **Defect Register Maintenance:** Whenever an issue is resolved, modified, or identified, the agent MUST update [KNOWN_ISSUES.md](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/KNOWN_ISSUES.md) with accurate root cause, fix, and verification evidence, and record the entry in [docs/agent/CHANGELOG.md](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/docs/agent/CHANGELOG.md).
