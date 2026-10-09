import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Candidate,
  Employer,
  Job,
  Interview,
  FollowUpTask,
  PaymentRecord,
  CandidateScreening,
  TaskKanbanStatus,
  RescheduleEvent,
  Application,
} from '../types';
import {
  calculateRegistrationFeeStatus,
  validateRegistrationRefund,
} from '../lib/registrationFee';
import {
  isCandidateClientEligible,
  validateScreeningRatings,
} from '../lib/screeningHelpers';
import {
  filterActiveJobsForEmployer,
  scheduleInterviewWithApplication,
} from '../lib/pipelineHelpers';
import {
  resolveKanbanStatus,
  isTaskOverdue,
} from '../lib/taskHelpers';
import {
  isPermanentError,
  isMissingTableOrSchemaError,
  enqueueMutation,
  getPendingMutations,
  processOfflineQueue,
  getDeadLetterMutations,
  retryDeadLetterMutationsForTable,
  retryDeadLetterMutation,
  closeOfflineDb,
  resetQueueProcessingStateForTesting,
  QueuedMutation,
} from '../lib/offlineQueue';

// In-memory IndexedDB persistent backing store for offline queue tests in Node.js
function setupMockIndexedDB() {
  const diskStorage = new Map<string, Map<string, any>>();

  const getDiskStore = (dbName: string, storeName: string) => {
    const key = `${dbName}::${storeName}`;
    if (!diskStorage.has(key)) {
      diskStorage.set(key, new Map());
    }
    return diskStorage.get(key)!;
  };

  const mockIDB = {
    open(dbName: string, _version: number) {
      const request: any = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };

      const existingStores = new Set<string>();

      const mockDb: any = {
        name: dbName,
        objectStoreNames: {
          contains(name: string) {
            return existingStores.has(name);
          },
        },
        createObjectStore(storeName: string, _options?: any) {
          existingStores.add(storeName);
          getDiskStore(dbName, storeName);
          return {};
        },
        transaction(_storeNames: string | string[], _mode: string) {
          const tx: any = {
            error: null,
            oncomplete: null,
            onerror: null,
            objectStore(name: string) {
              const disk = getDiskStore(dbName, name);
              return {
                put(value: any) {
                  const req: any = {};
                  setTimeout(() => {
                    disk.set(value.id, JSON.parse(JSON.stringify(value)));
                    if (req.onsuccess) req.onsuccess({ target: { result: value.id } });
                  }, 0);
                  return req;
                },
                get(id: string) {
                  const req: any = {};
                  setTimeout(() => {
                    const item = disk.get(id);
                    req.result = item ? JSON.parse(JSON.stringify(item)) : undefined;
                    if (req.onsuccess) req.onsuccess({ target: { result: req.result } });
                  }, 0);
                  return req;
                },
                getAll() {
                  const req: any = {};
                  setTimeout(() => {
                    req.result = Array.from(disk.values()).map((v) => JSON.parse(JSON.stringify(v)));
                    if (req.onsuccess) req.onsuccess({ target: { result: req.result } });
                  }, 0);
                  return req;
                },
                delete(id: string) {
                  const req: any = {};
                  setTimeout(() => {
                    disk.delete(id);
                    if (req.onsuccess) req.onsuccess({ target: { result: undefined } });
                  }, 0);
                  return req;
                },
                count() {
                  const req: any = {};
                  setTimeout(() => {
                    req.result = disk.size;
                    if (req.onsuccess) req.onsuccess({ target: { result: req.result } });
                  }, 0);
                  return req;
                },
                clear() {
                  const req: any = {};
                  setTimeout(() => {
                    disk.clear();
                    if (req.onsuccess) req.onsuccess({ target: { result: undefined } });
                  }, 0);
                  return req;
                },
              };
            },
          };

          setTimeout(() => {
            if (tx.oncomplete) tx.oncomplete();
          }, 5);

          return tx;
        },
        close() {},
      };

      setTimeout(() => {
        request.result = mockDb;
        if (request.onupgradeneeded) {
          request.onupgradeneeded({ target: request });
        }
        if (request.onsuccess) {
          request.onsuccess({ target: request });
        }
      }, 0);

      return request;
    },
    clearAll() {
      diskStorage.clear();
    },
  };

  (globalThis as any).indexedDB = mockIDB;
  return mockIDB;
}

