import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  GitCommit,
  Calendar,
  CheckSquare,
  PhoneCall,
  IndianRupee,
  Settings,
  ChevronLeft,
  ChevronRight,
  Shield,
  WifiOff,
  RefreshCw,
  X
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useData } from '../context/DataContext';
import { isSameDay, isPast, parseISO } from 'date-fns';

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  setIsCollapsed,
  mobileOpen,
  setMobileOpen,
}) => {
  const { currentUser, appRole } = useUser();
  const { candidates, jobs, interviews, tasks, isOffline, pendingCount } = useData();

  const now = new Date();

  // Dynamic badge counts for situational awareness
  const todayInterviewsCount = interviews.filter((i) => {
    try {
      return isSameDay(parseISO(i.scheduled_time), now) && i.status === 'Scheduled';
    } catch {
      return false;
    }
  }).length;

  const urgentTasksCount = tasks.filter((t) => {
    if (t.status === 'Completed') return false;
    try {
      const d = parseISO(t.due_date);
      return isPast(d) || isSameDay(d, now);
    } catch {
      return false;
    }
  }).length;

  const openJobsCount = jobs.filter((j) => j.status === 'Open' && j.is_active !== false).length;

  const navSections = [
    {
      title: 'WORKSPACE',
      items: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'RECRUITMENT',
      items: [
        { to: '/candidates', label: 'Candidates', icon: Users, badge: candidates.length },
        { to: '/employers', label: 'Clients / Employers', icon: Building2 },
        { to: '/jobs', label: 'Jobs', icon: Briefcase, badge: openJobsCount > 0 ? openJobsCount : undefined },
        { to: '/applications', label: 'Pipeline', icon: GitCommit },
        { to: '/interviews', label: 'Interviews', icon: Calendar, badge: todayInterviewsCount > 0 ? todayInterviewsCount : undefined, badgeColor: 'bg-purple-100 text-purple-700' },
      ],
    },
    {
      title: 'DAILY OPERATIONS',
      items: [
        { to: '/tasks?view=calls', label: 'Calling Activity', icon: PhoneCall },
        { to: '/tasks', label: 'Tasks & Follow-ups', icon: CheckSquare, badge: urgentTasksCount > 0 ? urgentTasksCount : undefined, badgeColor: 'bg-amber-100 text-amber-800' },
      ],
    },
    {
      title: 'MANAGEMENT',
      items: [
        { to: '/payments', label: 'Payments', icon: IndianRupee },
        { to: '/activities', label: 'Settings', icon: Settings },
      ],
    },
  ];

  const handleLinkClick = () => {
    if (mobileOpen) setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 md:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:sticky top-0 h-screen z-50 flex flex-col bg-white border-r border-slate-200 transition-all duration-200 ease-in-out shrink-0 select-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'w-18' : 'w-64'}`}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-base shadow-sm shadow-blue-500/20 shrink-0 tracking-tight">
              SC
            </div>
            {!isCollapsed && (
              <div className="min-w-0 transition-opacity">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-slate-900 text-sm tracking-tight leading-none">
                    SCC CRM
                  </span>
                  <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                    v3.6
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate mt-0.5 font-medium">
                  Shree Career Consultancy
                </p>
              </div>
            )}
          </div>

          {/* Desktop Collapse Button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label="Toggle sidebar collapse"
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 no-scrollbar">
          {navSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              {!isCollapsed && (
                <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={handleLinkClick}
                    title={isCollapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all group ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      } ${isCollapsed ? 'justify-center' : ''}`
                    }
                  >
                    <Icon
                      size={18}
                      className="shrink-0 transition-transform group-hover:scale-105"
                    />
                    {!isCollapsed && (
                      <span className="truncate flex-1">{item.label}</span>
                    )}
                    {!isCollapsed && item.badge !== undefined && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${
                          item.badgeColor || 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer: User & Network Status */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
          {/* Offline / Pending Indicator */}
          {isOffline && (
            <div
              className={`mb-2 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-semibold flex items-center gap-2 ${
                isCollapsed ? 'justify-center' : ''
              }`}
              title="Working offline. Changes are saved locally."
            >
              <WifiOff size={14} className="shrink-0 animate-pulse text-red-600" />
              {!isCollapsed && <span className="text-[11px] truncate">Offline (Saving)</span>}
            </div>
          )}

          {!isOffline && pendingCount > 0 && (
            <div
              className={`mb-2 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold flex items-center gap-2 ${
                isCollapsed ? 'justify-center' : ''
              }`}
              title={`${pendingCount} operation(s) queued for sync.`}
            >
              <RefreshCw size={13} className="shrink-0 animate-spin text-amber-600" />
              {!isCollapsed && <span className="text-[11px] truncate">{pendingCount} syncing...</span>}
            </div>
          )}

          {/* User Profile Info */}
          <div
            className={`flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white transition-colors ${
              isCollapsed ? 'justify-center' : ''
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs flex items-center justify-center shrink-0">
              {currentUser.slice(0, 2).toUpperCase()}
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 truncate leading-tight">
                  {currentUser}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Shield size={10} className="text-slate-400" />
                  <span className="text-[10px] text-slate-500 font-medium capitalize">
                    {appRole || (currentUser === 'Admin' ? 'Admin' : 'Recruiter')}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
