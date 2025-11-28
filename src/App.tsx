import React, { useState } from 'react';
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { DataProvider, useData } from './context/DataContext';
import { UserProvider, useUser } from './context/UserContext';
import { USERS } from './types';
import Dashboard from './screens/Dashboard';
import Candidates from './screens/Candidates';
import Jobs from './screens/Jobs';
import Interviews from './screens/Interviews';
import Activities from './screens/Activities';
import { LayoutDashboard, Users, Briefcase, Calendar, Settings, WifiOff, LogOut } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

function AppContent() {
  const { currentUser, setCurrentUser } = useUser();
  const { isOffline } = useData();

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 max-w-[430px] mx-auto border-x border-slate-200 shadow-2xl relative">
      <Toaster position="top-center" />
      
      {/* Offline Banner */}
      {isOffline && (
        <div className="bg-red-600 text-white text-xs text-center py-1 font-bold flex justify-center items-center gap-2 sticky top-0 z-50">
           <WifiOff size={12} /> Offline Mode - Changes queued
        </div>
      )}

      {/* Top Bar (Only visible if authenticated, essentially always) */}
      <div className="bg-white px-4 py-2 flex justify-between items-center shadow-sm sticky top-0 z-40">
        <span className="font-bold text-blue-700 tracking-tight">SCC CRM</span>
        <select 
            value={currentUser} 
            onChange={(e) => setCurrentUser(e.target.value as any)}
            className="text-xs border-none bg-slate-100 rounded px-2 py-1 font-medium focus:ring-0 cursor-pointer"
        >
            {USERS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Main Content Area */}
      <div className="min-h-[calc(100vh-110px)]">
        <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/candidates" element={<Candidates />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/interviews" element={<Interviews />} />
            <Route path="/activities" element={<Activities />} />
        </Routes>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 max-w-[430px] w-full bg-white border-t border-slate-200 flex justify-around py-2 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
        <NavItem to="/" icon={LayoutDashboard} label="Home" />
        <NavItem to="/candidates" icon={Users} label="Cands" />
        <NavItem to="/jobs" icon={Briefcase} label="Jobs" />
        <NavItem to="/interviews" icon={Calendar} label="Fix" />
        <NavItem to="/activities" icon={Settings} label="More" />
      </nav>
    </div>
  );
}

const NavItem = ({ to, icon: Icon, label }: any) => (
  <NavLink 
    to={to} 
    className={({ isActive }) => 
        `flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`
    }
  >
    <Icon size={20} />
    <span className="text-[10px] font-medium">{label}</span>
  </NavLink>
);

export default function App() {
  return (
    <UserProvider>
      <DataProvider>
        <HashRouter>
            <AppContent />
        </HashRouter>
      </DataProvider>
    </UserProvider>
  );
}