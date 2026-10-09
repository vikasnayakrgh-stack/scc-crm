# 📝 SCC CRM — Remediation Changelog (Phase 1)

**Target Repository:** `vikasnayakrgh-stack/scc-crm`  
**Production URL:** `https://scc-crm.vercel.app/`  
**Supabase Reference:** `zshihpvmtvwsbwrjpugy` (PostgreSQL 17.11)  
**Author:** Principal Full-Stack Engineer & Supabase/PostgreSQL Security Specialist  
**Status:** Phase 1 Application Code Remediated • 199/199 Vitest Tests Passing • 0 TypeScript Errors • Live Migration Execution Gated  

---

## 📋 Executive Change Summary

| Defect / Requirement ID | Severity | Affected Area | Core Remediation Applied | Verification Evidence |
|:---|:---:|:---|:---|:---|
| **ISSUE-013 / TASK-ATTR** | **P0** | `Tasks.tsx`, `DataContext.tsx` | Frontline recruiters creating tasks failed with RLS 42501 due to missing `created_by`. Added explicit attribution in `Tasks.tsx` (`created_by: userId`), defense-in-depth fallback in `DataContext.insert`, and prepared Migration 009 setting `DEFAULT auth.uid()`. | `remediationPhase1.test.ts` Section 1 passed |
| **ISSUE-014 / OCC-RESURRECT** | **P1** | `DataContext.tsx`, `offlineQueue.ts` | When offline OCC update replay returned 0 rows and remote lookup was null, `DataContext` previously executed an upsert, which resurrected server-deleted records. Fixed to return `RECORD_NOT_FOUND` error, which `isPermanentError` routes safely to Dead Letter Queue (DLQ). | `remediationPhase1.test.ts` Section 2 passed |
| **ISSUE-015 / DLQ-BLACKHOLE** | **P1** | `offlineQueue.ts`, `DataContext.tsx` | DLQ lacked inspection, retry, and clear APIs. Added `getDeadLetterMutations()`, `retryDeadLetterMutation()`, `removeDeadLetterMutation()`, and `clearDeadLetterQueue()` exposed via `DataContext`. | `remediationPhase1.test.ts` Section 4 passed |
| **ISSUE-016 / ACTOR-SCOPING** | **P1** | `offlineQueue.ts`, `DataContext.tsx` | Queued mutations lacked user scoping, risking replaying User A's queued mutations under User B's active session. Added `userId` scoping to `QueuedMutation`, `enqueueMutation`, and session filtering in `processOfflineQueue`. | `remediationPhase1.test.ts` Section 3 passed |
| **ISSUE-017 / INACTIVE-BYPASS** | **P1** | `App.tsx`, `AuthContext.tsx` | Deactivated accounts (`is_active = false`) could access the CRM workspace UI because `App.tsx` only checked `!user`. Added deactivated account and missing profile guards rendering blocking screens with owner contact (`vikasnayakrgh@gmail.com`). | `remediationPhase1.test.ts` Section 7 passed |
| **ISSUE-018 / LEAD-FOLLOWUP-TIME** | **P2** | `Leads.tsx` | `autoFollowupTime = '11:00'` was captured in call modal state but dropped when calling `createLeadFollowupTask()`. Now preserved in task title (`Follow-up: Name at 11:00 AM`) and notes (`[Scheduled Time: 11:00 AM]`). | `remediationPhase1.test.ts` Section 5 passed |
| **ISSUE-019 / LEAD-STALE-OVERWRITE** | **P2** | `Leads.tsx` | Recruiter saving call log with category update spread `...callModalLead` full object into `update('leads')`, risking overwriting concurrent note/assignment changes. Fixed to update only `{ id, category }`. | `remediationPhase1.test.ts` Section 5 passed |
| **ISSUE-020 / UNTRUTHFUL-CANDIDATE-CALL** | **P2** | `CandidateProfileDrawer.tsx` | Clicking phone dialer immediately hardcoded `call_type: 'Connected'`, violating truthful call logging. Replaced with interactive call modal with full outcome selection (Connected, Busy, No Answer, SwitchOff, etc.) and duration tracking. | `remediationPhase1.test.ts` Section 6 passed |

---

## 🛠️ Detailed File Changes & Rationale

### 1. `src/lib/offlineQueue.ts`
- **Actor Scoping:** Added optional `userId?: string` to `QueuedMutation` and `enqueueMutation()` options.
- **Permanent Error Classification:** Enhanced `isPermanentError()` to classify `RECORD_NOT_FOUND`, `42P01` (undefined table), `42703` (undefined column), `PGRST204`/`PGRST205` as permanent errors. This prevents 5 wasteful retry delays and immediately moves poisoned mutations to the Dead Letter Queue.
- **Actor Isolation in Queue Processing:** Added `currentUserId?: string` to `processOfflineQueue()`. If `mutation.userId && options?.currentUserId && mutation.userId !== options.currentUserId`, the mutation is skipped and preserved until the authoring user logs back in.
- **DLQ Management APIs:** Added `getDeadLetterMutations()`, `removeDeadLetterMutation()`, `retryDeadLetterMutation()`, and `clearDeadLetterQueue()`.

