# SCC CRM — AI Coding Agent Architecture & Governance Changelog

**Repository:** `vikasnayakrgh-stack/scc-crm`  
**Purpose:** Permanent audit log of significant engineering changes, migrations, security modifications, and architecture updates executed by AI coding agents and human engineers.  

---

## Agent Change Recording Template

*Copy this block for every future significant change task:*

```markdown
### [YYYY-MM-DD] <Concise Title of Change>
- **Task Reference / Ticket:** <e.g., P0-01 Pipeline Fix / Leads Module Remediation>
- **Agent Model / ID:** <e.g., Gemini 3.8 Flash / Claude 3.7 Sonnet / Antigravity Architect>
- **Scope / Mode:** <e.g., Database Migration, Frontend UX, Bugfix, Security Hardening>

#### 1. Rationale & Problem Description
<Why was this change necessary? What bug, security hole, or business requirement was addressed?>

#### 2. Affected Files
- `path/to/created_file.ext` (Created)
- `path/to/modified_file.ext` (Modified)
- `path/to/deleted_file.ext` (Deleted)

#### 3. Architectural & Business Invariants Impacted
- <Which ADRs or business rules were affected or enforced?>

#### 4. Verification & Testing Evidence
- **Automated Tests:** `<command executed>` (e.g., `npm test -- --run`)
  - Output: `X passed across Y files`
- **TypeScript Strictness:** `npm run typecheck` (`tsc --noEmit`) -> `0 errors`
- **Build Verification:** `npm run build` -> `built in Xs`
- **Database / Ledger Checks (if applicable):** <Details of remote verification or SQL explain>

#### 5. Unresolved Risks & Operational Notes
- <What requires manual testing, migration execution approval, or user confirmation?>
```

---

## Historical Changelog

### [2026-10-07] Production Activation & Live Verification Deployment
- **Task Reference:** SCC CRM — Production Activation & Live Smoke Test
- **Agent Model / ID:** Senior Software Architect & AI Agent Governance Engineering
- **Scope:** Live Database Migration Ledger Repair, Migration 006 Deployment, Live Workflow Smoke Test, 2-User Initial Role Provisioning

#### 1. Rationale & Problem Description
Safely activated SCC CRM against Supabase Cloud PostgreSQL `zshihpvmtvwsbwrjpugy`:
1. Reconciled migration ledger by recording missing historical migration `20261003000005_leads_module` into `supabase_migrations.schema_migrations`.
2. Deployed Migration 006 (`20261004000006_leads_module_remediation.sql`) to live database, resolving ISSUE-006 through ISSUE-012.
3. Made `leads_converted_candidate_id_fkey` DEFERRABLE INITIALLY DEFERRED to enable atomic GUC-free relational conversion without FK violation.
4. Provisioned initial production users (Admin + Telecaller) in `auth.users` and `public.profiles`.
5. Validated complete live recruitment lifecycle: lead creation, hot lead detection, telecalling, follow-ups, conversion, duplicate handling.

#### 2. Affected Files
- `supabase/migrations/20261004000006_leads_module_remediation.sql` (Modified - Added DEFERRABLE FK constraint)
- `KNOWN_ISSUES.md` (Modified - Updated ISSUE-006 through ISSUE-012 to VERIFIED)
- `docs/agent/PRODUCTION_ACTIVATION_REPORT.md` (Created - Production activation report)
- `docs/agent/CHANGELOG.md` (Modified - Added changelog entry)

#### 3. Architectural & Business Invariants Impacted
- Invariant 1 (Universal Lead Visibility): Verified live across roles.
- Invariant 2 (Call Logs Immutable Attribution): `trg_call_logs_set_created_by` active.
- Invariant 4 & 5 (Hot Leads = Never Called): Verified live.
- Invariant 6 & 7 (Atomic & Idempotent Lead Conversion): Verified live.

#### 4. Verification & Testing Evidence
- **Automated Tests:** `npm test -- --run` -> 141/141 passed across 9 test files.
- **TypeScript:** `tsc --noEmit` -> 0 errors.
- **Build:** `vite build` -> Built successfully in 1m 8s.
- **Live Database:** All 13 core workflow steps and import duplicate checks passed on Supabase Cloud.

---

### [2026-10-04] Critical Production Remediation & Verification
- **Task Reference:** SCC CRM — Critical Production Remediation & Verification
- **Agent Model / ID:** Senior Full-Stack Engineer, PostgreSQL/Supabase Security Specialist & QA Engineer
- **Scope:** Security Remediation (Call Logs RLS, Trigger Attribution), Migration Ledger Analysis, Strict Phone Normalization, GUC-Free Relational Conversion, Concurrency & E2E Lifecycle Testing

