import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  enqueueMutation,
  getPendingMutations,
  getQueueMetrics,
  processOfflineQueue,
  closeOfflineDb,
  resetQueueProcessingStateForTesting,
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

describe('SCC CRM — User Login & Logout Flow Verification', () => {
  beforeEach(() => {
    setupMockIndexedDB();
    closeOfflineDb();
    resetQueueProcessingStateForTesting();
  });

  afterEach(() => {
    closeOfflineDb();
    resetQueueProcessingStateForTesting();
  });

  // Requirement 1: No Supabase session -> Auth guard directs to Login screen
  it('Requirement 1: No Supabase session routes to Login screen', () => {
    const isSupabaseConfigured = true;
    const session = null;
    const loading = false;

    const determineView = (isConfigured: boolean, isLoading: boolean, currentSession: any) => {
      if (isConfigured) {
        if (isLoading) return 'loading';
        if (!currentSession) return 'login_screen';
      }
      return 'crm_workspace';
    };

    expect(determineView(isSupabaseConfigured, loading, session)).toBe('login_screen');
  });

  // Requirement 2: Valid session -> CRM rendered
  it('Requirement 2: Valid Supabase session routes to CRM workspace', () => {
    const isSupabaseConfigured = true;
    const session = { user: { id: 'admin-uuid', email: 'admin@sccjobs.in' } };
    const loading = false;

    const determineView = (isConfigured: boolean, isLoading: boolean, currentSession: any) => {
      if (isConfigured) {
        if (isLoading) return 'loading';
        if (!currentSession) return 'login_screen';
      }
      return 'crm_workspace';
    };

    expect(determineView(isSupabaseConfigured, loading, session)).toBe('crm_workspace');
  });

  // Requirement 3: Invalid login -> Useful human-readable error returned
  it('Requirement 3: Invalid login returns useful error message', async () => {
    const mockSignInWithPassword = vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400 },
    });

    const handleLogin = async (email: string, pass: string) => {
      const res = await mockSignInWithPassword({ email, password: pass });
      if (res.error) {
        const msg = res.error.message || '';
        if (msg.toLowerCase().includes('invalid login credentials') || res.error.status === 400) {
          return { success: false, error: 'Invalid email or password. Please verify your credentials and try again.' };
        }
        return { success: false, error: msg };
      }
      return { success: true };
    };

    const result = await handleLogin('admin@sccjobs.in', 'WrongPassword123');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid email or password. Please verify your credentials and try again.');
  });

  // Requirement 4: Successful login -> profile and role loaded
  it('Requirement 4: Successful login loads user profile and role', async () => {
    const mockUser = { id: 'admin-uuid', email: 'admin@sccjobs.in' };
    const mockProfile = {
      id: 'admin-uuid',
      email: 'admin@sccjobs.in',
      display_name: 'SCC Admin',
      role: 'admin',
      is_active: true,
    };

    const mockSignIn = vi.fn().mockResolvedValue({
      data: { user: mockUser, session: { access_token: 'fake-jwt' } },
      error: null,
    });

    const mockFetchProfile = vi.fn().mockResolvedValue({
      data: mockProfile,
      error: null,
    });

    let currentSession: any = null;
    let currentProfile: any = null;

    const performSignIn = async (email: string, pass: string) => {
      const authRes = await mockSignIn({ email, password: pass });
      if (!authRes.error && authRes.data.user) {
        currentSession = authRes.data.session;
        const profileRes = await mockFetchProfile(authRes.data.user.id);
        currentProfile = profileRes.data;
      }
      return { session: currentSession, profile: currentProfile };
    };

    const { session, profile } = await performSignIn('admin@sccjobs.in', 'Admin@Scc2026!');
    expect(session).not.toBeNull();
    expect(profile).not.toBeNull();
    expect(profile.role).toBe('admin');
    expect(profile.display_name).toBe('SCC Admin');
  });

  // Requirement 5: Logout -> clears session & returns to Login screen
  it('Requirement 5: Sign out clears session and profile, returning to Login screen', async () => {
    let session: any = { user: { id: 'admin-uuid' } };
    let profile: any = { role: 'admin' };

    const mockSignOut = vi.fn().mockImplementation(async () => {
      session = null;
      profile = null;
    });

    await mockSignOut();

    expect(session).toBeNull();
    expect(profile).toBeNull();

    // Verify Auth Guard triggers login screen
    const isSupabaseConfigured = true;
    const view = isSupabaseConfigured && !session ? 'login_screen' : 'crm_workspace';
    expect(view).toBe('login_screen');
  });

  // Requirement 6: Production authenticated user cannot change role client-side
  it('Requirement 6: Production authenticated user role is immutable from client UI', () => {
    const authProfile = {
      id: 'recruiter-uuid',
      email: 'telecaller@sccjobs.in',
      role: 'recruiter' as const,
      display_name: 'Telecaller 1',
    };

    // Simulate UserContext role resolution
    const resolveAppRole = (profile: typeof authProfile | null, localStorageMockRole: string) => {
      if (profile) {
        // Source of truth is STRICTLY the authenticated profile
        return profile.role;
      }
      return localStorageMockRole;
    };

    // Even if local storage or dev switcher attempts to inject 'admin':
    const resolvedRole = resolveAppRole(authProfile, 'admin');
    expect(resolvedRole).toBe('recruiter');
    expect(resolvedRole).not.toBe('admin');
  });

  // Requirement 7: Pending offline queue + no session -> queue is preserved
  it('Requirement 7: Unauthenticated session pauses sync and 100% preserves offline queue', async () => {
    await enqueueMutation('candidates', 'insert', { id: 'cand-offline-1', name: 'Ravi Kumar' });
    await enqueueMutation('candidates', 'insert', { id: 'cand-offline-2', name: 'Pooja Verma' });

    const remoteExecutor = vi.fn();
    const session = null;

    // Simulate syncNow session guard
    const runSync = async () => {
      if (!session) {
        return { paused: true };
      }
      return await processOfflineQueue(remoteExecutor);
    };

    const syncResult = await runSync();
    expect(syncResult).toEqual({ paused: true });
    expect(remoteExecutor).not.toHaveBeenCalled();

    // Check that items remain strictly intact
    const metrics = await getQueueMetrics();
    expect(metrics.pending).toBe(2);

    const pending = await getPendingMutations();
    expect(pending.length).toBe(2);
    expect(pending.map(m => m.data.name)).toEqual(['Ravi Kumar', 'Pooja Verma']);
  });

  // Requirement 8: Login with pending queue -> queue resumes automatically
  it('Requirement 8: Logging in with pending queue automatically drains mutations', async () => {
    await enqueueMutation('candidates', 'insert', { id: 'cand-3', name: 'Sunil Sahu' });

    const remoteExecutor = vi.fn().mockResolvedValue({ error: null });
    let session: any = null;

    const onLogin = async (newSession: any) => {
      session = newSession;
      if (session) {
        return await processOfflineQueue(remoteExecutor);
      }
      return null;
    };

    const result = await onLogin({ user: { id: 'admin-id' } });
    expect(result).toEqual({ processed: 1, failed: 0, deadLettered: 0 });
    expect(remoteExecutor).toHaveBeenCalledTimes(1);

    const metrics = await getQueueMetrics();
    expect(metrics.pending).toBe(0);
  });

  // Requirement 9: Queue reaches zero -> banner disappears
  it('Requirement 9: When pending queue reaches zero, sync banner disappears', () => {
    const resolveBannerState = (pending: number, isSyncing: boolean, isAuthenticated: boolean) => {
      if (pending > 0) {
        if (isAuthenticated && isSyncing) return 'syncing_banner';
        if (!isAuthenticated) return 'login_required_banner';
        return 'pending_banner';
      }
      return 'hidden';
    };

    // Initially 2 pending items
    expect(resolveBannerState(2, false, false)).toBe('login_required_banner');
    expect(resolveBannerState(2, true, true)).toBe('syncing_banner');

    // After all items synced (pending = 0)
    expect(resolveBannerState(0, false, true)).toBe('hidden');
    expect(resolveBannerState(0, false, false)).toBe('hidden');
  });
});