### 2. `src/context/DataContext.tsx`
- **Deleted Record Resurrection Prevention:** In `executeRemoteMutation()` (update branch), if OCC update affects 0 rows and `remoteExisting` is null, returned `RECORD_NOT_FOUND` error rather than blindly upserting.
- **Defense-in-Depth Task Attribution:** In `insert()`, if `table === 'tasks'` and `created_by` is not specified, dynamically resolved active session user ID from Supabase auth.
- **Actor-Scoped Mutation Queuing:** In `insert()`, `update()`, and `remove()`, passed `userId: currentUserId` into `enqueueMutation()`.
- **DLQ Context Exposing:** Exposed `getDeadLetterList`, `retryDeadLetter`, `removeDeadLetter`, and `clearDeadLetter` in `DataContextType`.

### 3. `src/screens/Tasks.tsx`
- **Explicit Attribution:** Destructured `userId` from `useUser()` hook and explicitly bound `created_by: userId` in `handleCreateTask()`.

### 4. `src/screens/Leads.tsx`
- **Atomic Category Update:** Replaced `update('leads', { ...callModalLead, category })` with `update('leads', { id: callModalLead.id, category })` to prevent overwriting concurrent updates.
- **Follow-up Time Preservation:** Integrated `autoFollowupTime` into task title and notes when scheduling call follow-ups.

### 5. `src/components/CandidateProfileDrawer.tsx`
- **Truthful Call Logging:** Replaced automatic `Connected` insert with `isCallModalOpen` state, allowing recruiters to record exact outcomes (`Connected`, `Busy`, `No Answer`, `SwitchOff`, `Call Back Later`, `Wrong Number`, `Interested`, `Not Interested`), duration, and notes.

### 6. `src/App.tsx`
- **Inactive Profile Guard:** Checked `profile && profile.is_active === false`, rendering a secure "Account Deactivated" notification screen with contact email `vikasnayakrgh@gmail.com`.
- **Missing Profile Guard:** Checked authenticated users without a profile in `public.profiles`, preventing unassigned accounts from accessing CRM candidate data.

### 7. `src/__tests__/remediationPhase1.test.ts` (NEW)
- Added 12 comprehensive unit and integration tests covering:
  - Task attribution and RLS evaluation
  - Record resurrection prevention and error classification
  - Actor scoping in offline replay
  - Dead Letter Queue lifecycle (enqueue, move to DLQ, inspect, retry, clean)
  - Lead atomic update and follow-up time preservation
  - Truthful candidate call logging
  - Inactive profile and missing profile access restriction

### 8. `supabase/migrations/20261009000009_tasks_attribution_and_candidate_visibility.sql` (NEW)
- Prepared reviewed migration setting `tasks.created_by DEFAULT auth.uid()`.
- Hardened `tasks_insert_policy` RLS.
- Enforced `trg_tasks_set_created_by` attribution trigger.
- Enforced `candidates_select_policy` allowing active team members to read candidate pool while preserving update boundaries.

---

## 🧪 Quality Gate Verification Results

| Quality Gate | Command Executed | Result | Details |
|:---|:---|:---:|:---|
| **Vitest Test Suite** | `npm test -- --run` | ✅ **PASS** | **14 test files passed, 199/199 tests passed (100% pass rate)** |
| **Strict TypeScript Check** | `npm run typecheck` (`tsc --noEmit`) | ✅ **PASS** | **0 errors across all source files and test fixtures** |
| **Production Build** | `npm run build` (`vite build`) | ✅ **PASS** | **Clean production bundle built in 9.41s (`dist/`)** |

---

## 🛑 Approval-Gated Actions Remaining

1. **Remote Database Migrations (008 & 009):**
   - Migration 008 (`20261009000008_office_screening_and_reschedule_history.sql`)
   - Migration 009 (`20261009000009_tasks_attribution_and_candidate_visibility.sql`)
   - **Status:** Reviewed and stored locally in repository. Zero SQL executed remotely against production project `zshihpvmtvwsbwrjpugy`.
2. **Owner Account Provisioning:**
   - Email: `vikasnayakrgh@gmail.com`
   - **Action Required by Owner:** Owner must invite this user via Supabase Dashboard (`Authentication -> Users -> Invite User`) or execute provisioning query with owner-chosen secure credentials.
3. **Deployment / Git Operations:**
   - Zero git commits or pushes executed. Working tree changes preserved cleanly.
