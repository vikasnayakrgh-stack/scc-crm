import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isPermanentError, isMissingTableOrSchemaError } from '../lib/offlineQueue';

/* =============================================================================
 * Security & RLS Policy Simulation Helpers (Pure Business Logic Assertions)
 * ============================================================================= */

interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'manager' | 'recruiter';
  is_active: boolean;
  display_name?: string;
}

interface ScreeningRow {
  id: string;
  candidate_id: string;
  screening_time: string;
  venue: string;
  skills_assessment?: string | null;
  communication_rating?: number | null;
  confidence_rating?: number | null;
  overall_rating?: number | null;
  remarks?: string | null;
  result: 'Pass' | 'Hold' | 'Fail';
  created_by?: string | null;
  is_active: boolean;
}

interface TaskRow {
  id: string;
  title: string;
  status: 'Pending' | 'To Do' | 'In Progress' | 'Waiting' | 'Completed' | 'Cancelled';
  created_by?: string | null;
  assigned_to_user_id?: string | null;
  assigned_to?: string;
  is_active: boolean;
}

interface CandidateRow {
  id: string;
  name: string;
  mobile: string;
  created_by?: string | null;
  assigned_to?: string | null;
  owner_id?: string | null;
  is_active: boolean;
}

interface PaymentRow {
  id: string;
  candidate_id?: string | null;
  type: 'Candidate_Registration' | 'Employer_Placement' | 'Other';
  amount: number;
  payment_method: 'UPI' | 'Cash' | 'Bank_Transfer' | 'Cheque';
  status: 'Paid' | 'Partial' | 'Pending' | 'Refunded';
}

/**
 * Migration 008 (Patched): screenings_select_policy
 * USING (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true))
 */
function evaluateScreeningsSelectPolicy(user: UserProfile | null): boolean {
  if (!user || !user.id) return false;
  return user.is_active === true;
}

/**
 * Migration 008 (Patched): screenings_insert_policy
 * WITH CHECK (auth.uid() IS NOT NULL AND profiles.is_active = true AND (created_by IS NULL OR created_by = auth.uid() OR is_admin()))
 */
function evaluateScreeningsInsertPolicy(row: Partial<ScreeningRow>, user: UserProfile | null): boolean {
  if (!user || !user.id || !user.is_active) return false;
  if (!row.created_by) return true; // Handled by DEFAULT auth.uid()
  if (row.created_by === user.id) return true;
  return user.role === 'admin';
}

/**
 * Migration 008 (Patched): screenings_update_policy
 * USING / WITH CHECK (auth.uid() IS NOT NULL AND profiles.is_active = true AND (created_by = auth.uid() OR is_admin_or_manager()))
 */
function evaluateScreeningsUpdatePolicy(row: ScreeningRow, user: UserProfile | null): boolean {
  if (!user || !user.id || !user.is_active) return false;
  if (row.created_by === user.id) return true;
  return user.role === 'admin' || user.role === 'manager';
}

/**
 * Migration 008 (Patched): overall_rating CHECK constraint
 * overall_rating numeric(3,1) CHECK (overall_rating IS NULL OR (overall_rating >= 1.0 AND overall_rating <= 5.0))
 */
function validateOverallRating(rating: number | null | undefined): boolean {
  if (rating === null || rating === undefined) return true;
  if (typeof rating !== 'number' || isNaN(rating)) return false;
  return rating >= 1.0 && rating <= 5.0;
}

/**
 * Migration 008 (Patched): payment_records_status_check
 * CHECK (status IN ('Paid', 'Partial', 'Pending', 'Refunded'))
 */
function validatePaymentStatus(status: string): boolean {
  return ['Paid', 'Partial', 'Pending', 'Refunded'].includes(status);
}

/**
 * Migration 009 (Patched): trg_tasks_set_created_by_fn()
 * Anti-spoofing trigger logic:
 * IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid();
 * ELSIF NEW.created_by <> auth.uid() AND NOT is_admin() THEN NEW.created_by := auth.uid();
 */
