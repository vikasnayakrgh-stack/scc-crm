# SCC CRM — Stage 3.1: Controlled P1 Bug Fix Report

**Branch:** `feature/production-hardening`  
**Previous Base Commit:** `8b6bfa8` (Stage 3 npm audit patch)  
**Bugfix Commit:** `5e4b684`  
**Date:** October 2, 2026  
**Status:** Both Approved P1 Issues Resolved and Verified via Regression Test Suites  

---

## 1. Executive Summary

In accordance with authorization, **only** the two identified P1 defects were addressed:
1. **P1-003:** Candidate placement status does not correctly reconcile when an application moves from Placed to Rejected (or any non-Placed stage).
2. **P1-004:** Offline queue `retryCount` is not persisted to IndexedDB across application restarts.

Strict scope restrictions were respected:
- No Supabase migrations modified.
- No Supabase Auth or RLS policies altered.
- No live Supabase connection or historical data touch.
- No UI redesigns or unapproved dependencies added.
- No `npm audit fix --force` executed.
- No pushes or deployments made.

---

## 2. Defect Analysis & Fix Details

### A. P1-003: Placement Status Reconciliation

#### Root Cause
In `src/screens/Applications.tsx`, `handleStageTransition` contained a one-way side effect:
```typescript
if (nextStage === 'Placed') {
  await update('candidates', { id: app.candidate_id, status: 'Placed' });
}
```
When an application moved to `Placed`, the candidate was marked `status = 'Placed'`. However, when that application was subsequently updated to `Rejected`, `Withdrawn`, or any other stage, there was no reconciliation logic to re-evaluate the candidate's status. The candidate remained permanently `Placed`, rendering them unavailable in the active talent pool even if they had other in-flight applications.

#### Implementation Details
1. Created `src/lib/placementReconciliation.ts` containing pure, deterministic business logic:
   - Evaluates all active applications for the candidate (`is_active !== false`).
   - Checks if any other application is in the `'Placed'` stage.
   - If the candidate still has another application in `'Placed'`, the candidate's status remains `'Placed'`.
   - If no remaining application is `'Placed'`, the candidate's status safely reverts to `'Active'`.
   - Strict guard: If the candidate has administrative `'Blacklisted'` status, it is **never** overridden to `'Active'` or `'Placed'` by application stage changes.
   - Idempotent: Repeated transitions to the same stage do not trigger redundant updates.
2. Updated `src/screens/Applications.tsx`:
   - `handleStageTransition` calls `reconcileCandidateStatus`.
   - Checks `candidate.status !== reconciliation.newStatus` before executing `update('candidates', ...)`.
   - Added idempotency early-return if `targetApp.stage === nextStage`.

#### Exact Files Changed
- `src/lib/placementReconciliation.ts` (created)
- `src/screens/Applications.tsx` (updated `handleStageTransition` and added import)
- `src/__tests__/placementReconciliation.test.ts` (created)

---

### B. P1-004: Offline Queue Retry Persistence & Backoff

#### Root Cause
In `src/lib/offlineQueue.ts`, `processOfflineQueue` handled transient errors by mutating the in-memory JavaScript object:
```typescript
mutation.retryCount = (mutation.retryCount || 0) + 1;
mutation.lastAttemptAt = Date.now();
```
However, the updated `mutation` was **never written back to IndexedDB**. As a result:
- If the browser was closed, reloaded, or restarted, `getPendingMutations()` read the stale record from IndexedDB with `retryCount: 0`.
- The queue could retry indefinitely across app sessions without ever triggering the 5-retry limit.
- Backoff cooldown calculations could not rely on persisted attempt counts.
- Transient errors thrown by `executor` did not properly increment or persist retries.

#### Implementation Details
1. Implemented `updateQueuedMutation(mutation: QueuedMutation): Promise<void>` in `src/lib/offlineQueue.ts`:
   - Performs `store.put(mutation)` in a `'readwrite'` IndexedDB transaction on `mutation_queue`.
   - Rejects with transaction error on persistence failure (ensuring persistence failures are never silently swallowed).
2. Implemented backoff utilities:
   - `calculateBackoffDelay(retryCount, baseDelayMs = 1000, maxDelayMs = 30000)`: exponential backoff ($1000 \times 2^{\text{retryCount} - 1}$).
   - `isMutationReadyForRetry(mutation, now, baseDelayMs, maxDelayMs)`: evaluates whether backoff cooldown has elapsed before processing.
3. Updated `processOfflineQueue`:
   - Skips pending mutations whose backoff cooldown has not yet expired.
   - Centralized retry handling in `handleTransientRetry`, covering both `{ error }` returns and thrown exceptions.
   - Increments `retryCount`, records `lastAttemptAt`, and persists via `await updateQueuedMutation(mutation)`.
   - When `retryCount >= 5`, moves the item to the Dead Letter Queue (`DEAD_LETTER_STORE`).
   - Added `closeOfflineDb()` helper to cleanly simulate app restarts during testing.
   - Concurrency guard (`isProcessingQueue`) ensures multiple sync passes do not run concurrently or race.

#### Exact Files Changed
- `src/lib/offlineQueue.ts` (added `updateQueuedMutation`, backoff calculations, restart simulator, updated processor)
- `src/__tests__/offlineQueuePersistence.test.ts` (created)

