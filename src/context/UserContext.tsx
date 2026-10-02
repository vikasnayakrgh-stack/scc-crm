import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, AppRole } from '../types';
import { useAuth } from './AuthContext';

interface UserContextType {
  currentUser: UserRole;
  setCurrentUser: (user: UserRole) => void;
  appRole: AppRole;
  userId?: string;
  userEmail?: string;
  displayName?: string;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();

  const [localUser, setLocalUser] = useState<UserRole>(() => {
    return (localStorage.getItem('scc_user') as UserRole) || 'Telecaller-1';
  });

  // Map Supabase verified profile role to legacy UserRole string for UI compatibility
  const resolvedUser: UserRole = React.useMemo(() => {
    if (auth.profile) {
      if (auth.profile.role === 'admin') return 'Admin';
      if (auth.profile.display_name?.includes('2') || auth.profile.email?.includes('2')) {
        return 'Telecaller-2';
      }
      return 'Telecaller-1';
    }
    return localUser;
  }, [auth.profile, localUser]);

  const handleSetUser = (role: UserRole) => {
    setLocalUser(role);
    localStorage.setItem('scc_user', role);
  };

  useEffect(() => {
    localStorage.setItem('scc_user', resolvedUser);
  }, [resolvedUser]);

  return (
    <UserContext.Provider
      value={{
        currentUser: resolvedUser,
        setCurrentUser: handleSetUser,
        appRole: auth.role,
        userId: auth.profile?.id || auth.user?.id,
        userEmail: auth.profile?.email || auth.user?.email,
        displayName: auth.profile?.display_name,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};