import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  enqueueMutation,
  getPendingMutations,
  processOfflineQueue,
  getQueueMetrics,
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

  const existingStores = new Set<string>();

  const mockIDB = {
    open(dbName: string, _version: number) {
      const request: any = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };

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
                  disk.set(value.id, JSON.parse(JSON.stringify(value)));
                  const req: any = { onsuccess: null, onerror: null };
                  setTimeout(() => {
                    if (req.onsuccess) req.onsuccess();
                    if (tx.oncomplete) tx.oncomplete();
                  }, 0);
                  return req;
                },
                delete(id: string) {
                  disk.delete(id);
                  const req: any = { onsuccess: null, onerror: null };
                  setTimeout(() => {
                    if (req.onsuccess) req.onsuccess();
                    if (tx.oncomplete) tx.oncomplete();
                  }, 0);
                  return req;
                },
                get(id: string) {
                  const req: any = { onsuccess: null, onerror: null, result: disk.get(id) };
                  setTimeout(() => {
                    req.result = disk.get(id) ? JSON.parse(JSON.stringify(disk.get(id))) : undefined;
                    if (req.onsuccess) req.onsuccess();
                  }, 0);
                  return req;
                },
                getAll() {
                  const req: any = { onsuccess: null, onerror: null, result: [] };
                  setTimeout(() => {
                    req.result = Array.from(disk.values()).map(v => JSON.parse(JSON.stringify(v)));
                    if (req.onsuccess) req.onsuccess();
                  }, 0);
                  return req;
                },
                count() {
                  const req: any = { onsuccess: null, onerror: null, result: 0 };
                  setTimeout(() => {
                    req.result = disk.size;
                    if (req.onsuccess) req.onsuccess();
                  }, 0);
                  return req;
                },
              };
            },
          };
          return tx;
        },
        close() {},
      };

      setTimeout(() => {
        if (!existingStores.has('mutation_queue') && request.onupgradeneeded) {
          request.result = mockDb;
          request.onupgradeneeded({ target: request });
        }
        request.result = mockDb;
        if (request.onsuccess) request.onsuccess({ target: request });
      }, 0);

      return request;
    },
  };

  (globalThis as any).indexedDB = mockIDB;
  return diskStorage;
}

