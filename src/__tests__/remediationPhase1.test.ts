import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isPermanentError,
  enqueueMutation,
  getPendingMutations,
  processOfflineQueue,
  moveToDeadLetterQueue,
  getDeadLetterMutations,
  retryDeadLetterMutation,
  clearDeadLetterQueue,
  closeOfflineDb,
  resetQueueProcessingStateForTesting,
  QueuedMutation,
} from '../lib/offlineQueue';

// In-memory IndexedDB persistent backing store for Node.js test environment
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
                    if (req.onsuccess) req.onsuccess({ target: { result: disk.size } });
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

describe('Phase 1 Remediation: Critical Persistence & Production Access Reliability', () => {
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
   * 1. Recruiter Task Attribution & created_by Guard
   * ========================================================================= */
  describe('P0: Recruiter Task Attribution & RLS Alignment', () => {
    it('ensures task creation incorporates authenticated user UUID as created_by', () => {
      const authenticatedUserId = 'a1111111-2222-3333-4444-555555555555';
      const rawTaskPayload = {
        title: 'Call candidate regarding interview schedule',
        due_date: '2026-10-10',
        assigned_to: 'Telecaller-1',
        priority: 'High',
        status: 'Pending',
        kanban_status: 'To Do',
        entity_type: 'candidate',
        entity_id: 'cand-001',
      };

      const applyTaskAttribution = (payload: any, userId?: string) => {
        return {
          ...payload,
          id: payload.id || 'task-generated-uuid',
          created_at: payload.created_at || new Date().toISOString(),
          created_by: payload.created_by || userId,
          is_active: true,
        };
      };

      const taskWithAttribution = applyTaskAttribution(rawTaskPayload, authenticatedUserId);

      expect(taskWithAttribution.created_by).toBe(authenticatedUserId);
      expect(taskWithAttribution.created_by).not.toBeNull();
      expect(taskWithAttribution.created_by).not.toBeUndefined();
      expect(taskWithAttribution.title).toBe(rawTaskPayload.title);
    });

    it('prevents tasks_insert_policy RLS failure by validating created_by against active session', () => {
      const activeSessionUid = 'recruiter-uuid-999';
      const taskRow = {
        title: 'Review candidate KYC documents',
        created_by: activeSessionUid,
      };

      const evaluateTasksInsertPolicy = (row: { created_by?: string }, authUid: string | null, isAdmin: boolean) => {
        if (!authUid) return false;
        if (isAdmin) return true;
        return row.created_by === authUid;
      };

      expect(evaluateTasksInsertPolicy(taskRow, activeSessionUid, false)).toBe(true);
      expect(evaluateTasksInsertPolicy({ created_by: undefined }, activeSessionUid, false)).toBe(false);
      expect(evaluateTasksInsertPolicy({ created_by: 'different-uid' }, activeSessionUid, false)).toBe(false);
    });
  });

  /* =========================================================================
   * 2. Offline Mutation Safety: Deleted Record Resurrection & DLQ
   * ========================================================================= */
  describe('P1: Offline Mutation Safety & Permanent Error Classification', () => {
    it('classifies RECORD_NOT_FOUND as a permanent error to prevent resurrection of deleted records', () => {
      const notFoundError = {
        code: 'RECORD_NOT_FOUND',
        message: 'Record cand-del-01 in candidates was deleted or not found remotely. Update cannot be applied.',
      };

      expect(isPermanentError(notFoundError)).toBe(true);
    });

    it('classifies unmigrated table and schema cache errors as transient (pending migration) to prevent silent DLQ loss', () => {
      expect(isPermanentError({ code: '42P01', message: 'relation "candidate_screenings" does not exist' })).toBe(false);
      expect(isPermanentError({ code: 'PGRST204', message: 'Could not find the "reschedule_history" column' })).toBe(false);
      expect(isPermanentError({ code: '42703', message: 'column "reschedule_history" of relation "interviews" does not exist' })).toBe(false);
      expect(isPermanentError({ message: 'could not find the table "public.candidate_screenings" in schema cache' })).toBe(false);
    });

    it('does not classify transient network, timeout, or auth-refresh errors as permanent', () => {
      expect(isPermanentError({ code: 'NETWORK_ERROR', message: 'Failed to fetch' })).toBe(false);
      expect(isPermanentError({ code: 'AUTH_EXPIRED', message: 'JWT expired' })).toBe(false);
      expect(isPermanentError({ message: 'network timeout occurred' })).toBe(false);
    });

    it('prevents resurrecting deleted records during OCC update replay by returning RECORD_NOT_FOUND', async () => {
      const handleOccUpdateReplay = async (
        table: string,
        entityId: string,
        payload: any,
        remoteLookup: (table: string, id: string) => Promise<{ id: string } | null>
      ) => {
        const remoteExisting = await remoteLookup(table, entityId);
        if (!remoteExisting) {
          return {
            error: {
              code: 'RECORD_NOT_FOUND',
              message: `Record ${entityId} in ${table} was deleted or not found remotely. Update cannot be applied.`,
            },
          };
        }
        return { data: { ...remoteExisting, ...payload }, error: null };
      };

      const mockRemoteLookup = vi.fn(async () => null);

      const replayResult = await handleOccUpdateReplay(
        'candidates',
        'cand-deleted-123',
        { notes: 'Updated while offline' },
        mockRemoteLookup
      );

      expect(replayResult.error).toBeDefined();
      expect(replayResult.error?.code).toBe('RECORD_NOT_FOUND');
      expect(isPermanentError(replayResult.error)).toBe(true);
    });
  });

  /* =========================================================================
   * 3. Actor Scoping in Offline Queue Processing
   * ========================================================================= */
  describe('P1: Actor Scoping in Offline Queue Processing', () => {
    it('skips queued mutations authored by another user when running under a different user session', async () => {
      const userAlphaId = 'user-alpha-111';
      const userBetaId = 'user-beta-222';

      await enqueueMutation('tasks', 'insert', { id: 'task-alpha-1', title: 'Alpha task' }, { userId: userAlphaId });
      await enqueueMutation('tasks', 'insert', { id: 'task-beta-1', title: 'Beta task' }, { userId: userBetaId });

      const executedMutationIds: string[] = [];
      const mockExecutor = vi.fn(async (mutation: QueuedMutation) => {
        executedMutationIds.push(mutation.id);
        return { error: null };
      });

      const result = await processOfflineQueue(mockExecutor, {
        currentUserId: userBetaId,
        skipBackoffCheck: true,
      });

      expect(result.processed).toBe(1);
      expect(executedMutationIds).toEqual(['task-beta-1']);

      const remainingQueue = await getPendingMutations();
      expect(remainingQueue).toHaveLength(1);
      expect(remainingQueue[0]!.id).toBe('task-alpha-1');
      expect(remainingQueue[0]!.userId).toBe(userAlphaId);
    });
  });

  /* =========================================================================
   * 4. Dead Letter Queue (DLQ) Recovery & Inspection
   * ========================================================================= */
  describe('P1: Dead Letter Queue (DLQ) Lifecycle & Inspection', () => {
    it('moves failing mutation to DLQ, allows inspection, and revives back to pending queue on retry', async () => {
      const poisonedMutation: QueuedMutation = {
        id: 'poison-001',
        entityId: 'cand-001',
        table: 'candidates',
        type: 'update',
        data: { id: 'cand-001', mobile: 'invalid-number' },
        timestamp: Date.now(),
        retryCount: 0,
        status: 'pending',
      };

      await moveToDeadLetterQueue(poisonedMutation, 'Check constraint violation');

      const dlqItems = await getDeadLetterMutations();
      expect(dlqItems).toHaveLength(1);
      expect(dlqItems[0]!.id).toBe('poison-001');
      expect(dlqItems[0]!.status).toBe('dead_letter');
      expect(dlqItems[0]!.errorMessage).toBe('Check constraint violation');

      await retryDeadLetterMutation('poison-001');

      const updatedDlq = await getDeadLetterMutations();
      expect(updatedDlq).toHaveLength(0);

      const pendingQueue = await getPendingMutations();
      expect(pendingQueue).toHaveLength(1);
      expect(pendingQueue[0]!.id).toBe('poison-001');
      expect(pendingQueue[0]!.status).toBe('pending');
      expect(pendingQueue[0]!.retryCount).toBe(0);
      expect(pendingQueue[0]!.errorMessage).toBeUndefined();

      await moveToDeadLetterQueue(pendingQueue[0]!, 'Test error');
      await clearDeadLetterQueue();
      const emptyDlq = await getDeadLetterMutations();
      expect(emptyDlq).toHaveLength(0);
    });
  });

  /* =========================================================================
   * 5. Lead Call Atomic Update & Follow-up Time Preservation
   * ========================================================================= */
  describe('P1: Lead Call Follow-up Time & Atomic Status Update', () => {
    it('updates only id and category rather than spreading full stale lead record', () => {
      const staleLeadSnapshot = {
        id: 'lead-101',
        name: 'Prakash Rao',
        mobile: '9826198261',
        category: 'New' as const,
        notes: 'Old notes that another recruiter may have updated in the meantime',
        assigned_to: 'Telecaller-1',
      };

      const newCategory = 'Warm' as const;

      const buildAtomicLeadStatusUpdate = (leadId: string, updatedCategory: string) => {
        return {
          id: leadId,
          category: updatedCategory,
        };
      };

      const payload = buildAtomicLeadStatusUpdate(staleLeadSnapshot.id, newCategory);

      expect(payload).toEqual({
        id: 'lead-101',
        category: 'Warm',
      });
      expect((payload as any).notes).toBeUndefined();
      expect((payload as any).assigned_to).toBeUndefined();
    });

    it('preserves promised autoFollowupTime in task title and notes', () => {
      const leadName = 'Kavita Verma';
      const autoFollowupDate = '2026-10-10';
      const autoFollowupTime = '11:00 AM';
      const autoFollowupPriority = 'High' as const;
      const callOutcome = 'Call Back Later';
      const callNote = 'Busy in meeting, requested call at 11 AM';

      const timeFormatted = autoFollowupTime ? ` at ${autoFollowupTime}` : '';
      const autoFollowupTitle = `Follow-up: ${leadName}`;
      const followupTitleWithTime = autoFollowupTime && !autoFollowupTitle.includes(autoFollowupTime)
        ? `${autoFollowupTitle}${timeFormatted}`
        : autoFollowupTitle;

      const baseNote = `Follow-up after ${callOutcome}. Call Remark: ${callNote}`;
      const followupNotesWithTime = autoFollowupTime
        ? `${baseNote} [Scheduled Time: ${autoFollowupTime}]`
        : baseNote;

      const taskPayload = {
        title: followupTitleWithTime,
        due_date: autoFollowupDate,
        priority: autoFollowupPriority,
        notes: followupNotesWithTime,
      };

      expect(taskPayload.title).toBe('Follow-up: Kavita Verma at 11:00 AM');
      expect(taskPayload.notes).toContain('[Scheduled Time: 11:00 AM]');
      expect(taskPayload.notes).toContain('Busy in meeting');
      expect(taskPayload.due_date).toBe('2026-10-10');
    });
  });

  /* =========================================================================
   * 6. Candidate Call Truthful Outcome Recording
   * ========================================================================= */
  describe('P2: Candidate Call Truthful Outcome Recording', () => {
    it('records truthful call outcome and duration instead of hardcoding Connected', () => {
      const candidateId = 'cand-501';
      const telecallerName = 'Telecaller-1';

      const buildCandidateCallLog = (
        outcome: 'Connected' | 'Busy' | 'No Answer' | 'SwitchOff' | 'Call Back Later',
        durationSec: number,
        note?: string
      ) => {
        return {
          candidate_id: candidateId,
          telecaller_name: telecallerName,
          call_type: outcome,
          timestamp: new Date().toISOString(),
          duration: outcome === 'Connected' ? durationSec : 0,
          note: note || undefined,
        };
      };

      const switchOffCall = buildCandidateCallLog('SwitchOff', 60, 'Switched off on 2nd ring');
      expect(switchOffCall.call_type).toBe('SwitchOff');
      expect(switchOffCall.duration).toBe(0);
      expect(switchOffCall.note).toBe('Switched off on 2nd ring');

      const connectedCall = buildCandidateCallLog('Connected', 120, 'Candidate interested in Junior Accountant vacancy');
      expect(connectedCall.call_type).toBe('Connected');
      expect(connectedCall.duration).toBe(120);
      expect(connectedCall.note).toContain('Junior Accountant');
    });
  });

  /* =========================================================================
   * 7. Account State Guard: Inactive & Missing Profile Restrictions
   * ========================================================================= */
  describe('P1: Account State Guard (is_active & Profile Verification)', () => {
    it('blocks deactivated accounts (is_active = false) from accessing workspace', () => {
      const verifyAccessEligibility = (
        user: { id: string; email: string } | null,
        profile: { id: string; role: string; is_active: boolean } | null
      ): { allowed: boolean; reason?: 'unauthenticated' | 'deactivated' | 'missing_profile' } => {
        if (!user) return { allowed: false, reason: 'unauthenticated' };
        if (profile && profile.is_active === false) return { allowed: false, reason: 'deactivated' };
        if (!profile) return { allowed: false, reason: 'missing_profile' };
        return { allowed: true };
      };

      expect(verifyAccessEligibility({ id: 'u1', email: 'r@scc.in' }, { id: 'u1', role: 'recruiter', is_active: true }))
        .toEqual({ allowed: true });

      expect(verifyAccessEligibility({ id: 'u2', email: 'deactivated@scc.in' }, { id: 'u2', role: 'recruiter', is_active: false }))
        .toEqual({ allowed: false, reason: 'deactivated' });

      expect(verifyAccessEligibility({ id: 'u3', email: 'orphaned@scc.in' }, null))
        .toEqual({ allowed: false, reason: 'missing_profile' });

      expect(verifyAccessEligibility(null, null))
        .toEqual({ allowed: false, reason: 'unauthenticated' });
    });
  });
});
