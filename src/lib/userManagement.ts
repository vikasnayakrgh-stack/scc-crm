import { supabase, isSupabaseConfigured } from './supabaseClient';
import { UserProfile, AppRole } from '../types';

export interface CreateUserPayload {
  email: string;
  password: string;
  display_name: string;
  role: AppRole;
  phone?: string;
}

export interface UpdateUserProfilePayload {
  display_name: string;
  phone?: string;
}

export interface UserActivityLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: any;
  created_at: string;
  performer_email?: string;
  performer_name?: string;
}

// Local mock storage key for offline fallback testing
const MOCK_PROFILES_KEY = 'scc_mock_profiles_v1';

const getStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage;
  return null;
};

export const getMockProfiles = (): UserProfile[] => {
  const storage = getStorage();
  try {
    if (storage) {
      const raw = storage.getItem(MOCK_PROFILES_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to parse mock profiles', e);
  }

  const initialMocks: UserProfile[] = [
    {
      id: 'mock-admin-1',
      email: 'vikasnayakrgh@gmail.com',
      display_name: 'Vikas Nayak (Owner)',
      role: 'admin',
      is_active: true,
      created_at: '2026-10-09T11:17:45Z',
      updated_at: '2026-10-09T13:29:37Z',
    },
    {
      id: 'mock-admin-2',
      email: 'admin@sccjobs.in',
      display_name: 'SCC Admin',
      role: 'admin',
      is_active: true,
      created_at: '2026-10-07T08:35:22Z',
    },
    {
      id: 'mock-recruiter-1',
      email: 'telecaller@sccjobs.in',
      display_name: 'Telecaller 1',
      role: 'recruiter',
      phone: '+91 98765 43210',
      is_active: true,
      created_at: '2026-10-07T08:35:22Z',
    },
  ];

  try {
    if (storage) {
      storage.setItem(MOCK_PROFILES_KEY, JSON.stringify(initialMocks));
    }
  } catch {}

  return initialMocks;
};

export const saveMockProfiles = (profiles: UserProfile[]) => {
  const storage = getStorage();
  try {
    if (storage) {
      storage.setItem(MOCK_PROFILES_KEY, JSON.stringify(profiles));
    }
  } catch {}
};

/**
 * Fetch all registered users in the CRM.
 * Active admins can see both active and inactive users via enhanced RLS.
 */
export async function fetchUsers(): Promise<{ data: UserProfile[] | null; error: Error | null }> {
  if (!isSupabaseConfigured) {
    return { data: getMockProfiles(), error: null };
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: data as UserProfile[], error: null };
  } catch (err: any) {
    console.error('Error fetching users:', err);
    return { data: null, error: err };
  }
}

/**
 * Fetch recent user management audit logs.
 */
export async function fetchUserActivityLogs(): Promise<{ data: UserActivityLog[] | null; error: Error | null }> {
  if (!isSupabaseConfigured) {
    return {
      data: [
        {
          id: 'log-1',
          user_id: 'mock-admin-1',
          action: 'ROLE_UPDATED',
          entity_type: 'profile',
          entity_id: 'mock-admin-1',
          details: { old_role: 'recruiter', new_role: 'admin' },
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    };
  }

  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('entity_type', 'profile')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return { data: data as UserActivityLog[], error: null };
  } catch (err: any) {
    console.error('Error fetching activity logs:', err);
    return { data: null, error: err };
  }
}

/**
 * Create a new user (Admin-only).
 * Uses PostgreSQL RPC admin_create_user.
 */
export async function createUser(payload: CreateUserPayload): Promise<{ data: any; error: Error | null }> {
  if (!payload.email || !payload.email.includes('@')) {
    return { data: null, error: new Error('Please provide a valid email address.') };
  }
  if (!payload.password || payload.password.length < 8) {
    return { data: null, error: new Error('Password must be at least 8 characters long.') };
  }

  if (!isSupabaseConfigured) {
    const mocks = getMockProfiles();
    if (mocks.some((m) => m.email.toLowerCase() === payload.email.toLowerCase())) {
      return { data: null, error: new Error(`A user with email ${payload.email} already exists.`) };
    }

    const newUser: UserProfile = {
      id: `mock-user-${Date.now()}`,
      email: payload.email.trim().toLowerCase(),
      display_name: payload.display_name.trim() || payload.email.split('@')[0],
      role: payload.role,
      phone: payload.phone?.trim(),
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mocks.unshift(newUser);
    saveMockProfiles(mocks);
    return { data: { success: true, user_id: newUser.id }, error: null };
  }

  try {
    const { data, error } = await supabase.rpc('admin_create_user', {
      p_email: payload.email.trim().toLowerCase(),
      p_password: payload.password,
      p_display_name: payload.display_name.trim(),
      p_role: payload.role,
      p_phone: payload.phone ? payload.phone.trim() : null,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

/**
 * Update user profile details (display_name, phone).
 */
export async function updateUserProfile(
  userId: string,
  payload: UpdateUserProfilePayload
): Promise<{ data: any; error: Error | null }> {
  if (!payload.display_name?.trim()) {
    return { data: null, error: new Error('Display name cannot be empty.') };
  }

  if (!isSupabaseConfigured) {
    const mocks = getMockProfiles();
    const idx = mocks.findIndex((u) => u.id === userId);
    if (idx >= 0) {
      mocks[idx] = {
        ...mocks[idx],
        display_name: payload.display_name.trim(),
        phone: payload.phone?.trim(),
        updated_at: new Date().toISOString(),
      };
      saveMockProfiles(mocks);
      return { data: mocks[idx], error: null };
    }
    return { data: null, error: new Error('User not found.') };
  }

  try {
    const { data, error } = await supabase.rpc('admin_update_user_profile', {
      target_user_id: userId,
      p_display_name: payload.display_name.trim(),
      p_phone: payload.phone ? payload.phone.trim() : null,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

/**
 * Assign and change permitted user roles.
 */
export async function changeUserRole(
  userId: string,
  newRole: AppRole
): Promise<{ data: any; error: Error | null }> {
  if (!isSupabaseConfigured) {
    const mocks = getMockProfiles();
    const idx = mocks.findIndex((u) => u.id === userId);
    if (idx >= 0) {
      // Prevent last-admin demotion in mock
      if (mocks[idx].role === 'admin' && newRole !== 'admin') {
        const adminCount = mocks.filter((u) => u.role === 'admin' && u.is_active).length;
        if (adminCount <= 1) {
          return { data: null, error: new Error('Cannot demote the last remaining active administrator.') };
        }
      }
      mocks[idx] = { ...mocks[idx], role: newRole, updated_at: new Date().toISOString() };
      saveMockProfiles(mocks);
      return { data: mocks[idx], error: null };
    }
    return { data: null, error: new Error('User not found.') };
  }

  try {
    const { data, error } = await supabase.rpc('admin_set_user_role', {
      target_user_id: userId,
      new_role: newRole,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

/**
 * Activate or deactivate staff account.
 */
export async function setUserActive(
  userId: string,
  isActive: boolean
): Promise<{ data: any; error: Error | null }> {
  if (!isSupabaseConfigured) {
    const mocks = getMockProfiles();
    const idx = mocks.findIndex((u) => u.id === userId);
    if (idx >= 0) {
      if (mocks[idx].role === 'admin' && !isActive) {
        const activeAdmins = mocks.filter((u) => u.role === 'admin' && u.is_active).length;
        if (activeAdmins <= 1) {
          return { data: null, error: new Error('Cannot deactivate the last remaining active administrator.') };
        }
      }
      mocks[idx] = { ...mocks[idx], is_active: isActive, updated_at: new Date().toISOString() };
      saveMockProfiles(mocks);
      return { data: mocks[idx], error: null };
    }
    return { data: null, error: new Error('User not found.') };
  }

  try {
    const { data, error } = await supabase.rpc('admin_set_user_active', {
      target_user_id: userId,
      p_is_active: isActive,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

/**
 * Set a direct temporary password for a user (Admin-only).
 */
export async function resetUserPasswordDirect(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; error: Error | null }> {
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: new Error('Password must be at least 8 characters long.') };
  }

  if (!isSupabaseConfigured) {
    return { success: true, error: null };
  }

  try {
    const { data, error } = await supabase.rpc('admin_reset_user_password', {
      target_user_id: userId,
      p_new_password: newPassword,
    });

    if (error) throw error;
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err };
  }
}

/**
 * Dispatch an official password reset recovery email via Supabase Auth.
 */
export async function sendPasswordResetEmail(
  email: string
): Promise<{ success: boolean; error: Error | null }> {
  if (!email || !email.includes('@')) {
    return { success: false, error: new Error('Invalid email address.') };
  }

  if (!isSupabaseConfigured) {
    return { success: true, error: null };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/`,
    });

    if (error) throw error;
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err };
  }
}