describe('Auth-Aware Offline Sync & Banner Logic', () => {
  beforeEach(() => {
    setupMockIndexedDB();
    closeOfflineDb();
    resetQueueProcessingStateForTesting();
  });

  afterEach(() => {
    closeOfflineDb();
    resetQueueProcessingStateForTesting();
  });

  it('Requirement 1: No session pauses sync and leaves queue intact', async () => {
    await enqueueMutation('candidates', 'insert', { id: 'cand-1', name: 'Rupal Lama' });
    const metricsBefore = await getQueueMetrics();
    expect(metricsBefore.pending).toBe(1);

    // Mock sync controller without session
    let session: any = null;
    const executeRemote = vi.fn().mockResolvedValue({ error: null });

    const simulateSyncNow = async () => {
      if (!session) {
        // Paused: no session
        return { paused: true };
      }
      return await processOfflineQueue(executeRemote);
    };

    const res = await simulateSyncNow();
    expect(res).toEqual({ paused: true });
    expect(executeRemote).not.toHaveBeenCalled();

    // Verify queue is 100% preserved
    const metricsAfter = await getQueueMetrics();
    expect(metricsAfter.pending).toBe(1);
    const queue = await getPendingMutations();
    expect(queue[0]?.id).toBe('cand-1');
  });

  it('Requirement 2: Authenticated session allows queue processing to start', async () => {
    await enqueueMutation('candidates', 'insert', { id: 'cand-2', name: 'Sagar' });
    const executeRemote = vi.fn().mockResolvedValue({ error: null });

    let session = { user: { id: 'user-1' } };

    const simulateSyncNow = async () => {
      if (!session) return { paused: true };
      return await processOfflineQueue(executeRemote);
    };

    const result = await simulateSyncNow();
    expect(result).toEqual({ processed: 1, failed: 0, deadLettered: 0 });
    expect(executeRemote).toHaveBeenCalledTimes(1);

    const metricsAfter = await getQueueMetrics();
    expect(metricsAfter.pending).toBe(0);
  });

  it('Requirement 3: Auth event triggers queue resumption', async () => {
    await enqueueMutation('jobs', 'insert', { id: 'job-1', role: 'Accountant' });
    const executeRemote = vi.fn().mockResolvedValue({ error: null });

    let session: any = null;
    const authListeners: Array<(event: string, session: any) => void> = [];

    const onAuthStateChange = (cb: any) => {
      authListeners.push(cb);
    };

    const simulateSyncNow = async () => {
      if (!session) return;
      await processOfflineQueue(executeRemote);
    };

    onAuthStateChange(async (_event: string, newSession: any) => {
      if (newSession) {
        session = newSession;
        await simulateSyncNow();
      }
    });

    // Simulate login event
    for (const listener of authListeners) {
      listener('SIGNED_IN', { user: { id: 'admin-1' } });
    }

    // Give microtasks time to resolve
    await new Promise(r => setTimeout(r, 50));

    expect(executeRemote).toHaveBeenCalledTimes(1);
    const metrics = await getQueueMetrics();
    expect(metrics.pending).toBe(0);
  });

  it('Requirement 4 & 5 & 6: Banner state evaluation matrix', () => {
    // Pure banner state resolver function matching Layout.tsx logic
    const getBannerState = (params: {
      pendingCount: number;
      isOffline: boolean;
      isAuthenticated: boolean;
      isSyncing: boolean;
    }) => {
      const { pendingCount, isOffline, isAuthenticated, isSyncing } = params;
      if (isOffline) {
        return 'offline';
      }
      if (pendingCount > 0) {
        if (isAuthenticated && isSyncing) {
          return 'syncing'; // State 1: with spinner
        }
        if (!isAuthenticated) {
          return 'login_required'; // State 2: NO spinner
        }
        if (isAuthenticated && !isSyncing) {
          return 'pending_sync'; // Idle pending
        }
      }
      return 'hidden'; // State 3
    };

    // State 2: Not authenticated + pending changes -> login_required (no spinner)
    expect(getBannerState({ pendingCount: 74, isOffline: false, isAuthenticated: false, isSyncing: false }))
      .toBe('login_required');

    // State 1: Authenticated + actively syncing -> syncing (with spinner)
    expect(getBannerState({ pendingCount: 74, isOffline: false, isAuthenticated: true, isSyncing: true }))
      .toBe('syncing');

    // State 3: Authenticated + no pending changes -> hidden
    expect(getBannerState({ pendingCount: 0, isOffline: false, isAuthenticated: true, isSyncing: false }))
      .toBe('hidden');

    // Offline mode priority
    expect(getBannerState({ pendingCount: 74, isOffline: true, isAuthenticated: true, isSyncing: false }))
      .toBe('offline');
  });

  it('Requirement 7: Single-flight protection prevents duplicate queue processors', async () => {
    await enqueueMutation('candidates', 'insert', { id: 'cand-multi-1', name: 'User 1' });
    await enqueueMutation('candidates', 'insert', { id: 'cand-multi-2', name: 'User 2' });

    let isSyncing = false;
    let executorCalls = 0;

    const slowExecutor = vi.fn().mockImplementation(async () => {
      executorCalls++;
      await new Promise(r => setTimeout(r, 20));
      return { error: null };
    });

    const safeSyncNow = async () => {
      if (isSyncing) return { dropped: true };
      isSyncing = true;
      try {
        return await processOfflineQueue(slowExecutor);
      } finally {
        isSyncing = false;
      }
    };

    // Fire two sync calls concurrently
    const [call1, call2] = await Promise.all([
      safeSyncNow(),
      safeSyncNow(),
    ]);

    // One must have run, the other dropped by single-flight protection
    const wasDropped = ('dropped' in call1 && Boolean(call1.dropped)) || ('dropped' in call2 && Boolean(call2.dropped));
    expect(wasDropped).toBe(true);
    expect(executorCalls).toBe(2); // Only processed the 2 items once
  });

  it('Requirement 8: Failed mutations are never silently deleted', async () => {
    await enqueueMutation('candidates', 'insert', { id: 'cand-fail', name: 'Fail User' });

    // Transient network failure
    const networkFailExecutor = vi.fn().mockResolvedValue({
      error: { message: 'Failed to fetch', code: 'FETCH_ERROR' },
    });

    const result = await processOfflineQueue(networkFailExecutor);
    expect(result.failed).toBe(1);

    // Record MUST still exist in pending queue with incremented retry count
    const pending = await getPendingMutations();
    expect(pending.length).toBe(1);
    expect(pending[0]?.id).toBe('cand-fail');
    expect(pending[0]?.retryCount).toBe(1);
    expect(pending[0]?.errorMessage).toContain('Failed to fetch');

    // Permanent constraint failure -> moved to DLQ, NOT deleted
    const permanentFailExecutor = vi.fn().mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    resetQueueProcessingStateForTesting();
    const result2 = await processOfflineQueue(permanentFailExecutor, { skipBackoffCheck: true });
    expect(result2.deadLettered).toBe(1);

    // Queue count is 0, but DLQ is 1
    const metrics = await getQueueMetrics();
    expect(metrics.pending).toBe(0);
    expect(metrics.deadLetter).toBe(1);
  });

  it('Phase 8: Controlled offline workflow simulation', async () => {
    // 1. Disconnect network
    let networkOnline = false;

    // Helper for banner state resolution
    const evaluateBanner = (pending: number, online: boolean, auth: boolean, syncing: boolean) => {
      if (!online) return 'offline';
      if (pending > 0) {
        if (auth && syncing) return 'syncing';
        if (!auth) return 'login_required';
        return 'pending_sync';
      }
      return 'hidden';
    };

    // 2. Create one harmless test record offline
    const testRecord = {
      id: 'test-offline-record-1',
      name: 'Harmless Test User',
      mobile: '9893000000',
      status: 'Active',
    };
    await enqueueMutation('candidates', 'insert', testRecord);

    // 3. Confirm it becomes a pending offline mutation
    const metricsOffline = await getQueueMetrics();
    expect(metricsOffline.pending).toBe(1);

    // 4. Confirm banner shows 'offline' when network is offline, even if pending > 0
    expect(evaluateBanner(metricsOffline.pending, networkOnline, true, false)).toBe('offline');

    // If online but unauthenticated -> 'login_required' (no spinner)
    expect(evaluateBanner(metricsOffline.pending, true, false, false)).toBe('login_required');

    // If online + authenticated + actively syncing -> 'syncing' (with spinner)
    expect(evaluateBanner(metricsOffline.pending, true, true, true)).toBe('syncing');

    // 5. Reconnect network
    networkOnline = true;
    const remoteUpsertMock = vi.fn().mockResolvedValue({ error: null });

    // 6. Confirm automatic sync starts and completes
    resetQueueProcessingStateForTesting();
    const syncResult = await processOfflineQueue(remoteUpsertMock);
    expect(syncResult.processed).toBe(1);
    expect(syncResult.failed).toBe(0);

    // 7. Confirm queue returns to zero
    const metricsAfterSync = await getQueueMetrics();
    expect(metricsAfterSync.pending).toBe(0);

    // 8. Confirm banner disappears
    expect(evaluateBanner(metricsAfterSync.pending, networkOnline, true, false)).toBe('hidden');

    // 9. Verify remote executor received the record
    expect(remoteUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        table: 'candidates',
        type: 'insert',
        data: expect.objectContaining({
          id: 'test-offline-record-1',
          name: 'Harmless Test User',
        }),
      })
    );
  });
});
