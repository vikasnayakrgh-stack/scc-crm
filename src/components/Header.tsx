import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
  Bell,
  CheckCircle2,
  AlertTriangle,
  User,
  Briefcase,
  Users,
  ChevronDown,
  X,
  Phone,
  Calendar,
  ExternalLink,
  LogIn,
  LogOut
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { USERS, UserRole } from '../types';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  onOpenSignIn?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu, onOpenSignIn }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, appRole, displayName, userEmail } = useUser();
  const { user: authUser, profile, signOut } = useAuth();
  const { candidates, jobs, tasks } = useData();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute breadcrumbs and page title
  const getPageInfo = () => {
    switch (location.pathname) {
      case '/':
        return { category: 'Workspace', title: 'Dashboard' };
      case '/candidates':
        return { category: 'Recruitment', title: 'Candidates' };
      case '/employers':
        return { category: 'Recruitment', title: 'Clients & Employers' };
      case '/jobs':
        return { category: 'Recruitment', title: 'Job Openings' };
      case '/applications':
        return { category: 'Recruitment', title: 'Pipeline & Applications' };
      case '/interviews':
        return { category: 'Recruitment', title: 'Interviews' };
      case '/tasks':
        return { category: 'Daily Operations', title: 'Tasks & Follow-ups' };
      case '/payments':
        return { category: 'Management', title: 'Payments & Invoicing' };
      case '/activities':
        return { category: 'Management', title: 'Settings & Audit Logs' };
      default:
        return { category: 'SCC CRM', title: 'Recruitment Portal' };
    }
  };

  const pageInfo = getPageInfo();

  // Instant global search matches
  const trimmedSearch = searchQuery.trim().toLowerCase();
  const matchedCandidates = trimmedSearch.length >= 2
    ? candidates
        .filter(
          (c) =>
            c.name.toLowerCase().includes(trimmedSearch) ||
            c.mobile.includes(trimmedSearch) ||
            (c.last_role || '').toLowerCase().includes(trimmedSearch) ||
            (c.skills || []).some((s) => s.toLowerCase().includes(trimmedSearch))
        )
        .slice(0, 5)
    : [];

  const matchedJobs = trimmedSearch.length >= 2
    ? jobs
        .filter(
          (j) =>
            j.role.toLowerCase().includes(trimmedSearch) ||
            j.company_name.toLowerCase().includes(trimmedSearch) ||
            j.location.toLowerCase().includes(trimmedSearch)
        )
        .slice(0, 4)
    : [];

  const hasSearchResults = matchedCandidates.length > 0 || matchedJobs.length > 0;

  // Urgent notifications (overdue tasks)
  const overdueTasks = tasks.filter((t) => {
    if (t.status === 'Completed') return false;
    try {
      const d = new Date(t.due_date);
      return d < new Date() && d.toDateString() !== new Date().toDateString();
    } catch {
      return false;
    }
  });

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200/80 px-4 md:px-6 flex items-center justify-between gap-4">
      {/* Left: Mobile trigger & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Open mobile navigation"
        >
          <Menu size={20} />
        </button>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <span>{pageInfo.category}</span>
            <span>/</span>
            <span className="text-slate-600 font-semibold">{pageInfo.title}</span>
          </div>
          <h1 className="text-base font-bold text-slate-800 tracking-tight truncate leading-tight hidden sm:block">
            {pageInfo.title}
          </h1>
        </div>
      </div>

      {/* Middle: Global Search */}
      <div ref={searchRef} className="relative flex-1 max-w-md hidden md:block">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search candidates, skills, jobs, clients..."
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchOpen(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {searchOpen && trimmedSearch.length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-100 py-2 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
            {hasSearchResults ? (
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
                {matchedCandidates.length > 0 && (
                  <div className="p-2">
                    <p className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Users size={12} /> Candidates ({matchedCandidates.length})
                    </p>
                    {matchedCandidates.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          navigate(`/candidates?search=${encodeURIComponent(c.name)}`);
                          setSearchOpen(false);
                          setSearchQuery('');
                        }}
                        className="px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div>
                          <p className="font-semibold text-slate-800">{c.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {c.last_role || 'Candidate'} • {c.location} • {c.mobile}
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {matchedJobs.length > 0 && (
                  <div className="p-2">
                    <p className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Briefcase size={12} /> Job Openings ({matchedJobs.length})
                    </p>
                    {matchedJobs.map((j) => (
                      <div
                        key={j.id}
                        onClick={() => {
                          navigate(`/jobs`);
                          setSearchOpen(false);
                          setSearchQuery('');
                        }}
                        className="px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div>
                          <p className="font-semibold text-slate-800">{j.role}</p>
                          <p className="text-[11px] text-slate-400">
                            {j.company_name} • {j.location}
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                          {j.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-slate-400">
                No matching candidate or job opening found for "{searchQuery}".
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Notifications & User Menu */}
      <div className="flex items-center gap-2">
        {/* Notifications Icon with Overdue Alert */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors relative"
            title="System notifications"
            aria-label="View notifications"
          >
            <Bell size={18} />
            {overdueTasks.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-600 rounded-full ring-2 ring-white" />
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-100 py-3 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
              <div className="px-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span className="font-bold text-slate-800">Notifications</span>
                {overdueTasks.length > 0 ? (
                  <span className="text-[10px] bg-red-50 text-red-700 font-bold px-1.5 py-0.5 rounded">
                    {overdueTasks.length} Overdue
                  </span>
                ) : (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded">
                    All caught up
                  </span>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                {overdueTasks.slice(0, 4).map((t) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      navigate('/tasks');
                      setNotificationsOpen(false);
                    }}
                    className="p-2 rounded-lg bg-red-50/60 hover:bg-red-50 border border-red-100 cursor-pointer transition-colors"
                  >
                    <p className="font-semibold text-red-900 truncate">{t.title}</p>
                    <p className="text-[10px] text-red-700 mt-0.5">
                      Due: {new Date(t.due_date).toLocaleDateString('en-IN')} • Click to resolve
                    </p>
                  </div>
                ))}
                {overdueTasks.length === 0 && (
                  <p className="p-4 text-center text-slate-400">
                    No urgent alerts or overdue follow-ups.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile & Role Selector */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="User account menu"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-xs flex items-center justify-center shadow-xs">
              {(displayName || currentUser).slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-bold text-slate-800 leading-tight">
                {profile?.display_name || displayName || currentUser}
              </span>
              <span className="text-[10px] text-slate-400 capitalize font-medium">
                {profile?.role || appRole || (currentUser === 'Admin' ? 'Admin' : 'Recruiter')}
              </span>
            </div>
            <ChevronDown size={14} className="text-slate-400 hidden sm:block" />
          </button>

          {/* User Menu Dropdown */}
          {userDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 p-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <p className="font-bold text-slate-900 truncate">
                  {profile?.display_name || displayName || currentUser}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {authUser?.email || userEmail || 'local@sccjobs.in'}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 uppercase tracking-wider">
                    {profile?.role || appRole || (currentUser === 'Admin' ? 'Admin' : 'Recruiter')}
                  </span>
                  {authUser ? (
                    <span className="text-[10px] text-emerald-600 flex items-center gap-0.5 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                      <CheckCircle2 size={11} /> Verified Auth
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-medium">Mock Session</span>
                  )}
                </div>
              </div>

              {/* Dev/Demo Role Switcher — ONLY rendered when Supabase is completely unconfigured for local mock development */}
              {!isSupabaseConfigured && (
                <div className="px-3 py-2 bg-slate-50 rounded-lg my-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Dev Role Switch (Mock Mode)
                  </p>
                  <select
                    value={currentUser}
                    onChange={(e) => {
                      setCurrentUser(e.target.value as UserRole);
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-xs bg-white border border-slate-200 rounded px-2 py-1 font-semibold text-slate-700 cursor-pointer focus:ring-1 focus:ring-blue-500"
                  >
                    {USERS.map((u) => (
                      <option key={u} value={u}>
                        {u} ({u === 'Admin' ? 'Full Access' : 'Recruiter'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={() => {
                  navigate('/activities');
                  setUserDropdownOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700 font-medium flex items-center justify-between transition-colors"
              >
                <span>Settings & Logs</span>
                <ExternalLink size={13} className="text-slate-400" />
              </button>

              {authUser && (
                <button
                  onClick={async () => {
                    setUserDropdownOpen(false);
                    await signOut();
                  }}
                  className="w-full text-left px-3 py-2 mt-1 border-t border-slate-100 rounded-lg hover:bg-red-50 text-red-600 font-medium flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span>Sign Out</span>
                  <LogOut size={13} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
