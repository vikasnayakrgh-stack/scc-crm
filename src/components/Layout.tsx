import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  GitCommit,
  Calendar,
  CheckSquare,
  WifiOff,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useData } from '../context/DataContext';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { isOffline, pendingCount, deadLetterCount } = useData();

  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('scc_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('scc_sidebar_collapsed', isCollapsed.toString());
    } catch (e) {
      console.warn('Failed to save sidebar state to storage', e);
    }
  }, [isCollapsed]);

  return (
    <div className="flex min-h-screen bg-[#f8fafc] font-sans text-slate-900 antialiased selection:bg-blue-100 selection:text-blue-900">
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'text-xs font-semibold shadow-lg border border-slate-100 rounded-xl',
          duration: 3500,
        }}
      />

      {/* Modern Collapsible Sidebar */}
      <Sidebar
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 transition-all">
        {/* Network & Synchronization Banners */}
        {isOffline && (
          <div className="bg-red-600 text-white text-xs px-4 py-1.5 font-bold flex justify-center items-center gap-2 sticky top-0 z-50 shadow-sm">
            <WifiOff size={14} className="animate-pulse" />
            <span>Offline Mode — All changes are preserved locally in IndexedDB and will sync once connection returns.</span>
          </div>
        )}

        {pendingCount > 0 && !isOffline && (
          <div className="bg-amber-600 text-white text-xs px-4 py-1 font-semibold flex justify-center items-center gap-2 sticky top-0 z-50 shadow-xs">
            <RefreshCw size={13} className="animate-spin" />
            <span>Syncing {pendingCount} offline change{pendingCount > 1 ? 's' : ''} with Supabase cloud...</span>
          </div>
        )}

        {deadLetterCount > 0 && (
          <div className="bg-rose-700 text-white text-xs px-4 py-1 font-semibold flex justify-center items-center gap-2">
            <AlertCircle size={13} />
            <span>{deadLetterCount} operation(s) rejected by validation. Inspect Settings / Audit logs.</span>
          </div>
        )}

        {/* Global Top Header */}
        <Header onOpenMobileMenu={() => setMobileOpen(true)} />

        {/* Dynamic Route Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1600px] w-full mx-auto pb-24 md:pb-12">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (Quick access to top 5 views for touch ease) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 flex justify-around py-2 px-1 z-40 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <MobileNavItem to="/" icon={LayoutDashboard} label="Home" />
        <MobileNavItem to="/candidates" icon={Users} label="Candidates" />
        <MobileNavItem to="/jobs" icon={Briefcase} label="Jobs" />
        <MobileNavItem to="/applications" icon={GitCommit} label="Pipeline" />
        <MobileNavItem to="/interviews" icon={Calendar} label="Interviews" />
        <MobileNavItem to="/tasks" icon={CheckSquare} label="Tasks" />
      </nav>
    </div>
  );
};

const MobileNavItem = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `flex flex-col items-center gap-1 py-1 px-2 rounded-lg transition-colors text-[10px] font-semibold ${
        isActive ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
      }`
    }
  >
    <Icon size={18} />
    <span className="truncate">{label}</span>
  </NavLink>
);
