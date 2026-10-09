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
  const { user, profile, loading, signOut } = useAuth();

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

    // Inactive Account Restriction: Profile explicitly marked inactive
    if (profile && profile.is_active === false) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
          <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-4 text-red-400 text-2xl font-bold">
              ✕
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Account Deactivated</h1>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Your staff account (<span className="text-slate-200 font-medium">{user.email}</span>) has been marked inactive by the system administrator.
              You cannot access CRM candidate records or internal workflows. Contact the primary owner at <span className="text-blue-400 font-mono">vikasnayakrgh@gmail.com</span>.
            </p>
            <button
              onClick={() => signOut()}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg border border-slate-700 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      );
    }

    // Missing Profile Guard: Authenticated user has no entry in public.profiles
    if (!profile) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
          <div className="max-w-md w-full bg-slate-900 border border-amber-500/30 rounded-2xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-400 text-2xl font-bold">
              !
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Staff Profile Required</h1>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Authenticated as <span className="text-slate-200 font-medium">{user.email}</span>, but an active staff profile was not found in the CRM registry.
              Please request the primary owner (<span className="text-blue-400 font-mono">vikasnayakrgh@gmail.com</span>) to assign your role.
            </p>
            <button
              onClick={() => signOut()}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg border border-slate-700 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      );
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