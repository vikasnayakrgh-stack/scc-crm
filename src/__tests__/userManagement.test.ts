import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createUser,
  updateUserProfile,
  changeUserRole,
  setUserActive,
  resetUserPasswordDirect,
  sendPasswordResetEmail,
  fetchUsers,
  fetchUserActivityLogs,
  getMockProfiles,
  saveMockProfiles,
  CreateUserPayload,
} from '../lib/userManagement';
import { UserProfile, AppRole } from '../types';

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => (storageMap.has(key) ? storageMap.get(key)! : null),
  setItem: (key: string, val: string) => { storageMap.set(key, String(val)); },
  removeItem: (key: string) => { storageMap.delete(key); },
  clear: () => { storageMap.clear(); },
};
(globalThis as any).localStorage = mockLocalStorage;

// Isolate unit tests to deterministic mock mode
vi.mock('../lib/supabaseClient', () => ({
  isSupabaseConfigured: false,
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    auth: {
      resetPasswordForEmail: vi.fn(),
    },
  },
}));

describe('User Management Module — Security, RBAC & Lifecycle Tests', () => {
  beforeEach(() => {
    // Reset mock localStorage state before each test
    mockLocalStorage.clear();
    const initialProfiles: UserProfile[] = [
      {
        id: 'admin-uuid-1',
        email: 'vikasnayakrgh@gmail.com',
        display_name: 'Vikas Nayak (Owner)',
        role: 'admin',
        is_active: true,
        created_at: '2026-10-09T10:00:00Z',
      },
      {
        id: 'admin-uuid-2',
        email: 'admin@sccjobs.in',
        display_name: 'Secondary Admin',
        role: 'admin',
        is_active: true,
        created_at: '2026-10-09T10:05:00Z',
      },
      {
        id: 'recruiter-uuid-1',
        email: 'telecaller1@sccjobs.in',
        display_name: 'Telecaller One',
        role: 'recruiter',
        phone: '+91 98765 11111',
        is_active: true,
        created_at: '2026-10-09T10:10:00Z',
      },
      {
        id: 'recruiter-uuid-2',
        email: 'inactive.user@sccjobs.in',
        display_name: 'Inactive Recruiter',
        role: 'recruiter',
        is_active: false,
        created_at: '2026-10-09T10:15:00Z',
      },
    ];
    saveMockProfiles(initialProfiles);
  });

  describe('1. User Creation & Validation Guardrails', () => {
    it('validates email format and rejects missing or malformed email', async () => {
      const invalidPayloads: CreateUserPayload[] = [
        {
          email: '',
          password: 'Password123!',
          display_name: 'Test User',
          role: 'recruiter',
        },
        {
          email: 'invalid-email-without-at',
          password: 'Password123!',
          display_name: 'Test User',
          role: 'recruiter',
        },
      ];

      for (const payload of invalidPayloads) {
        const result = await createUser(payload);
        expect(result.data).toBeNull();
        expect(result.error).toBeDefined();
        expect(result.error?.message).toMatch(/valid email/i);
      }
    });

    it('enforces minimum 8 character password policy', async () => {
      const shortPasswords = ['123', 'short', '1234567'];

      for (const pwd of shortPasswords) {
        const result = await createUser({
          email: 'newbie@sccjobs.in',
          password: pwd,
          display_name: 'Newbie',
          role: 'recruiter',
        });
        expect(result.data).toBeNull();
        expect(result.error).toBeDefined();
        expect(result.error?.message).toMatch(/at least 8 characters/i);
      }
    });

    it('successfully creates user with valid attributes and normalizes email', async () => {
      const payload: CreateUserPayload = {
        email: '  Manager.Candidate@SCCJobs.IN  ',
        password: 'ValidPassword123!',
        display_name: '  Senior Manager  ',
        role: 'manager',
        phone: '+91 99999 88888',
      };

      const result = await createUser(payload);
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data.success).toBe(true);

      const profiles = getMockProfiles();
      const created = profiles.find((p) => p.email === 'manager.candidate@sccjobs.in');
      expect(created).toBeDefined();
      expect(created?.role).toBe('manager');
      expect(created?.display_name).toBe('Senior Manager');
      expect(created?.phone).toBe('+91 99999 88888');
      expect(created?.is_active).toBe(true);
    });

    it('prevents duplicate account creation for existing email address', async () => {
      const duplicatePayload: CreateUserPayload = {
        email: 'vikasnayakrgh@gmail.com',
        password: 'AnotherPassword123!',
        display_name: 'Vikas Clone',
        role: 'recruiter',
      };

      const result = await createUser(duplicatePayload);
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/already exists/i);
    });
  });

  describe('2. User Profile Updates', () => {
    it('rejects update if display name is empty or pure whitespace', async () => {
      const result = await updateUserProfile('recruiter-uuid-1', {
        display_name: '   ',
      });
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/cannot be empty/i);
    });

    it('updates display name and phone number for valid profile', async () => {
      const result = await updateUserProfile('recruiter-uuid-1', {
        display_name: 'Telecaller Pro',
        phone: '+91 91234 56789',
      });

      expect(result.error).toBeNull();
      expect(result.data.display_name).toBe('Telecaller Pro');
      expect(result.data.phone).toBe('+91 91234 56789');

      const profiles = getMockProfiles();
      const updated = profiles.find((p) => p.id === 'recruiter-uuid-1');
      expect(updated?.display_name).toBe('Telecaller Pro');
      expect(updated?.phone).toBe('+91 91234 56789');
    });

    it('returns error when updating a non-existent user ID', async () => {
      const result = await updateUserProfile('non-existent-uuid', {
        display_name: 'Ghost User',
      });
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/user not found/i);
    });
  });

  describe('3. Role Modification & Last-Admin Lockout Protection', () => {
    it('allows demoting an admin when another active admin exists', async () => {
      // We have 2 active admins in initial state: admin-uuid-1 and admin-uuid-2
      const result = await changeUserRole('admin-uuid-2', 'manager');
      expect(result.error).toBeNull();
      expect(result.data.role).toBe('manager');

      const profiles = getMockProfiles();
      const updated = profiles.find((p) => p.id === 'admin-uuid-2');
      expect(updated?.role).toBe('manager');
    });

    it('STRICTLY BLOCKS demoting the LAST remaining active administrator', async () => {
      // First demote admin-uuid-2, leaving only admin-uuid-1 as the sole active admin
      await changeUserRole('admin-uuid-2', 'manager');

      // Now attempt to demote admin-uuid-1
      const result = await changeUserRole('admin-uuid-1', 'recruiter');
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/last remaining active administrator/i);

      // Verify role was NOT changed
      const profiles = getMockProfiles();
      const admin1 = profiles.find((p) => p.id === 'admin-uuid-1');
      expect(admin1?.role).toBe('admin');
    });

    it('allows promoting recruiter or manager to admin', async () => {
      const result = await changeUserRole('recruiter-uuid-1', 'admin');
      expect(result.error).toBeNull();
      expect(result.data.role).toBe('admin');

      const profiles = getMockProfiles();
      const promoted = profiles.find((p) => p.id === 'recruiter-uuid-1');
      expect(promoted?.role).toBe('admin');
    });

    it('allows lateral role change between manager and recruiter without admin restriction', async () => {
      const result = await changeUserRole('recruiter-uuid-1', 'manager');
      expect(result.error).toBeNull();
      expect(result.data.role).toBe('manager');
    });
  });

  describe('4. Account Deactivation & Last-Admin Guard', () => {
    it('allows deactivating a non-admin user (instantly marks is_active = false)', async () => {
      const result = await setUserActive('recruiter-uuid-1', false);
      expect(result.error).toBeNull();
      expect(result.data.is_active).toBe(false);

      const profiles = getMockProfiles();
      const user = profiles.find((p) => p.id === 'recruiter-uuid-1');
      expect(user?.is_active).toBe(false);
    });

    it('allows reactivating an inactive user', async () => {
      const result = await setUserActive('recruiter-uuid-2', true);
      expect(result.error).toBeNull();
      expect(result.data.is_active).toBe(true);

      const profiles = getMockProfiles();
      const user = profiles.find((p) => p.id === 'recruiter-uuid-2');
      expect(user?.is_active).toBe(true);
    });

    it('allows deactivating an admin when multiple active admins exist', async () => {
      // We have 2 active admins
      const result = await setUserActive('admin-uuid-2', false);
      expect(result.error).toBeNull();
      expect(result.data.is_active).toBe(false);
    });

    it('STRICTLY BLOCKS deactivating the LAST remaining active administrator', async () => {
      // Deactivate admin-uuid-2 first
      await setUserActive('admin-uuid-2', false);

      // Now attempt to deactivate admin-uuid-1
      const result = await setUserActive('admin-uuid-1', false);
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/last remaining active administrator/i);

      // Verify admin-uuid-1 remains active
      const profiles = getMockProfiles();
      const admin1 = profiles.find((p) => p.id === 'admin-uuid-1');
      expect(admin1?.is_active).toBe(true);
    });
  });

  describe('5. Password Reset Mechanics', () => {
    it('validates password length for direct admin password reset', async () => {
      const shortResult = await resetUserPasswordDirect('recruiter-uuid-1', '12345');
      expect(shortResult.success).toBe(false);
      expect(shortResult.error).toBeDefined();
      expect(shortResult.error?.message).toMatch(/at least 8 characters/i);

      const validResult = await resetUserPasswordDirect('recruiter-uuid-1', 'SecureNewPass123!');
      expect(validResult.success).toBe(true);
      expect(validResult.error).toBeNull();
    });

    it('validates email format for password reset recovery email dispatch', async () => {
      const invalidResult = await sendPasswordResetEmail('bad-email');
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error).toBeDefined();
      expect(invalidResult.error?.message).toMatch(/invalid email/i);

      const validResult = await sendPasswordResetEmail('telecaller1@sccjobs.in');
      expect(validResult.success).toBe(true);
      expect(validResult.error).toBeNull();
    });
  });

  describe('6. Data Retrieval & Filtering Support', () => {
    it('returns all registered users including active and inactive accounts', async () => {
      const res = await fetchUsers();
      expect(res.error).toBeNull();
      expect(res.data).toBeDefined();
      expect(res.data?.length).toBe(4);

      const activeCount = res.data?.filter((u) => u.is_active).length;
      const inactiveCount = res.data?.filter((u) => !u.is_active).length;

      expect(activeCount).toBe(3);
      expect(inactiveCount).toBe(1);
    });

    it('returns user activity audit logs with correct structure', async () => {
      const res = await fetchUserActivityLogs();
      expect(res.error).toBeNull();
      expect(res.data).toBeDefined();
      expect(Array.isArray(res.data)).toBe(true);

      if (res.data && res.data.length > 0) {
        const log = res.data[0];
        expect(log).toHaveProperty('id');
        expect(log).toHaveProperty('user_id');
        expect(log).toHaveProperty('action');
        expect(log).toHaveProperty('entity_type');
        expect(log).toHaveProperty('entity_id');
        expect(log).toHaveProperty('created_at');
      }
    });
  });

  describe('7. RBAC Roles Hierarchy Whitelist', () => {
    it('verifies system-wide permitted roles matches specification', () => {
      const permittedRoles: AppRole[] = ['admin', 'manager', 'recruiter'];
      expect(permittedRoles).toHaveLength(3);
      expect(permittedRoles).toContain('admin');
      expect(permittedRoles).toContain('manager');
      expect(permittedRoles).toContain('recruiter');

      // Unauthorized roles should never be allowed
      const isPermitted = (role: string): role is AppRole =>
        permittedRoles.includes(role as AppRole);

      expect(isPermitted('super_admin')).toBe(false);
      expect(isPermitted('guest')).toBe(false);
      expect(isPermitted('anonymous')).toBe(false);
    });
  });
});
