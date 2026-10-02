export interface QueuedMutation {
  id: string;
  table: string;
  type: 'insert' | 'update' | 'delete';
  data: any;
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

// Add mutation to offline queue
export const enqueueMutation = async (
  table: string,
  type: 'insert' | 'update' | 'delete',
  data: any
): Promise<QueuedMutation> => {
  const db = await getOfflineDb();
  const mutation: QueuedMutation = {
    id: data.id || crypto.randomUUID(),
    table,
    type,
    data: { ...data, id: data.id || crypto.randomUUID() },
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

      const qReq = qStore.count();
      qReq.onsuccess = () => { pending = qReq.result; };

      const dlqReq = dlqStore.count();
      dlqReq.onsuccess = () => { deadLetter = dlqReq.result; };

      tx.oncomplete = () => resolve({ pending, deadLetter });
      tx.onerror = () => resolve({ pending: 0, deadLetter: 0 });
    });
  } catch {
    return { pending: 0, deadLetter: 0 };
  }
};

// Check if an error is permanent (constraint, schema, or authorization error)
export const isPermanentError = (error: any): boolean => {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();

  // PostgreSQL unique violation: 23505, foreign key violation: 23503, not null: 23502
  if (code.startsWith('23') || code === '42501' || code === 'PGRST') return true;
  if (msg.includes('duplicate') || msg.includes('violates') || msg.includes('permission denied')) return true;
  return false;
};

// Concurrency guarded queue processor
export const processOfflineQueue = async (
  executor: (mutation: QueuedMutation) => Promise<{ error: any }>
): Promise<{ processed: number; failed: number; deadLettered: number }> => {
  if (isProcessingQueue) return { processed: 0, failed: 0, deadLettered: 0 };
  if (!navigator.onLine) return { processed: 0, failed: 0, deadLettered: 0 };

  isProcessingQueue = true;
  let processed = 0;
  let failed = 0;
  let deadLettered = 0;

  try {
    const queue = await getPendingMutations();

    for (const mutation of queue) {
      if (!navigator.onLine) break; // Network lost mid-sync

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
          // Transient network/timeout error -> Exponential backoff retry
          mutation.retryCount = (mutation.retryCount || 0) + 1;
          mutation.lastAttemptAt = Date.now();
          if (mutation.retryCount >= 5) {
            // Exceeded max retries -> Move to DLQ
            await moveToDeadLetterQueue(mutation, 'Exceeded max retries: ' + (error.message || 'Network error'));
            deadLettered++;
          }
          failed++;
        }
      } catch (err: any) {
        failed++;
        if (isPermanentError(err)) {
          await moveToDeadLetterQueue(mutation, err.message || 'Execution error');
          deadLettered++;
        }
      }
    }
  } finally {
    isProcessingQueue = false;
  }

  return { processed, failed, deadLettered };
};