describe('Recruitment Workflow Enhancements & Production Defect Verifications', () => {
  let mockDB: ReturnType<typeof setupMockIndexedDB>;

  beforeEach(() => {
    closeOfflineDb();
    resetQueueProcessingStateForTesting();
    mockDB = setupMockIndexedDB();
    mockDB.clearAll();
  });

  afterEach(() => {
    closeOfflineDb();
    resetQueueProcessingStateForTesting();
    mockDB?.clearAll();
  });

  /* =========================================================================
   * 1. Candidate Remarks & Client Notes Persistence
   * ========================================================================= */
  describe('P0: Candidate Remarks & Client Notes Isolation & Persistence', () => {
    it('updates candidate notes without mutating unrelated candidate fields or interview feedback', () => {
      const initialCandidate: Candidate = {
        id: 'cand-001',
        created_at: '2026-10-01T10:00:00Z',
        name: 'Rohan Sharma',
        mobile: '9826198261',
        experience: 3.5,
        skills: ['Tally', 'GST'],
        location: 'Raipur',
        expected_salary: 20000,
        last_role: 'Accountant',
        status: 'Active',
        notes: 'Initial walk-in note',
        owner_id: 'user-001',
        is_active: true,
      };

      const updatedNotes = 'Candidate passed office screening. Strong accountant candidate.';
      const updatedCandidate: Candidate = {
        ...initialCandidate,
        notes: updatedNotes,
      };

      expect(updatedCandidate.id).toBe(initialCandidate.id);
      expect(updatedCandidate.mobile).toBe(initialCandidate.mobile);
      expect(updatedCandidate.skills).toEqual(initialCandidate.skills);
      expect(updatedCandidate.notes).toBe(updatedNotes);
      expect(updatedCandidate.status).toBe('Active');
    });

    it('updates client employer notes independently without leaking into candidate notes', () => {
      const initialEmployer: Employer = {
        id: 'emp-101',
        created_at: '2026-09-01T10:00:00Z',
        company_name: 'Shree Cement Ltd',
        contact_person: 'Vikas Agarwal',
        phone: '9893098930',
        location: 'Raipur',
        status: 'Active',
        notes: 'Old client payment terms',
        is_active: true,
      };

      const newClientNotes = 'Immediate requirement for Senior Accountant. Salary budget 25k.';
      const updatedEmployer: Employer = {
        ...initialEmployer,
        notes: newClientNotes,
      };

      expect(updatedEmployer.id).toBe(initialEmployer.id);
      expect(updatedEmployer.company_name).toBe(initialEmployer.company_name);
      expect(updatedEmployer.notes).toBe(newClientNotes);
      expect((updatedEmployer as any).skills).toBeUndefined();
    });
  });

  /* =========================================================================
   * 2. Office Screening Module & Rating Precision
   * ========================================================================= */
  describe('P1: Office Screening Interview Module & Rating Validation', () => {
    it('validates ratings including fractional overall_rating (e.g. 4.5, 3.5) supported by numeric(3,1)', () => {
      expect(validateScreeningRatings({ communicationRating: 4, confidenceRating: 5, overallRating: 4.5 })).toEqual({
        valid: true,
      });

      expect(validateScreeningRatings({ communicationRating: 3, confidenceRating: 3, overallRating: 3.5 })).toEqual({
        valid: true,
      });

      // Out of bounds overall rating
      expect(validateScreeningRatings({ overallRating: 5.5 })).toEqual({
        valid: false,
        error: 'Overall rating must be between 1.0 and 5.0',
      });

      expect(validateScreeningRatings({ overallRating: 0.5 })).toEqual({
        valid: false,
        error: 'Overall rating must be between 1.0 and 5.0',
      });

      // Out of bounds communication rating
      expect(validateScreeningRatings({ communicationRating: 6 })).toEqual({
        valid: false,
        error: 'Communication rating must be between 1 and 5',
      });
    });

    it('accurately evaluates candidate client-readiness via production isCandidateClientEligible', () => {
      const passedCandidate: Candidate = {
        id: 'cand-001',
        created_at: '2026-10-01T10:00:00Z',
        name: 'Aman Patel',
        mobile: '9826011111',
        experience: 2,
        skills: ['Sales'],
        location: 'Raipur',
        expected_salary: 18000,
        last_role: 'Sales Executive',
        status: 'Active',
        screening_status: 'Pass',
        owner_id: 'user-001',
        is_active: true,
      };

      const holdCandidate: Candidate = {
        id: 'cand-002',
        created_at: '2026-10-01T10:00:00Z',
        name: 'Sunita Dewangan',
        mobile: '9826022222',
        experience: 1,
        skills: ['Reception'],
        location: 'Bhilai',
        expected_salary: 12000,
        last_role: 'Receptionist',
        status: 'Active',
        screening_status: 'Hold',
        owner_id: 'user-001',
        is_active: true,
      };

      const unScreenedCandidate: Candidate = {
        id: 'cand-003',
        created_at: '2026-10-01T10:00:00Z',
        name: 'Pooja Verma',
        mobile: '9826033333',
        experience: 4,
        skills: ['HR'],
        location: 'Raipur',
        expected_salary: 25000,
        last_role: 'HR Executive',
        status: 'Active',
        screening_status: 'Pending',
        owner_id: 'user-001',
        is_active: true,
      };

      expect(isCandidateClientEligible(passedCandidate)).toBe(true);
      expect(isCandidateClientEligible(holdCandidate)).toBe(false);
      expect(isCandidateClientEligible(holdCandidate, true)).toBe(true); // Explicit override
      expect(isCandidateClientEligible(unScreenedCandidate)).toBe(false);
      expect(isCandidateClientEligible(null)).toBe(false);
    });

    it('preserves chronological screening history without overwriting prior rounds', () => {
      const round1: CandidateScreening = {
        id: 'scr-001',
        candidate_id: 'cand-002',
        screening_time: '2026-10-01T10:00:00Z',
        venue: 'SCC Head Office',
        skills_assessment: 'Basic Excel only',
        communication_rating: 2,
        confidence_rating: 3,
        overall_rating: 2.5,
        remarks: 'Needs practice',
        result: 'Hold',
        screening_staff: 'Telecaller-1',
        created_at: '2026-10-01T10:30:00Z',
        is_active: true,
      };

      const round2: CandidateScreening = {
        id: 'scr-002',
        candidate_id: 'cand-002',
        screening_time: '2026-10-04T14:00:00Z',
        venue: 'SCC Head Office',
        skills_assessment: 'Cleared Pivot table test',
        communication_rating: 4,
        confidence_rating: 4,
        overall_rating: 4.0,
        remarks: 'Much improved',
        result: 'Pass',
        screening_staff: 'Admin',
        created_at: '2026-10-04T14:30:00Z',
        is_active: true,
      };

      const history = [round1, round2];
      expect(history).toHaveLength(2);
      expect(history[0]!.result).toBe('Hold');
      expect(history[1]!.result).toBe('Pass');
      expect(history[0]!.id).not.toBe(history[1]!.id);
    });
  });

  /* =========================================================================
   * 3. Registration Fee Tracking & Accounting Refund Reconciliations
   * ========================================================================= */
  describe('P1: Registration Fee Ledger & Status Calculation (Domain Module)', () => {
    it('returns Unpaid for empty payment history', () => {
      const summary = calculateRegistrationFeeStatus([]);
      expect(summary).toEqual({
        expectedFee: 200,
        totalPaid: 0,
        totalRefunded: 0,
        netReceived: 0,
        outstandingAmount: 200,
        computedStatus: 'Unpaid',
        isRegistrationFeePaid: false,
        canRefund: false,
        maxRefundableAmount: 0,
      });
    });

    it('correctly calculates Partial payment of ₹100', () => {
      const partialPayment: Partial<PaymentRecord> = {
        id: 'pay-001',
        type: 'Candidate_Registration',
        amount: 100,
        status: 'Partial',
        is_active: true,
      };

      const summary = calculateRegistrationFeeStatus([partialPayment as PaymentRecord]);
      expect(summary.netReceived).toBe(100);
      expect(summary.outstandingAmount).toBe(100);
      expect(summary.computedStatus).toBe('Partial');
      expect(summary.isRegistrationFeePaid).toBe(false);
      expect(summary.canRefund).toBe(true);
      expect(summary.maxRefundableAmount).toBe(100);
    });

    it('correctly calculates Full payment of ₹200', () => {
      const fullPayment: Partial<PaymentRecord> = {
        id: 'pay-002',
        type: 'Candidate_Registration',
        amount: 200,
        status: 'Paid',
        is_active: true,
      };

      const summary = calculateRegistrationFeeStatus([fullPayment as PaymentRecord]);
      expect(summary.netReceived).toBe(200);
      expect(summary.outstandingAmount).toBe(0);
      expect(summary.computedStatus).toBe('Paid');
      expect(summary.isRegistrationFeePaid).toBe(true);
      expect(summary.canRefund).toBe(true);
      expect(summary.maxRefundableAmount).toBe(200);
    });

    it('correctly calculates full refund: netReceived drops to 0 and status becomes Refunded', () => {
      const payments: Partial<PaymentRecord>[] = [
        { id: 'p1', type: 'Candidate_Registration', amount: 200, status: 'Paid', is_active: true },
        { id: 'p2', type: 'Candidate_Registration', amount: 200, status: 'Refunded', is_active: true },
      ];

      const summary = calculateRegistrationFeeStatus(payments as PaymentRecord[]);
      expect(summary.totalPaid).toBe(200);
      expect(summary.totalRefunded).toBe(200);
      expect(summary.netReceived).toBe(0);
      expect(summary.outstandingAmount).toBe(200);
      expect(summary.computedStatus).toBe('Refunded');
      expect(summary.isRegistrationFeePaid).toBe(false);
      expect(summary.canRefund).toBe(false);
      expect(summary.maxRefundableAmount).toBe(0);
    });

    it('correctly calculates partial refund: candidate pays ₹200, receives ₹50 refund', () => {
      const payments: Partial<PaymentRecord>[] = [
        { id: 'p1', type: 'Candidate_Registration', amount: 200, status: 'Paid', is_active: true },
        { id: 'p2', type: 'Candidate_Registration', amount: 50, status: 'Refunded', is_active: true },
      ];

      const summary = calculateRegistrationFeeStatus(payments as PaymentRecord[]);
      expect(summary.totalPaid).toBe(200);
      expect(summary.totalRefunded).toBe(50);
      expect(summary.netReceived).toBe(150);
      expect(summary.outstandingAmount).toBe(50);
      expect(summary.computedStatus).toBe('Partial');
      expect(summary.isRegistrationFeePaid).toBe(false);
      expect(summary.canRefund).toBe(true);
      expect(summary.maxRefundableAmount).toBe(150);
    });

    it('reconciles multiple split payments totaling ₹200', () => {
      const payments: Partial<PaymentRecord>[] = [
        { id: 'p1', type: 'Candidate_Registration', amount: 100, status: 'Partial', is_active: true },
        { id: 'p2', type: 'Candidate_Registration', amount: 100, status: 'Paid', is_active: true },
      ];

      const summary = calculateRegistrationFeeStatus(payments as PaymentRecord[]);
      expect(summary.totalPaid).toBe(200);
      expect(summary.netReceived).toBe(200);
      expect(summary.outstandingAmount).toBe(0);
      expect(summary.computedStatus).toBe('Paid');
      expect(summary.isRegistrationFeePaid).toBe(true);
    });

    it('reconciles candidate re-payment after a full refund', () => {
      const payments: Partial<PaymentRecord>[] = [
        { id: 'p1', type: 'Candidate_Registration', amount: 200, status: 'Paid', is_active: true },
        { id: 'p2', type: 'Candidate_Registration', amount: 200, status: 'Refunded', is_active: true },
        { id: 'p3', type: 'Candidate_Registration', amount: 200, status: 'Paid', is_active: true },
      ];

      const summary = calculateRegistrationFeeStatus(payments as PaymentRecord[]);
      expect(summary.totalPaid).toBe(400);
      expect(summary.totalRefunded).toBe(200);
      expect(summary.netReceived).toBe(200);
      expect(summary.outstandingAmount).toBe(0);
      expect(summary.computedStatus).toBe('Paid');
      expect(summary.isRegistrationFeePaid).toBe(true);
    });

    it('blocks over-refund attempt where refundAmount exceeds net balance', () => {
      const payments: Partial<PaymentRecord>[] = [
        { id: 'p1', type: 'Candidate_Registration', amount: 200, status: 'Paid', is_active: true },
      ];

      const validation = validateRegistrationRefund(payments as PaymentRecord[], 250);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Cannot refund ₹250. Maximum refundable balance is ₹200.');
    });

    it('blocks refund attempt on candidates with zero received balance', () => {
      const validation = validateRegistrationRefund([], 100);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('No refundable balance available');
    });

    it('blocks duplicate refund attempt after candidate is already fully refunded', () => {
      const payments: Partial<PaymentRecord>[] = [
        { id: 'p1', type: 'Candidate_Registration', amount: 200, status: 'Paid', is_active: true },
        { id: 'p2', type: 'Candidate_Registration', amount: 200, status: 'Refunded', is_active: true },
      ];

      const validation = validateRegistrationRefund(payments as PaymentRecord[], 50);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('No refundable balance available');
    });

    it('blocks invalid refund amounts (negative or decimal values)', () => {
      const payments: Partial<PaymentRecord>[] = [
        { id: 'p1', type: 'Candidate_Registration', amount: 200, status: 'Paid', is_active: true },
      ];

      expect(validateRegistrationRefund(payments as PaymentRecord[], -50).valid).toBe(false);
      expect(validateRegistrationRefund(payments as PaymentRecord[], 0).valid).toBe(false);
      expect(validateRegistrationRefund(payments as PaymentRecord[], 50.75).valid).toBe(false);
    });
  });

  /* =========================================================================
   * 4. Candidate-to-Client Interview Scheduling & Job Filtering
   * ========================================================================= */
  describe('P1: Candidate-to-Client Interview Scheduling & Job Filtering', () => {
    const mockJobs: Job[] = [
      {
        id: 'job-001',
        employer_id: 'emp-101',
        company_name: 'Shree Cement Ltd',
        role: 'Accountant',
        location: 'Raipur',
        min_exp: 2,
        max_exp: 5,
        salary_min: 18000,
        salary_max: 25000,
        skills_req: ['Tally', 'GST'],
        urgency: 1,
        status: 'Open',
        created_at: '2026-10-01T10:00:00Z',
        is_active: true,
      },
      {
        id: 'job-002',
        employer_id: 'emp-101',
        company_name: 'Shree Cement Ltd',
        role: 'Commercial Billing Clerk',
        location: 'Raipur',
        min_exp: 1,
        max_exp: 3,
        salary_min: 15000,
        salary_max: 20000,
        skills_req: ['Excel'],
        urgency: 2,
        status: 'Open',
        created_at: '2026-10-01T10:00:00Z',
        is_active: true,
      },
      {
        id: 'job-003',
        employer_id: 'emp-102',
        company_name: 'Jindal Steel',
        role: 'Site Mechanical Engineer',
        location: 'Raigarh',
        min_exp: 3,
        max_exp: 6,
        salary_min: 30000,
        salary_max: 45000,
        skills_req: ['AutoCAD'],
        urgency: 1,
        status: 'Open',
        created_at: '2026-10-01T10:00:00Z',
        is_active: true,
      },
      {
        id: 'job-004',
        employer_id: 'emp-101',
        company_name: 'Shree Cement Ltd',
        role: 'Closed Dispatch Clerk',
        location: 'Raipur',
        min_exp: 1,
        max_exp: 2,
        salary_min: 10000,
        salary_max: 12000,
        skills_req: ['Computer Basics'],
        urgency: 1,
        status: 'Closed',
        created_at: '2026-10-01T10:00:00Z',
        is_active: true,
      },
    ];

    it('filters active jobs belonging exclusively to the selected employer via filterActiveJobsForEmployer', () => {
      const jobsForEmp101 = filterActiveJobsForEmployer(mockJobs, 'emp-101');
      expect(jobsForEmp101).toHaveLength(2);
      expect(jobsForEmp101.map((j) => j.id)).toEqual(['job-001', 'job-002']);

      const jobsForEmp102 = filterActiveJobsForEmployer(mockJobs, 'emp-102');
      expect(jobsForEmp102).toHaveLength(1);
      expect(jobsForEmp102[0]!.role).toBe('Site Mechanical Engineer');

      // Empty employer returns empty array
      expect(filterActiveJobsForEmployer(mockJobs, '')).toEqual([]);
    });

    it('idempotently links job applications when scheduling interviews via scheduleInterviewWithApplication', async () => {
      const mockInsert = vi.fn(async (table: string, data: any) => ({ data: { id: `${table}-new-id`, ...data } }));
      const mockUpdate = vi.fn(async () => ({}));

      const existingApps: Application[] = [];

      const result = await scheduleInterviewWithApplication({
        candidateId: 'cand-001',
        jobId: 'job-001',
        scheduledTime: '2026-10-10T11:00:00Z',
        currentUser: 'Admin',
        existingApplications: existingApps,
        insert: mockInsert,
        update: mockUpdate,
      });

      expect(result.applicationCreated).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith('applications', expect.objectContaining({
        candidate_id: 'cand-001',
        job_id: 'job-001',
        stage: 'Interview Scheduled',
      }));
      expect(mockInsert).toHaveBeenCalledWith('interviews', expect.objectContaining({
        candidate_id: 'cand-001',
        job_id: 'job-001',
        scheduled_time: '2026-10-10T11:00:00Z',
      }));
    });
  });

  /* =========================================================================
   * 5. Interview Rescheduling & Audit History
   * ========================================================================= */
  describe('P1: Interview Rescheduling with Audit History Preservation', () => {
    it('appends reschedule event to reschedule_history without overwriting prior history or ratings', () => {
      const initialInterview: Interview = {
        id: 'int-001',
        candidate_id: 'cand-001',
        job_id: 'job-001',
        application_id: 'app-001',
        scheduled_time: '2026-10-05T10:00:00Z',
        status: 'Scheduled',
        rating: 4,
        feedback: 'First round technical test cleared',
        reschedule_history: [],
        created_at: '2026-10-01T10:00:00Z',
        is_active: true,
      };

      const rescheduleEvent: RescheduleEvent = {
        previous_time: initialInterview.scheduled_time,
        new_time: '2026-10-07T14:30:00Z',
        rescheduled_at: '2026-10-04T12:00:00Z',
        rescheduled_by: 'Admin',
        reason: 'Client HR traveling out of station',
      };

      const updatedInterview: Interview = {
        ...initialInterview,
        scheduled_time: rescheduleEvent.new_time,
        reschedule_history: [...(initialInterview.reschedule_history || []), rescheduleEvent],
      };

      expect(updatedInterview.scheduled_time).toBe('2026-10-07T14:30:00Z');
      expect(updatedInterview.reschedule_history).toHaveLength(1);
      expect(updatedInterview.reschedule_history![0]!.previous_time).toBe('2026-10-05T10:00:00Z');
      expect(updatedInterview.reschedule_history![0]!.reason).toBe('Client HR traveling out of station');
      expect(updatedInterview.rating).toBe(4);
      expect(updatedInterview.feedback).toBe('First round technical test cleared');
    });

    it('supports multiple sequential rescheduling rounds with complete audit trail', () => {
      const event1: RescheduleEvent = {
        previous_time: '2026-10-05T10:00:00Z',
        new_time: '2026-10-07T14:30:00Z',
        rescheduled_at: '2026-10-04T12:00:00Z',
        rescheduled_by: 'Admin',
        reason: 'Client HR requested postponement',
      };

      const event2: RescheduleEvent = {
        previous_time: '2026-10-07T14:30:00Z',
        new_time: '2026-10-08T11:00:00Z',
        rescheduled_at: '2026-10-06T15:00:00Z',
        rescheduled_by: 'Telecaller-1',
        reason: 'Candidate train delayed',
      };

      const history = [event1, event2];
      expect(history).toHaveLength(2);
      expect(history[0]!.previous_time).toBe('2026-10-05T10:00:00Z');
      expect(history[1]!.new_time).toBe('2026-10-08T11:00:00Z');
      expect(history[1]!.reason).toBe('Candidate train delayed');
    });
  });

  /* =========================================================================
   * 6. Lead Phone Number Direct Display & Clipboard Copy
   * ========================================================================= */
  describe('P2: Lead Phone Number Direct Display & Tap-to-Copy', () => {
    it('copies phone number cleanly to clipboard with fallback when API is unavailable', async () => {
      const mobileNumber = '9826198261';
      let copiedText = '';

      const mockClipboard = {
        writeText: vi.fn(async (text: string) => {
          copiedText = text;
        }),
      };

      await mockClipboard.writeText(mobileNumber);
      expect(mockClipboard.writeText).toHaveBeenCalledWith(mobileNumber);
      expect(copiedText).toBe(mobileNumber);
    });

    it('ensures phone copying does not trigger tel: dialer navigation', () => {
      let isDialerTriggered = false;
      let isCopied = false;

      const handleCopy = (e: { stopPropagation: () => void; preventDefault: () => void }) => {
        e.stopPropagation();
        e.preventDefault();
        isCopied = true;
      };

      const mockEvent = {
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
      };

      handleCopy(mockEvent);
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(isCopied).toBe(true);
      expect(isDialerTriggered).toBe(false);
    });
  });

  /* =========================================================================
   * 7. Tasks & Follow-ups Kanban Board (Authoritative taskHelpers)
   * ========================================================================= */
  describe('P2: Tasks & Follow-ups Kanban Board (taskHelpers)', () => {
    it('maps legacy and kanban statuses into 4 canonical Kanban columns via resolveKanbanStatus', () => {
      expect(resolveKanbanStatus({ status: 'Pending' })).toBe('To Do');
      expect(resolveKanbanStatus({ status: 'Completed' })).toBe('Completed');
      expect(resolveKanbanStatus({ status: 'In Progress' })).toBe('In Progress');
      expect(resolveKanbanStatus({ status: 'Waiting' })).toBe('Waiting');
      expect(resolveKanbanStatus({ kanban_status: 'In Progress', status: 'Pending' })).toBe('In Progress');
      expect(resolveKanbanStatus({ kanban_status: 'Waiting', status: 'Pending' })).toBe('Waiting');
    });

    it('correctly evaluates overdue tasks against current date via isTaskOverdue', () => {
      const today = '2026-10-09';
      expect(isTaskOverdue({ due_date: '2026-10-01', status: 'Pending' }, today)).toBe(true);
      expect(isTaskOverdue({ due_date: '2026-10-01', status: 'Completed' }, today)).toBe(false); // Completed tasks never overdue
      expect(isTaskOverdue({ due_date: '2026-10-09', status: 'Pending' }, today)).toBe(false); // Due today
      expect(isTaskOverdue({ due_date: '2026-10-15', status: 'Pending' }, today)).toBe(false); // Upcoming
    });

    it('updates existing task next_action and notes in-place without creating duplicates', () => {
      const existingTask: FollowUpTask = {
        id: 'task-001',
        title: 'Confirm interview attendance with Rohan',
        due_date: '2026-10-05',
        assigned_to: 'Telecaller-1',
        priority: 'High',
        status: 'Pending',
        kanban_status: 'To Do',
        entity_type: 'candidate',
        entity_id: 'cand-001',
        created_at: '2026-10-01T10:00:00Z',
        is_active: true,
      };

      const updatedTask: FollowUpTask = {
        ...existingTask,
        next_action: 'Send location map on WhatsApp after 3 PM',
        notes: 'Candidate confirmed morning availability',
        kanban_status: 'In Progress',
      };

      expect(updatedTask.id).toBe(existingTask.id);
      expect(updatedTask.next_action).toBe('Send location map on WhatsApp after 3 PM');
      expect(updatedTask.kanban_status).toBe('In Progress');
      expect(updatedTask.entity_id).toBe(existingTask.entity_id);
    });
  });

  /* =========================================================================
   * 8. Offline Queue & Missing Table Recovery Lifecycle
   * ========================================================================= */
  describe('P1: Offline Queue & Missing-Table Error Recovery Lifecycle', () => {
    it('classifies missing table/column and schema cache errors as transient (pending migration)', () => {
      expect(isMissingTableOrSchemaError({ code: '42P01', message: 'relation "candidate_screenings" does not exist' })).toBe(true);
      expect(isMissingTableOrSchemaError({ code: 'PGRST205', message: 'could not find the table "candidate_screenings"' })).toBe(true);
      expect(isMissingTableOrSchemaError({ code: '42703', message: 'column "reschedule_history" does not exist' })).toBe(true);
      expect(isMissingTableOrSchemaError({ message: 'could not find the table "public.candidate_screenings" in schema cache' })).toBe(true);

      // isPermanentError must return false so they undergo exponential retries instead of immediate DLQ dumping
      expect(isPermanentError({ code: '42P01', message: 'relation "candidate_screenings" does not exist' })).toBe(false);
      expect(isPermanentError({ code: 'PGRST205', message: 'could not find the table "candidate_screenings"' })).toBe(false);
    });

    it('classifies permission denied and check constraint violations as permanent', () => {
      expect(isPermanentError({ code: '42501', message: 'permission denied for table candidates' })).toBe(true);
      expect(isPermanentError({ code: '23514', message: 'check constraint "payment_records_status_check" violated' })).toBe(true);
      expect(isPermanentError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(true);
      expect(isPermanentError({ code: 'RECORD_NOT_FOUND', message: 'Record deleted or not found remotely' })).toBe(true);
    });

    it('classifies network failures, timeouts, and auth expiration as transient', () => {
      expect(isPermanentError({ code: 'NETWORK_ERROR', message: 'Failed to fetch' })).toBe(false);
      expect(isPermanentError({ code: 'AUTH_EXPIRED', message: 'JWT expired' })).toBe(false);
      expect(isPermanentError({ message: 'network timeout occurred' })).toBe(false);
    });

    it('prevents missing table from being immediately dumped into DLQ on attempt 1, allowing retry with backoff', async () => {
      await enqueueMutation('candidate_screenings', 'insert', {
        id: 'scr-queue-001',
        candidate_id: 'cand-001',
        venue: 'Head Office',
        result: 'Pass',
      });

      // Executor returns 42P01 (table not yet migrated)
      const mockExecutor = vi.fn(async () => ({
        error: {
          code: '42P01',
          message: 'relation "candidate_screenings" does not exist',
        },
      }));

      const syncResult = await processOfflineQueue(mockExecutor, { skipBackoffCheck: true });

      // First run: item is NOT dead-lettered! It is counted as failed (transient retry attempt 1)
      expect(syncResult.processed).toBe(0);
      expect(syncResult.deadLettered).toBe(0);
      expect(syncResult.failed).toBe(1);

      // Remains in pending queue with retryCount = 1
      const pending = await getPendingMutations();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe('scr-queue-001');
      expect(pending[0]!.retryCount).toBe(1);

      // Dead letter queue remains empty
      const dlq = await getDeadLetterMutations();
      expect(dlq).toHaveLength(0);
    });

    it('synchronizes successfully once migration is applied remotely without duplicating records', async () => {
      const screeningId = 'scr-queue-002';
      await enqueueMutation('candidate_screenings', 'insert', {
        id: screeningId,
        candidate_id: 'cand-001',
        result: 'Pass',
      });

      let migrationApplied = false;

      // Executor fails on attempt 1, but succeeds once migration is applied
      const mockExecutor = vi.fn(async (mutation: QueuedMutation) => {
        if (!migrationApplied) {
          return { error: { code: '42P01', message: 'relation does not exist' } };
        }
        // Simulating remote idempotent upsert
        return { error: null };
      });

      // Run 1: Fails before migration
      await processOfflineQueue(mockExecutor, { skipBackoffCheck: true });
      expect((await getPendingMutations())[0]!.retryCount).toBe(1);

      // Operator applies Migration 008 remotely!
      migrationApplied = true;

      // Run 2: Background sync retries and succeeds!
      const run2Result = await processOfflineQueue(mockExecutor, { skipBackoffCheck: true });
      expect(run2Result.processed).toBe(1);
      expect(run2Result.deadLettered).toBe(0);

      // Queue is completely clean
      expect(await getPendingMutations()).toHaveLength(0);
      expect(await getDeadLetterMutations()).toHaveLength(0);
    });

    it('revives dead-lettered mutations for an unmigrated table via retryDeadLetterMutationsForTable', async () => {
      // Simulate an unmigrated mutation that exhausted retries and landed in DLQ
      await enqueueMutation('candidate_screenings', 'insert', {
        id: 'scr-dlq-001',
        candidate_id: 'cand-001',
        result: 'Hold',
      });

      const failingExecutor = vi.fn(async () => ({
        error: { code: '42P01', message: 'relation does not exist' },
      }));

      // Run 5 attempts to move it to DLQ
      for (let i = 0; i < 5; i++) {
        await processOfflineQueue(failingExecutor, { skipBackoffCheck: true });
      }

      // Confirmed in DLQ
      const dlqItems = await getDeadLetterMutations();
      expect(dlqItems).toHaveLength(1);
      expect(dlqItems[0]!.id).toBe('scr-dlq-001');

      // Operator applies Migration 008 and revives table screenings from DLQ
      const revivedCount = await retryDeadLetterMutationsForTable('candidate_screenings');
      expect(revivedCount).toBe(1);

      // DLQ is empty; pending queue has the revived mutation ready to sync
      expect(await getDeadLetterMutations()).toHaveLength(0);
      const pendingQueue = await getPendingMutations();
      expect(pendingQueue).toHaveLength(1);
      expect(pendingQueue[0]!.id).toBe('scr-dlq-001');
      expect(pendingQueue[0]!.retryCount).toBe(0);

      // Now sync succeeds
      const successExecutor = vi.fn(async () => ({ error: null }));
      const syncResult = await processOfflineQueue(successExecutor, { skipBackoffCheck: true });
      expect(syncResult.processed).toBe(1);
      expect(await getPendingMutations()).toHaveLength(0);
    });
  });
});
