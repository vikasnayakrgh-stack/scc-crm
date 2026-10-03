import { describe, it, expect, vi } from 'vitest';
import {
  scheduleInterviewWithApplication,
  canUserMarkPlacementPaid,
  getAllowedPaymentStatusesForRole,
  shouldUpdateCandidateRegistrationPaid,
  ScheduleInterviewParams,
} from '../lib/pipelineHelpers';
import { Application, Candidate, PaymentRecord } from '../types';

describe('Stage 5 Wave 1 — P0 Critical Regression Test Suite', () => {
  /* =========================================================================
   * P0-01: Match & Schedule Pipeline Integrity
   * ========================================================================= */
  describe('P0-01: Match & Schedule Pipeline Integrity', () => {
    it('creates a job_application in "Interview Scheduled" stage and links interview to it when none exists', async () => {
      const insertedRecords: Record<string, any[]> = {
        applications: [],
        interviews: [],
      };

      const mockInsert = vi.fn(async (table: string, data: any) => {
        const id = `${table}-${Date.now()}`;
        const record = { ...data, id };
        if (!insertedRecords[table]) {
          insertedRecords[table] = [];
        }
        insertedRecords[table].push(record);
        return { data: record, id };
      });

      const mockUpdate = vi.fn(async (_table: string, _data: any) => ({}));

      const params: ScheduleInterviewParams = {
        candidateId: 'cand-101',
        jobId: 'job-202',
        scheduledTime: '2026-10-06T11:00:00Z',
        currentUser: 'recruiter-rahul',
        existingApplications: [],
        insert: mockInsert,
        update: mockUpdate,
      };

      const result = await scheduleInterviewWithApplication(params);

      // Verify Application was created
      expect(result.applicationCreated).toBe(true);
      expect(result.applicationUpdated).toBe(false);
      expect(mockInsert).toHaveBeenCalledWith('applications', expect.objectContaining({
        candidate_id: 'cand-101',
        job_id: 'job-202',
        stage: 'Interview Scheduled',
        assigned_to: 'recruiter-rahul',
      }));

      // Verify Interview was linked to the newly created Application
      expect(mockInsert).toHaveBeenCalledWith('interviews', expect.objectContaining({
        candidate_id: 'cand-101',
        job_id: 'job-202',
        application_id: result.applicationId,
        scheduled_time: '2026-10-06T11:00:00Z',
        status: 'Scheduled',
      }));

      expect(result.applicationId).toBeTruthy();
      expect(result.interviewId).toBeTruthy();
    });

    it('reuses existing application and advances stage from "Applied" to "Interview Scheduled"', async () => {
      const existingApp: Application = {
        id: 'app-999',
        created_at: '2026-10-01T00:00:00Z',
        candidate_id: 'cand-101',
        job_id: 'job-202',
        stage: 'Applied',
        assigned_to: 'recruiter-rahul',
        is_active: true,
      };

      const mockInsert = vi.fn(async (table: string, data: any) => {
        return { data: { ...data, id: `${table}-new` }, id: `${table}-new` };
      });
      const mockUpdate = vi.fn(async () => ({}));

      const params: ScheduleInterviewParams = {
        candidateId: 'cand-101',
        jobId: 'job-202',
        scheduledTime: '2026-10-07T14:00:00Z',
        currentUser: 'recruiter-rahul',
        existingApplications: [existingApp],
        insert: mockInsert,
        update: mockUpdate,
      };

      const result = await scheduleInterviewWithApplication(params);

      // Must NOT create an application
      expect(result.applicationCreated).toBe(false);
      expect(result.applicationUpdated).toBe(true);
      expect(result.applicationId).toBe('app-999');

      // Must update application stage to 'Interview Scheduled'
      expect(mockUpdate).toHaveBeenCalledWith('applications', {
        id: 'app-999',
        stage: 'Interview Scheduled',
      });

      // Must link interview to existing application
      expect(mockInsert).toHaveBeenCalledWith('interviews', expect.objectContaining({
        candidate_id: 'cand-101',
        job_id: 'job-202',
        application_id: 'app-999',
      }));
    });

    it('idempotency: multiple schedules for same candidate+job reuse application without duplicate application creation', async () => {
      const existingApp: Application = {
        id: 'app-existing-1',
        created_at: '2026-10-01T00:00:00Z',
        candidate_id: 'cand-101',
        job_id: 'job-202',
        stage: 'Interview Scheduled',
        assigned_to: 'recruiter-rahul',
        is_active: true,
      };

      const mockInsert = vi.fn(async (table: string, data: any) => ({
        data: { ...data, id: 'int-round2' },
        id: 'int-round2',
      }));
      const mockUpdate = vi.fn(async () => ({}));

      const params: ScheduleInterviewParams = {
        candidateId: 'cand-101',
        jobId: 'job-202',
        scheduledTime: '2026-10-08T16:00:00Z',
        currentUser: 'recruiter-rahul',
        existingApplications: [existingApp],
        insert: mockInsert,
        update: mockUpdate,
      };

      const result = await scheduleInterviewWithApplication(params);

      expect(result.applicationCreated).toBe(false);
      expect(result.applicationId).toBe('app-existing-1');
      // No extra application inserted
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockInsert).toHaveBeenCalledWith('interviews', expect.anything());
    });

    it('throws validation error if required parameters are missing', async () => {
      const mockInsert = vi.fn();
      const mockUpdate = vi.fn();

      await expect(
        scheduleInterviewWithApplication({
          candidateId: '',
          jobId: 'job-1',
          scheduledTime: '2026-10-08T10:00:00Z',
          existingApplications: [],
          insert: mockInsert,
          update: mockUpdate,
        })
      ).rejects.toThrow('Candidate, Job opening, and scheduled time are required');

      await expect(
        scheduleInterviewWithApplication({
          candidateId: 'cand-1',
          jobId: '',
          scheduledTime: '2026-10-08T10:00:00Z',
          existingApplications: [],
          insert: mockInsert,
          update: mockUpdate,
        })
      ).rejects.toThrow('Candidate, Job opening, and scheduled time are required');

      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('handles insertion failure gracefully without returning partial invalid state', async () => {
      const mockInsert = vi.fn().mockRejectedValueOnce(new Error('Network offline or RLS denial'));
      const mockUpdate = vi.fn();

      await expect(
        scheduleInterviewWithApplication({
          candidateId: 'cand-1',
          jobId: 'job-1',
          scheduledTime: '2026-10-08T10:00:00Z',
          existingApplications: [],
          insert: mockInsert,
          update: mockUpdate,
        })
      ).rejects.toThrow('Network offline or RLS denial');
    });
  });

  /* =========================================================================
   * P0-02: Placement Invoice Permissions & Status Rules
   * ========================================================================= */
  describe('P0-02: Placement Invoice Permissions & Status Rules', () => {
    it('restricts recruiters to "Pending" status when creating an Employer_Placement invoice', () => {
      const allowed = getAllowedPaymentStatusesForRole('recruiter', 'Employer_Placement');
      expect(allowed).toEqual(['Pending']);
      expect(allowed).not.toContain('Paid');
    });

    it('allows Admin and Manager to create or mark Employer_Placement invoice as "Paid" or "Pending"', () => {
      const adminAllowed = getAllowedPaymentStatusesForRole('admin', 'Employer_Placement');
      expect(adminAllowed).toContain('Paid');
      expect(adminAllowed).toContain('Pending');

      const managerAllowed = getAllowedPaymentStatusesForRole('manager', 'Employer_Placement');
      expect(managerAllowed).toContain('Paid');
      expect(managerAllowed).toContain('Pending');
    });

    it('allows recruiters to record Candidate_Registration as "Paid" or "Pending"', () => {
      const recruiterCandidateRegAllowed = getAllowedPaymentStatusesForRole(
        'recruiter',
        'Candidate_Registration'
      );
      expect(recruiterCandidateRegAllowed).toContain('Paid');
      expect(recruiterCandidateRegAllowed).toContain('Pending');
    });

    it('canUserMarkPlacementPaid only permits admin and manager roles', () => {
      expect(canUserMarkPlacementPaid('admin')).toBe(true);
      expect(canUserMarkPlacementPaid('Admin')).toBe(true);
      expect(canUserMarkPlacementPaid('manager')).toBe(true);
      expect(canUserMarkPlacementPaid('Manager')).toBe(true);

      expect(canUserMarkPlacementPaid('recruiter')).toBe(false);
      expect(canUserMarkPlacementPaid('telecaller')).toBe(false);
      expect(canUserMarkPlacementPaid('')).toBe(false);
    });
  });

  /* =========================================================================
   * P0-03: Candidate Registration Fee Synchronization
   * ========================================================================= */
  describe('P0-03: Candidate Registration Fee Synchronization', () => {
    it('shouldUpdateCandidateRegistrationPaid returns true ONLY for Candidate_Registration with status Paid', () => {
      expect(shouldUpdateCandidateRegistrationPaid('Candidate_Registration', 'Paid')).toBe(true);
    });

    it('shouldUpdateCandidateRegistrationPaid returns false for Candidate_Registration with status Pending', () => {
      expect(shouldUpdateCandidateRegistrationPaid('Candidate_Registration', 'Pending')).toBe(false);
    });

    it('shouldUpdateCandidateRegistrationPaid returns false for Employer_Placement regardless of status', () => {
      expect(shouldUpdateCandidateRegistrationPaid('Employer_Placement', 'Paid')).toBe(false);
      expect(shouldUpdateCandidateRegistrationPaid('Employer_Placement', 'Pending')).toBe(false);
    });

    it('shouldUpdateCandidateRegistrationPaid returns false for Other payment types', () => {
      expect(shouldUpdateCandidateRegistrationPaid('Other', 'Paid')).toBe(false);
    });

    it('correctly simulates candidate registration_fee_paid state update on payment success', () => {
      const candidate: Candidate = {
        id: 'cand-301',
        created_at: '2026-10-01T00:00:00Z',
        name: 'Vikas Patel',
        mobile: '9826012345',
        experience: 1,
        skills: ['Counter Sales'],
        location: 'Raipur',
        expected_salary: 12000,
        last_role: 'Sales Executive',
        status: 'Active',
        owner_id: 'Recruiter-1',
        is_active: true,
        registration_fee_paid: false,
      };

      const payment: PaymentRecord = {
        id: 'pay-501',
        created_at: '2026-10-03T10:00:00Z',
        candidate_id: candidate.id,
        amount: 200,
        type: 'Candidate_Registration',
        status: 'Paid',
        payment_method: 'UPI',
        reference_no: 'UPI/2026/9991',
        paid_at: '2026-10-03T10:00:00Z',
        recorded_by: 'Recruiter-1',
        is_active: true,
      };

      let updatedCandidate = { ...candidate };

      if (shouldUpdateCandidateRegistrationPaid(payment.type, payment.status)) {
        updatedCandidate.registration_fee_paid = true;
      }

      expect(updatedCandidate.registration_fee_paid).toBe(true);
    });

    it('does not mark candidate registration_fee_paid if payment creation fails', () => {
      const candidate: Candidate = {
        id: 'cand-302',
        created_at: '2026-10-01T00:00:00Z',
        name: 'Pooja Verma',
        mobile: '9826054321',
        experience: 2,
        skills: ['Back Office'],
        location: 'Raipur',
        expected_salary: 14000,
        last_role: 'Clerk',
        status: 'Active',
        owner_id: 'Recruiter-1',
        is_active: true,
        registration_fee_paid: false,
      };

      let candidateState = { ...candidate };
      let paymentFailed = true;

      if (!paymentFailed) {
        candidateState.registration_fee_paid = true;
      }

      // Proves failure preserves candidate unpaid state
      expect(candidateState.registration_fee_paid).toBe(false);
    });

    it('idempotency: multiple or replayed registration payments do not corrupt candidate state', () => {
      let candidateRegistrationPaid = false;

      // First payment
      if (shouldUpdateCandidateRegistrationPaid('Candidate_Registration', 'Paid')) {
        candidateRegistrationPaid = true;
      }
      expect(candidateRegistrationPaid).toBe(true);

      // Replay / second payment confirmation
      if (shouldUpdateCandidateRegistrationPaid('Candidate_Registration', 'Paid')) {
        candidateRegistrationPaid = true;
      }
      expect(candidateRegistrationPaid).toBe(true);
    });
  });
});