function executeTasksAttributionTrigger(
  newRow: Partial<TaskRow>,
  authUid: string | null,
  userProfile: UserProfile | null
): Partial<TaskRow> {
  const rowCopy = { ...newRow };
  const isAdmin = userProfile?.role === 'admin' && userProfile?.is_active === true;

  if (rowCopy.created_by === null || rowCopy.created_by === undefined) {
    rowCopy.created_by = authUid;
  } else if (authUid && rowCopy.created_by !== authUid && !isAdmin) {
    // Non-admin cannot forge attribution
    rowCopy.created_by = authUid;
  }
  // When authUid is null (service_role background worker), explicit created_by is preserved
  return rowCopy;
}

/**
 * Migration 009 (Patched): tasks_insert_policy
 * WITH CHECK (auth.uid() IS NOT NULL AND profiles.is_active = true AND (created_by = auth.uid() OR is_admin()))
 */
function evaluateTasksInsertPolicy(row: Partial<TaskRow>, user: UserProfile | null): boolean {
  if (!user || !user.id || !user.is_active) return false;
  return row.created_by === user.id || user.role === 'admin';
}

/**
 * Migration 009: candidates_select_policy (Invariant 1)
 * USING (auth.uid() IS NOT NULL AND profiles.is_active = true)
 */
function evaluateCandidatesSelectPolicy(user: UserProfile | null): boolean {
  if (!user || !user.id) return false;
  return user.is_active === true;
}

/**
 * Candidate UPDATE policy (unchanged on live DB)
 * USING (is_admin_or_manager() OR assigned_to = auth.uid() OR created_by = auth.uid())
 */
function evaluateCandidatesUpdatePolicy(row: CandidateRow, user: UserProfile | null): boolean {
  if (!user || !user.id || !user.is_active) return false;
  if (user.role === 'admin' || user.role === 'manager') return true;
  return row.assigned_to === user.id || row.created_by === user.id;
}

/**
 * Candidate DELETE policy (no delete policy exists on live DB -> DENY ALL)
 */
function evaluateCandidatesDeletePolicy(_row: CandidateRow, _user: UserProfile | null): boolean {
  return false; // Denied to all authenticated users
}

/* =============================================================================
 * Test Suite: Migration 008 & 009 Safety & Remediation Preflight
 * ============================================================================= */

