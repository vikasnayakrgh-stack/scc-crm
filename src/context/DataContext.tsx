import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import {
  Candidate,
  Job,
  Interview,
  CallLog,
  Employer,
  Application,
  FollowUpTask,
  PaymentRecord
} from '../types';
import {
  enqueueMutation,
  processOfflineQueue,
  getQueueMetrics,
  QueuedMutation
} from '../lib/offlineQueue';
import { toast } from 'react-hot-toast';

interface DataContextType {
  candidates: Candidate[];
  employers: Employer[];
  jobs: Job[];
  applications: Application[];
  interviews: Interview[];
  callLogs: CallLog[];
  tasks: FollowUpTask[];
  payments: PaymentRecord[];
  loading: boolean;
  isOffline: boolean;
  pendingCount: number;
  deadLetterCount: number;
  refreshData: () => Promise<void>;
  insert: (table: string, data: any) => Promise<any>;
  update: (table: string, data: any) => Promise<any>;
  remove: (table: string, id: string) => Promise<any>;
  syncNow: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Local storage seed keys for development / fallback when remote Supabase is unavailable
const LOCAL_STORAGE_KEY_PREFIX = 'scc_crm_data_';

const getInitialData = <T,>(key: string, fallback: T[]): T[] => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + key);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error(`Failed to read ${key} from storage:`, e);
  }
  return fallback;
};

