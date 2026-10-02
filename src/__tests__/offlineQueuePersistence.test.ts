import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  enqueueMutation,
  getPendingMutations,
  updateQueuedMutation,
  processOfflineQueue,
  getQueueMetrics,
  calculateBackoffDelay,
  isMutationReadyForRetry,
  closeOfflineDb,
  resetQueueProcessingStateForTesting,
  QueuedMutation,
} from '../lib/offlineQueue';

// In-memory IndexedDB persistent backing store for Node.js test environment
function setupMockIndexedDB() {
  // Underlying persistent storage across connection re-opens (simulates disk storage)
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
              };
            },
          };

          setTimeout(() => {
            if (tx.oncomplete) tx.oncomplete();
          }, 5);

          return tx;
        },
        close() {
          // Closed connection
        },
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

describe('P1-004: Offline Queue Retry Persistence & Backoff', () => {
  let mockDB: ReturnType<typeof setupMockIndexedDB>;

  beforeEach(() => {
    resetQueueProcessingStateForTesting();
    closeOfflineDb();
    mockDB = setupMockIndexedDB();
  });

  afterEach(() => {
    closeOfflineDb();
    resetQueueProcessingStateForTesting();
    mockDB.clearAll();
  });

  // Test 1: Retry count survives simulated application restart
  it('persists retryCount across simulated application restart / connection reloads', async () => {
    // 1. Enqueue an offline mutation
    const item = await enqueueMutation('candidates', 'insert', {
      id: 'mutation-retry-1',
      name: 'Ramesh Patel',
      mobile: '9893012345',
    });
    expect(item.retryCount).toBe(0);

    // 2. Process queue with a transient network error (e.g. 504 Gateway Timeout)
    const result = await processOfflineQueue(async () => {
      return { error: { message: '504 Gateway Timeout (Network Error)' } };
    }, { skipBackoffCheck: true });

    expect(result.failed).toBe(1);
    expect(result.processed).toBe(0);
    expect(result.deadLettered).toBe(0);

    // 3. Simulate application restart: close database connection and reset cached instance
    closeOfflineDb();

    // 4. Re-read pending mutations from IndexedDB
    const pendingAfterRestart = await getPendingMutations();
    expect(pendingAfterRestart.length).toBe(1);

    const reloadedItem = pendingAfterRestart[0]!;
    expect(reloadedItem.id).toBe('mutation-retry-1');
    expect(reloadedItem.retryCount).toBe(1);
    expect(reloadedItem.lastAttemptAt).toBeDefined();
    expect(reloadedItem.errorMessage).toContain('504 Gateway Timeout');

    // 5. Fail again
    await processOfflineQueue(async () => {
      return { error: { message: 'Network unreachable' } };
    }, { skipBackoffCheck: true });

    // 6. Simulate restart again
    closeOfflineDb();
    const pendingAfterSecondRestart = await getPendingMutations();
    expect(pendingAfterSecondRestart[0]!.retryCount).toBe(2);
    expect(pendingAfterSecondRestart[0]!.errorMessage).toContain('Network unreachable');
  });

  // Test 2: Backoff calculation uses persisted retry count
  it('correctly calculates exponential backoff delay based on retry count', () => {
    expect(calculateBackoffDelay(0)).toBe(0);
    expect(calculateBackoffDelay(1, 1000)).toBe(1000);   // 1st retry: 1s
    expect(calculateBackoffDelay(2, 1000)).toBe(2000);   // 2nd retry: 2s
    expect(calculateBackoffDelay(3, 1000)).toBe(4000);   // 3rd retry: 4s
    expect(calculateBackoffDelay(4, 1000)).toBe(8000);   // 4th retry: 8s
    expect(calculateBackoffDelay(5, 1000)).toBe(16000);  // 5th retry: 16s
    expect(calculateBackoffDelay(10, 1000, 30000)).toBe(30000); // capped at maxDelayMs
  });

  it('respects backoff cooldown period before attempting next retry', () => {
    const now = 10000;
    const mutation: QueuedMutation = {
      id: 'm-1',
      table: 'candidates',
      type: 'insert',
      data: { name: 'Test' },
      timestamp: 5000,
      retryCount: 2, // delay is 2000ms
      lastAttemptAt: 9000, // 1000ms ago, but backoff requires 2000ms
      status: 'pending',
    };

    // 1000ms elapsed < 2000ms backoff requirement
    expect(isMutationReadyForRetry(mutation, now, 1000)).toBe(false);

    // 2500ms elapsed >= 2000ms backoff requirement
    expect(isMutationReadyForRetry(mutation, now + 1500, 1000)).toBe(true);

    // Mutations with 0 retries are immediately ready
    const freshMutation: QueuedMutation = { ...mutation, retryCount: 0, lastAttemptAt: undefined };
    expect(isMutationReadyForRetry(freshMutation, now)).toBe(true);
  });

  // Test 3: Permanent failures reach the DLQ
  it('moves permanent database constraint errors directly to the Dead Letter Queue without retrying', async () => {
    await enqueueMutation('candidates', 'insert', {
      id: 'mutation-permanent-1',
      mobile: '9876543210',
    });

    // Execute with a PostgreSQL unique constraint violation error
    const result = await processOfflineQueue(async () => {
      return {
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "candidates_mobile_key"',
        },
      };
    });

    expect(result.deadLettered).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.processed).toBe(0);

    // Mutation is removed from pending queue
    const pending = await getPendingMutations();
    expect(pending.length).toBe(0);

    // Verified in DLQ metrics
    const metrics = await getQueueMetrics();
    expect(metrics.pending).toBe(0);
    expect(metrics.deadLetter).toBe(1);
  });

  // Test 4: Concurrent processing does not lose retry updates or run simultaneously
  it('enforces concurrency lock preventing overlapping queue processing passes', async () => {
    await enqueueMutation('candidates', 'insert', { id: 'm-concurrent-1', name: 'Lock Test' });

    let executionStarted = false;
    let finishExecution: () => void = () => {};
    const executionPromise = new Promise<void>((resolve) => {
      finishExecution = resolve;
    });

    // Start first queue run which hangs until finishExecution is called
    const run1Promise = processOfflineQueue(async () => {
      executionStarted = true;
      await executionPromise;
      return { error: null };
    });

    // Wait until run 1 has set isProcessingQueue = true
    while (!executionStarted) {
      await new Promise((r) => setTimeout(r, 5));
    }

    // Attempt second concurrent queue run while run 1 is active
    const run2Result = await processOfflineQueue(async () => {
      return { error: null };
    });

    // Run 2 must immediately exit with 0 operations processed
    expect(run2Result.processed).toBe(0);
    expect(run2Result.failed).toBe(0);
    expect(run2Result.deadLettered).toBe(0);

    // Let run 1 complete
    finishExecution();
    const run1Result = await run1Promise;
    expect(run1Result.processed).toBe(1);
  });

  // Test 5: Exceeding max retries (5) transitions mutation to DLQ
  it('moves a transient failure to the Dead Letter Queue once it reaches 5 attempts', async () => {
    await enqueueMutation('candidates', 'insert', { id: 'm-exhaust-retries', name: 'Exhaust Retries' });

    // Simulate 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      const res = await processOfflineQueue(async () => {
        return { error: { message: 'Network offline' } };
      }, { skipBackoffCheck: true });
      expect(res.failed).toBe(1);
      expect(res.deadLettered).toBe(0);

      const items = await getPendingMutations();
      expect(items[0]!.retryCount).toBe(i);
    }

    // 5th attempt must move to DLQ
    const fifthResult = await processOfflineQueue(async () => {
      return { error: { message: 'Network offline' } };
    }, { skipBackoffCheck: true });

    expect(fifthResult.deadLettered).toBe(1);
    expect(fifthResult.failed).toBe(0);

    const pending = await getPendingMutations();
    expect(pending.length).toBe(0);

    const metrics = await getQueueMetrics();
    expect(metrics.deadLetter).toBe(1);
  });

  // Test 6: Failed persistence does not silently succeed
  it('throws and does not silently succeed if updating IndexedDB fails', async () => {
    const item: QueuedMutation = {
      id: 'corrupt-item',
      table: 'candidates',
      type: 'insert',
      data: {},
      timestamp: Date.now(),
      retryCount: 1,
      status: 'pending',
    };

    closeOfflineDb();

    // Override transaction to simulate an IndexedDB write error
    const brokenDb = {
      close() {},
      transaction() {
        return {
          objectStore() {
            return {
              put() {
                const req: any = {};
                setTimeout(() => {
                  if (req.onerror) req.onerror();
                }, 0);
                return req;
              },
            };
          },
          error: new Error('Disk quota exceeded (IOError)'),
        };
      },
    };

    // Replace global indexedDB
    (globalThis as any).indexedDB = {
      open() {
        const req: any = {};
        setTimeout(() => {
          req.result = brokenDb;
          if (req.onsuccess) req.onsuccess({ target: req });
        }, 0);
        return req;
      },
    };

    await expect(updateQueuedMutation(item)).rejects.toThrow('Disk quota exceeded');
  });
});
