# SCC CRM — Architectural & Business Decision Records (ADRs)

**Classification:** Project Governance & Architecture Log  
**Repository:** `vikasnayakrgh-stack/scc-crm`  
**Target Environment:** Supabase Cloud PostgreSQL `zshihpvmtvwsbwrjpugy` (PostgreSQL 17.11)  
**Maintained By:** Antigravity Engineering & Architecture Team  
**Last Updated:** October 4, 2026  

---

## Purpose & Usage

This document records confirmed architectural, structural, and business decisions governing the **Shree Career Consultancy (SCC) Recruitment Management CRM**. 

Every future AI coding agent or human engineer MUST review these decisions before proposing changes. Decisions documented here represent established project consensus and must NOT be reversed, circumvented, or silently rewritten without meeting the documented **Conditions for Change**.

---

## Summary of Decisions

| ID | Title | Date | Status | Scope |
|:---|:---|:---|:---|:---|
| **[ADR-001](#adr-001-two-tier-candidate-pipeline-leads-vs-candidates)** | Two-Tier Candidate Pipeline (Leads vs Candidates) | 2026-10-03 | **CONFIRMED** | Data Model / Database |
| **[ADR-002](#adr-002-universal-lead-visibility-with-team-assignment)** | Universal Lead Visibility with Team Assignment | 2026-10-04 | **CONFIRMED** | RLS / Business Logic |
| **[ADR-003](#adr-003-hot-lead-definition-driven-by-call-attempts)** | Hot Lead Definition Driven by Call Attempts (Not Age) | 2026-10-04 | **CONFIRMED** | Recruitment Lifecycle |
| **[ADR-004](#adr-004-selection--placement-reconciliation-engine)** | Selection ≠ Placement (Placement Reconciliation Engine) | 2026-10-02 | **CONFIRMED** | Recruitment Lifecycle |
| **[ADR-005](#adr-005-canonical-10-digit-indian-phone-normalization)** | Canonical 10-Digit Indian Phone Normalization & Storage | 2026-10-04 | **CONFIRMED** | Data Integrity / Indexing |
| **[ADR-006](#adr-006-dual-ledger-financial-bookkeeping-architecture)** | Dual-Ledger Financial Bookkeeping & Role Guardrails | 2026-10-03 | **CONFIRMED** | Financial Security / RLS |
| **[ADR-007](#adr-007-migration-first-database-evolution--ledger-tracking)** | Migration-First Database Evolution & Ledger Tracking | 2026-10-04 | **CONFIRMED** | Database Operations |
| **[ADR-008](#adr-008-offline-first-mutation-queue-with-optimistic-ui)** | Offline-First Mutation Queue with Optimistic UI & DLQ | 2026-10-02 | **CONFIRMED** | Frontend Architecture |

---

## Detailed Records

### ADR-001: Two-Tier Candidate Pipeline (Leads vs Candidates)

* **Decision:**  
  Maintain `leads` and `candidates` as two distinct, dedicated database tables rather than merging them into a single polymorphic table with status flags.
* **Reason:**  
  1. Leads represent raw, unverified prospects imported in bulk from portals (WorkIndia, Naukri.com, Indeed) with noisy, incomplete, or duplicate data.
  2. Candidates represent verified, active talent assets who have undergone phone screening, confirmed availability and salary expectations, agreed to consultancy terms, and are ready for job matching.
  3. Keeping raw leads out of the candidate pool prevents polluting candidate matching algorithms, protects employer submissions from unvetted resumes, and maintains clean candidate analytics.
* **Date / Evidence:**  
  October 3, 2026 (`STAGE_5_WORKFLOW_AUDIT.md`, `supabase/migrations/20261003000005_leads_module.sql`).
* **Consequences:**  
  - Requires cross-table duplicate detection triggers (`trg_leads_cross_dedup`, `trg_candidates_cross_dedup`).
  - Requires atomic conversion procedure (`convert_lead_to_candidate`) that creates/links the candidate, marks the lead as `Converted`, and links `converted_candidate_id`.
  - Lead conversion must preserve the original lead record and its call history.
* **Conditions for Change:**  
  Requires explicit written approval from SCC management and the Lead Architect, accompanied by a full data migration plan and UI redesign.

---

### ADR-002: Universal Lead Visibility with Team Assignment

* **Decision:**  
  All active, authenticated CRM users (recruiters, managers, administrators) can view all leads across the organization. The `assigned_to` field organizes individual work queues but MUST NOT restrict read visibility.
* **Reason:**  
  Recruitment consultancy telecalling is inherently collaborative. If Recruiter A is on leave, engaged on another call, or if a candidate calls back on the main office number, Recruiter B or the receptionist must immediately look up the lead, view past call notes, and handle the candidate without delay. Siloing leads causes duplicate calls, frustrated candidates, and lost placements.
* **Date / Evidence:**  
  October 4, 2026 (`LEADS_REMEDIATION_PLAN.md`, `src/__tests__/leadsModule.test.ts` Scenario 15).
* **Consequences:**  
  - `leads` RLS `SELECT` policy grants access to all authenticated users with `profiles.is_active = true`.
  - `call_logs` associated with leads (`lead_id IS NOT NULL`) are readable by all active CRM team members.
  - UI provides filters (`All Leads`, `My Leads`, `Unassigned Leads`, or filter by specific telecaller) while preserving universal read access.
* **Conditions for Change:**  
  Can only be changed if SCC transitions to a multi-branch or franchise model where distinct legal entities must be partitioned by branch ID (`branch_id`).

---

### ADR-003: Hot Lead Definition Driven by Call Attempts

* **Decision:**  
  A lead is classified as **Hot** if and only if `call_attempts == 0` (no call logs exist for this lead) and `category NOT IN ('Converted', 'Rejected', 'Do Not Contact')`.  
  The very first logged call attempt—regardless of whether it is Connected, Busy, No Answer, or SwitchOff—permanently removes the lead from Hot Leads.
* **Reason:**  
  In recruitment sales, the greatest conversion value is the **first outreach touchpoint**. An untouched lead that was imported 30 days ago is still a high-priority "Hot" opportunity requiring first contact. Conversely, a lead imported 2 minutes ago that has already been called is now in the active calling/follow-up pipeline (Warm) and must not clutter the untouched lead queue.
* **Date / Evidence:**  
  October 4, 2026 (`src/screens/Leads.tsx`, `src/__tests__/leadsModule.test.ts` Scenarios 1–4).
* **Consequences:**  
  - Hot Lead categorization is a dynamic, rule-based classification based on `call_logs` presence, not a static timestamp filter.
  - Telecallers logging an unanswered call ("No Answer", "Busy", "SwitchOff") automatically transition the lead out of Hot Leads and trigger a default next-day follow-up task.
  - Reactivated leads (e.g. from "Rejected" back to "Warm") retain their call history and MUST NOT re-enter Hot Leads.
* **Conditions for Change:**  
  Requires operational change request by SCC operations manager defining an alternative automated cooling/aging rule.

---

### ADR-004: Selection ≠ Placement (Placement Reconciliation Engine)

* **Decision:**  
  Moving a job application to the `"Selected"` stage DOES NOT mark the candidate as `"Placed"`. Candidate status becomes `"Placed"` if and only if an application reaches the explicit `"Placed"` stage (offer accepted, joined). When that application moves away from `"Placed"` (e.g., candidate rejects offer, fails background verification, or application is marked `"Rejected"`), candidate status automatically reconciles back to `"Active"`, unless another active application is `"Placed"`.
* **Reason:**  
  Candidates frequently attend multiple interviews and may receive selections from multiple employers. Prematurely marking a candidate `"Placed"` upon client selection locks them out of the active talent pool. If the candidate subsequently rejects the offer, they would remain permanently "Placed" and lost to other active client openings.
* **Date / Evidence:**  
  October 2, 2026 (Commit `5e4b684`, `STAGE_3_1_BUGFIX_REPORT.md`, `src/lib/placementReconciliation.ts`).
* **Consequences:**  
  - All stage updates in `Applications.tsx` must route through `reconcileCandidateStatus()`.
  - Administrative `"Blacklisted"` status is an inviolable override: reconciliation logic must NEVER revert a blacklisted candidate to `"Active"` or `"Placed"`.
  - Idempotent: Redundant stage updates do not trigger duplicate database mutations.
* **Conditions for Change:**  
  None. This is an invariant core business rule for SCC recruitment consultancy operations.

---

### ADR-005: Canonical 10-Digit Indian Phone Normalization

* **Decision:**  
  All Indian phone numbers stored in `leads.mobile` and `candidates.mobile` must be normalized to a canonical 10-digit string before storage. Normalization must strip non-digit characters, international `0091` (14 digits), `+910` (13 digits), `+91` / `91` (12 digits), and leading `0` (11 digits), validating that the final 10 digits start with 6, 7, 8, or 9.
* **Reason:**  
  Spreadsheets from job portals and manual user inputs contain diverse phone representations (`+91 98260-12345`, `09826012345`, `919826012345`, `00919826012345`). Format variations previously bypassed unique constraints and duplicate detection, causing duplicate records across leads and candidates.
* **Date / Evidence:**  
  October 4, 2026 (`src/lib/candidateImport.ts`, `20261004000006_leads_module_remediation.sql`).
* **Consequences:**  
  - Parity between PostgreSQL function `public.normalize_phone(text)` and TypeScript utility `normalizePhone(raw)`.
  - Database triggers execute `NEW.mobile := public.normalize_phone(NEW.mobile)` on `BEFORE INSERT OR UPDATE`.
  - Unique partial indexes enforce single active instance per normalized number.
  - Transaction-level advisory lock `pg_advisory_xact_lock(hashtext('scc_mobile:' || norm_mobile))` serializes concurrent inserts on identical numbers.
* **Conditions for Change:**  
  Can only be changed if SCC expands operations outside India and requires international dialing code support (+E.164 standard).

---

### ADR-006: Dual-Ledger Financial Bookkeeping & Role Guardrails

* **Decision:**  
  CRM financials are separated into two distinct invoice/payment types in `public.payment_records`:
  1. `Candidate_Registration`: Standard registration fee (₹200) collected from jobseekers.
  2. `Employer_Placement`: Commission invoice billed to corporate employers upon successful placement.  
  Recruiters are permitted to create `Pending` placement invoices, but ONLY Administrators and Managers have permission to mark them as `Paid` or update financial amounts.
* **Reason:**  
  1. Prevents financial misreporting, rogue discounts, and commission fraud.
  2. Ensures that candidate registration fees automatically synchronize with the candidate profile boolean `candidates.registration_fee_paid` via database trigger (`trg_sync_candidate_registration_fee`).
  3. Protects cross-recruiter invoice data from unauthorized modification.
* **Date / Evidence:**  
  October 3, 2026 (`20261003000003_stage5_wave1_critical_fixes.sql`, `STAGE_5_WAVE1_IMPLEMENTATION_REPORT.md`).
* **Consequences:**  
  - PostgreSQL RLS enforces `status = 'Pending'` on recruiter inserts for employer placements.
  - Updates transitioning to `Paid` are restricted to `is_admin_or_manager()`.
  - Trigger auto-populates `recorded_by_user_id = auth.uid()` to prevent caller spoofing.
* **Conditions for Change:**  
  Requires formal policy change by SCC finance management.

---

### ADR-007: Migration-First Database Evolution & Ledger Tracking

* **Decision:**  
  All changes to the Supabase PostgreSQL database MUST be authored as sequential, numbered SQL migration files under `supabase/migrations/`.  
  Direct, unrecorded DDL execution in the Supabase SQL Editor is strictly prohibited unless immediately reconciled in `supabase_migrations.schema_migrations`.
* **Reason:**  
  Direct DDL execution in previous stages left Migration 005 physically present in PostgreSQL system catalogs but absent from the `schema_migrations` tracking table, breaking migration runner reproducibility and risking schema collision.
* **Date / Evidence:**  
  October 4, 2026 (`LIVE_LEADS_DATABASE_VERIFICATION_REPORT.md`, `LEADS_REMEDIATION_PLAN.md`).
* **Consequences:**  
  - Historical migrations must never be silently edited once committed or applied.
  - Every schema fix or addition must be an incremental, additive migration.
  - Every migration script must be idempotent and non-destructive.
  - Agents must verify ledger alignment against live database before declaring migration status.
* **Conditions for Change:**  
  None. Fundamental database governance and reliability law.

---

### ADR-008: Offline-First Mutation Queue with Optimistic UI & DLQ

* **Decision:**  
  All mutations to database entities must support offline operation via `src/lib/offlineQueue.ts`, writing to IndexedDB (`mutation_queue`), applying optimistic local UI updates, and persisting retry attempts and backoff timestamps across app reloads. Mutations failing after 5 attempts are routed to the Dead Letter Queue (`DEAD_LETTER_STORE`).
* **Reason:**  
  Recruiters in Central India frequently experience transient network drops or switch between Wi-Fi and mobile hotspots. Offline queueing prevents data entry loss, maintains responsive UI speed, and guarantees at-least-once synchronization with Supabase.
* **Date / Evidence:**  
  October 2, 2026 (Commit `5e4b684`, `src/__tests__/offlineQueuePersistence.test.ts`).
* **Consequences:**  
  - `retryCount` and `lastAttemptAt` must be updated directly in IndexedDB via `store.put()`.
  - Permanent errors (e.g., PostgreSQL constraint violation `23505`) must route immediately to the Dead Letter Queue without exhausting 5 useless retries.
  - Queue processor must enforce single-instance concurrency lock (`isProcessingQueue`).
* **Conditions for Change:**  
  Can only be changed if the application is re-architected strictly as a real-time online web socket application without offline requirements.
