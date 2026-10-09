import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import { AuthProvider } from './context/AuthContext';
import { UserProvider } from './context/UserContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';

import Dashboard from './screens/Dashboard';
import Candidates from './screens/Candidates';
import Leads from './screens/Leads';
import Employers from './screens/Employers';
import Jobs from './screens/Jobs';
import Applications from './screens/Applications';
import Interviews from './screens/Interviews';
import Tasks from './screens/Tasks';
import Payments from './screens/Payments';
import Activities from './screens/Activities';

import { useAuth } from './context/AuthContext';
import { isSupabaseConfigured } from './lib/supabaseClient';
import Login from './screens/Login';

function AppContent() {
  const { user, loading } = useAuth();

  // Production Auth Guard: Enforce authentication when Supabase is configured
  if (isSupabaseConfigured) {
    if (loading) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
          <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-semibold text-slate-200">Verifying secure session...</p>
          <p className="text-xs text-slate-400 mt-1">Shree Career Consultancy • SCC CRM</p>
        </div>
      );
    }

    if (!user) {
      return <Login />;
    }
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/candidates" element={<Candidates />} />
        <Route path="/employers" element={<Employers />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/interviews" element={<Interviews />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/activities" element={<Activities />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <UserProvider>
          <DataProvider>
            <HashRouter>
              <AppContent />
            </HashRouter>
          </DataProvider>
        </UserProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}