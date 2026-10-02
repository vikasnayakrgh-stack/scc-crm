export interface QueuedMutation {
  id: string;
  entityId?: string;
  table: string;
  type: 'insert' | 'update' | 'delete';
  data: any;
  expectedUpdatedAt?: string;
  timestamp: number;
  retryCount: number;
  lastAttemptAt?: number;
  errorMessage?: string;
  status: 'pending' | 'dead_letter';
}

const DB_NAME = 'scc_crm_offline_v2';
const DB_VERSION = 1;
const QUEUE_STORE = 'mutation_queue';
const DEAD_LETTER_STORE = 'dead_letter_queue';

let dbInstance: IDBDatabase | null = null;
let isProcessingQueue = false;

// Open or get existing IndexedDB connection
export const getOfflineDb = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DEAD_LETTER_STORE)) {
        db.createObjectStore(DEAD_LETTER_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(new Error('IndexedDB initialization failed'));
    };
  });
};

// Add mutation to offline queue with unique mutation id and OCC token
export const enqueueMutation = async (
  table: string,
  type: 'insert' | 'update' | 'delete',
  data: any,
  options?: { expectedUpdatedAt?: string }
): Promise<QueuedMutation> => {
  const db = await getOfflineDb();
  const entityId = data?.id || crypto.randomUUID();
  // Ensure mutation id is unique per operation while preserving entityId
  const mutationId = data?._mutationId || data?.id || crypto.randomUUID();
  const mutation: QueuedMutation = {
    id: mutationId,
    entityId,
    table,
    type,
    data: { ...data, id: entityId },
    expectedUpdatedAt: options?.expectedUpdatedAt || data?.updated_at,
    timestamp: Date.now(),
    retryCount: 0,
    status: 'pending',
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.put(mutation);

    req.onsuccess = () => resolve(mutation);
    req.onerror = () => reject(tx.error);
  });
};

// Get all pending mutations ordered by timestamp
export const getPendingMutations = async (): Promise<QueuedMutation[]> => {
  const db = await getOfflineDb();
  return new Promise((resolve) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.getAll();

    req.onsuccess = () => {
      const items = (req.result as QueuedMutation[]) || [];
      items.sort((a, b) => a.timestamp - b.timestamp);
      resolve(items);
    };
    req.onerror = () => resolve([]);
  });
};

// Remove a successfully processed mutation
export const removeQueuedMutation = async (id: string): Promise<void> => {
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(tx.error);
  });
};

// Persist an updated mutation (e.g. incremented retryCount, lastAttemptAt, errorMessage) back to IndexedDB
export const updateQueuedMutation = async (mutation: QueuedMutation): Promise<void> => {
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.put(mutation);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(tx.error || new Error('Failed to persist queued mutation update'));
  });
};

// Calculate exponential backoff delay based on retry count
export const calculateBackoffDelay = (
  retryCount: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 30000
): number => {
  if (retryCount <= 0) return 0;
  // retryCount 1: 1000ms, 2: 2000ms, 3: 4000ms, 4: 8000ms, 5: 16000ms...
  const delay = baseDelayMs * Math.pow(2, retryCount - 1);
  return Math.min(delay, maxDelayMs);
};

// Check if a queued mutation has served its backoff cooldown
export const isMutationReadyForRetry = (
  mutation: QueuedMutation,
  now: number = Date.now(),
  baseDelayMs: number = 1000,
  maxDelayMs: number = 30000
): boolean => {
  if (!mutation.retryCount || !mutation.lastAttemptAt) return true;
  const delay = calculateBackoffDelay(mutation.retryCount, baseDelayMs, maxDelayMs);
  return now - mutation.lastAttemptAt >= delay;
};

// Close open IndexedDB connection (simulates app restart or reload)
export const closeOfflineDb = (): void => {
  if (dbInstance) {
    if (typeof dbInstance.close === 'function') {
      dbInstance.close();
    }
    dbInstance = null;
  }
};

// Reset queue processing lock for testing or disaster recovery
export const resetQueueProcessingStateForTesting = (): void => {
  isProcessingQueue = false;
};

const isOnline = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
};

// Move a poisoned/permanently failing mutation to Dead Letter Queue (DLQ)
export const moveToDeadLetterQueue = async (
  mutation: QueuedMutation,
  errorMessage: string
): Promise<void> => {
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE, DEAD_LETTER_STORE], 'readwrite');
    const queueStore = tx.objectStore(QUEUE_STORE);
    const dlqStore = tx.objectStore(DEAD_LETTER_STORE);

    const deadItem: QueuedMutation = {
      ...mutation,
      errorMessage,
      status: 'dead_letter',
      lastAttemptAt: Date.now(),
    };

    queueStore.delete(mutation.id);
    dlqStore.put(deadItem);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// Get count of pending items and dead letter items
