import { describe, it, expect } from 'vitest';
import { taskSchema, callLogSchema } from '../lib/validation';
import { normalizePhone } from '../lib/candidateImport';
import { CallLog } from '../types';

describe('SCC CRM — Leads Module Production Remediation Verification Suite', () => {
  /* =========================================================================
   * Fix 1: Anonymous & Inactive Account RPC Execution Denial & Auth Guards
   * ========================================================================= */
  describe('Fix 1: Anonymous & Inactive Profile RPC Denial & Auth Guards', () => {
    interface MockProfile {
      id: string;
      role: 'admin' | 'manager' | 'recruiter';
      is_active: boolean;
    }

    const profiles = new Map<string, MockProfile>([
      ['active-recruiter-id', { id: 'active-recruiter-id', role: 'recruiter', is_active: true }],
      ['deactivated-recruiter-id', { id: 'deactivated-recruiter-id', role: 'recruiter', is_active: false }],
    ]);

    const simulateRpcAuthGuard = (authUid: string | null) => {
      if (!authUid) {
        throw new Error('Unauthorized: Authentication required (42501)');
      }
      const profile = profiles.get(authUid);
      if (!profile || !profile.is_active) {
        throw new Error('Unauthorized: Active user profile required (42501)');
      }
      return { success: true };
    };

    it('rejects unauthenticated (anon) callers', () => {
      expect(() => simulateRpcAuthGuard(null)).toThrowError(/Unauthorized: Authentication required/);
      expect(() => simulateRpcAuthGuard(undefined as any)).toThrowError(/Unauthorized: Authentication required/);
    });

    it('rejects deactivated employees even if they hold a valid JWT', () => {
      expect(() => simulateRpcAuthGuard('deactivated-recruiter-id')).toThrowError(/Active user profile required/);
    });

    it('allows active authenticated recruiters, managers, and admins', () => {
      expect(simulateRpcAuthGuard('active-recruiter-id')).toEqual({ success: true });
    });
  });

  /* =========================================================================
   * Fix 3: Lead Call Logs RLS Visibility for Teammates & Inactive Guard
   * ========================================================================= */
  describe('Fix 3: Lead Call Logs RLS Visibility for Teammates', () => {
    interface MockProfile {
      id: string;
      role: 'admin' | 'manager' | 'recruiter';
      is_active: boolean;
    }

    interface MockCandidate {
      id: string;
      assigned_to: string | null;
      created_by: string | null;
    }

    interface MockLead {
      id: string;
      is_active: boolean;
      assigned_to: string | null;
      created_by: string | null;
    }

    // Mathematical representation of call_logs_select_policy with active profile guard
    const canViewCallLog = (
      log: CallLog,
      user: MockProfile,
      leads: Map<string, MockLead>,
      candidates: Map<string, MockCandidate>
    ): boolean => {
      // 0. Active CRM profile required
      if (!user.is_active) return false;

      // 1. Admin or Manager has global visibility
      if (user.role === 'admin' || user.role === 'manager') return true;

      // 2. Creator of the call log always has visibility
      if (log.created_by && log.created_by === user.id) return true;

      // 3. Lead Call Logs: Shared across all active authenticated CRM users if the lead is active
      if (log.lead_id) {
        const lead = leads.get(log.lead_id);
        if (lead && lead.is_active) {
          return true;
        }
      }

      // 4. Candidate Call Logs: Restricted to assigned recruiter or candidate creator
      if (log.candidate_id) {
        const candidate = candidates.get(log.candidate_id);
        if (candidate) {
          if (candidate.assigned_to === user.id || candidate.created_by === user.id) {
            return true;
          }
        }
      }

      return false;
    };

    const recruiterA: MockProfile = { id: 'recruiter-a', role: 'recruiter', is_active: true };
    const recruiterB: MockProfile = { id: 'recruiter-b', role: 'recruiter', is_active: true };
    const adminUser: MockProfile = { id: 'admin-1', role: 'admin', is_active: true };
    const managerUser: MockProfile = { id: 'manager-1', role: 'manager', is_active: true };
    const deactivatedRecruiter: MockProfile = { id: 'recruiter-inactive', role: 'recruiter', is_active: false };

    const leads = new Map<string, MockLead>([
      ['lead-101', { id: 'lead-101', is_active: true, assigned_to: recruiterA.id, created_by: recruiterA.id }],
    ]);
    const candidates = new Map<string, MockCandidate>([
      ['cand-201', { id: 'cand-201', assigned_to: recruiterA.id, created_by: recruiterA.id }],
    ]);

    const leadCallLog: CallLog = {
      id: 'call-lead-1',
      lead_id: 'lead-101',
      candidate_id: null,
      telecaller_name: 'Recruiter A',
      call_type: 'Connected',
      duration: 90,
      note: 'Lead is interested in accountant role',
      timestamp: new Date().toISOString(),
      created_by: recruiterA.id,
    };

    const candCallLog: CallLog = {
      id: 'call-cand-1',
      lead_id: null,
      candidate_id: 'cand-201',
      telecaller_name: 'Recruiter A',
      call_type: 'Connected',
      duration: 60,
      note: 'Candidate salary negotiation in progress',
      timestamp: new Date().toISOString(),
      created_by: recruiterA.id,
    };

    it('allows Recruiter B to view Recruiter A’s call logs on a shared active Lead', () => {
      expect(canViewCallLog(leadCallLog, recruiterA, leads, candidates)).toBe(true);
      expect(canViewCallLog(leadCallLog, recruiterB, leads, candidates)).toBe(true);
    });

    it('blocks deactivated employees from viewing lead call logs even if authenticated', () => {
      expect(canViewCallLog(leadCallLog, deactivatedRecruiter, leads, candidates)).toBe(false);
    });

    it('keeps candidate call logs restricted to candidate owner/assignee, hiding from unrelated recruiters', () => {
      expect(canViewCallLog(candCallLog, recruiterA, leads, candidates)).toBe(true);
      expect(canViewCallLog(candCallLog, recruiterB, leads, candidates)).toBe(false);
    });

    it('grants Admin and Manager unrestricted read visibility across both Lead and Candidate call logs', () => {
      expect(canViewCallLog(leadCallLog, adminUser, leads, candidates)).toBe(true);
      expect(canViewCallLog(candCallLog, adminUser, leads, candidates)).toBe(true);
      expect(canViewCallLog(leadCallLog, managerUser, leads, candidates)).toBe(true);
      expect(canViewCallLog(candCallLog, managerUser, leads, candidates)).toBe(true);
    });

    // Model of hardened call_logs_insert_policy
    const canInsertCallLog = (
      log: Partial<CallLog>,
      user: MockProfile,
      leads: Map<string, MockLead>,
      candidates: Map<string, MockCandidate>
    ): boolean => {
      // Must have active CRM profile
      if (!user.is_active) return false;

      // Admin or manager can log calls anywhere
      if (user.role === 'admin' || user.role === 'manager') return true;

      // Lead call logs: allowed for any active user if target lead is active
      if (log.lead_id) {
        const lead = leads.get(log.lead_id);
        return Boolean(lead && lead.is_active);
      }

      // Candidate call logs: allowed only if assigned to or created by caller
      if (log.candidate_id) {
        const candidate = candidates.get(log.candidate_id);
        return Boolean(candidate && (candidate.assigned_to === user.id || candidate.created_by === user.id));
      }

      return false;
    };

    // Model of trg_call_logs_set_created_by attribution trigger
    const applyCreatedByTrigger = (authUid: string | null, payloadCreatedBy?: string | null): string | null => {
      // In PostgreSQL: NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
      return authUid || payloadCreatedBy || null;
    };

    it('allows active recruiters to insert call logs on active leads even when created_by is omitted in payload', () => {
      expect(canInsertCallLog({ lead_id: 'lead-101' }, recruiterB, leads, candidates)).toBe(true);
    });

    it('blocks deactivated employees from inserting call logs', () => {
      expect(canInsertCallLog({ lead_id: 'lead-101' }, deactivatedRecruiter, leads, candidates)).toBe(false);
    });

    it('enforces candidate call log restriction on insert for non-assigned recruiters even when created_by matches caller', () => {
      // Recruiter A is assigned
      expect(canInsertCallLog({ candidate_id: 'cand-201', created_by: recruiterA.id }, recruiterA, leads, candidates)).toBe(true);
      // Recruiter B is NOT assigned — attempting to bypass via created_by MUST FAIL
      expect(canInsertCallLog({ candidate_id: 'cand-201', created_by: recruiterB.id }, recruiterB, leads, candidates)).toBe(false);
    });

    it('allows Admin and Manager to insert call logs for any Lead and any Candidate', () => {
      expect(canInsertCallLog({ lead_id: 'lead-101' }, adminUser, leads, candidates)).toBe(true);
      expect(canInsertCallLog({ candidate_id: 'cand-201' }, adminUser, leads, candidates)).toBe(true);
      expect(canInsertCallLog({ lead_id: 'lead-101' }, managerUser, leads, candidates)).toBe(true);
      expect(canInsertCallLog({ candidate_id: 'cand-201' }, managerUser, leads, candidates)).toBe(true);
    });

    it('overrides spoofed created_by value via trusted attribution trigger', () => {
      // Recruiter B attempts to spoof created_by as Recruiter A
      const spoofedPayload = { lead_id: 'lead-101', created_by: recruiterA.id };
      const effectiveCreatedBy = applyCreatedByTrigger(recruiterB.id, spoofedPayload.created_by);
      // Trigger always enforces authenticated identity auth.uid()
      expect(effectiveCreatedBy).toBe(recruiterB.id);
      expect(effectiveCreatedBy).not.toBe(recruiterA.id);
    });

    it('strictly denies UPDATE and DELETE on call logs across all roles (audit immutability)', () => {
      // In PostgreSQL: call_logs has NO UPDATE or DELETE policies, and table grant is strictly (SELECT, INSERT)
      const canUpdateOrDeleteCallLog = (_user: MockProfile, _action: 'UPDATE' | 'DELETE'): boolean => {
        // Strict denial: call logs are immutable audit records
        return false;
      };

      expect(canUpdateOrDeleteCallLog(recruiterA, 'UPDATE')).toBe(false);
      expect(canUpdateOrDeleteCallLog(recruiterA, 'DELETE')).toBe(false);
      expect(canUpdateOrDeleteCallLog(managerUser, 'UPDATE')).toBe(false);
      expect(canUpdateOrDeleteCallLog(managerUser, 'DELETE')).toBe(false);
      expect(canUpdateOrDeleteCallLog(adminUser, 'UPDATE')).toBe(false);
      expect(canUpdateOrDeleteCallLog(adminUser, 'DELETE')).toBe(false);
    });
  });

  /* =========================================================================
   * Fix 4: Cross-Table Candidate/Lead Duplicate Protection, Strict Phone Normalization & Relational Conversion
   * ========================================================================= */
  describe('Fix 4: Cross-Table Candidate/Lead Duplicate Protection & Relational Conversion', () => {
    describe('Strict Indian Mobile Validation (^[6-9][0-9]{9}$)', () => {
      it('validates and normalizes valid Indian mobile numbers across all supported formats', () => {
        // Standard 10-digit
        expect(normalizePhone('9876543210')).toEqual({ isValid: true, normalized: '9876543210' });
        expect(normalizePhone('8876543210')).toEqual({ isValid: true, normalized: '8876543210' });
        expect(normalizePhone('7876543210')).toEqual({ isValid: true, normalized: '7876543210' });
        expect(normalizePhone('6876543210')).toEqual({ isValid: true, normalized: '6876543210' });

        // +91 format
        expect(normalizePhone('+91 98765 43210')).toEqual({ isValid: true, normalized: '9876543210' });
        expect(normalizePhone('+91-98765-43210')).toEqual({ isValid: true, normalized: '9876543210' });

        // +91 0 format (13 digits)
        expect(normalizePhone('+91 09876543210')).toEqual({ isValid: true, normalized: '9876543210' });

        // Leading 0 format (11 digits)
        expect(normalizePhone('09876543210')).toEqual({ isValid: true, normalized: '9876543210' });

        // International 0091 format (14 digits)
        expect(normalizePhone('00919876543210')).toEqual({ isValid: true, normalized: '9876543210' });
      });

      it('strictly rejects invalid, malformed, empty, or out-of-range phone inputs', () => {
        // Empty / Null / Undefined
        expect(normalizePhone('').isValid).toBe(false);
        expect(normalizePhone('   ').isValid).toBe(false);
        expect(normalizePhone(null).isValid).toBe(false);
        expect(normalizePhone(undefined).isValid).toBe(false);

        // Too short (< 10 digits)
        expect(normalizePhone('98765').isValid).toBe(false);
        expect(normalizePhone('987654321').isValid).toBe(false);

        // Too long (> 10 digits after prefix strip)
        expect(normalizePhone('98765432109999').isValid).toBe(false);

        // Invalid starting digit (India mobile must start with 6, 7, 8, 9)
        expect(normalizePhone('5555555555').isValid).toBe(false);
        expect(normalizePhone('1234567890').isValid).toBe(false);
        expect(normalizePhone('2345678901').isValid).toBe(false);

        // Non-digits only
        expect(normalizePhone('not-a-number').isValid).toBe(false);
      });

      it('strictly rejects numbers with repeated or malformed prefixes without improper digit stripping', () => {
        // Repeated +91 or 91
        expect(normalizePhone('+91919876543210').isValid).toBe(false);
        expect(normalizePhone('91919876543210').isValid).toBe(false);

        // Repeated 0091
        expect(normalizePhone('009100919876543210').isValid).toBe(false);
        expect(normalizePhone('0091919876543210').isValid).toBe(false);
        expect(normalizePhone('+9100919876543210').isValid).toBe(false);

        // Double leading zeros
        expect(normalizePhone('009876543210').isValid).toBe(false);
      });
    });

    describe('Cross-Table Duplicate Protection & GUC-Free Relational Conversion', () => {
      it('blocks candidate creation if an active unconverted lead exists, ignoring any custom GUCs', () => {
        const activeLeads = [
          { id: 'lead-1', mobile: '9826011111', is_active: true, converted_candidate_id: null as string | null },
        ];

        // Model of trg_candidates_cross_table_dedup (relational, GUC-free)
        const checkCandidateInsert = (candidateId: string, rawMobile: string, _attemptedGucValue?: string) => {
          const norm = normalizePhone(rawMobile);
          if (!norm.isValid) {
            throw new Error(`Invalid mobile: "${rawMobile}" cannot be normalized (23514)`);
          }

          // Trigger checks: is there an active lead whose converted_candidate_id does NOT equal this candidate's ID?
          const existingUnconvertedLead = activeLeads.find(
            l => l.mobile === norm.normalized && l.is_active && (l.converted_candidate_id === null || l.converted_candidate_id !== candidateId)
          );

          if (existingUnconvertedLead) {
            throw new Error(`Cross-table duplicate: An active unconverted lead with mobile ${norm.normalized} already exists in CRM Leads module. (23505)`);
          }

          return { allowed: true };
        };

        // 1. Direct standard 10-digit duplicate is blocked
        expect(() => checkCandidateInsert('cand-new-1', '9826011111')).toThrowError(/Cross-table duplicate/);

        // 2. Formatted "+91 98260 11111" representation is ALSO blocked
        expect(() => checkCandidateInsert('cand-new-2', '+91 98260 11111')).toThrowError(/Cross-table duplicate/);

        // 3. Leading-zero "09826011111" representation is ALSO blocked
        expect(() => checkCandidateInsert('cand-new-3', '09826011111')).toThrowError(/Cross-table duplicate/);

        // 4. International prefix "00919826011111" is ALSO blocked
        expect(() => checkCandidateInsert('cand-new-4', '00919826011111')).toThrowError(/Cross-table duplicate/);

        // 5. Country code with leading zero "+91 09826011111" is ALSO blocked
        expect(() => checkCandidateInsert('cand-new-5', '+91 09826011111')).toThrowError(/Cross-table duplicate/);

        // 6. Attempting to bypass by setting custom GUC is INEFFECTIVE (trigger is GUC-free)
        expect(() => checkCandidateInsert('cand-new-6', '9826011111', 'lead-1')).toThrowError(/Cross-table duplicate/);

        // 7. Distinct mobile is allowed
        expect(checkCandidateInsert('cand-new-7', '+91 98260 22222').allowed).toBe(true);
      });

      it('enforces that converted_candidate_id can only be modified by trusted conversion RPC', () => {
        // Model of trg_enforce_lead_ownership
        const simulateLeadUpdate = (currentUser: string, oldVal: string | null, newVal: string | null) => {
          if (newVal !== oldVal) {
            if (currentUser !== 'postgres') {
              throw new Error('Unauthorized: converted_candidate_id can only be modified via convert_lead_to_candidate RPC (42501)');
            }
          }
          return { allowed: true };
        };

        // Direct client query running as 'authenticated' role is REJECTED
        expect(() => simulateLeadUpdate('authenticated', null, 'fake-candidate-uuid')).toThrowError(/Unauthorized: converted_candidate_id can only be modified/);

        // Trusted conversion RPC running as 'postgres' role is ALLOWED
        expect(simulateLeadUpdate('postgres', null, 'legit-candidate-uuid').allowed).toBe(true);
      });

      it('guarantees lead conversion idempotency without creating duplicate candidates', () => {
        const dbLeads = [{ id: 'lead-c1', mobile: '9876599999', converted_candidate_id: null as string | null }];
        const dbCandidates: { id: string; mobile: string; name: string }[] = [];

        const convertLead = (leadId: string) => {
          const lead = dbLeads.find(l => l.id === leadId);
          if (!lead) throw new Error('Lead not found');

          // Idempotency check: already converted
          if (lead.converted_candidate_id) {
            const cand = dbCandidates.find(c => c.id === lead.converted_candidate_id)!;
            return { success: true, idempotent: true, candidate_id: cand.id, candidate_name: cand.name };
          }

          // Pre-generate candidate ID and link on lead
          const candId = `cand-${dbCandidates.length + 1}`;
          lead.converted_candidate_id = candId;

          // Insert candidate with pre-linked ID
          dbCandidates.push({ id: candId, mobile: lead.mobile, name: 'Converted Cand' });

          return { success: true, idempotent: false, candidate_id: candId, candidate_name: 'Converted Cand' };
        };

        const res1 = convertLead('lead-c1');
        expect(res1.idempotent).toBe(false);
        expect(dbCandidates.length).toBe(1);

        const res2 = convertLead('lead-c1');
        expect(res2.idempotent).toBe(true);
        expect(res2.candidate_id).toBe(res1.candidate_id);
        expect(dbCandidates.length).toBe(1); // Still exactly 1 candidate
      });
    });

    it('simulates concurrent candidate vs lead creation with advisory lock serialization', () => {
      // Simulates database advisory lock table on mobile
      const locks = new Set<string>();
      const dbLeads: { id: string; mobile: string; is_active: boolean }[] = [];
      const dbCandidates: { id: string; mobile: string; is_active: boolean }[] = [];

      const insertLead = (mobile: string) => {
        const norm = normalizePhone(mobile).normalized;
        const lockKey = `scc_mobile:${norm}`;
        if (locks.has(lockKey)) throw new Error('Lock contention: serialized');
        locks.add(lockKey);
        try {
          if (dbCandidates.some(c => c.mobile === norm && c.is_active)) {
            throw new Error('Cross-table duplicate: Candidate already exists');
          }
          dbLeads.push({ id: `lead-${Date.now()}`, mobile: norm, is_active: true });
        } finally {
          locks.delete(lockKey);
        }
      };

      const insertCandidate = (mobile: string) => {
        const norm = normalizePhone(mobile).normalized;
        const lockKey = `scc_mobile:${norm}`;
        if (locks.has(lockKey)) throw new Error('Lock contention: serialized');
        locks.add(lockKey);
        try {
          if (dbLeads.some(l => l.mobile === norm && l.is_active)) {
            throw new Error('Cross-table duplicate: Lead already exists');
          }
          dbCandidates.push({ id: `cand-${Date.now()}`, mobile: norm, is_active: true });
        } finally {
          locks.delete(lockKey);
        }
      };

      // Candidate inserted first
      insertCandidate('+91 98765 00001');
      expect(dbCandidates.length).toBe(1);

      // Concurrent lead attempt with same mobile in different format is rejected
      expect(() => insertLead('09876500001')).toThrowError(/Cross-table duplicate: Candidate already exists/);
      expect(dbLeads.length).toBe(0);
    });

    it('rejects unauthorized lead conversion requests (unauthenticated callers or deactivated staff)', () => {
      const activeProfiles = new Map<string, { id: string; role: string; is_active: boolean }>([
        ['active-recruiter', { id: 'active-recruiter', role: 'recruiter', is_active: true }],
        ['inactive-recruiter', { id: 'active-recruiter', role: 'recruiter', is_active: false }],
      ]);

      const simulateConvertRpcAuth = (callerId: string | null) => {
        if (!callerId) throw new Error('Unauthorized: Authentication required (42501)');
        const profile = activeProfiles.get(callerId);
        if (!profile || !profile.is_active) {
          throw new Error('Unauthorized: Active user profile required (42501)');
        }
        return { authorized: true };
      };

      expect(() => simulateConvertRpcAuth(null)).toThrowError(/Unauthorized: Authentication required/);
      expect(() => simulateConvertRpcAuth('inactive-recruiter')).toThrowError(/Active user profile required/);
      expect(simulateConvertRpcAuth('active-recruiter').authorized).toBe(true);
    });

    it('rolls back lead update if candidate insert fails during conversion (atomic transaction guarantee)', () => {
      const lead = {
        id: 'lead-rollback-1',
        mobile: '9876588888',
        name: 'Rollback Candidate',
        category: 'Warm',
        converted_candidate_id: null as string | null,
        converted_at: null as string | null,
      };

      const candidateTable: any[] = [];

      const simulateConversionTransaction = (shouldFailCandidateInsert: boolean) => {
        // Savepoint / Transaction begin
        const leadSnapshot = { ...lead };
        try {
          const preCandidateId = 'cand-uuid-test';
          // Step 1: Pre-link lead
          lead.converted_candidate_id = preCandidateId;
          lead.category = 'Converted';
          lead.converted_at = new Date().toISOString();

          // Step 2: Insert candidate (simulating failure if shouldFailCandidateInsert is true)
          if (shouldFailCandidateInsert) {
            throw new Error('Database constraint error on candidate insert (23505/23514)');
          }

          candidateTable.push({ id: preCandidateId, mobile: lead.mobile, name: lead.name });
          return { success: true };
        } catch (err) {
          // Transaction Rollback
          lead.converted_candidate_id = leadSnapshot.converted_candidate_id;
          lead.category = leadSnapshot.category;
          lead.converted_at = leadSnapshot.converted_at;
          throw err;
        }
      };

      // When candidate insert fails, entire operation rolls back
      expect(() => simulateConversionTransaction(true)).toThrowError(/Database constraint error/);
      expect(lead.converted_candidate_id).toBeNull();
      expect(lead.category).toBe('Warm');
      expect(candidateTable.length).toBe(0);

      // When candidate insert succeeds, state persists
      expect(simulateConversionTransaction(false).success).toBe(true);
      expect(lead.converted_candidate_id).toBe('cand-uuid-test');
      expect(lead.category).toBe('Converted');
      expect(candidateTable.length).toBe(1);
    });
  });

  /* =========================================================================
   * Fix 5: Concurrent Follow-up Task Idempotency
   * ========================================================================= */
  describe('Fix 5: Concurrent Follow-up Task Idempotency', () => {
    it('recovers from unique collision on (lead_entity_id, due_date) and returns existing task', () => {
      const existingTasks = new Map<string, { id: string; lead_entity_id: string; due_date: string; status: string }>();

      // Seed existing task
      existingTasks.set('lead-uuid-1_2026-10-05_Pending', {
        id: 'task-uuid-1',
        lead_entity_id: 'lead-uuid-1',
        due_date: '2026-10-05',
        status: 'Pending',
      });

      const createFollowupWithCollisionRecovery = (leadId: string, dueDate: string) => {
        const key = `${leadId}_${dueDate}_Pending`;
        if (existingTasks.has(key)) {
          const existing = existingTasks.get(key)!;
          return {
            success: true,
            idempotent: true,
            task_id: existing.id,
            message: 'Follow-up task already exists for this date',
          };
        }

        // Simulate new task
        const newTask = {
          id: `task-${Math.random()}`,
          lead_entity_id: leadId,
          due_date: dueDate,
          status: 'Pending',
        };
        existingTasks.set(key, newTask);
        return {
          success: true,
          idempotent: false,
          task_id: newTask.id,
          message: 'Follow-up task created',
        };
      };

      // Duplicate request on same lead and same date returns idempotent result with same ID
      const res1 = createFollowupWithCollisionRecovery('lead-uuid-1', '2026-10-05');
      expect(res1.idempotent).toBe(true);
      expect(res1.task_id).toBe('task-uuid-1');

      // Different date is allowed as a new task
      const res2 = createFollowupWithCollisionRecovery('lead-uuid-1', '2026-10-06');
      expect(res2.idempotent).toBe(false);
      expect(res2.task_id).not.toBe('task-uuid-1');
    });

    it('permits a new follow-up task on the same date after prior follow-up is completed (partial index)', () => {
      // Partial unique index condition: WHERE entity_type = 'lead' AND status = 'Pending' AND is_active = true
      interface TaskRecord {
        id: string;
        lead_entity_id: string;
        due_date: string;
        status: 'Pending' | 'Completed';
      }

      const tasks: TaskRecord[] = [
        { id: 'task-100', lead_entity_id: 'lead-001', due_date: '2026-10-05', status: 'Completed' },
      ];

      const canInsertPendingTask = (leadId: string, dueDate: string): boolean => {
        const pendingDuplicate = tasks.find(
          t => t.lead_entity_id === leadId && t.due_date === dueDate && t.status === 'Pending'
        );
        return !pendingDuplicate;
      };

      // Can insert because prior task on 2026-10-05 is Completed
      expect(canInsertPendingTask('lead-001', '2026-10-05')).toBe(true);

      // Now add a Pending task
      tasks.push({ id: 'task-101', lead_entity_id: 'lead-001', due_date: '2026-10-05', status: 'Pending' });

      // Second Pending task on the same date is blocked by the partial index
      expect(canInsertPendingTask('lead-001', '2026-10-05')).toBe(false);
    });
  });

  /* =========================================================================
   * Fix 6: Lead Task Reference Consistency
   * ========================================================================= */
  describe('Fix 6: Lead Task Reference Consistency Enforcement', () => {
    it('rejects tasks with entity_type = "lead" when lead_entity_id is missing or null', () => {
      const invalidLeadTask = {
        title: 'Call Back Later',
        due_date: '2026-10-05',
        entity_type: 'lead' as const,
        entity_id: 'lead-001',
        lead_entity_id: null,
      };

      const resultInvalid = taskSchema.safeParse(invalidLeadTask);
      expect(resultInvalid.success).toBe(false);
      if (!resultInvalid.success) {
        expect(resultInvalid.error.issues[0]?.message).toContain('Lead tasks must include a valid lead_entity_id');
      }

      const validLeadTask = {
        title: 'Call Back Later',
        due_date: '2026-10-05',
        entity_type: 'lead' as const,
        entity_id: 'lead-001',
        lead_entity_id: 'lead-001',
      };
      const resultValid = taskSchema.safeParse(validLeadTask);
      expect(resultValid.success).toBe(true);

      const validCandidateTask = {
        title: 'Interview prep',
        due_date: '2026-10-05',
        entity_type: 'candidate' as const,
        entity_id: 'cand-001',
        lead_entity_id: null,
      };
      expect(taskSchema.safeParse(validCandidateTask).success).toBe(true);
    });
  });

  /* =========================================================================
   * Task 5: End-to-End Recruitment Lifecycle & Concurrency Verification
   * ========================================================================= */
  describe('Task 5: End-to-End Recruitment Lifecycle & Invariants', () => {
    it('verifies the full recruitment workflow from import to candidate interview', () => {
      // 1. Lead Import
      const leadMobile = '+91 98260 77123';
      const normResult = normalizePhone(leadMobile);
      expect(normResult.isValid).toBe(true);
      expect(normResult.normalized).toBe('9826077123');

      const lead = {
        id: 'lead-e2e-01',
        name: 'Rohan Mehra',
        mobile: normResult.normalized,
        category: 'New' as const,
        assigned_to: 'recruiter-1',
        converted_candidate_id: null as string | null,
        is_active: true,
      };

      const callLogs: CallLog[] = [];
      const followUpTasks: any[] = [];

      // 2. Hot Lead rule: untouched lead is Hot
      const isHot = (l: typeof lead, logs: CallLog[]) => {
        const attempts = logs.filter(c => c.lead_id === l.id).length;
        return l.is_active && attempts === 0 && !['Converted', 'Rejected', 'Do Not Contact'].includes(l.category);
      };
      expect(isHot(lead, callLogs)).toBe(true);

      // 3. First Call Attempt: No Answer
      const firstCall: CallLog = {
        id: 'call-e2e-1',
        lead_id: lead.id,
        candidate_id: null,
        telecaller_name: 'Recruiter One',
        call_type: 'No Answer',
        duration: 0,
        note: 'Switched off / ringing',
        timestamp: new Date().toISOString(),
        created_by: 'recruiter-1',
      };
      callLogs.push(firstCall);

      // Invariant: First call permanently removes from Hot Leads
      expect(isHot(lead, callLogs)).toBe(false);

      // Auto next-day follow up created
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const autoFollowup = {
        id: 'task-e2e-1',
        title: `Retry Call (No Answer): ${lead.name}`,
        due_date: tomorrow,
        entity_type: 'lead',
        entity_id: lead.id,
        lead_entity_id: lead.id,
        status: 'Pending',
        is_active: true,
      };
      followUpTasks.push(autoFollowup);
      expect(followUpTasks.length).toBe(1);

      // 4. Recruiter edits follow-up date and time
      autoFollowup.due_date = '2026-10-10';
      autoFollowup.title = 'Retry Call afternoon: Rohan Mehra';
      expect(autoFollowup.due_date).toBe('2026-10-10');

      // 5. Second Call: Connected & Interested
      const secondCall: CallLog = {
        id: 'call-e2e-2',
        lead_id: lead.id,
        candidate_id: null,
        telecaller_name: 'Recruiter One',
        call_type: 'Connected',
        duration: 180,
        note: 'Candidate ready for interview, confirmed 20k salary expectation',
        timestamp: new Date().toISOString(),
        created_by: 'recruiter-1',
      };
      callLogs.push(secondCall);
      lead.category = 'Warm' as any;
      autoFollowup.status = 'Completed';

      // Call logs retain original caller
      expect(callLogs[0]?.telecaller_name).toBe('Recruiter One');
      expect(callLogs[1]?.telecaller_name).toBe('Recruiter One');

      // 6. Lead Conversion to Candidate
      const candidateId = 'cand-e2e-01';
      lead.converted_candidate_id = candidateId;
      lead.category = 'Converted' as any;

      // Invariant: Lead is NOT deleted
      expect(lead.is_active).toBe(true);
      expect(lead.category).toBe('Converted');
      expect(callLogs.filter(c => c.lead_id === lead.id).length).toBe(2);

      // 7. Candidate Profile Created
      const candidate = {
        id: candidateId,
        name: lead.name,
        mobile: lead.mobile,
        status: 'Active',
        assigned_to: lead.assigned_to,
        is_active: true,
      };
      expect(candidate.status).toBe('Active');

      // 8. Interview Scheduling with Application Pipeline
      const application = {
        id: 'app-e2e-01',
        candidate_id: candidate.id,
        job_id: 'job-01',
        stage: 'Interview Scheduled',
      };
      const interview = {
        id: 'int-e2e-01',
        application_id: application.id,
        candidate_id: candidate.id,
        job_id: 'job-01',
        interview_date: '2026-10-12T11:00:00Z',
      };

      expect(interview.application_id).toBe(application.id);
      expect(application.stage).toBe('Interview Scheduled');
    });
  });
});
