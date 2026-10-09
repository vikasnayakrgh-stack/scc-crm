import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { AppRole, UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: AppRole;
  isAdmin: boolean;
  isManager: boolean;
  isRecruiter: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch or refresh profile from profiles table
  const fetchProfile = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setProfile(data as UserProfile);
      }
    } catch (err) {
      console.warn('Failed to load profile for user', userId, err);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // In mock/unconfigured mode, provide a default local development profile
      const localRole = (localStorage.getItem('scc_mock_role') as AppRole) || 'recruiter';
      setProfile({
        id: 'mock-user-local',
        email: 'local@sccjobs.in',
        display_name: 'Local Developer',
        role: localRole,
        is_active: true,
        created_at: new Date().toISOString(),
      });
      setLoading(false);
      return;
    }

    let isMounted = true;
    let initialLoadComplete = false;

    // Safety timeout: Guarantee the UI NEVER hangs on "Verifying secure session..." longer than 3 seconds
    const safetyTimer = setTimeout(() => {
      if (isMounted && !initialLoadComplete) {
        console.warn('Session verification timed out after 3000ms. Revealing login screen.');
        setLoading(false);
      }
    }, 3000);

    // 1. Initial session load with resilient error handling
    const initSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn('Supabase getSession error:', error);
          if (isMounted) {
            setUser(null);
            setSession(null);
            setProfile(null);
          }
          return;
        }

        const activeSession = data?.session ?? null;
        if (isMounted) {
          setSession(activeSession);
          setUser(activeSession?.user ?? null);
          if (activeSession?.user) {
            await fetchProfile(activeSession.user.id);
          } else {
            setProfile(null);
          }
        }
      } catch (err) {
        console.error('Failed to resolve initial auth session:', err);
        if (isMounted) {
          setUser(null);
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          initialLoadComplete = true;
          clearTimeout(safetyTimer);
          setLoading(false);
        }
      }
    };

    initSession();

    // 2. Auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!isMounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          try {
            await fetchProfile(newSession.user.id);
          } catch (e) {
            console.warn('Error fetching profile on auth state change:', e);
          }
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      return { error: new Error('Supabase is not configured') };
    }
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.data.user) {
      await fetchProfile(result.data.user.id);
    }
    return { error: result.error };
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    if (!isSupabaseConfigured) {
      return { error: new Error('Supabase is not configured') };
    }
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });
    return { error: result.error };
  };

  const signOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const role: AppRole = profile?.role || 'recruiter';
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isRecruiter = role === 'recruiter';

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        isAdmin,
        isManager,
        isRecruiter,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