#### 1. Rationale & Problem Description
Addressed the five outstanding production remediation issues:
1. Eliminated candidate authorization bypass in `call_logs_insert_policy` via top-level `created_by` self-attribution, added attribution trigger `trg_call_logs_set_created_by`, separated lead and candidate call paths, enforced active profile guards, and verified UPDATE/DELETE denial.
2. Formulated official Supabase CLI metadata repair sequence for missing migration `20261003000005`, proved why embedded SQL in migration 006 is fatal under CLI execution, and verified migration 006 is ledger-independent.
3. Implemented and aligned strict 10-digit Indian mobile normalization (`^[6-9][0-9]{9}$`) in TypeScript and PostgreSQL, rejecting invalid prefixes, malformed numbers, and repeated prefixes without improper digit stripping.
4. Eliminated custom session GUC `scc.converting_lead_id`, replaced with relational pre-linking in `convert_lead_to_candidate` paired with `CURRENT_USER = 'postgres'` trigger guard and transaction-level advisory locks.
5. Verified concurrency-safe follow-up idempotency (partial unique index), lead import duplicate protection, and the complete recruitment lifecycle.

#### 2. Affected Files
- `src/__tests__/leadsRemediation.test.ts` (Modified - Added Task 1 spoofing/admin/manager/immutable, Task 3 repeated prefix, Task 4 rollback/unauthorized, Task 5 completed follow-up & E2E lifecycle tests)
- `docs/agent/CRITICAL_REMEDIATION_REPORT.md` (Created - Consolidated pre-execution remediation deliverable)
- `docs/agent/CHANGELOG.md` (Modified - Added this changelog record)
- `KNOWN_ISSUES.md` (Modified - Updated test evidence counts for ISSUE-007, ISSUE-009, ISSUE-010, ISSUE-012)

#### 3. Architectural & Business Invariants Impacted
- ADR-001 (Two-tier candidate pipeline) enforced.
- ADR-002 (Universal lead visibility with team assignment) verified.
- ADR-003 (Hot lead definition driven by call attempts) verified.
- ADR-005 (Canonical 10-digit Indian phone normalization) verified.
- ADR-007 (Migration-first database evolution & ledger tracking) verified.
- Zero live SQL / migrations executed; pre-execution safety gate strictly maintained.

#### 4. Verification & Testing Evidence
- **Automated Tests:** `npm test -- --run` -> **141/141 passed** across 9 test suites (0 failures).
- **TypeScript Strictness:** `npx tsc --noEmit` -> **0 errors** (Clean exit code 0).
- **Build Verification:** `npm run build` -> Clean Vite production build in 1m 25s (`dist/` created).
- **Security Tests:** RLS simulation, trigger attribution, caller spoofing rejection, GUC elimination, role privilege protection, audit immutability all verified.

#### 5. Unresolved Risks & Operational Notes
- Production readiness verdict: **YELLOW — Local fixes complete, live verification pending**.
- Actual Supabase CLI migration repair (`supabase migration repair --status applied 20261003000005`) and migration 006 deployment (`supabase db push`) await explicit human approval.

### [2026-10-04] Governance Discoverability, Startup Protocol & Defect Register Reconciliation
- **Task Reference:** SCC CRM — Final Governance Audit & Agent Instruction Enforcement
- **Agent Model / ID:** Senior AI Agent Governance Architect & Repository Configuration Auditor
- **Scope:** Governance System Audit, Discoverability Adapters, Startup Protocol & Defect Register Reconciliation

#### 1. Rationale & Problem Description
Conducted an independent governance and instruction enforceability audit across Antigravity, Gemini CLI, Claude Code, and Cursor. Found that while Antigravity natively loads root `AGENTS.md`, Claude Code, Gemini CLI, and Cursor require standard adapter files to guarantee discoverability without manual intervention. Also resolved gaps in `AGENTS.md` (formalized 7-step Mandatory Task Startup Protocol and uncommitted work protection), corrected `KNOWN_ISSUES.md` (updated ISSUE-007, corrected ISSUE-008 to CLI repair, updated ISSUE-009 to strict TRAI validation, and added ISSUE-012 for GUC elimination).

