import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Candidate, Job, Interview, CallLog } from '../types';
import { toast } from 'react-hot-toast';

interface QueuedMutation {
  id: string;
  table: string;
  type: 'insert' | 'update' | 'delete';
  data: any;
  timestamp: number;
}

interface DataContextType {
  candidates: Candidate[];
  jobs: Job[];
  interviews: Interview[];
  callLogs: CallLog[];
  loading: boolean;
  isOffline: boolean;
  pendingCount: number;
  refreshData: () => Promise<void>;
  insert: (table: string, data: any) => Promise<any>;
  update: (table: string, data: any) => Promise<any>;
  remove: (table: string, id: string) => Promise<any>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const DB_NAME = 'scc-crm-offline';
const STORE_NAME = 'mutations';

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const dbRef = useRef<IDBDatabase | null>(null);

  // Initialize IndexedDB
  useEffect(() => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (event) => {
      dbRef.current = (event.target as IDBOpenDBRequest).result;
      countPendingMutations();
    };
    request.onerror = () => console.error('IndexedDB init failed');
  }, []);

  const countPendingMutations = async () => {
    if (!dbRef.current) return;
    try {
      const tx = dbRef.current.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const countRequest = store.count();
      countRequest.onsuccess = () => setPendingCount(countRequest.result);
    } catch (e) {
      console.error('Count pending failed:', e);
    }
  };

  const queueMutation = async (mutation: Omit<QueuedMutation, 'id' | 'timestamp'>) => {
    if (!dbRef.current) return;
    const fullMutation: QueuedMutation = {
      ...mutation,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    };
    try {
      const tx = dbRef.current.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.add(fullMutation);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      setPendingCount(prev => prev + 1);
    } catch (e) {
      console.error('Queue mutation failed:', e);
    }
  };

  const processQueue = async () => {
    if (!dbRef.current || isOffline) return;
    try {
      const tx = dbRef.current.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = async () => {
        const mutations = getAllRequest.result;
        for (const mutation of mutations) {
          try {
            let error: any = null;
            if (mutation.type === 'insert') {
              const { error: e } = await supabase.from(mutation.table).insert(mutation.data);
              error = e;
            } else if (mutation.type === 'update') {
              const { error: e } = await supabase.from(mutation.table).update(mutation.data).eq('id', mutation.data.id);
              error = e;
            } else if (mutation.type === 'delete') {
              const { error: e } = await supabase.from(mutation.table).delete().eq('id', mutation.data.id);
              error = e;
            }
            if (error) throw error;
            
            // Remove from queue
            const delTx = dbRef.current!.transaction(STORE_NAME, 'readwrite');
            delTx.objectStore(STORE_NAME).delete(mutation.id);
          } catch (e) {
            console.error('Sync failed for mutation:', mutation, e);
            break;
          }
        }
        await countPendingMutations();
        if (pendingCount > 0) toast.success(`${pendingCount} change${pendingCount > 1 ? 's' : ''} synced!`);
      };
    } catch (e) {
      console.error('Process queue failed:', e);
    }
  };

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

    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => {
      setIsOffline(false);
      fetchData();
      processQueue();
      toast.success("Internet wapas aa gaya! Data sync ho raha hai...");
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    const channel = supabase.channel('scc-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [fetchData, isOffline]);

  const insert = useCallback(async (table: string, data: any) => {
    if (!navigator.onLine) {
      await queueMutation({ table, type: 'insert', data });
      toast.success('Queued for sync (offline)');
      return { data: null, error: null };
    }
    const result = await supabase.from(table).insert(data);
    if (result.error) {
      await queueMutation({ table, type: 'insert', data });
      toast.error('Failed, queued for retry');
    }
    return result;
  }, []);

  const update = useCallback(async (table: string, data: any) => {
    if (!navigator.onLine) {
      await queueMutation({ table, type: 'update', data });
      toast.success('Queued for sync (offline)');
      return { data: null, error: null };
    }
    const result = await supabase.from(table).update(data).eq('id', data.id);
    if (result.error) {
      await queueMutation({ table, type: 'update', data });
      toast.error('Failed, queued for retry');
    }
    return result;
  }, []);

  const remove = useCallback(async (table: string, id: string) => {
    if (!navigator.onLine) {
      await queueMutation({ table, type: 'delete', data: { id } });
      toast.success('Queued for sync (offline)');
      return { data: null, error: null };
    }
    const result = await supabase.from(table).delete().eq('id', id);
    if (result.error) {
      await queueMutation({ table, type: 'delete', data: { id } });
      toast.error('Failed, queued for retry');
    }
    return result;
  }, []);

  return (
    <DataContext.Provider value={{ 
      candidates, 
      jobs, 
      interviews, 
      callLogs, 
      loading, 
      isOffline, 
      pendingCount,
      refreshData: fetchData,
      insert,
      update,
      remove
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