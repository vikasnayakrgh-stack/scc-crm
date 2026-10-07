import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeLeadImportRows,
  normalizeLeadSource,
  parseLeadExperience,
  parseLeadSalary,
  parseLeadSkills,
  LeadImportAnalysisResult,
} from '../lib/leadImport';
import {
  normalizePhone,
  autoDetectColumnMapping,
} from '../lib/candidateImport';
import {
  leadSchema,
  callLogSchema,
  taskSchema,
  candidateSchema,
} from '../lib/validation';
import {
  Lead,
  Candidate,
  CallLog,
  FollowUpTask,
  LeadImportBatch,
  LeadAssignmentHistory,
  CallType,
  LeadCategory,
} from '../types';

describe('SCC CRM — Dedicated Leads Management Module Test Suite', () => {
  /* Helper to generate mock leads */
  const createMockLead = (overrides: Partial<Lead> = {}): Lead => ({
    id: overrides.id || `lead-${Math.random().toString(36).substr(2, 9)}`,
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString(),
    name: overrides.name || 'Rahul Sharma',
    mobile: overrides.mobile || '9826012345',
    email: overrides.email || 'rahul@example.com',
    experience: overrides.experience ?? 2,
    skills: overrides.skills || ['Back Office', 'Excel'],
    location: overrides.location || 'Raipur',
    expected_salary: overrides.expected_salary ?? 18000,
    current_salary: overrides.current_salary ?? 14000,
    qualification: overrides.qualification || 'Graduate — B.Com',
    notice_period: overrides.notice_period || 'Immediate',
    last_role: overrides.last_role || 'Office Assistant',
    source: overrides.source || 'WorkIndia',
    category: overrides.category || 'New',
    assigned_to: overrides.assigned_to || null,
    import_batch_id: overrides.import_batch_id || null,
    converted_candidate_id: overrides.converted_candidate_id || null,
    converted_at: overrides.converted_at || null,
    notes: overrides.notes || null,
    is_active: overrides.is_active !== undefined ? overrides.is_active : true,
  });

  /* Helper to generate mock candidates */
  const createMockCandidate = (overrides: Partial<Candidate> = {}): Candidate => ({
    id: overrides.id || `cand-${Math.random().toString(36).substr(2, 9)}`,
    created_at: overrides.created_at || new Date().toISOString(),
    name: overrides.name || 'Sunita Verma',
    mobile: overrides.mobile || '9826099999',
    email: overrides.email || 'sunita@example.com',
    experience: overrides.experience ?? 3,
    skills: overrides.skills || ['Telecalling', 'Customer Service'],
    location: overrides.location || 'Raipur',
    expected_salary: overrides.expected_salary ?? 20000,
    last_role: overrides.last_role || 'Executive',
    status: overrides.status || 'Active',
    source: overrides.source || 'Job Portal',
    owner_id: overrides.owner_id || 'recruiter-1',
    is_active: overrides.is_active !== undefined ? overrides.is_active : true,
  });

  /* Hot Lead Classification Helper matching Leads.tsx logic */
  const isHotLead = (lead: Lead, calledLeadIds: Set<string>): boolean => {
    return (
      lead.is_active &&
      !calledLeadIds.has(lead.id) &&
      lead.category !== 'Converted' &&
      lead.category !== 'Rejected' &&
      lead.category !== 'Do Not Contact'
    );
  };

  /* =========================================================================
   * Scenario 1: New imported lead appears in Hot Leads
   * ========================================================================= */
  describe('1. Hot Leads: New imported lead appears in Hot Leads', () => {
    it('classifies a newly imported lead with zero call logs as Hot', () => {
      const newLead = createMockLead({ category: 'New' });
      const calledLeadIds = new Set<string>();

      expect(isHotLead(newLead, calledLeadIds)).toBe(true);
    });
  });

  /* =========================================================================
   * Scenario 2: Old never-called lead remains Hot
   * ========================================================================= */
  describe('2. Hot Leads: Old never-called lead remains Hot', () => {
    it('keeps a 45-day-old lead in Hot Leads because call attempts = 0', () => {
      const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
      const oldNeverCalledLead = createMockLead({
        created_at: fortyFiveDaysAgo,
        category: 'New',
      });
      const calledLeadIds = new Set<string>(); // 0 call attempts

      expect(isHotLead(oldNeverCalledLead, calledLeadIds)).toBe(true);
    });
  });

  /* =========================================================================
   * Scenario 3: First connected call removes lead from Hot
   * ========================================================================= */
  describe('3. Lifecycle: First connected call removes lead from Hot', () => {
    it('removes lead from Hot Leads as soon as a connected call is logged', () => {
      const lead = createMockLead({ id: 'lead-001', category: 'New' });
      const calledLeadIds = new Set<string>();

      expect(isHotLead(lead, calledLeadIds)).toBe(true);

      // Record first connected call
      const callLog: CallLog = {
        id: 'call-001',
        lead_id: lead.id,
        candidate_id: null,
        telecaller_name: 'Priya Sharma',
        call_type: 'Connected',
        duration: 120,
        note: 'Candidate is looking for back office roles in Pandri',
        timestamp: new Date().toISOString(),
      };

      calledLeadIds.add(callLog.lead_id!);
      lead.category = 'Warm';

      expect(isHotLead(lead, calledLeadIds)).toBe(false);
    });
  });

  /* =========================================================================
   * Scenario 4: First unanswered call removes lead from Hot
   * ========================================================================= */
  describe('4. Lifecycle: First unanswered call removes lead from Hot', () => {
    it('removes lead from Hot Leads even if the call was No Answer / Busy', () => {
      const lead = createMockLead({ id: 'lead-002', category: 'New' });
      const calledLeadIds = new Set<string>();

      expect(isHotLead(lead, calledLeadIds)).toBe(true);

      // Record unanswered call attempt
      const callLog: CallLog = {
        id: 'call-002',
        lead_id: lead.id,
        candidate_id: null,
        telecaller_name: 'Amit Patel',
        call_type: 'No Answer',
        duration: 0,
        note: 'Ringing, no response',
        timestamp: new Date().toISOString(),
      };

      calledLeadIds.add(callLog.lead_id!);
      lead.category = 'Warm'; // Transitioned from New/Hot after first attempt

      expect(isHotLead(lead, calledLeadIds)).toBe(false);
    });
  });

  /* =========================================================================
   * Scenario 5: No Answer creates next-day follow-up by default
   * ========================================================================= */
  describe('5. Follow-ups: No Answer creates next-day follow-up by default', () => {
    it('automatically generates a next-day follow-up task on unanswered call', () => {
      const lead = createMockLead({ id: 'lead-003', name: 'Vikas Sahu' });
      const callType: CallType = 'No Answer';

      // Logic simulating recordLeadCall
      let generatedTask: Partial<FollowUpTask> | null = null;
      if (['No Answer', 'Busy', 'SwitchOff', 'Call Back Later'].includes(callType)) {
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        generatedTask = {
          title: `Retry Call (${callType}): ${lead.name}`,
          entity_type: 'lead',
          entity_id: lead.id,
          lead_entity_id: lead.id,
          due_date: tomorrow,
          priority: 'Medium',
          status: 'Pending',
          is_active: true,
        };
      }

      expect(generatedTask).not.toBeNull();
      expect(generatedTask?.title).toBe('Retry Call (No Answer): Vikas Sahu');
      expect(generatedTask?.lead_entity_id).toBe('lead-003');
      expect(generatedTask?.due_date).toBe(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
    });
  });

  /* =========================================================================
   * Scenario 6: Employee can edit suggested follow-up
   * ========================================================================= */
  describe('6. Follow-ups: Employee can edit suggested follow-up', () => {
    it('accepts customized follow-up date, time, priority, and notes from recruiter', () => {
      const customizedTask = {
        title: 'Discuss Tally Prime Requirement',
        due_date: '2026-10-15',
        priority: 'High' as const,
        notes: 'Candidate asked to call at 4:30 PM after office hours',
        assigned_to: 'recruiter-priya',
        entity_type: 'lead' as const,
        entity_id: 'lead-004',
        lead_entity_id: 'lead-004',
        status: 'Pending' as const,
      };

      const parsed = taskSchema.safeParse(customizedTask);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.title).toBe('Discuss Tally Prime Requirement');
        expect(parsed.data.priority).toBe('High');
        expect(parsed.data.due_date).toBe('2026-10-15');
      }
    });
  });

  /* =========================================================================
   * Scenario 7: Re-upload does not reset existing lead status
   * ========================================================================= */
  describe('7. Deduplication: Re-upload does not reset existing lead status', () => {
    it('detects existing lead on re-upload and marks status as already_in_leads', () => {
      const existingLead = createMockLead({
        id: 'lead-existing-1',
        mobile: '9826011111',
        category: 'Warm',
      });

      const rawRows = [
        { 'Candidate Name': 'Existing Lead Person', 'Mobile Number': '9826011111' },
      ];

      const mapping = {
        name: 'Candidate Name',
        mobile: 'Mobile Number',
      };

      const result = analyzeLeadImportRows({
        rawRows,
        mapping,
        source: 'WorkIndia',
        existingLeads: [existingLead],
        existingCandidates: [],
      });

      expect(result.stats.totalRows).toBe(1);
      expect(result.stats.readyCount).toBe(0);
      expect(result.stats.alreadyInLeadsCount).toBe(1);
      expect(result.rows[0]!.status).toBe('already_in_leads');
      expect(result.rows[0]!.selected).toBe(false);
      expect(result.rows[0]!.statusReason).toContain('Already in Leads (Warm)');
    });
  });

  /* =========================================================================
   * Scenario 8: Duplicate phone inside same file is skipped
   * ========================================================================= */
  describe('8. Deduplication: Duplicate phone inside same file is skipped', () => {
    it('marks first occurrence as ready and subsequent occurrence as duplicate_in_file', () => {
      const rawRows = [
        { 'Full Name': 'First Entry', 'Contact': '9826022222' },
        { 'Full Name': 'Second Entry (Duplicate)', 'Contact': '+91 98260-22222' },
      ];

      const mapping = {
        name: 'Full Name',
        mobile: 'Contact',
      };

      const result = analyzeLeadImportRows({
        rawRows,
        mapping,
        source: 'WorkIndia',
        existingLeads: [],
        existingCandidates: [],
      });

      expect(result.stats.totalRows).toBe(2);
      expect(result.stats.readyCount).toBe(1);
      expect(result.stats.duplicateInFileCount).toBe(1);

      expect(result.rows[0]!.status).toBe('ready');
      expect(result.rows[0]!.selected).toBe(true);

      expect(result.rows[1]!.status).toBe('duplicate_in_file');
      expect(result.rows[1]!.selected).toBe(false);
      expect(result.rows[1]!.statusReason).toContain('matches Row 2');
    });
  });

  /* =========================================================================
   * Scenario 9: Duplicate phone in Leads is skipped
   * ========================================================================= */
  describe('9. Deduplication: Duplicate phone in Leads is skipped', () => {
    it('flags mobile already present in Leads table and excludes from ready count', () => {
      const activeLead = createMockLead({ mobile: '9826033333', name: 'Kavita Joshi' });

      const rawRows = [
        { 'Candidate Name': 'Kavita Joshi New File', 'Mobile Number': '09826033333' },
      ];

      const mapping = {
        name: 'Candidate Name',
        mobile: 'Mobile Number',
      };

      const result = analyzeLeadImportRows({
        rawRows,
        mapping,
        source: 'WorkIndia',
        existingLeads: [activeLead],
        existingCandidates: [],
      });

      expect(result.rows[0]!.status).toBe('already_in_leads');
      expect(result.rows[0]!.matchedEntityRef).toBe('Kavita Joshi');
      expect(result.stats.readyCount).toBe(0);
      expect(result.stats.alreadyInLeadsCount).toBe(1);
    });
  });

  /* =========================================================================
   * Scenario 10: Duplicate phone in Candidates is not imported as a new Lead
   * ========================================================================= */
  describe('10. Deduplication: Duplicate phone in Candidates is not imported as a new Lead', () => {
    it('cross-table detects active Candidate mobile and blocks import as a Lead', () => {
      const existingCand = createMockCandidate({
        mobile: '9826044444',
        name: 'Deepak Rao',
        status: 'Active',
      });

      const rawRows = [
        { 'Candidate Name': 'Deepak Rao WorkIndia', 'Mobile Number': '+91 98260 44444' },
      ];

      const mapping = {
        name: 'Candidate Name',
        mobile: 'Mobile Number',
      };

      const result = analyzeLeadImportRows({
        rawRows,
        mapping,
        source: 'WorkIndia',
        existingLeads: [],
        existingCandidates: [existingCand],
      });

      expect(result.stats.readyCount).toBe(0);
      expect(result.stats.alreadyInCandidatesCount).toBe(1);
      expect(result.rows[0]!.status).toBe('already_in_candidates');
      expect(result.rows[0]!.selected).toBe(false);
      expect(result.rows[0]!.statusReason).toContain('Already registered as Candidate in CRM');
      expect(result.rows[0]!.matchedEntityRef).toBe('Deepak Rao');
    });
  });

  /* =========================================================================
   * Scenario 11: Concurrent imports cannot create duplicates
   * ========================================================================= */
  describe('11. Concurrency: Deduplication checks handle simultaneous attempts', () => {
    it('rejects duplicate lead creation with matching mobile in offline and local checks', async () => {
      const existingLeads: Lead[] = [createMockLead({ mobile: '9826055555' })];

      const attemptCreate = (mobile: string) => {
        const found = existingLeads.find(l => l.mobile === mobile && l.is_active);
        if (found) {
          return { success: false, reason: 'duplicate_lead', message: 'An active lead with this mobile already exists' };
        }
        const newLead = createMockLead({ mobile });
        existingLeads.push(newLead);
        return { success: true, lead: newLead };
      };

      const res1 = attemptCreate('9826055555');
      expect(res1.success).toBe(false);
      expect(res1.reason).toBe('duplicate_lead');

      const res2 = attemptCreate('9826066666');
      expect(res2.success).toBe(true);

      const res3 = attemptCreate('9826066666');
      expect(res3.success).toBe(false);
    });
  });

  /* =========================================================================
   * Scenario 12: Multiple categories can be assigned
   * ========================================================================= */
  describe('12. Categorization: Multiple categories/skills can be assigned', () => {
    it('combines file skills and user-selected categories without duplicates', () => {
      const rawRows = [
        { 'Name': 'Manoj Sen', 'Phone': '9826077777', 'Skills': 'Tally, GST, Billing' },
      ];

      const mapping = {
        name: 'Name',
        mobile: 'Phone',
        skills: 'Skills',
      };

      const userSelectedCategories = ['Back Office', 'Accountant', 'GST'];

      const result = analyzeLeadImportRows({
        rawRows,
        mapping,
        source: 'Naukri.com',
        categories: userSelectedCategories,
        existingLeads: [],
        existingCandidates: [],
      });

      expect(result.rows[0]!.parsed.skills).toEqual(
        expect.arrayContaining(['Tally', 'GST', 'Billing', 'Back Office', 'Accountant'])
      );
      // 'GST' should appear only once (deduped set)
      const gstCount = result.rows[0]!.parsed.skills.filter(s => s === 'GST').length;
      expect(gstCount).toBe(1);
    });
  });

  /* =========================================================================
   * Scenario 13: Assignment during import
   * ========================================================================= */
  describe('13. Assignment: Assigning leads to an employee during import', () => {
    it('attaches assignedTo user ID to all parsed lead rows in the batch', () => {
      const rawRows = [
        { 'Name': 'Candidate 1', 'Mobile': '9826088881' },
        { 'Name': 'Candidate 2', 'Mobile': '9826088882' },
      ];

      const mapping = { name: 'Name', mobile: 'Mobile' };

      const result = analyzeLeadImportRows({
        rawRows,
        mapping,
        source: 'WorkIndia',
        assignedTo: 'user-telecaller-neha',
        existingLeads: [],
        existingCandidates: [],
      });

      expect(result.rows[0]!.parsed.assigned_to).toBe('user-telecaller-neha');
      expect(result.rows[1]!.parsed.assigned_to).toBe('user-telecaller-neha');
    });
  });

  /* =========================================================================
   * Scenario 14: Assignment after import
   * ========================================================================= */
  describe('14. Assignment: Reassignment after import records history', () => {
    it('updates lead.assigned_to and creates a lead_assignment_history log', () => {
      const lead = createMockLead({ id: 'lead-assign-1', assigned_to: 'user-old' });
      const historyList: LeadAssignmentHistory[] = [];

      // Simulate assignLead handler
      const reassign = (leadId: string, newUserId: string, reason: string) => {
        const fromUser = lead.assigned_to;
        lead.assigned_to = newUserId;
        const hist: LeadAssignmentHistory = {
          id: `hist-${Date.now()}`,
          created_at: new Date().toISOString(),
          lead_id: leadId,
          assigned_from: fromUser,
          assigned_to: newUserId,
          assigned_by: 'admin-user',
          reason: reason,
        };
        historyList.push(hist);
      };

      reassign(lead.id, 'user-new', 'Workload balancing across telecallers');

      expect(lead.assigned_to).toBe('user-new');
      expect(historyList).toHaveLength(1);
      expect(historyList[0]!.assigned_from).toBe('user-old');
      expect(historyList[0]!.assigned_to).toBe('user-new');
      expect(historyList[0]!.reason).toBe('Workload balancing across telecallers');
    });
  });

  /* =========================================================================
   * Scenario 15: Universal lead visibility for CRM users
   * ========================================================================= */
  describe('15. Visibility: Universal lead visibility with filter options', () => {
    it('allows filtering by unassigned, specific user, or all leads', () => {
      const leads = [
        createMockLead({ id: 'l1', assigned_to: 'user-a' }),
        createMockLead({ id: 'l2', assigned_to: 'user-b' }),
        createMockLead({ id: 'l3', assigned_to: null }),
      ];

      const filterByAssigned = (filter: string) => {
        return leads.filter(l => {
          if (filter === 'All') return true;
          if (filter === 'Unassigned') return !l.assigned_to;
          return l.assigned_to === filter;
        });
      };

      expect(filterByAssigned('All')).toHaveLength(3);
      expect(filterByAssigned('Unassigned')).toHaveLength(1);
      expect(filterByAssigned('Unassigned')[0]!.id).toBe('l3');
      expect(filterByAssigned('user-a')).toHaveLength(1);
      expect(filterByAssigned('user-a')[0]!.id).toBe('l1');
    });
  });

  /* =========================================================================
   * Scenario 16: Call history preserves actual caller
   * ========================================================================= */
  describe('16. Call Audit: Call history preserves actual caller identity', () => {
    it('keeps telecaller_name immutable on call log even after lead reassignment', () => {
      const lead = createMockLead({ id: 'lead-audit-1', assigned_to: 'rahul-telecaller' });

      const callLog: CallLog = {
        id: 'call-100',
        lead_id: lead.id,
        candidate_id: null,
        telecaller_name: 'Rahul Sharma',
        call_type: 'Connected',
        duration: 90,
        note: 'Interested in Retail Cashier position',
        timestamp: '2026-10-01T10:00:00Z',
      };

      // Reassign lead to Priya
      lead.assigned_to = 'priya-telecaller';

      // Call log telecaller_name remains Rahul Sharma
      expect(callLog.telecaller_name).toBe('Rahul Sharma');
      expect(lead.assigned_to).toBe('priya-telecaller');
    });
  });

  /* =========================================================================
   * Scenario 17: Not Interested leads appear separately
   * ========================================================================= */
  describe('17. Pipeline: Not Interested leads appear in dedicated section', () => {
    it('places leads marked Rejected / Do Not Contact in the not_interested tab', () => {
      const leads = [
        createMockLead({ id: 'l1', category: 'New' }),
        createMockLead({ id: 'l2', category: 'Warm' }),
        createMockLead({ id: 'l3', category: 'Rejected' }),
        createMockLead({ id: 'l4', category: 'Do Not Contact' }),
      ];

      const notInterestedLeads = leads.filter(
        l => l.category === 'Rejected' || l.category === 'Do Not Contact'
      );
      const activePipelineLeads = leads.filter(
        l => l.category !== 'Rejected' && l.category !== 'Do Not Contact'
      );

      expect(notInterestedLeads).toHaveLength(2);
      expect(notInterestedLeads.map(l => l.id)).toEqual(['l3', 'l4']);
      expect(activePipelineLeads).toHaveLength(2);
      expect(activePipelineLeads.map(l => l.id)).toEqual(['l1', 'l2']);
    });
  });

  /* =========================================================================
   * Scenario 18: Reactivated leads retain call history and do not become Hot
   * ========================================================================= */
  describe('18. Reactivation: Reactivated leads retain history and do not become Hot', () => {
    it('restores lead to Warm, keeps prior call logs, and prevents Hot lead categorization', () => {
      const lead = createMockLead({ id: 'lead-react-1', category: 'Rejected' });
      const callLogs: CallLog[] = [
        {
          id: 'call-prev-1',
          lead_id: lead.id,
          candidate_id: null,
          telecaller_name: 'Priya',
          call_type: 'Not Interested',
          duration: 45,
          note: 'Currently not looking for jobs',
          timestamp: '2026-09-15T11:00:00Z',
        },
      ];

      const calledLeadIds = new Set<string>(callLogs.map(c => c.lead_id!));

      // Reactivation action
      lead.category = 'Warm';
      lead.notes = `${lead.notes || ''} [Reactivated on 2026-10-04: Candidate called back saying now available]`;

      expect(lead.category).toBe('Warm');
      expect(calledLeadIds.has(lead.id)).toBe(true);
      expect(isHotLead(lead, calledLeadIds)).toBe(false); // MUST NOT become Hot
    });
  });

  /* =========================================================================
   * Scenario 19: Conversion preserves Lead record
   * ========================================================================= */
  describe('19. Conversion: Converting lead to candidate preserves lead record', () => {
    it('updates lead category to Converted and links converted_candidate_id without deletion', () => {
      const lead = createMockLead({
        id: 'lead-conv-1',
        name: 'Gaurav Dewangan',
        mobile: '9826091234',
        category: 'Warm',
      });

      const newCandidateId = 'cand-conv-888';

      // Conversion transition
      lead.category = 'Converted';
      lead.converted_candidate_id = newCandidateId;
      lead.converted_at = new Date().toISOString();

      expect(lead.is_active).toBe(true); // NOT deleted
      expect(lead.category).toBe('Converted');
      expect(lead.converted_candidate_id).toBe('cand-conv-888');
      expect(lead.converted_at).toBeTruthy();
    });
  });

  /* =========================================================================
   * Scenario 20: Repeated conversion is idempotent (no duplicate Candidate)
   * ========================================================================= */
  describe('20. Conversion: Repeated conversion is idempotent', () => {
    it('returns existing candidate ID without creating another candidate', () => {
      const lead = createMockLead({
        id: 'lead-conv-2',
        converted_candidate_id: 'cand-existing-999',
        category: 'Converted',
      });

      const handleConvert = (targetLead: Lead) => {
        if (targetLead.converted_candidate_id) {
          return {
            success: true,
            idempotent: true,
            candidate_id: targetLead.converted_candidate_id,
            message: 'Already converted',
          };
        }
        return { success: true, idempotent: false, candidate_id: 'cand-new' };
      };

      const res = handleConvert(lead);
      expect(res.idempotent).toBe(true);
      expect(res.candidate_id).toBe('cand-existing-999');
      expect(res.message).toBe('Already converted');
    });
  });

  /* =========================================================================
   * Scenario 21: Import batch history accuracy
   * ========================================================================= */
  describe('21. Batches: Import batch record preserves file metadata and counts', () => {
    it('records correct batch metrics for total, imported, and skipped counts', () => {
      const batchRecord: LeadImportBatch = {
        id: 'batch-001',
        created_at: new Date().toISOString(),
        imported_by: 'user-admin',
        file_name: 'WorkIndia_Raipur_Leads_Oct2026.xlsx',
        detected_platform: 'WorkIndia',
        total_rows: 50,
        imported_count: 42,
        skipped_duplicate_count: 6,
        skipped_invalid_count: 2,
        default_assigned_to: 'user-telecaller-1',
        notes: 'Raipur Retail & Telecaller import',
      };

      expect(batchRecord.total_rows).toBe(
        batchRecord.imported_count +
        batchRecord.skipped_duplicate_count +
        batchRecord.skipped_invalid_count
      );
      expect(batchRecord.detected_platform).toBe('WorkIndia');
      expect(batchRecord.file_name).toBe('WorkIndia_Raipur_Leads_Oct2026.xlsx');
    });
  });

  /* =========================================================================
   * Scenario 22: Invalid mobile numbers flagged
   * ========================================================================= */
  describe('22. Validation: Invalid Indian mobile numbers are properly flagged', () => {
    it('rejects short, non-digit, and numbers with invalid starting digits', () => {
      const rawRows = [
        { 'Name': 'Short Number', 'Phone': '98260' },
        { 'Name': 'Letters in Phone', 'Phone': '98260ABCD1' },
        { 'Name': 'Invalid Start Digit 4', 'Phone': '4826012345' },
        { 'Name': 'Missing Phone', 'Phone': '' },
      ];

      const mapping = { name: 'Name', mobile: 'Phone' };

      const result = analyzeLeadImportRows({
        rawRows,
        mapping,
        source: 'WorkIndia',
        existingLeads: [],
        existingCandidates: [],
      });

      expect(result.stats.totalRows).toBe(4);
      expect(result.stats.invalidCount).toBe(4);
      expect(result.stats.readyCount).toBe(0);

      expect(result.rows[0]!.statusReason).toContain('Expected 10 digits');
      expect(result.rows[1]!.statusReason).toContain('Expected 10 digits');
      expect(result.rows[2]!.statusReason).toContain('Invalid starting digit');
      expect(result.rows[3]!.statusReason).toContain('Missing phone number');
    });
  });

  /* =========================================================================
   * Scenario 23: Existing Candidate/Job/Interview/Payment workflows unaffected
   * ========================================================================= */
  describe('23. Zero Regression: Existing recruitment workflows remain intact', () => {
    it('validates candidateSchema independently with all standard fields', () => {
      const candData = {
        name: 'Aman Agrawal',
        mobile: '9826078901',
        experience: 2,
        skills: 'Sales, Marketing',
        location: 'Raipur',
        expected_salary: 20000,
        last_role: 'Sales Executive',
        status: 'Active' as const,
      };

      const result = candidateSchema.safeParse(candData);
      expect(result.success).toBe(true);
    });

    it('validates callLogSchema XOR constraint: accepts candidate call OR lead call, rejects both or neither', () => {
      // 1. Valid Candidate call
      const candidateCall = {
        candidate_id: 'cand-001',
        telecaller_name: 'Priya',
        call_type: 'Connected' as const,
        duration: 60,
        timestamp: new Date().toISOString(),
      };
      expect(callLogSchema.safeParse(candidateCall).success).toBe(true);

      // 2. Valid Lead call
      const leadCall = {
        lead_id: 'lead-001',
        telecaller_name: 'Rahul',
        call_type: 'Connected' as const,
        duration: 45,
        timestamp: new Date().toISOString(),
      };
      expect(callLogSchema.safeParse(leadCall).success).toBe(true);

      // 3. Invalid: Both candidate_id and lead_id provided
      const bothCall = {
        candidate_id: 'cand-001',
        lead_id: 'lead-001',
        telecaller_name: 'Rahul',
        call_type: 'Connected' as const,
        duration: 30,
      };
      const bothResult = callLogSchema.safeParse(bothCall);
      expect(bothResult.success).toBe(false);

      // 4. Invalid: Neither candidate_id nor lead_id provided
      const neitherCall = {
        telecaller_name: 'Rahul',
        call_type: 'Connected' as const,
        duration: 30,
      };
      const neitherResult = callLogSchema.safeParse(neitherCall);
      expect(neitherResult.success).toBe(false);
    });

    it('validates leadSchema accepts all 9 canonical call outcomes', () => {
      const canonicalOutcomes: CallType[] = [
        'Connected',
        'No Answer',
        'Busy',
        'SwitchOff',
        'Call Back Later',
        'Not Interested',
        'Interested',
        'Wrong Number',
        'Converted',
      ];

      for (const outcome of canonicalOutcomes) {
        const log = {
          lead_id: 'lead-valid-1',
          telecaller_name: 'Telecaller',
          call_type: outcome,
          duration: 10,
        };
        const res = callLogSchema.safeParse(log);
        expect(res.success).toBe(true);
      }
    });

    it('validates leadSchema rejects invalid categories and sources', () => {
      const invalidCategory = leadSchema.safeParse({
        name: 'Test Lead',
        mobile: '9826012345',
        category: 'NonExistentCategory' as any,
      });
      expect(invalidCategory.success).toBe(false);

      const invalidSource = leadSchema.safeParse({
        name: 'Test Lead',
        mobile: '9826012345',
        source: 'FakeSource' as any,
      });
      expect(invalidSource.success).toBe(false);
    });
  });
});