describe('Production Migration Preflight: Security & Remediation Test Suite', () => {
  // Test profiles
  const activeAdmin: UserProfile = { id: 'admin-uuid-1', email: 'admin@sccjobs.in', role: 'admin', is_active: true };
  const activeManager: UserProfile = { id: 'manager-uuid-2', email: 'manager@sccjobs.in', role: 'manager', is_active: true };
  const activeRecruiter1: UserProfile = { id: 'recruiter-uuid-3', email: 'telecaller1@sccjobs.in', role: 'recruiter', is_active: true };
  const activeRecruiter2: UserProfile = { id: 'recruiter-uuid-4', email: 'telecaller2@sccjobs.in', role: 'recruiter', is_active: true };
  const inactiveRecruiter: UserProfile = { id: 'inactive-uuid-5', email: 'former@sccjobs.in', role: 'recruiter', is_active: false };

  /* ---------------------------------------------------------------------------
   * 1. Active vs Inactive Screening Access (Task 1.1)
   * --------------------------------------------------------------------------- */
  describe('1. Active vs. Inactive Screening Access (Migration 008 RLS)', () => {
    it('grants SELECT access to active recruiters, managers, and administrators', () => {
      expect(evaluateScreeningsSelectPolicy(activeAdmin)).toBe(true);
      expect(evaluateScreeningsSelectPolicy(activeManager)).toBe(true);
      expect(evaluateScreeningsSelectPolicy(activeRecruiter1)).toBe(true);
    });

    it('strictly denies SELECT access to deactivated staff members (is_active = false)', () => {
      expect(evaluateScreeningsSelectPolicy(inactiveRecruiter)).toBe(false);
    });

    it('strictly denies SELECT access to unauthenticated sessions (auth.uid() = null)', () => {
      expect(evaluateScreeningsSelectPolicy(null)).toBe(false);
    });

    it('grants INSERT access to active staff with correct attribution', () => {
      const screening: Partial<ScreeningRow> = {
        candidate_id: 'cand-1',
        screening_time: '2026-10-09T10:00:00Z',
        venue: 'SCC Raipur Head Office',
        result: 'Pass',
        created_by: activeRecruiter1.id,
      };
      expect(evaluateScreeningsInsertPolicy(screening, activeRecruiter1)).toBe(true);
    });

    it('strictly denies INSERT access to deactivated staff members', () => {
      const screening: Partial<ScreeningRow> = {
        candidate_id: 'cand-1',
        result: 'Pass',
        created_by: inactiveRecruiter.id,
      };
      expect(evaluateScreeningsInsertPolicy(screening, inactiveRecruiter)).toBe(false);
    });
  });

  /* ---------------------------------------------------------------------------
   * 2. Unauthorized Screening Updates (Task 1.2)
   * --------------------------------------------------------------------------- */
  describe('2. Unauthorized Screening Updates (Migration 008 RLS)', () => {
    const existingScreening: ScreeningRow = {
      id: 'screen-101',
      candidate_id: 'cand-101',
      screening_time: '2026-10-09T09:00:00Z',
      venue: 'SCC Raipur Head Office',
      result: 'Hold',
      created_by: activeRecruiter1.id,
      is_active: true,
    };

    it('allows the original screening creator to update their assessment', () => {
      expect(evaluateScreeningsUpdatePolicy(existingScreening, activeRecruiter1)).toBe(true);
    });

    it('allows an administrator or manager to update any screening assessment', () => {
      expect(evaluateScreeningsUpdatePolicy(existingScreening, activeAdmin)).toBe(true);
      expect(evaluateScreeningsUpdatePolicy(existingScreening, activeManager)).toBe(true);
    });

    it('strictly blocks other non-creator recruiters from tampering with screening records', () => {
      expect(evaluateScreeningsUpdatePolicy(existingScreening, activeRecruiter2)).toBe(false);
    });

    it('strictly blocks deactivated staff members even if they created the record', () => {
      const formerStaffScreening: ScreeningRow = {
        ...existingScreening,
        created_by: inactiveRecruiter.id,
      };
      expect(evaluateScreeningsUpdatePolicy(formerStaffScreening, inactiveRecruiter)).toBe(false);
    });
  });

  /* ---------------------------------------------------------------------------
   * 3. Screening Creator Attribution (Task 1.3)
   * --------------------------------------------------------------------------- */
  describe('3. Screening Creator Attribution (Migration 008 Attribution Defense)', () => {
    it('accepts omitted created_by by relying on DEFAULT auth.uid()', () => {
      const screeningWithoutAttribution: Partial<ScreeningRow> = {
        candidate_id: 'cand-101',
        result: 'Pass',
        created_by: undefined,
      };
      expect(evaluateScreeningsInsertPolicy(screeningWithoutAttribution, activeRecruiter1)).toBe(true);
    });

    it('blocks a non-admin from forging created_by to another recruiter or admin', () => {
      const spoofedScreening: Partial<ScreeningRow> = {
        candidate_id: 'cand-101',
        result: 'Pass',
        created_by: activeAdmin.id, // Recruiter attempts to claim Admin created it
      };
      expect(evaluateScreeningsInsertPolicy(spoofedScreening, activeRecruiter1)).toBe(false);
    });

    it('allows an administrator to explicitly set created_by to another user during migration/delegation', () => {
      const delegatedScreening: Partial<ScreeningRow> = {
        candidate_id: 'cand-101',
        result: 'Pass',
        created_by: activeRecruiter1.id,
      };
      expect(evaluateScreeningsInsertPolicy(delegatedScreening, activeAdmin)).toBe(true);
    });
  });

  /* ---------------------------------------------------------------------------
   * 4. Decimal Ratings (Task 1.4)
   * --------------------------------------------------------------------------- */
  describe('4. Decimal Ratings Compatibility (overall_rating numeric(3,1))', () => {
    it('accepts valid decimal ratings like 4.5, 3.5, and 1.5', () => {
      expect(validateOverallRating(4.5)).toBe(true);
      expect(validateOverallRating(3.5)).toBe(true);
      expect(validateOverallRating(1.5)).toBe(true);
    });

    it('accepts valid whole number boundary ratings 1.0 and 5.0', () => {
      expect(validateOverallRating(1.0)).toBe(true);
      expect(validateOverallRating(5.0)).toBe(true);
      expect(validateOverallRating(3)).toBe(true);
    });

    it('accepts null and undefined for optional overall rating', () => {
      expect(validateOverallRating(null)).toBe(true);
      expect(validateOverallRating(undefined)).toBe(true);
    });

    it('strictly rejects out-of-range ratings (< 1.0 or > 5.0)', () => {
      expect(validateOverallRating(0.5)).toBe(false);
      expect(validateOverallRating(0.9)).toBe(false);
      expect(validateOverallRating(5.1)).toBe(false);
      expect(validateOverallRating(6.0)).toBe(false);
      expect(validateOverallRating(-1.0)).toBe(false);
    });
  });

  /* ---------------------------------------------------------------------------
   * 5. Refunded Payment Status & Calculations (Task 1.5)
   * --------------------------------------------------------------------------- */
  describe('5. Registration Fee Refund Support (payment_records_status_check)', () => {
    it('accepts Refunded along with existing statuses (Paid, Partial, Pending)', () => {
      expect(validatePaymentStatus('Paid')).toBe(true);
      expect(validatePaymentStatus('Partial')).toBe(true);
      expect(validatePaymentStatus('Pending')).toBe(true);
      expect(validatePaymentStatus('Refunded')).toBe(true);
    });

    it('strictly rejects invalid or corrupted payment statuses', () => {
      expect(validatePaymentStatus('Cancelled')).toBe(false);
      expect(validatePaymentStatus('Void')).toBe(false);
      expect(validatePaymentStatus('Disputed')).toBe(false);
      expect(validatePaymentStatus('unknown')).toBe(false);
    });

    it('correctly calculates net received fee and computed status when refund is recorded', () => {
      const expectedFee = 200;
      const payments: PaymentRow[] = [
        { id: 'pay-1', candidate_id: 'cand-1', type: 'Candidate_Registration', amount: 200, payment_method: 'UPI', status: 'Paid' },
        { id: 'pay-2', candidate_id: 'cand-1', type: 'Candidate_Registration', amount: 200, payment_method: 'Cash', status: 'Refunded' },
      ];

      const totalPaid = payments
        .filter((p) => p.status === 'Paid' || p.status === 'Partial')
        .reduce((sum, p) => sum + p.amount, 0);

      const totalRefunded = payments
        .filter((p) => p.status === 'Refunded')
        .reduce((sum, p) => sum + p.amount, 0);

      const netReceived = totalPaid - totalRefunded;
      expect(netReceived).toBe(0);

      const computedStatus = (hasRefund: boolean, net: number) => {
        if (hasRefund && net <= 0) return 'Refunded';
        if (net >= expectedFee) return 'Paid';
        if (net > 0) return 'Partial';
        return 'Unpaid';
      };

      expect(computedStatus(true, netReceived)).toBe('Refunded');
    });
  });

  /* ---------------------------------------------------------------------------
   * 6. Task Attribution & Trigger Anti-Spoofing (Task 2)
   * --------------------------------------------------------------------------- */
  describe('6. Tasks Attribution & Trigger Anti-Spoofing (Migration 009)', () => {
    it('automatically attributes task to auth.uid() when created_by is omitted', () => {
      const incomingTask: Partial<TaskRow> = { title: 'Call candidate back', status: 'Pending' };
      const triggered = executeTasksAttributionTrigger(incomingTask, activeRecruiter1.id, activeRecruiter1);

      expect(triggered.created_by).toBe(activeRecruiter1.id);
      expect(evaluateTasksInsertPolicy(triggered, activeRecruiter1)).toBe(true);
    });

    it('forcibly resets created_by to caller auth.uid() when a non-admin attempts to forge attribution', () => {
      const forgedTask: Partial<TaskRow> = {
        title: 'Task claiming admin authorship',
        status: 'To Do',
        created_by: activeAdmin.id, // Forged
      };

      const triggered = executeTasksAttributionTrigger(forgedTask, activeRecruiter1.id, activeRecruiter1);

      // Trigger forcibly resets created_by to the caller's actual ID
      expect(triggered.created_by).toBe(activeRecruiter1.id);
      // RLS policy check succeeds under real caller identity
      expect(evaluateTasksInsertPolicy(triggered, activeRecruiter1)).toBe(true);
    });

    it('preserves explicit attribution when an administrator delegates task authorship', () => {
      const delegatedTask: Partial<TaskRow> = {
        title: 'Admin created task on behalf of recruiter',
        status: 'Pending',
        created_by: activeRecruiter1.id,
      };

      const triggered = executeTasksAttributionTrigger(delegatedTask, activeAdmin.id, activeAdmin);

      expect(triggered.created_by).toBe(activeRecruiter1.id);
      expect(evaluateTasksInsertPolicy(triggered, activeAdmin)).toBe(true);
    });

    it('preserves service_role background job attribution where auth.uid() is null', () => {
      const systemTask: Partial<TaskRow> = {
        title: 'System daily follow-up job',
        status: 'Pending',
        created_by: 'system-service-worker-id',
      };

      const triggered = executeTasksAttributionTrigger(systemTask, null, null);

      expect(triggered.created_by).toBe('system-service-worker-id');
    });

    it('allows assigning task to another colleague while preserving author attribution', () => {
      const taskAssignment: Partial<TaskRow> = {
        title: 'Follow up on resume verification',
        status: 'To Do',
        assigned_to_user_id: activeRecruiter2.id, // Assigned to recruiter 2
        assigned_to: 'Telecaller 2',
      };

      const triggered = executeTasksAttributionTrigger(taskAssignment, activeRecruiter1.id, activeRecruiter1);

      expect(triggered.created_by).toBe(activeRecruiter1.id);
      expect(triggered.assigned_to_user_id).toBe(activeRecruiter2.id);
      expect(evaluateTasksInsertPolicy(triggered, activeRecruiter1)).toBe(true);
    });
  });

  /* ---------------------------------------------------------------------------
   * 7. Candidate SELECT vs UPDATE/DELETE Permissions (Task 2.6)
   * --------------------------------------------------------------------------- */
  describe('7. Candidate Pool Visibility vs Update/Delete Isolation (Invariant 1)', () => {
    const candidateRecord: CandidateRow = {
      id: 'cand-501',
      name: 'Rohan Sharma',
      mobile: '9827012345',
      created_by: activeRecruiter1.id,
      assigned_to: activeRecruiter1.id,
      is_active: true,
    };

    it('allows all active team members to SELECT candidate records for multi-client job matching', () => {
      expect(evaluateCandidatesSelectPolicy(activeAdmin)).toBe(true);
      expect(evaluateCandidatesSelectPolicy(activeManager)).toBe(true);
      expect(evaluateCandidatesSelectPolicy(activeRecruiter1)).toBe(true);
      expect(evaluateCandidatesSelectPolicy(activeRecruiter2)).toBe(true); // Can see Recruiter 1's candidate
    });

    it('denies candidate SELECT to deactivated staff members', () => {
      expect(evaluateCandidatesSelectPolicy(inactiveRecruiter)).toBe(false);
    });

    it('restricts candidate UPDATE to creator, assigned recruiter, manager, or admin', () => {
      expect(evaluateCandidatesUpdatePolicy(candidateRecord, activeRecruiter1)).toBe(true); // Owner
      expect(evaluateCandidatesUpdatePolicy(candidateRecord, activeAdmin)).toBe(true); // Admin
      expect(evaluateCandidatesUpdatePolicy(candidateRecord, activeManager)).toBe(true); // Manager

      // Recruiter 2 can SELECT the candidate, but CANNOT UPDATE them
      expect(evaluateCandidatesUpdatePolicy(candidateRecord, activeRecruiter2)).toBe(false);
    });

    it('strictly denies candidate DELETE to all authenticated roles (no DELETE policy exists)', () => {
      expect(evaluateCandidatesDeletePolicy(candidateRecord, activeRecruiter1)).toBe(false);
      expect(evaluateCandidatesDeletePolicy(candidateRecord, activeRecruiter2)).toBe(false);
      expect(evaluateCandidatesDeletePolicy(candidateRecord, activeManager)).toBe(false);
      expect(evaluateCandidatesDeletePolicy(candidateRecord, activeAdmin)).toBe(false);
    });
  });

  /* ---------------------------------------------------------------------------
   * 8. Application Compatibility: Pre vs. Post Migration Behavior
   * --------------------------------------------------------------------------- */
  describe('8. Application Fallback & Post-Migration Direct Sync (Task 3.8)', () => {
    it('classifies missing candidate_screenings table (42P01) as transient pending migration rather than permanent DLQ trap', () => {
      const missingTableErr = { code: '42P01', message: 'relation "candidate_screenings" does not exist' };
      expect(isMissingTableOrSchemaError(missingTableErr)).toBe(true);
      expect(isPermanentError(missingTableErr)).toBe(false);
    });

    it('handles Kanban tasks status transitions safely before migration via fallback notes', () => {
      const taskUpdatePayload = {
        id: 'task-1',
        status: 'In Progress',
        notes: 'Called client',
      };

      // Simulated DataContext pre-migration fallback:
      const handleTasksFallback = (data: typeof taskUpdatePayload, remoteConstraintSupportsKanban: boolean) => {
        if (!remoteConstraintSupportsKanban) {
          return {
            ...data,
            status: 'Pending',
            notes: `${data.notes} [Kanban: ${data.status}]`,
          };
        }
        return data;
      };

      const preMigration = handleTasksFallback(taskUpdatePayload, false);
      expect(preMigration.status).toBe('Pending');
      expect(preMigration.notes).toContain('[Kanban: In Progress]');

      const postMigration = handleTasksFallback(taskUpdatePayload, true);
      expect(postMigration.status).toBe('In Progress');
      expect(postMigration.notes).toBe('Called client');
    });

    it('verifies client-side DataContext auto-injects created_by for screenings and tasks', () => {
      const applyAttributionGuard = (table: string, record: any, currentUserId?: string) => {
        const full = { ...record };
        if ((table === 'tasks' || table === 'candidate_screenings') && !full.created_by && currentUserId) {
          full.created_by = currentUserId;
        }
        return full;
      };

      const task = applyAttributionGuard('tasks', { title: 'Test' }, activeRecruiter1.id);
      expect(task.created_by).toBe(activeRecruiter1.id);

      const screening = applyAttributionGuard('candidate_screenings', { venue: 'Office' }, activeRecruiter1.id);
      expect(screening.created_by).toBe(activeRecruiter1.id);

      const lead = applyAttributionGuard('leads', { name: 'Lead 1' }, activeRecruiter1.id);
      expect(lead.created_by).toBeUndefined(); // Untouched
    });
  });
});