const saveToLocalStorage = (key: string, data: any) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + key, JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to save ${key} to storage:`, e);
  }
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [candidates, setCandidates] = useState<Candidate[]>(() => getInitialData('candidates', []));
  const [employers, setEmployers] = useState<Employer[]>(() => getInitialData('employers', []));
  const [jobs, setJobs] = useState<Job[]>(() => getInitialData('jobs', []));
  const [applications, setApplications] = useState<Application[]>(() => getInitialData('applications', []));
  const [interviews, setInterviews] = useState<Interview[]>(() => getInitialData('interviews', []));
  const [callLogs, setCallLogs] = useState<CallLog[]>(() => getInitialData('callLogs', []));
  const [tasks, setTasks] = useState<FollowUpTask[]>(() => getInitialData('tasks', []));
  const [payments, setPayments] = useState<PaymentRecord[]>(() => getInitialData('payments', []));

  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [deadLetterCount, setDeadLetterCount] = useState(0);

  // Sync state to local storage for persistence across reloads
  useEffect(() => { saveToLocalStorage('candidates', candidates); }, [candidates]);
  useEffect(() => { saveToLocalStorage('employers', employers); }, [employers]);
  useEffect(() => { saveToLocalStorage('jobs', jobs); }, [jobs]);
  useEffect(() => { saveToLocalStorage('applications', applications); }, [applications]);
  useEffect(() => { saveToLocalStorage('interviews', interviews); }, [interviews]);
  useEffect(() => { saveToLocalStorage('callLogs', callLogs); }, [callLogs]);
  useEffect(() => { saveToLocalStorage('tasks', tasks); }, [tasks]);
  useEffect(() => { saveToLocalStorage('payments', payments); }, [payments]);

  const updateQueueStatus = useCallback(async () => {
    const metrics = await getQueueMetrics();
    setPendingCount(metrics.pending);
    setDeadLetterCount(metrics.deadLetter);
  }, []);

  const fetchData = useCallback(async () => {
    if (!navigator.onLine || !isSupabaseConfigured) {
      setLoading(false);
      await updateQueueStatus();
      return;
    }

    try {
      const [candRes, empRes, jobRes, appRes, intRes, logRes, taskRes, payRes] = await Promise.all([
        supabase.from('candidates').select('*').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('employers').select('*').eq('is_active', true).order('company_name', { ascending: true }),
        supabase.from('jobs').select('*, employers(company_name)').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('applications').select('*, candidates(name, mobile), jobs(role, company_name)').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('interviews').select('*, candidates(name, mobile), jobs(role, company_name)').eq('is_active', true).order('scheduled_time', { ascending: true }),
        supabase.from('call_logs').select('*, candidates(name)').order('timestamp', { ascending: false }).limit(200),
        supabase.from('tasks').select('*').eq('is_active', true).order('due_date', { ascending: true }),
        supabase.from('payments').select('*, candidates(name), employers(company_name)').order('paid_at', { ascending: false }),
      ]);

      if (candRes.data) setCandidates(candRes.data);
      if (empRes.data) setEmployers(empRes.data);
      if (jobRes.data) setJobs(jobRes.data);
      if (appRes.data) setApplications(appRes.data);
      if (intRes.data) setInterviews(intRes.data);
      if (logRes.data) setCallLogs(logRes.data);
      if (taskRes.data) setTasks(taskRes.data);
      if (payRes.data) setPayments(payRes.data);
    } catch (error) {
      console.warn('Remote data fetch failed or tables not yet migrated; using local cache.', error);
    } finally {
      setLoading(false);
      await updateQueueStatus();
    }
  }, [updateQueueStatus]);

  // Execute a single queued mutation against Supabase with idempotency and OCC
  const executeRemoteMutation = useCallback(async (mutation: QueuedMutation) => {
    if (!isSupabaseConfigured) {
      return { error: null }; // In mock/local mode, consider synced locally
    }

    const entityId = mutation.entityId || mutation.data?.id;

    if (mutation.type === 'insert') {
      // Idempotent insert: use upsert with onConflict on primary key 'id' and ignoreDuplicates: true
      return await supabase
        .from(mutation.table)
        .upsert(mutation.data, { onConflict: 'id', ignoreDuplicates: true });
    } else if (mutation.type === 'update') {
      // Optimistic concurrency control (OCC): check expectedUpdatedAt if present
      let query = supabase.from(mutation.table).update(mutation.data).eq('id', entityId);
      if (mutation.expectedUpdatedAt) {
        query = query.eq('updated_at', mutation.expectedUpdatedAt);
      }
      const res = await query.select();
      if (!res.error && res.data && res.data.length === 0 && mutation.expectedUpdatedAt) {
        return {
          error: {
            code: 'CONCURRENCY_CONFLICT',
            message: 'Conflict: Record was modified remotely while offline. Saved to dead letter queue for review.',
          },
        };
      }
      return res;
    } else if (mutation.type === 'delete') {
      return await supabase.from(mutation.table).delete().eq('id', entityId);
    }
    return { error: new Error('Unknown mutation type') };
  }, []);

  // Process offline queue with backoff, session guard, and DLQ
  const syncNow = useCallback(async () => {
    if (!navigator.onLine) {
      toast.error('Cannot sync while offline');
      return;
    }

    // Session freshness check: pause sync if session expired or unauthenticated
    if (isSupabaseConfigured) {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.warn('Sync paused: No active Supabase session. Will resume once authenticated.');
        return;
      }
    }

    const result = await processOfflineQueue(executeRemoteMutation);
    await updateQueueStatus();

    if (result.processed > 0) {
      toast.success(`${result.processed} change${result.processed > 1 ? 's' : ''} synced!`);
      await fetchData();
    }
    if (result.deadLettered > 0) {
      toast.error(`${result.deadLettered} item(s) rejected due to constraint errors.`);
    }
  }, [executeRemoteMutation, updateQueueStatus, fetchData]);

  useEffect(() => {
    fetchData();

    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => {
      setIsOffline(false);
      syncNow();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [fetchData, syncNow]);

  // Optimistic state updater for local UI consistency
  const applyLocalMutation = useCallback((table: string, type: 'insert' | 'update' | 'delete', record: any) => {
    const updateList = <T extends { id: string }>(prev: T[]): T[] => {
      if (type === 'insert') {
        return [record as T, ...prev.filter(item => item.id !== record.id)];
      } else if (type === 'update') {
        return prev.map(item => item.id === record.id ? { ...item, ...record } : item);
      } else if (type === 'delete') {
        return prev.filter(item => item.id !== record.id);
      }
      return prev;
    };

    switch (table) {
      case 'candidates': setCandidates(updateList); break;
      case 'employers': setEmployers(updateList); break;
      case 'jobs': setJobs(updateList); break;
      case 'applications': setApplications(updateList); break;
      case 'interviews': setInterviews(updateList); break;
      case 'call_logs': setCallLogs(updateList); break;
      case 'tasks': setTasks(updateList); break;
      case 'payments':
        setPayments(updateList);
        if (record.type === 'Candidate_Registration' && record.candidate_id && record.status === 'Paid') {
          setCandidates(prev => prev.map(c => c.id === record.candidate_id ? { ...c, registration_fee_paid: true } : c));
        }
        break;
    }
  }, []);

  // Truthful insert: Propagates errors, updates state optimistically if offline
  const insert = useCallback(async (table: string, data: any) => {
    const fullRecord = {
      ...data,
      id: data.id || crypto.randomUUID(),
      created_at: data.created_at || new Date().toISOString(),
    };

    if (!navigator.onLine || !isSupabaseConfigured) {
      // Save locally & queue for remote sync
      await enqueueMutation(table, 'insert', fullRecord);
      applyLocalMutation(table, 'insert', fullRecord);
      await updateQueueStatus();
      return { data: fullRecord, error: null };
    }

    const result = await supabase
      .from(table)
      .upsert(fullRecord, { onConflict: 'id', ignoreDuplicates: true })
      .select()
      .single();
    if (result.error) {
      // Throw error so calling screen DOES NOT show false-success toast!
      throw new Error(result.error.message || `Failed to insert into ${table}`);
    }

    applyLocalMutation(table, 'insert', result.data || fullRecord);
    return result;
  }, [applyLocalMutation, updateQueueStatus]);

  // Truthful update: Propagates errors, updates state optimistically if offline
  const update = useCallback(async (table: string, data: any) => {
    if (!data.id) throw new Error('Cannot update record without id');

    const updatedRecord = {
      ...data,
      updated_at: new Date().toISOString(),
    };

    if (!navigator.onLine || !isSupabaseConfigured) {
      await enqueueMutation(table, 'update', updatedRecord);
      applyLocalMutation(table, 'update', updatedRecord);
      await updateQueueStatus();
      return { data: updatedRecord, error: null };
    }

    const result = await supabase.from(table).update(updatedRecord).eq('id', data.id).select().single();
    if (result.error) {
      throw new Error(result.error.message || `Failed to update ${table}`);
    }

    applyLocalMutation(table, 'update', result.data || updatedRecord);
    return result;
  }, [applyLocalMutation, updateQueueStatus]);

  // Truthful remove: Propagates errors
  const remove = useCallback(async (table: string, id: string) => {
    if (!id) throw new Error('Cannot remove record without id');

    if (!navigator.onLine || !isSupabaseConfigured) {
      await enqueueMutation(table, 'delete', { id });
      applyLocalMutation(table, 'delete', { id });
      await updateQueueStatus();
      return { error: null };
    }

    const result = await supabase.from(table).delete().eq('id', id);
    if (result.error) {
      throw new Error(result.error.message || `Failed to delete from ${table}`);
    }

    applyLocalMutation(table, 'delete', { id });
    return result;
  }, [applyLocalMutation, updateQueueStatus]);

  return (
    <DataContext.Provider value={{
      candidates,
      employers,
      jobs,
      applications,
      interviews,
      callLogs,
      tasks,
      payments,
      loading,
      isOffline,
      pendingCount,
      deadLetterCount,
      refreshData: fetchData,
      insert,
      update,
      remove,
      syncNow,
    }}>
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