#### 2. Affected Files
- `CLAUDE.md` (Created - Lightweight adapter pointing to `AGENTS.md`)
- `GEMINI.md` (Created - Lightweight adapter pointing to `AGENTS.md`)
- `.cursorrules` (Created - Lightweight adapter pointing to `AGENTS.md`)
- `AGENTS.md` (Modified - Added 7-step Mandatory Task Startup Protocol, uncommitted work protection, Defect Register maintenance mandate)
- `KNOWN_ISSUES.md` (Modified - Corrected ISSUE-007, ISSUE-008, ISSUE-009; added ISSUE-012)
- `docs/agent/CHANGELOG.md` (Modified - Added this audit record)
- `docs/agent/GOVERNANCE_AUDIT_REPORT.md` (Created - Consolidated governance audit report)

#### 3. Architectural & Business Invariants Impacted
- ADR-001 through ADR-008 reinforced.
- Strict 7-step startup protocol codified.
- Cross-IDE instruction discoverability guaranteed without rules duplication.
- Permission boundaries strictly enforced: zero live SQL, zero unapproved commits, zero overwrites of uncommitted work.

#### 4. Verification & Testing Evidence
- Automated Tests: `npm test -- --run` -> 133/133 passed across 9 test suites.
- TypeScript Strictness: `tsc --noEmit` -> 0 errors.
- Working Tree Verification: `git status` confirms zero application source code (`src/`) and zero database migration files (`supabase/migrations/`) were modified.
- Live Database: Zero live mutations or remote CLI commands executed.

#### 5. Unresolved Risks & Operational Notes
- Migration `20261004000006_leads_module_remediation.sql` remains under strict pre-execution halt pending user approval.

- **Task Reference:** Task: Create Permanent SCC CRM Agent Operating Rules
- **Agent Model / ID:** Antigravity AI Coding Agent Governance Architect
- **Scope:** Documentation, Repository Inspection & Operating Rules System
- **1. Rationale:**  
  Created a permanent, root-level instruction system (`AGENTS.md`, `KNOWN_ISSUES.md`, `docs/agent/DECISIONS.md`, `docs/agent/CHANGELOG.md`) to prevent future AI coding agents from repeating historical errors, introducing security regressions, breaking RLS policies, bypassing phone normalization, or altering migrations.
- **2. Affected Files:**
  - `AGENTS.md` (Created)
  - `KNOWN_ISSUES.md` (Created)
  - `docs/agent/DECISIONS.md` (Created)
  - `docs/agent/CHANGELOG.md` (Created)
- **3. Invariants Impacted:**  
  Documents ADR-001 through ADR-008; codifies 7 strict SCC recruitment business rules; establishes strict permissions gate (zero unapproved migrations, zero live DB mutations, zero unapproved commits/deployments).
- **4. Verification Evidence:**  
  Inspection-only audit. Confirmed zero source code modifications, zero SQL executions, and zero git commits.
- **5. Unresolved Risks:**  
  Migration `20261004000006_leads_module_remediation.sql` remains in strict pre-execution halt pending user approval.

---

### [2026-10-04] Stage 5.1: Leads Module Remediation & Multi-Perspective Audit
- **Task Reference:** Pre-Execution Remediation Plan for Leads Module
- **Agent Model / ID:** Multi-Agent Audit Team (Security, Concurrency, Ledger, Integrity)
- **Scope:** Security Hardening, RLS Extensions, Canonical Normalization, Follow-Up Idempotency
- **1. Rationale:**  
  Identified that Migration 005 had `call_logs_insert_policy` blocking recruiter calls on leads, lacked `created_by` default, granted anonymous execution on RPCs, missed canonical phone normalization for `0091` / `910`, and lacked ledger registration in `supabase_migrations.schema_migrations`.
- **2. Affected Files:**
  - `LEADS_REMEDIATION_PLAN.md` (Created)
  - `LIVE_LEADS_DATABASE_VERIFICATION_REPORT.md` (Created)
  - `supabase/migrations/20261004000006_leads_module_remediation.sql` (Created - Unapplied)
  - `src/__tests__/leadsRemediation.test.ts` (Created)
  - `src/lib/candidateImport.ts` (Modified - canonical phone normalization)
- **3. Invariants Impacted:**  
  ADR-001, ADR-002, ADR-003, ADR-005, ADR-007.
- **4. Verification Evidence:**  
  `src/__tests__/leadsRemediation.test.ts` passed (17 tests). Zero live mutations executed.

---

### [2026-10-03] Stage 5 Wave 2A: Candidate, Employer & Job Editing & Field Enhancements
- **Task Reference:** Stage 5 Wave 2A Field Modernization
- **Agent Model / ID:** Antigravity Engineering
- **Scope:** Full-Stack Recruitment Field Modernization
- **1. Rationale:**  
  Recruiters required educational qualifications, notice period, and current salary for Central India candidates; employers required edit modals and vacancy shortcuts; jobs required urgency tags.
