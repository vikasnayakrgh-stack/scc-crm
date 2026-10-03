import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import { AuthProvider } from './context/AuthContext';
import { UserProvider } from './context/UserContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';

import Dashboard from './screens/Dashboard';
import Candidates from './screens/Candidates';
import Employers from './screens/Employers';
import Jobs from './screens/Jobs';
import Applications from './screens/Applications';
import Interviews from './screens/Interviews';
import Tasks from './screens/Tasks';
import Payments from './screens/Payments';
import Activities from './screens/Activities';

function AppContent() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
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