export const getQueueMetrics = async (): Promise<{ pending: number; deadLetter: number }> => {
  try {
    const db = await getOfflineDb();
    return new Promise((resolve) => {
      const tx = db.transaction([QUEUE_STORE, DEAD_LETTER_STORE], 'readonly');
      const qStore = tx.objectStore(QUEUE_STORE);
      const dlqStore = tx.objectStore(DEAD_LETTER_STORE);

      let pending = 0;
      let deadLetter = 0;
      let completed = 0;

      const checkDone = () => {
        completed += 1;
        if (completed === 2) {
          resolve({ pending, deadLetter });
        }
      };

      const qReq = qStore.count();
      qReq.onsuccess = () => {
        pending = qReq.result;
        checkDone();
      };
      qReq.onerror = () => checkDone();

      const dlqReq = dlqStore.count();
      dlqReq.onsuccess = () => {
        deadLetter = dlqReq.result;
        checkDone();
      };
      dlqReq.onerror = () => checkDone();

      tx.onerror = () => resolve({ pending: 0, deadLetter: 0 });
    });
  } catch {
    return { pending: 0, deadLetter: 0 };
  }
};

// Check if an error is permanent (constraint, schema, concurrency, or authorization error)
export const isPermanentError = (error: any): boolean => {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();

  // Explicit transient authentication / network failures: NEVER permanent
  if (
    code === 'AUTH_EXPIRED' ||
    code === 'SESSION_EXPIRED' ||
    msg.includes('jwt expired') ||
    msg.includes('session expired') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('fetch failed')
  ) {
    return false;
  }

  // Concurrency conflict (OCC): permanent conflict that requires manual resolution
  if (code === 'CONCURRENCY_CONFLICT' || msg.includes('conflict')) return true;

  // PostgreSQL unique violation: 23505, foreign key violation: 23503, not null: 23502
  // Genuine RLS permission denied: 42501 (when session is active)
  if (code.startsWith('23') || code === '42501' || code === 'PGRST') return true;
  if (msg.includes('duplicate') || msg.includes('violates') || msg.includes('permission denied')) return true;
  return false;
};

// Helper to handle transient retry calculation and persistence
const handleTransientRetry = async (
  mutation: QueuedMutation,
  errorMsg: string,
  attemptTime: number
): Promise<{ dlq: boolean }> => {
  mutation.retryCount = (mutation.retryCount || 0) + 1;
  mutation.lastAttemptAt = attemptTime;
  mutation.errorMessage = errorMsg;

  if (mutation.retryCount >= 5) {
    await moveToDeadLetterQueue(
      mutation,
      'Exceeded max retries: ' + mutation.errorMessage
    );
    return { dlq: true };
  } else {
    // Persist the updated retry count and timestamp to IndexedDB
    await updateQueuedMutation(mutation);
    return { dlq: false };
  }
};

// Concurrency guarded queue processor with persisted retry count and exponential backoff
export const processOfflineQueue = async (
  executor: (mutation: QueuedMutation) => Promise<{ error: any }>,
  options?: {
    now?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    skipBackoffCheck?: boolean;
  }
): Promise<{ processed: number; failed: number; deadLettered: number }> => {
  if (isProcessingQueue) return { processed: 0, failed: 0, deadLettered: 0 };
  if (!isOnline()) return { processed: 0, failed: 0, deadLettered: 0 };

  isProcessingQueue = true;
  let processed = 0;
  let failed = 0;
  let deadLettered = 0;

  const now = options?.now ?? Date.now();
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 30000;

  try {
    const queue = await getPendingMutations();

    for (const mutation of queue) {
      if (!isOnline()) break; // Network lost mid-sync

      // Backoff check: skip items still in backoff cooldown unless explicitly skipped
      if (!options?.skipBackoffCheck && !isMutationReadyForRetry(mutation, now, baseDelayMs, maxDelayMs)) {
        continue;
      }

      try {
        const { error } = await executor(mutation);

        if (!error) {
          await removeQueuedMutation(mutation.id);
          processed++;
        } else if (isPermanentError(error)) {
          // Permanent constraint error -> Move to Dead Letter Queue to avoid head-of-line blocking!
          await moveToDeadLetterQueue(mutation, error.message || 'Constraint error');
          deadLettered++;
        } else {
          // Transient network/timeout error -> Exponential backoff retry with persistence
          const { dlq } = await handleTransientRetry(mutation, error.message || 'Network error', now);
          if (dlq) {
            deadLettered++;
          } else {
            failed++;
          }
        }
      } catch (err: any) {
        if (isPermanentError(err)) {
          await moveToDeadLetterQueue(mutation, err?.message || 'Execution error');
          deadLettered++;
        } else {
          const { dlq } = await handleTransientRetry(mutation, err?.message || 'Execution error', now);
          if (dlq) {
            deadLettered++;
          } else {
            failed++;
          }
        }
      }
    }
  } finally {
    isProcessingQueue = false;
  }

  return { processed, failed, deadLettered };
};