---

## 3. Regression Tests Added

### Suite 1: `src/__tests__/placementReconciliation.test.ts` (7 tests)
1. **Placed application moved to Rejected:** Reconciles candidate status from `Placed` back to `Active`.
2. **Candidate with another Placed application:** When one placed application is rejected, candidate remains `Placed` due to the second active placed application.
3. **Candidate with multiple active applications:** Candidate remains `Active` across stage transitions (Applied, Screening, Interview Scheduled, Rejected).
4. **Repeated stage updates and idempotency:** Repeated transitions to the same stage do not alter state or trigger redundant updates.
5. **Transition to Placed:** Candidate transitions to `Placed` when an application reaches the `Placed` stage.
6. **Blacklisted candidate protection:** Blacklisted candidates are never reverted to `Active` or set to `Placed`.
7. **Soft-deleted application exclusion:** Soft-deleted applications (`is_active === false`) are ignored during placement checks.

### Suite 2: `src/__tests__/offlineQueuePersistence.test.ts` (7 tests)
1. **Retry count survives simulated restart:** Enqueue item $\to$ transient error $\to$ `closeOfflineDb()` $\to$ reload from IndexedDB $\to$ verifies `retryCount === 1` and `lastAttemptAt` is preserved. Fails again $\to$ `closeOfflineDb()` $\to$ verifies `retryCount === 2`.
2. **Backoff delay calculation:** Verifies exponential delays (1s, 2s, 4s, 8s, 16s, capped at 30s).
3. **Backoff cooldown enforcement:** Verifies `isMutationReadyForRetry` returns `false` before delay elapses and `true` once elapsed.
4. **Permanent failure to DLQ:** PostgreSQL constraint error `23505` immediately moves to Dead Letter Queue without retrying.
5. **Concurrency lock enforcement:** Concurrent call to `processOfflineQueue` returns immediately with 0 processed while first call is active.
6. **Max retries exhaustion:** Item fails 4 times with `retryCount` incrementing, then 5th failure moves item directly to DLQ.
7. **Failed persistence propagation:** Simulates IndexedDB write error during `updateQueuedMutation` $\to$ verifies exception is raised and not silently swallowed.

---

## 4. Verification Results & Comparison

| Command | Stage 3 Baseline (`8b6bfa8`) | Stage 3.1 Post-Fix (`5e4b684`) | Verdict |
|---------|------------------------------|--------------------------------|---------|
| `npm run typecheck` | 0 errors | 0 errors | ✅ PASS |
| `npm test` | 8/8 tests passed (1 file) | **22/22 tests passed (3 files)** | ✅ PASS (+14 tests) |
| `npm run lint` | 0 errors, 38 warnings | 0 errors, 53 warnings (all `any` / fast-refresh; 0 in prod code) | ✅ PASS |
| `npm run build` | Built in 16.06s (536.19 kB) | Built in 10.03s (538.03 kB) | ✅ PASS |
| `npm audit` | 5 vulnerabilities (react-router, vitest) | 5 vulnerabilities (unchanged, requires `--force`) | ✅ PASS (no regressions) |

### Verification Command Outputs

```text
> tsc --noEmit
Exit code: 0 (0 errors)

> vitest run
✓ src/__tests__/placementReconciliation.test.ts (7 tests) 6ms
✓ src/__tests__/recruitment.test.ts (8 tests) 5ms
✓ src/__tests__/offlineQueuePersistence.test.ts (7 tests) 528ms
Test Files: 3 passed (3)
Tests:      22 passed (22)
Duration:   1.33s

> vite build
✓ 2370 modules transformed.
dist/index.html                    1.09 kB │ gzip:   0.62 kB
dist/assets/browser-C8nikC9u.js    0.62 kB │ gzip:   0.43 kB
dist/assets/index-C_YDrHOS.js    538.03 kB │ gzip: 155.30 kB
✓ built in 10.03s
```

---

## 5. Remaining Limitations (Out of Scope for Stage 3.1)

1. **Supabase Auth / RLS Integration:** The client still uses `localStorage` for role switching until Supabase Auth is provisioned in Stage 4.
2. **Pre-requisite DDL Migration:** Migration `000_initial_schema.sql` for the original 4 tables (`candidates`, `jobs`, `interviews`, `call_logs`) remains to be packaged before connecting to a clean Supabase project.
3. **React Router Dependency Update:** The 5 low-risk npm audit advisories (in `react-router-dom` and `vitest`) require `--force` breaking version upgrades and should be validated in a dedicated dependency upgrade pass.

---

## 6. Defect Status Verdict

| Defect ID | Description | Status | Evidence |
|-----------|-------------|--------|----------|
| **P1-003** | Placement Status Reconciliation | **✅ FIXED & VERIFIED** | 7 regression tests passing in `placementReconciliation.test.ts` |
| **P1-004** | Offline Queue Retry Persistence | **✅ FIXED & VERIFIED** | 7 regression tests passing in `offlineQueuePersistence.test.ts` |

**Final Git Commit:** `5e4b684`  
**Commit Message:** `fix: resolve placement reconciliation and offline retry persistence`
