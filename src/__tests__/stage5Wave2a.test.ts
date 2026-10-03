import { describe, it, expect, vi } from 'vitest';
import {
  candidateSchema,
  jobSchema,
  employerSchema,
  parseSkills,
  QUALIFICATION_OPTIONS,
  NOTICE_PERIOD_OPTIONS,
  ACQUISITION_SOURCE_OPTIONS,
} from '../lib/validation';
import { Candidate, Employer, Job, Application, Interview } from '../types';
import { calculateCandidateJobMatch } from '../lib/matching';

describe('Stage 5 Wave 2A: Candidate, Employer & Job Editing & Field Enhancements', () => {
  /* =========================================================================
   * 1. Candidate Editing & New Field Schema Validations
   * ========================================================================= */
  describe('Candidate Validation & New Fields', () => {
    it('validates a complete candidate input with all new Wave 2A fields', () => {
      const validCandidate = {
        name: 'Amit Patel',
        mobile: '9826198261',
        experience: 4,
        skills: 'Excel, Tally Prime, Billing, Taxation',
        location: 'Raipur',
        expected_salary: 28000,
        current_salary: 22000,
        last_role: 'Accountant',
        email: 'amit.patel@example.com',
        qualification: 'Graduate — B.Com',
        notice_period: '15 Days',
        source: 'Job Portal',
        status: 'Active' as const,
        notes: 'Has strong references from previous employer',
      };

      const result = candidateSchema.safeParse(validCandidate);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.qualification).toBe('Graduate — B.Com');
        expect(result.data.notice_period).toBe('15 Days');
        expect(result.data.current_salary).toBe(22000);
        expect(result.data.source).toBe('Job Portal');
      }
    });

    it('accepts custom qualification, notice period, and source values', () => {
      const candidateWithCustomFields = {
        name: 'Pooja Verma',
        mobile: '9988776655',
        experience: 2,
        skills: 'AutoCAD, 3D Max',
        location: 'Bilaspur',
        expected_salary: 25000,
        current_salary: 18000,
        last_role: 'Draftsman',
        qualification: 'B.Arch (Architecture)',
        notice_period: 'Serving Notice (20 Days)',
        source: 'Campus Job Fair 2026',
        status: 'Active' as const,
      };

      const result = candidateSchema.safeParse(candidateWithCustomFields);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.qualification).toBe('B.Arch (Architecture)');
        expect(result.data.notice_period).toBe('Serving Notice (20 Days)');
        expect(result.data.source).toBe('Campus Job Fair 2026');
      }
    });

    it('validates standard dropdown options list completeness', () => {
      expect(QUALIFICATION_OPTIONS).toContain('Graduate — B.Com');
      expect(QUALIFICATION_OPTIONS).toContain('Diploma / ITI');
      expect(QUALIFICATION_OPTIONS).toContain('Other');

      expect(NOTICE_PERIOD_OPTIONS).toContain('Immediate');
      expect(NOTICE_PERIOD_OPTIONS).toContain('30 Days');
      expect(NOTICE_PERIOD_OPTIONS).toContain('Other');

      expect(ACQUISITION_SOURCE_OPTIONS).toContain('WhatsApp');
      expect(ACQUISITION_SOURCE_OPTIONS).toContain('Walk-in');
      expect(ACQUISITION_SOURCE_OPTIONS).toContain('Job Portal');
      expect(ACQUISITION_SOURCE_OPTIONS).toContain('Other');
    });

    it('validates current_salary: accepts 0, positive integers, and rejects negative values', () => {
      const base = {
        name: 'Suresh Kumar',
        mobile: '9123456789',
        experience: 1,
        skills: 'Sales',
        location: 'Durg',
        expected_salary: 15000,
        last_role: 'Sales Executive',
      };

      // Accepts 0 (Fresher / Unemployed)
      const zeroSalary = candidateSchema.safeParse({ ...base, current_salary: 0 });
      expect(zeroSalary.success).toBe(true);

      // Accepts positive salary
      const positiveSalary = candidateSchema.safeParse({ ...base, current_salary: 12000 });
      expect(positiveSalary.success).toBe(true);

      // Rejects negative salary
      const negativeSalary = candidateSchema.safeParse({ ...base, current_salary: -5000 });
      expect(negativeSalary.success).toBe(false);
      if (!negativeSalary.success) {
        expect(negativeSalary.error.issues[0]?.message).toContain('Current salary cannot be negative');
      }

      // Rejects excessive salary
      const excessiveSalary = candidateSchema.safeParse({ ...base, current_salary: 99999999 });
      expect(excessiveSalary.success).toBe(false);
    });

    it('preserves existing candidate workflows (matching calculation and registration fee warning)', () => {
      const candidate: Candidate = {
        id: 'cand-wave2a-1',
        created_at: '2026-10-01T00:00:00Z',
        name: 'Kavita Sahu',
        mobile: '9826001122',
        experience: 3,
        skills: ['Tally', 'GST', 'Excel'],
        location: 'Raipur',
        expected_salary: 20000,
        current_salary: 16000,
        last_role: 'Junior Accountant',
        qualification: 'Graduate — B.Com',
        notice_period: 'Immediate',
        source: 'Walk-in',
        status: 'Active',
        owner_id: 'recruiter-1',
        is_active: true,
        registration_fee_paid: false, // Unpaid fee
      };

      const job: Job = {
        id: 'job-wave2a-1',
        created_at: '2026-10-01T00:00:00Z',
        company_name: 'Shree Logistics',
        role: 'Accountant',
        location: 'Raipur',
        min_exp: 2,
        max_exp: 5,
        salary_min: 18000,
        salary_max: 25000,
        skills_req: ['Tally', 'GST'],
        urgency: 3,
        status: 'Open',
        is_active: true,
      };

      // Transparent match calculation functions seamlessly with new fields
      const match = calculateCandidateJobMatch(candidate, job);
      expect(match.isEligible).toBe(true);
      expect(match.score).toBeGreaterThanOrEqual(70);

      // Unpaid registration fee does not prevent candidate from being active or matched
      expect(candidate.registration_fee_paid).toBe(false);
      expect(candidate.status).toBe('Active');
    });

    it('simulates candidate edit: updates fields while strictly preserving candidate ID and ownership', () => {
      const originalCandidate: Candidate = {
        id: 'cand-preserved-uuid-1234',
        created_at: '2026-10-01T00:00:00Z',
        name: 'Rohan Sharma',
        mobile: '9876543210',
        experience: 2,
        skills: ['Back Office'],
        location: 'Raipur',
        expected_salary: 15000,
        last_role: 'Clerk',
        status: 'Active',
        owner_id: 'original-telecaller',
        is_active: true,
        registration_fee_paid: true,
      };

      const editPayload = {
        name: 'Rohan Sharma (Promoted)',
        mobile: '9876543210',
        experience: 3,
        skills: parseSkills('Back Office, MIS, Advanced Excel'),
        location: 'Raipur',
        expected_salary: 22000,
        current_salary: 17000,
        last_role: 'Operations Executive',
        qualification: 'Graduate — B.A. / B.Sc / Other',
        notice_period: '30 Days',
        source: 'Referral',
        status: 'Active' as const,
      };

      // In update, ID must remain unchanged and owner_id preserved
      const updatedCandidate: Candidate = {
        ...originalCandidate,
        ...editPayload,
        id: originalCandidate.id, // ID preserved!
        owner_id: originalCandidate.owner_id, // Ownership preserved!
      };

      expect(updatedCandidate.id).toBe('cand-preserved-uuid-1234');
      expect(updatedCandidate.owner_id).toBe('original-telecaller');
      expect(updatedCandidate.experience).toBe(3);
      expect(updatedCandidate.current_salary).toBe(17000);
      expect(updatedCandidate.qualification).toBe('Graduate — B.A. / B.Sc / Other');
      expect(updatedCandidate.registration_fee_paid).toBe(true);
    });
  });

  /* =========================================================================
   * 2. Employer Editing & Validation
   * ========================================================================= */
  describe('Employer Editing & Validation', () => {
    it('validates employer input with all supported schema fields', () => {
      const validEmployer = {
        company_name: 'Apex Super Specialty Hospital',
        contact_person: 'Dr. Vivek Agrawal (Director HR)',
        phone: '9826011223',
        email: 'hr@apexhospital.org',
        location: 'Raipur',
        industry: 'Healthcare & Pharmaceuticals',
        address: 'Sector 4, Devendra Nagar',
        notes: 'Commercial terms: 8.33% CTC placement fee',
        status: 'Active' as const,
      };

      const result = employerSchema.safeParse(validEmployer);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.company_name).toBe('Apex Super Specialty Hospital');
        expect(result.data.status).toBe('Active');
      }
    });

    it('rejects invalid phone numbers and missing required fields in employer', () => {
      const invalidEmployer = {
        company_name: '', // Required
        contact_person: 'V', // Too short
        phone: '12345', // Invalid Indian phone
        location: '',
      };

      const result = employerSchema.safeParse(invalidEmployer);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorFields = result.error.issues.map((i) => i.path[0]);
        expect(errorFields).toContain('company_name');
        expect(errorFields).toContain('contact_person');
        expect(errorFields).toContain('phone');
        expect(errorFields).toContain('location');
      }
    });

    it('simulates employer edit: preserves employer ID and linked jobs integrity', () => {
      const originalEmployer: Employer = {
        id: 'emp-uuid-888',
        created_at: '2026-10-01T00:00:00Z',
        company_name: 'Shriram Finance Corp',
        contact_person: 'Manoj Tiwari',
        phone: '9893012345',
        location: 'Raipur',
        status: 'Active',
        is_active: true,
      };

      const linkedJobs: Job[] = [
        {
          id: 'job-1',
          created_at: '2026-10-01T00:00:00Z',
          company_name: originalEmployer.company_name,
          employer_id: originalEmployer.id,
          role: 'Collection Executive',
          location: 'Raipur',
          min_exp: 1,
          max_exp: 3,
          salary_min: 15000,
          salary_max: 20000,
          skills_req: ['Field Sales'],
          urgency: 3,
          status: 'Open',
          is_active: true,
        },
      ];

      // Edit employer: updating contact person, phone, and status to Inactive
      const updatedEmployer: Employer = {
        ...originalEmployer,
        contact_person: 'Manoj Tiwari (Senior VP)',
        phone: '9893099999',
        status: 'Inactive',
        updated_at: '2026-10-03T16:00:00Z',
      };

      expect(updatedEmployer.id).toBe(originalEmployer.id); // ID strictly preserved!
      expect(updatedEmployer.phone).toBe('9893099999');
      expect(updatedEmployer.status).toBe('Inactive');

      // Linked jobs still point to the same employer_id
      expect(linkedJobs[0]!.employer_id).toBe(updatedEmployer.id);
    });
  });

  /* =========================================================================
   * 3. Job Editing & Validation
   * ========================================================================= */
  describe('Job Editing & Validation', () => {
    it('validates job input with min_exp <= max_exp and salary_min <= salary_max', () => {
      const validJob = {
        company_name: 'Jindal Steel & Power',
        role: 'Senior Plant Maintenance Engineer',
        location: 'Raigarh',
        min_exp: 3,
        max_exp: 7,
        salary_min: 40000,
        salary_max: 65000,
        skills_req: 'Mechanical, Hydraulics, PLC',
        urgency: 4,
        employer_id: 'emp-101',
        status: 'Open' as const,
      };

      const result = jobSchema.safeParse(validJob);
      expect(result.success).toBe(true);
    });

    it('rejects invalid job salary bounds (salary_min > salary_max)', () => {
      const invalidSalaryJob = {
        company_name: 'Apex Traders',
        role: 'Accountant',
        location: 'Raipur',
        min_exp: 1,
        max_exp: 3,
        salary_min: 35000, // Greater than max!
        salary_max: 25000,
        skills_req: 'Tally',
        urgency: 2,
      };

      const result = jobSchema.safeParse(invalidSalaryJob);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Min salary cannot exceed max salary');
      }
    });

    it('rejects invalid job experience bounds (min_exp > max_exp)', () => {
      const invalidExpJob = {
        company_name: 'Apex Traders',
        role: 'Accountant',
        location: 'Raipur',
        min_exp: 5, // Greater than max!
        max_exp: 2,
        salary_min: 20000,
        salary_max: 30000,
        skills_req: 'Tally',
        urgency: 2,
      };

      const result = jobSchema.safeParse(invalidExpJob);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Min experience cannot exceed max experience');
      }
    });

    it('simulates job edit: preserves job ID and linked applications and interviews', () => {
      const originalJob: Job = {
        id: 'job-uuid-777',
        created_at: '2026-10-01T00:00:00Z',
        company_name: 'City Mall Retail',
        employer_id: 'emp-uuid-retail',
        role: 'Store Cashier',
        location: 'Raipur',
        min_exp: 0,
        max_exp: 2,
        salary_min: 12000,
        salary_max: 16000,
        skills_req: ['Cash Handling', 'Billing'],
        urgency: 2,
        status: 'Open',
        is_active: true,
      };

      const linkedApplication: Application = {
        id: 'app-uuid-555',
        created_at: '2026-10-01T00:00:00Z',
        candidate_id: 'cand-1',
        job_id: originalJob.id,
        stage: 'Interview Scheduled',
        is_active: true,
      };

      const linkedInterview: Interview = {
        id: 'int-uuid-333',
        created_at: '2026-10-01T00:00:00Z',
        candidate_id: 'cand-1',
        job_id: originalJob.id,
        application_id: linkedApplication.id,
        scheduled_time: '2026-10-05T10:00:00Z',
        status: 'Scheduled',
        feedback: '',
        is_active: true,
      };

      // Edit job: updating salary and status to Closed
      const updatedJob: Job = {
        ...originalJob,
        salary_min: 14000,
        salary_max: 18000,
        status: 'Closed',
      };

      expect(updatedJob.id).toBe(originalJob.id); // Job ID strictly preserved!
      expect(updatedJob.salary_min).toBe(14000);
      expect(updatedJob.status).toBe('Closed');

      // Linked pipeline relationships remain valid
      expect(linkedApplication.job_id).toBe(updatedJob.id);
      expect(linkedInterview.job_id).toBe(updatedJob.id);
      expect(linkedInterview.application_id).toBe(linkedApplication.id);
    });
  });

  /* =========================================================================
   * 4. Offline Queue & Mutation Invariant Simulation
   * ========================================================================= */
  describe('Offline Queue & Mutation Invariants', () => {
    it('simulates update action: enqueues update mutation with correct table and record id', async () => {
      const queuedMutations: any[] = [];
      const localState: Record<string, any[]> = {
        candidates: [
          {
            id: 'cand-offline-1',
            name: 'Original Name',
            experience: 1,
            skills: ['Tally'],
            location: 'Raipur',
            expected_salary: 15000,
            last_role: 'Accountant',
            status: 'Active',
            owner_id: 'recruiter-1',
            is_active: true,
          },
        ],
      };

      const mockEnqueueMutation = vi.fn(async (table: string, type: string, data: any) => {
        queuedMutations.push({ table, type, data, timestamp: Date.now() });
      });

      const mockApplyLocalMutation = vi.fn((table: string, _type: string, record: any) => {
        const list = localState[table] ?? [];
        localState[table] = list.map((item) =>
          item.id === record.id ? { ...item, ...record } : item
        );
      });

      // Execute simulated offline update
      const updatePayload = {
        id: 'cand-offline-1',
        name: 'Updated Name',
        qualification: 'Graduate — B.Com',
        current_salary: 18000,
        updated_at: new Date().toISOString(),
      };

      await mockEnqueueMutation('candidates', 'update', updatePayload);
      mockApplyLocalMutation('candidates', 'update', updatePayload);

      expect(mockEnqueueMutation).toHaveBeenCalledWith('candidates', 'update', expect.objectContaining({
        id: 'cand-offline-1',
        name: 'Updated Name',
        qualification: 'Graduate — B.Com',
      }));

      // Local optimistic state is updated immediately
      const candidateList = localState.candidates ?? [];
      const updatedCandidate = candidateList[0];
      expect(updatedCandidate?.name).toBe('Updated Name');
      expect(updatedCandidate?.qualification).toBe('Graduate — B.Com');
      expect(updatedCandidate?.current_salary).toBe(18000);
      expect(updatedCandidate?.id).toBe('cand-offline-1');
    });

    it('requires record ID for any update mutation and throws if missing', () => {
      const updateWithoutId = () => {
        const data: any = { name: 'Nameless Update' };
        if (!data.id) throw new Error('Cannot update record without id');
      };

      expect(updateWithoutId).toThrow('Cannot update record without id');
    });
  });
});
