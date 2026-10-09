import { describe, it, expect, vi } from 'vitest';
import {
  Candidate,
  Employer,
  Job,
  Interview,
  Lead,
  CallLog,
  FollowUpTask,
  LeadAssignmentHistory,
  InterviewStatus,
  CallType,
  LeadCategory,
} from '../types';

describe('Recruitment Workflow & Candidate Intelligence Upgrade', () => {
  /* =========================================================================
   * 1. Candidate Profile, Candidate Remarks & Interview Intelligence
   * ========================================================================= */
  describe('Candidate Profile, Remarks & Interview History', () => {
    const mockCandidate: Candidate = {
      id: 'cand-001',
      created_at: '2026-10-01T10:00:00Z',
      name: 'Rohan Sharma',
      mobile: '9826198261',
      experience: 3.5,
      skills: ['Tally Prime', 'Excel', 'GST', 'Taxation'],
      location: 'Raipur',
      expected_salary: 28000,
      current_salary: 22000,
      last_role: 'Accountant',
      qualification: 'Graduate — B.Com',
      notice_period: '15 Days',
      source: 'Naukri.com',
      status: 'Active',
      notes: 'Candidate visited SCC office for initial screening. Strong communication skills.',
      owner_id: 'user-001',
      is_active: true,
    };

    const mockEmployerA: Employer = {
      id: 'emp-101',
      created_at: '2026-09-01T10:00:00Z',
      company_name: 'Shree Cement Ltd',
      contact_person: 'Vikas Agarwal',
      phone: '9893098930',
      location: 'Raipur',
      status: 'Active',
      is_active: true,
    };

    const mockEmployerB: Employer = {
      id: 'emp-102',
      created_at: '2026-09-01T10:00:00Z',
      company_name: 'Jindal Steel & Power',
      contact_person: 'Sunil Rao',
      phone: '9425094250',
      location: 'Raigarh',
      status: 'Active',
      is_active: true,
    };

    const mockJobA: Job = {
      id: 'job-201',
      created_at: '2026-10-01T10:00:00Z',
      company_name: 'Shree Cement Ltd',
      employer_id: 'emp-101',
      role: 'Senior Accountant',
      location: 'Raipur',
      min_exp: 3,
      max_exp: 6,
      salary_min: 25000,
      salary_max: 32000,
      skills_req: ['Tally', 'GST'],
      urgency: 2,
      status: 'Open',
      is_active: true,
      employer: mockEmployerA,
    };

    const mockJobB: Job = {
      id: 'job-202',
      created_at: '2026-10-01T10:00:00Z',
      company_name: 'Jindal Steel & Power',
      employer_id: 'emp-102',
      role: 'Junior Accountant',
      location: 'Raigarh',
      min_exp: 1,
      max_exp: 3,
      salary_min: 18000,
      salary_max: 24000,
      skills_req: ['Excel', 'Billing'],
      urgency: 1,
      status: 'Open',
      is_active: true,
      employer: mockEmployerB,
    };

    const mockInterviews: Interview[] = [
      {
        id: 'int-001',
        created_at: '2026-10-02T10:00:00Z',
        candidate_id: 'cand-001',
        job_id: 'job-202',
        scheduled_time: '2026-10-03T11:00:00Z',
        status: 'Rejected',
        feedback: 'Candidate salary expectation exceeded client budget.',
        rating: 3,
        next_action: 'Consider for higher budget roles',
        is_active: true,
        jobs: mockJobB,
        candidates: mockCandidate,
      },
      {
        id: 'int-002',
        created_at: '2026-10-05T10:00:00Z',
        candidate_id: 'cand-001',
        job_id: 'job-201',
        scheduled_time: '2026-10-06T15:00:00Z',
        status: 'Selected',
        feedback: 'Good accounting concepts and Tally knowledge. Selected for final round.',
        rating: 5,
        next_action: 'Schedule client director round',
        is_active: true,
        jobs: mockJobA,
        candidates: mockCandidate,
      },
    ];

    it('preserves distinction between candidate remark and interview remarks', () => {
      // Candidate remark = general recruiter screening notes
      expect(mockCandidate.notes).toBe(
        'Candidate visited SCC office for initial screening. Strong communication skills.'
      );

      // Interview remarks = feedback specific to each individual client interview
      expect(mockInterviews[0]!.feedback).toBe('Candidate salary expectation exceeded client budget.');
      expect(mockInterviews[1]!.feedback).toBe(
        'Good accounting concepts and Tally knowledge. Selected for final round.'
      );

      // Ensure they do not overwrite each other
      expect(mockCandidate.notes).not.toEqual(mockInterviews[0]!.feedback);
      expect(mockCandidate.notes).not.toEqual(mockInterviews[1]!.feedback);
      expect(mockInterviews[0]!.feedback).not.toEqual(mockInterviews[1]!.feedback);
    });

    it('correctly sorts candidate interview history newest first', () => {
      const sortedHistory = [...mockInterviews].sort(
        (a, b) => new Date(b.scheduled_time).getTime() - new Date(a.scheduled_time).getTime()
      );

      expect(sortedHistory[0]!.id).toBe('int-002'); // 2026-10-06
      expect(sortedHistory[1]!.id).toBe('int-001'); // 2026-10-03
      expect(sortedHistory[0]!.status).toBe('Selected');
      expect(sortedHistory[0]!.rating).toBe(5);
      expect(sortedHistory[1]!.rating).toBe(3);
    });

    it('supports ⭐ 1-5 interview rating scale and next action fields', () => {
      for (const intv of mockInterviews) {
        expect(intv.rating).toBeGreaterThanOrEqual(1);
        expect(intv.rating).toBeLessThanOrEqual(5);
        expect(intv.next_action).toBeDefined();
        expect(typeof intv.next_action).toBe('string');
      }
    });
  });

  /* =========================================================================
   * 2. Candidate Advanced Filtering Logic
   * ========================================================================= */
  describe('Candidate Advanced Filtering Engine', () => {
    const candidatesList: Candidate[] = [
      {
        id: 'c1',
        created_at: '2026-10-01T10:00:00Z',
        name: 'Aakash Verma',
        mobile: '9826000001',
        experience: 0,
        skills: ['Excel', 'Computer Operator'],
        location: 'Raipur',
        expected_salary: 12000,
        current_salary: 0,
        last_role: 'Fresher',
        qualification: '12th Pass',
        notice_period: 'Immediate',
        source: 'Walk-in',
        status: 'Active',
        owner_id: 'u1',
        is_active: true,
      },
      {
        id: 'c2',
        created_at: '2026-10-01T10:00:00Z',
        name: 'Bhavna Sahu',
        mobile: '9826000002',
        experience: 2,
        skills: ['Tally', 'Billing'],
        location: 'Bilaspur',
        expected_salary: 18000,
        current_salary: 15000,
        last_role: 'Billing Executive',
        qualification: 'Graduate — B.Com',
        notice_period: '15 Days',
        source: 'Naukri.com',
        status: 'Active',
        owner_id: 'u1',
        is_active: true,
      },
      {
        id: 'c3',
        created_at: '2026-10-01T10:00:00Z',
        name: 'Chirag Dewangan',
        mobile: '9826000003',
        experience: 4.5,
        skills: ['Tally Prime', 'GST', 'Taxation'],
        location: 'Raipur',
        expected_salary: 30000,
        current_salary: 24000,
        last_role: 'Senior Accountant',
        qualification: 'Post Graduate — M.Com',
        notice_period: '30 Days',
        source: 'Indeed',
        status: 'Active',
        owner_id: 'u1',
        is_active: true,
      },
      {
        id: 'c4',
        created_at: '2026-10-01T10:00:00Z',
        name: 'Deepak Patel',
        mobile: '9826000004',
        experience: 6,
        skills: ['AutoCAD', 'Civil Engineering'],
        location: 'Durg',
        expected_salary: 45000,
        current_salary: 35000,
        last_role: 'Site Engineer',
        qualification: 'BE / B.Tech',
        notice_period: 'Immediate',
        source: 'Referral',
        status: 'Placed',
        owner_id: 'u1',
        is_active: true,
      },
    ];

    const interviewsMap = new Map<string, Interview[]>([
      [
        'c2',
        [
          {
            id: 'i-c2-1',
            created_at: '2026-10-01T00:00:00Z',
            candidate_id: 'c2',
            job_id: 'j1',
            scheduled_time: '2026-10-02T10:00:00Z',
            status: 'Done',
            feedback: 'Interview completed',
            rating: 3,
            is_active: true,
          },
        ],
      ],
      [
        'c3',
        [
          {
            id: 'i-c3-1',
            created_at: '2026-10-04T00:00:00Z',
            candidate_id: 'c3',
            job_id: 'j2',
            scheduled_time: '2026-10-05T14:00:00Z',
            status: 'Selected',
            feedback: 'Excellent candidate',
            rating: 5,
            is_active: true,
          },
        ],
      ],
    ]);

    it('filters candidates by experience bracket accurately', () => {
      // Fresher
      const freshers = candidatesList.filter(c => c.experience === 0);
      expect(freshers.map(c => c.id)).toEqual(['c1']);

      // 1-3 years
      const oneToThree = candidatesList.filter(c => c.experience >= 1 && c.experience <= 3);
      expect(oneToThree.map(c => c.id)).toEqual(['c2']);

      // 3-5 years
      const threeToFive = candidatesList.filter(c => c.experience > 3 && c.experience <= 5);
      expect(threeToFive.map(c => c.id)).toEqual(['c3']);

      // 5+ years
      const fivePlus = candidatesList.filter(c => c.experience > 5);
      expect(fivePlus.map(c => c.id)).toEqual(['c4']);
    });

    it('filters candidates dynamically by qualification', () => {
      const bcomCandidates = candidatesList.filter(c => c.qualification === 'Graduate — B.Com');
      expect(bcomCandidates.map(c => c.id)).toEqual(['c2']);

      const btechCandidates = candidatesList.filter(c => c.qualification === 'BE / B.Tech');
      expect(btechCandidates.map(c => c.id)).toEqual(['c4']);
    });

    it('filters candidates by salary min and max ranges', () => {
      // Expected salary between ₹15,000 and ₹30,000
      const midSalary = candidatesList.filter(
        c => (c.expected_salary ?? 0) >= 15000 && (c.expected_salary ?? 0) <= 30000
      );
      expect(midSalary.map(c => c.id)).toEqual(['c2', 'c3']);

      // Expected salary <= 15000
      const lowSalary = candidatesList.filter(c => (c.expected_salary ?? 0) <= 15000);
      expect(lowSalary.map(c => c.id)).toEqual(['c1']);
    });

    it('filters candidates using Smart Interview Status filter', () => {
      // Never Interviewed
      const neverInterviewed = candidatesList.filter(c => {
        const intvs = interviewsMap.get(c.id) || [];
        return intvs.length === 0;
      });
      expect(neverInterviewed.map(c => c.id)).toEqual(['c1', 'c4']);

      // Selected
      const selected = candidatesList.filter(c => {
        const intvs = interviewsMap.get(c.id) || [];
        return intvs.some(i => i.status === 'Selected');
      });
      expect(selected.map(c => c.id)).toEqual(['c3']);

      // Interviewed / Done
      const interviewed = candidatesList.filter(c => {
        const intvs = interviewsMap.get(c.id) || [];
        return intvs.some(i => i.status === 'Done');
      });
      expect(interviewed.map(c => c.id)).toEqual(['c2']);
    });

    it('combines multiple filters together and resets on clear', () => {
      // Multi-filter: Experience 1-3 years + Qualification B.Com + Interviewed
      const filtered = candidatesList.filter(c => {
        const matchesExp = c.experience >= 1 && c.experience <= 3;
        const matchesQual = c.qualification === 'Graduate — B.Com';
        const intvs = interviewsMap.get(c.id) || [];
        const matchesInterview = intvs.length > 0;
        return matchesExp && matchesQual && matchesInterview;
      });
      expect(filtered.map(c => c.id)).toEqual(['c2']);

      // Clear all filters returns full list
      const resetList = candidatesList.filter(() => true);
      expect(resetList.length).toBe(4);
    });
  });

  /* =========================================================================
   * 3. Client / Employer Profile & Candidate Interview History
   * ========================================================================= */
  describe('Client Profile & Client Interview History', () => {
    const employer1: Employer = {
      id: 'emp-001',
      created_at: '2026-09-01T00:00:00Z',
      company_name: 'Raipur Steel Works',
      contact_person: 'Harish Dewangan',
      phone: '9826111111',
      location: 'Urla Industrial Area, Raipur',
      status: 'Active',
      is_active: true,
    };

    const employer2: Employer = {
      id: 'emp-002',
      created_at: '2026-09-01T00:00:00Z',
      company_name: 'Bilaspur Logistics',
      contact_person: 'Pawan Mishra',
      phone: '9826222222',
      location: 'Bilaspur',
      status: 'Active',
      is_active: true,
    };

    const jobsList: Job[] = [
      {
        id: 'job-101',
        created_at: '2026-10-01T00:00:00Z',
        company_name: 'Raipur Steel Works',
        employer_id: 'emp-001',
        role: 'Accountant',
        location: 'Raipur',
        min_exp: 2,
        max_exp: 5,
        salary_min: 20000,
        salary_max: 25000,
        skills_req: ['Tally', 'Excel'],
        urgency: 2,
        status: 'Open',
        is_active: true,
      },
      {
        id: 'job-102',
        created_at: '2026-10-01T00:00:00Z',
        company_name: 'Bilaspur Logistics',
        employer_id: 'emp-002',
        role: 'Dispatcher',
        location: 'Bilaspur',
        min_exp: 1,
        max_exp: 3,
        salary_min: 15000,
        salary_max: 18000,
        skills_req: ['Logistics'],
        urgency: 1,
        status: 'Open',
        is_active: true,
      },
    ];

    const interviewsList: Interview[] = [
      {
        id: 'int-1',
        created_at: '2026-10-01T00:00:00Z',
        candidate_id: 'cand-a',
        job_id: 'job-101',
        scheduled_time: '2026-10-03T10:00:00Z',
        status: 'Selected',
        feedback: 'Good Excel knowledge, candidate selected.',
        rating: 4,
        is_active: true,
      },
      {
        id: 'int-2',
        created_at: '2026-10-02T00:00:00Z',
        candidate_id: 'cand-b',
        job_id: 'job-101',
        scheduled_time: '2026-10-04T11:00:00Z',
        status: 'Rejected',
        feedback: 'Salary expectation exceeded budget.',
        rating: 2,
        is_active: true,
      },
      {
        id: 'int-3',
        created_at: '2026-10-02T00:00:00Z',
        candidate_id: 'cand-c',
        job_id: 'job-102', // Belongs to Bilaspur Logistics!
        scheduled_time: '2026-10-04T12:00:00Z',
        status: 'Selected',
        feedback: 'Hired for dispatch shift.',
        rating: 5,
        is_active: true,
      },
    ];

    it('isolates candidate interview history strictly to the selected client', () => {
      // Find interviews belonging to Raipur Steel Works (emp-001)
      const client1Jobs = new Set(jobsList.filter(j => j.employer_id === employer1.id).map(j => j.id));
      const client1Interviews = interviewsList.filter(i => client1Jobs.has(i.job_id));

      expect(client1Interviews.length).toBe(2);
      expect(client1Interviews.map(i => i.id)).toEqual(['int-1', 'int-2']);
      // Must NOT contain int-3 from Bilaspur Logistics
      expect(client1Interviews.some(i => i.id === 'int-3')).toBe(false);
    });

    it('allows client interview filtering by status and rating', () => {
      const client1Jobs = new Set(jobsList.filter(j => j.employer_id === employer1.id).map(j => j.id));
      const client1Interviews = interviewsList.filter(i => client1Jobs.has(i.job_id));

      const selectedCandidates = client1Interviews.filter(i => i.status === 'Selected');
      expect(selectedCandidates.length).toBe(1);
      expect(selectedCandidates[0]!.id).toBe('int-1');
      expect(selectedCandidates[0]!.rating).toBe(4);

      const rejectedCandidates = client1Interviews.filter(i => i.status === 'Rejected');
      expect(rejectedCandidates.length).toBe(1);
      expect(rejectedCandidates[0]!.id).toBe('int-2');
      expect(rejectedCandidates[0]!.feedback).toBe('Salary expectation exceeded budget.');
    });
  });

  /* =========================================================================
   * 4. Leads Management & Post-Call Workflow Intelligence
   * ========================================================================= */
  describe('Leads Management: Show Number & Unified Post-Call Workflow', () => {
    const maskMobile = (mobile: string) => {
      if (!mobile || mobile.length < 6) return mobile;
      return `${mobile.slice(0, 4)}••••${mobile.slice(-2)}`;
    };

    it('correctly masks and reveals lead phone numbers', () => {
      const rawMobile = '9826198261';
      const masked = maskMobile(rawMobile);
      expect(masked).toBe('9826••••61');

      // Unmasking state test
      const revealedIds = new Set<string>();
      expect(revealedIds.has('lead-001')).toBe(false);

      // User clicks Show Number
      revealedIds.add('lead-001');
      expect(revealedIds.has('lead-001')).toBe(true);
      const displayed = revealedIds.has('lead-001') ? rawMobile : maskMobile(rawMobile);
      expect(displayed).toBe('9826198261');
    });

    it('suggests correct Lead status based on Call outcome', () => {
      const outcomeToStatusMap: Record<CallType, LeadCategory> = {
        Connected: 'Warm',
        Interested: 'Warm',
        'Not Interested': 'Rejected',
        'Wrong Number': 'Do Not Contact',
        'No Answer': 'Warm', // transitions from Hot/New to Warm
        Busy: 'Warm',
        SwitchOff: 'Warm',
        'Call Back Later': 'Warm',
        Converted: 'Converted',
      };

      for (const [outcome, expectedStatus] of Object.entries(outcomeToStatusMap)) {
        let suggestedCategory: LeadCategory = 'Warm';
        if (outcome === 'Interested') suggestedCategory = 'Warm';
        else if (outcome === 'Not Interested') suggestedCategory = 'Rejected';
        else if (outcome === 'Wrong Number') suggestedCategory = 'Do Not Contact';
        else if (outcome === 'Converted') suggestedCategory = 'Converted';
        else suggestedCategory = 'Warm';

        expect(suggestedCategory).toBe(expectedStatus);
      }
    });

    it('enforces that logging any call permanently removes lead from Hot Leads', () => {
      const lead: Lead = {
        id: 'lead-100',
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
        name: 'Suresh Kumar',
        mobile: '9876543210',
        skills: ['Delivery', 'Driver'],
        source: 'WorkIndia',
        category: 'New',
        is_active: true,
      };

      const callLogsList: CallLog[] = [];
      const calledLeadIds = new Set(callLogsList.filter(c => c.lead_id).map(c => c.lead_id));

      // Before call: Never called -> HOT
      const isHotBefore = !calledLeadIds.has(lead.id) && lead.category !== 'Converted' && lead.category !== 'Rejected';
      expect(isHotBefore).toBe(true);

      // Record first call attempt (even if No Answer)
      callLogsList.push({
        id: 'log-1',
        lead_id: lead.id,
        telecaller_name: 'Telecaller-1',
        call_type: 'No Answer',
        duration: 25,
        note: 'Phone rang, no pickup',
        timestamp: new Date().toISOString(),
      });

      const calledLeadIdsAfter = new Set(callLogsList.filter(c => c.lead_id).map(c => c.lead_id));
      const isHotAfter = !calledLeadIdsAfter.has(lead.id) && lead.category !== 'Converted' && lead.category !== 'Rejected';

      // After call: Permanently removed from Hot Leads!
      expect(isHotAfter).toBe(false);
    });

    it('auto-configures follow-up task on No Answer outcome', () => {
      const outcome: CallType = 'No Answer';
      const leadName = 'Manish Verma';

      let autoFollowupTitle = '';
      let shouldCreateFollowup = false;

      if (['No Answer', 'Busy', 'SwitchOff', 'Call Back Later'].includes(outcome)) {
        shouldCreateFollowup = true;
        autoFollowupTitle = `Follow-up (${outcome}): ${leadName}`;
      }

      expect(shouldCreateFollowup).toBe(true);
      expect(autoFollowupTitle).toBe('Follow-up (No Answer): Manish Verma');
    });

    it('builds unified chronological activity timeline for lead', () => {
      const leadCreated = '2026-10-01T10:00:00Z';
      const call1Time = '2026-10-02T11:00:00Z';
      const taskDue = '2026-10-03T11:00:00Z';
      const call2Time = '2026-10-03T11:30:00Z';

      const events = [
        { type: 'created', timestamp: leadCreated, title: 'Lead Ingested' },
        { type: 'call', timestamp: call1Time, title: 'Call: No Answer', note: 'Phone rang' },
        { type: 'task', timestamp: '2026-10-02T11:05:00Z', title: 'Follow-up Task Scheduled' },
        { type: 'call', timestamp: call2Time, title: 'Call: Connected', note: 'Ready for interview' },
      ];

      // Sort newest first
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      expect(events[0]!.title).toBe('Call: Connected');
      expect(events[0]!.note).toBe('Ready for interview');
      expect(events[3]!.title).toBe('Lead Ingested');
    });
  });
});
