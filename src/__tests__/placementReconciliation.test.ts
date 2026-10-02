import { describe, it, expect } from 'vitest';
import { reconcileCandidateStatus } from '../lib/placementReconciliation';
import { Candidate, Application } from '../types';

describe('P1-003: Placement Status Reconciliation', () => {
  const createCandidate = (overrides: Partial<Candidate> = {}): Candidate => ({
    id: 'cand-101',
    created_at: '2026-10-01T00:00:00Z',
    name: 'Pooja Verma',
    mobile: '9876543210',
    experience: 3,
    skills: ['Tally', 'GST'],
    location: 'Raipur',
    expected_salary: 20000,
    last_role: 'Accountant',
    status: 'Active',
    owner_id: 'Telecaller-1',
    is_active: true,
    ...overrides,
  });

  const createApplication = (id: string, stage: Application['stage'], overrides: Partial<Application> = {}): Application => ({
    id,
    created_at: '2026-10-01T00:00:00Z',
    candidate_id: 'cand-101',
    job_id: `job-${id}`,
    stage,
    is_active: true,
    ...overrides,
  });

  // Test 1: Placed application moved to Rejected -> Candidate reverts to Active
  it('reconciles candidate status back to Active when a Placed application is moved to Rejected', () => {
    const candidate = createCandidate({ status: 'Placed' });
    const app1 = createApplication('app-1', 'Placed');
    const applications = [app1];

    const result = reconcileCandidateStatus(candidate, applications, 'app-1', 'Rejected');

    expect(result.candidateId).toBe('cand-101');
    expect(result.previousStatus).toBe('Placed');
    expect(result.newStatus).toBe('Active');
    expect(result.hasOtherPlacedApps).toBe(false);
    expect(result.reason).toContain('moved away from Placed to Rejected');
  });

  // Test 2: Candidate with another Placed application -> Candidate remains Placed
  it('keeps candidate status as Placed if another active application is still in Placed stage', () => {
    const candidate = createCandidate({ status: 'Placed' });
    const app1 = createApplication('app-1', 'Placed');
    const app2 = createApplication('app-2', 'Placed');
    const applications = [app1, app2];

    // Move app-1 to Rejected, but app-2 is still Placed
    const result = reconcileCandidateStatus(candidate, applications, 'app-1', 'Rejected');

    expect(result.previousStatus).toBe('Placed');
    expect(result.newStatus).toBe('Placed');
    expect(result.hasOtherPlacedApps).toBe(true);
    expect(result.reason).toContain('1 other active application(s) in Placed stage');
  });

  // Test 3: Candidate with multiple active applications -> Remains Active across non-placed stage movements
  it('keeps candidate status Active when moving between stages with multiple non-placed active applications', () => {
    const candidate = createCandidate({ status: 'Active' });
    const app1 = createApplication('app-1', 'Interview Scheduled');
    const app2 = createApplication('app-2', 'Screening');
    const app3 = createApplication('app-3', 'Shortlisted');
    const applications = [app1, app2, app3];

    // Move app-1 to Interview Completed
    const result1 = reconcileCandidateStatus(candidate, applications, 'app-1', 'Interview Completed');
    expect(result1.newStatus).toBe('Active');
    expect(result1.totalActiveApps).toBe(3);

    // Reject app-2
    const result2 = reconcileCandidateStatus(candidate, applications, 'app-2', 'Rejected');
    expect(result2.newStatus).toBe('Active');

    // Reject app-1 as well
    const result3 = reconcileCandidateStatus(candidate, applications, 'app-1', 'Rejected');
    expect(result3.newStatus).toBe('Active');
  });

  // Test 4: Repeated stage updates and idempotency
  it('is idempotent on repeated transitions to the same stage', () => {
    const candidate = createCandidate({ status: 'Active' });
    const app1 = createApplication('app-1', 'Rejected');
    const applications = [app1];

    // Updating an already rejected application to Rejected
    const result = reconcileCandidateStatus(candidate, applications, 'app-1', 'Rejected');
    expect(result.previousStatus).toBe('Active');
    expect(result.newStatus).toBe('Active');
    expect(result.previousStatus).toBe(result.newStatus);
  });

  // Test 5: Candidate moves to Placed when application transitions to Placed
  it('transitions candidate to Placed when an application is marked Placed', () => {
    const candidate = createCandidate({ status: 'Active' });
    const app1 = createApplication('app-1', 'Offer');
    const applications = [app1];

    const result = reconcileCandidateStatus(candidate, applications, 'app-1', 'Placed');
    expect(result.previousStatus).toBe('Active');
    expect(result.newStatus).toBe('Placed');
  });

  // Test 6: Blacklisted candidates are never overridden by application stage changes
  it('preserves Blacklisted status regardless of application stage transitions', () => {
    const candidate = createCandidate({ status: 'Blacklisted' });
    const app1 = createApplication('app-1', 'Applied');
    const applications = [app1];

    const resultToPlaced = reconcileCandidateStatus(candidate, applications, 'app-1', 'Placed');
    expect(resultToPlaced.newStatus).toBe('Blacklisted');

    const resultToRejected = reconcileCandidateStatus(candidate, applications, 'app-1', 'Rejected');
    expect(resultToRejected.newStatus).toBe('Blacklisted');
  });

  // Test 7: Soft-deleted (is_active === false) Placed applications do not count towards active placement
  it('ignores soft-deleted applications when evaluating candidate placement status', () => {
    const candidate = createCandidate({ status: 'Placed' });
    const app1 = createApplication('app-1', 'Placed');
    // app2 was Placed in the past but soft-deleted
    const app2 = createApplication('app-2', 'Placed', { is_active: false });
    const applications = [app1, app2];

    // Move app-1 to Withdrawn
    const result = reconcileCandidateStatus(candidate, applications, 'app-1', 'Withdrawn');
    expect(result.newStatus).toBe('Active');
    expect(result.hasOtherPlacedApps).toBe(false);
  });
});
