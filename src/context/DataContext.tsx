import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Candidate, Job, Interview, CallLog } from '../types';
import { toast } from 'react-hot-toast';

interface DataContextType {
  candidates: Candidate[];
  jobs: Job[];
  interviews: Interview[];
  callLogs: CallLog[];
  loading: boolean;
  isOffline: boolean;
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const fetchData = useCallback(async () => {
    if (!navigator.onLine) {
        setLoading(false);
        return;
    }

    try {
      const [candRes, jobRes, intRes, logRes] = await Promise.all([
        supabase.from('candidates').select('*').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('jobs').select('*').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('interviews').select('*, candidates(name, mobile), jobs(role, company_name)').eq('is_active', true).order('scheduled_time', { ascending: true }),
        supabase.from('call_logs').select('*, candidates(name)').order('timestamp', { ascending: false }).limit(50),
      ]);

      if (candRes.data) setCandidates(candRes.data);
      if (jobRes.data) setJobs(jobRes.data);
      if (intRes.data) setInterviews(intRes.data);
      if (logRes.data) setCallLogs(logRes.data);
    } catch (error) {
      console.error("Data load failed", error);
      toast.error("Data load fail ho gaya.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Offline handlers
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => {
        setIsOffline(false);
        fetchData();
        toast.success("Internet wapas aa gaya! Data sync ho raha hai...");
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Realtime Subscription
    const channel = supabase.channel('scc-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        // Simple reload strategy for consistency
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [fetchData]);

  return (
    <DataContext.Provider value={{ candidates, jobs, interviews, callLogs, loading, isOffline, refreshData: fetchData }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};