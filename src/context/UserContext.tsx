import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole } from '../types';

interface UserContextType {
  currentUser: UserRole;
  setCurrentUser: (user: UserRole) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserRole>(() => {
    return (localStorage.getItem('scc_user') as UserRole) || 'Telecaller-1';
  });

  useEffect(() => {
    localStorage.setItem('scc_user', currentUser);
  }, [currentUser]);

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser }}>
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