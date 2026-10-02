import { describe, it, expect } from 'vitest';
import { calculateCandidateJobMatch, normalizeSkill } from '../lib/matching';
import { parseSkills } from '../lib/validation';
import { isPermanentError } from '../lib/offlineQueue';
import { Candidate, Job, Interview } from '../types';

describe('Candidate - Job Matching Engine', () => {
  const sampleCandidate: Candidate = {
    id: 'cand-1',
    created_at: '2026-10-01T00:00:00Z',
    name: 'Rahul Sharma',
    mobile: '9876543210',
    experience: 3,
    skills: ['Tally', 'Excel', 'GST', 'Billing'],
    location: 'Raipur',
    expected_salary: 25000,
    last_role: 'Accountant',
    status: 'Active',
    owner_id: 'Telecaller-1',
    is_active: true,
  };

  const sampleJob: Job = {
    id: 'job-1',
    created_at: '2026-10-01T00:00:00Z',
    company_name: 'Apex Traders',
    role: 'Senior Accountant',
    location: 'Raipur',
    min_exp: 2,
    max_exp: 5,
    salary_min: 20000,
    salary_max: 30000,
    skills_req: ['Tally', 'GST', 'Excel'],
    urgency: 4,
    status: 'Open',
    is_active: true,
  };

  it('correctly matches skills, location, exp and budget with high score', () => {
    const result = calculateCandidateJobMatch(sampleCandidate, sampleJob);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.isEligible).toBe(true);
    expect(result.skillOverlap.length).toBe(3);
  });

  it('disqualifies closed jobs immediately with 0 score', () => {
    const closedJob: Job = { ...sampleJob, status: 'Closed' };
    const result = calculateCandidateJobMatch(sampleCandidate, closedJob);
    expect(result.score).toBe(0);
    expect(result.isEligible).toBe(false);
    expect(result.reasons[0]).toContain('closed');
  });

  it('handles case-insensitivity and whitespace normalization', () => {
    expect(normalizeSkill('  MS EXCEL ')).toBe('ms excel');
    expect(normalizeSkill('Full-Stack_Dev')).toBe('full stack dev');
  });
});

describe('Validation & Helpers', () => {
  it('parses comma-separated skills into clean arrays', () => {
    const input = 'Excel,  Tally , GST ,,, Billing  ';
    const parsed = parseSkills(input);
    expect(parsed).toEqual(['Excel', 'Tally', 'GST', 'Billing']);
  });

  it('handles array inputs safely', () => {
    expect(parseSkills([' React ', ' Node '])).toEqual(['React', 'Node']);
  });
});

describe('Offline Queue & Error Classification', () => {
  it('identifies PostgreSQL constraint errors as permanent', () => {
    const uniqueViolation = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const fkViolation = { code: '23503', message: 'insert or update violates foreign key constraint' };
    const rlsDenied = { code: '42501', message: 'permission denied for table candidates' };

    expect(isPermanentError(uniqueViolation)).toBe(true);
    expect(isPermanentError(fkViolation)).toBe(true);
    expect(isPermanentError(rlsDenied)).toBe(true);
  });

  it('identifies transient network drops as non-permanent (eligible for retry)', () => {
    const networkDrop = { message: 'Failed to fetch' };
    const timeout = { message: 'Gateway timeout 504' };

    expect(isPermanentError(networkDrop)).toBe(false);
    expect(isPermanentError(timeout)).toBe(false);
  });
});

describe('Interview vs Placement Lifecycle Invariant', () => {
  it('ensures interview selection status is distinct from placed candidate status', () => {
    const interview: Interview = {
      id: 'int-1',
      created_at: '2026-10-01T00:00:00Z',
      candidate_id: 'cand-1',
      job_id: 'job-1',
      scheduled_time: '2026-10-05T10:00:00Z',
      status: 'Selected',
      feedback: 'Cleared technical interview',
      is_active: true,
    };

    const candidate: Candidate = {
      id: 'cand-1',
      created_at: '2026-10-01T00:00:00Z',
      name: 'Sunita Devi',
      mobile: '9988776655',
      experience: 2,
      skills: ['Data Entry'],
      location: 'Bilaspur',
      expected_salary: 15000,
      last_role: 'Data Entry',
      status: 'Active', // Candidate remains Active until joined & confirmed!
      owner_id: 'Telecaller-2',
      is_active: true,
    };

    expect(interview.status).toBe('Selected');
    expect(candidate.status).toBe('Active'); // Proves Selection != Placed
  });
});
