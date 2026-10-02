import React, { useState } from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import { DataProvider, useData } from './context/DataContext';
import { AuthProvider } from './context/AuthContext';
import { UserProvider, useUser } from './context/UserContext';
import { USERS } from './types';
import Dashboard from './screens/Dashboard';
import Candidates from './screens/Candidates';
import Employers from './screens/Employers';
import Jobs from './screens/Jobs';
import Applications from './screens/Applications';
import Interviews from './screens/Interviews';
import Tasks from './screens/Tasks';
import Payments from './screens/Payments';
import Activities from './screens/Activities';
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  GitCommit,
  Calendar,
  CheckSquare,
  IndianRupee,
  Settings,
  WifiOff,
  AlertCircle,
  Menu,
  X
} from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from './components/ErrorBoundary';

function AppContent() {
  const { currentUser, setCurrentUser } = useUser();
  const { isOffline, pendingCount, deadLetterCount } = useData();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/candidates', icon: Users, label: 'Candidates' },
    { to: '/employers', icon: Building2, label: 'Clients' },
    { to: '/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/applications', icon: GitCommit, label: 'Pipeline' },
    { to: '/interviews', icon: Calendar, label: 'Interviews' },
    { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
    { to: '/payments', icon: IndianRupee, label: 'Payments' },
    { to: '/activities', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 max-w-5xl mx-auto border-x border-slate-200 shadow-xl relative flex flex-col">
      <Toaster position="top-center" />

      {/* Network Alert Banners */}
      {isOffline && (
        <div className="bg-red-600 text-white text-xs text-center py-1.5 font-bold flex justify-center items-center gap-2 sticky top-0 z-50">
          <WifiOff size={13} /> Offline Mode — Changes saved locally and will sync when internet restores
        </div>
      )}

      {pendingCount > 0 && !isOffline && (
        <div className="bg-amber-600 text-white text-xs text-center py-1 font-bold flex justify-center items-center gap-2 sticky top-0 z-50">
          <AlertCircle size={13} /> {pendingCount} change{pendingCount > 1 ? 's' : ''} queued for sync
        </div>
      )}

      {deadLetterCount > 0 && (
        <div className="bg-rose-700 text-white text-xs text-center py-1 font-semibold flex justify-center items-center gap-2">
          ⚠️ {deadLetterCount} operation(s) rejected by validation. Check Settings.
        </div>
      )}

      {/* Responsive Top Bar */}
      <header className="bg-white px-4 py-2.5 flex justify-between items-center shadow-sm sticky top-0 z-40 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-slate-600 hover:bg-slate-100 rounded-md"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-baseline gap-2">
            <span className="font-extrabold text-blue-700 text-lg tracking-tight">SCC CRM</span>
            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider hidden sm:inline-block">
              Job Consultancy
            </span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`
              }
            >
              <link.icon size={14} />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Role Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">Role:</span>
          <select
            value={currentUser}
            onChange={(e) => setCurrentUser(e.target.value as any)}
            className="text-xs border border-slate-200 bg-slate-50 font-semibold rounded px-2.5 py-1 focus:ring-1 focus:ring-blue-500 cursor-pointer text-slate-800"
          >
            {USERS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-1 shadow-md z-40 sticky top-12">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              <link.icon size={16} />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-h-[calc(100vh-115px)]">
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
      </main>

      {/* Mobile Bottom Navigation (Quick access to top 5 views) */}
      <nav className="md:hidden fixed bottom-0 max-w-5xl w-full bg-white border-t border-slate-200 flex justify-around py-1.5 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
        <NavItem to="/" icon={LayoutDashboard} label="Home" />
        <NavItem to="/candidates" icon={Users} label="Cands" />
        <NavItem to="/jobs" icon={Briefcase} label="Jobs" />
        <NavItem to="/applications" icon={GitCommit} label="Pipeline" />
        <NavItem to="/interviews" icon={Calendar} label="Fix" />
        <NavItem to="/tasks" icon={CheckSquare} label="Tasks" />
      </nav>
    </div>
  );
}

const NavItem = ({ to, icon: Icon, label }: any) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `flex flex-col items-center gap-0.5 p-1 rounded-lg transition-colors ${
        isActive ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
      }`
    }
  >
    <Icon size={18} />
    <span className="text-[10px]">{label}</span>
  </NavLink>
);

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