- **2. Affected Files:**
  - `STAGE_5_WAVE2A_IMPLEMENTATION_REPORT.md` (Created)
  - `supabase/migrations/20261003000004_stage5_wave2a_candidate_fields.sql` (Created & Deployed)
  - `src/__tests__/stage5Wave2a.test.ts` (Created)
  - `src/lib/validation.ts` (Modified)
  - `src/screens/Candidates.tsx` (Modified)
  - `src/screens/Employers.tsx` (Modified)
  - `src/screens/Jobs.tsx` (Modified)
- **3. Invariants Impacted:**  
  Candidate and Job schemas updated with validated dropdowns and custom input support.
- **4. Verification Evidence:**  
  All 18 Wave 2A unit tests passing in `src/__tests__/stage5Wave2a.test.ts`.

---

### [2026-10-03] Stage 5 Wave 1: P0 Critical Pipeline Integrity, RLS Security & Production Fixes
- **Task Reference:** Stage 5 Wave 1 Pipeline Hardening
- **Agent Model / ID:** Antigravity Engineering
- **Scope:** Pipeline Triggers, Financial RLS, Registration Fee Sync
- **1. Rationale:**  
  Resolved P0-01 (Match & Schedule orphan interviews), P0-02 (Recruiter 42501 on employer invoices with Paid guardrail), and P0-03 (Candidate fee desync with profile flag).
- **2. Affected Files:**
  - `STAGE_5_WAVE1_IMPLEMENTATION_REPORT.md` (Created)
  - `supabase/migrations/20261003000003_stage5_wave1_critical_fixes.sql` (Created & Deployed)
  - `src/__tests__/stage5Wave1.test.ts` (Created)
  - `src/lib/pipelineHelpers.ts` (Created)
- **3. Invariants Impacted:**  
  ADR-004, ADR-006.
- **4. Verification Evidence:**  
  8 live remote RLS test scenarios executed against Supabase Cloud (`zshihpvmtvwsbwrjpugy`); 44/44 Vitest tests passing.

---

### [2026-10-02] Stage 4B: Supabase Database Foundation & Hardened Procedures
- **Task Reference:** Stage 4B Cloud Database Deployment
- **Agent Model / ID:** Antigravity Engineering
- **Scope:** Supabase Database Provisioning, RBAC, RLS, Initial Tables
- **1. Rationale:**  
  Migrated CRM from local-only storage to Supabase PostgreSQL cloud backend with multi-role RBAC (admin, manager, recruiter).
- **2. Affected Files:**
  - `STAGE_4B_DEPLOYMENT_COMPLETE.md` (Created)
  - `supabase/migrations/20261002000001_core_schema.sql` (Created & Deployed)
  - `supabase/migrations/20261002000002_rls_and_security.sql` (Created & Deployed)
  - `src/__tests__/authAndSecurity.test.ts` (Created)
  - `src/context/AuthContext.tsx` (Created)
- **3. Invariants Impacted:**  
  Role protection trigger (`trg_protect_profile_roles`), profile provisioning trigger (`handle_new_user`), core RLS policies.
- **4. Verification Evidence:**  
  28 unit and integration tests passing; TypeScript compilation passing.

---

### [2026-10-02] Stage 3.1: Controlled P1 Bug Fixes (Placement Reconciliation & Offline Queue)
- **Task Reference:** Stage 3.1 P1 Bugfix
- **Agent Model / ID:** Antigravity Engineering
- **Scope:** Client-side business logic and offline queue persistence
- **1. Rationale:**  
  Resolved P1-003 (Candidate remained permanently Placed when application demoted) and P1-004 (Offline queue `retryCount` not persisted to IndexedDB across browser reloads).
- **2. Affected Files:**
  - `STAGE_3_1_BUGFIX_REPORT.md` (Created)
  - `src/lib/placementReconciliation.ts` (Created)
  - `src/__tests__/placementReconciliation.test.ts` (Created)
  - `src/lib/offlineQueue.ts` (Modified)
  - `src/__tests__/offlineQueuePersistence.test.ts` (Created)
  - `src/screens/Applications.tsx` (Modified)
- **3. Invariants Impacted:**  
  ADR-004, ADR-008.
- **4. Verification Evidence:**  
  14 new tests added (22/22 tests passing across 3 files); build cleanly verified. Git commit `5e4b684`.
