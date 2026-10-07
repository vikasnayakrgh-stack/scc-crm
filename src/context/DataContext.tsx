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
  PaymentRecord,
  Lead,
  LeadImportBatch,
  LeadAssignmentHistory,
  CallType,
  LeadCategory,
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
  leads: Lead[];
  leadImportBatches: LeadImportBatch[];
  leadAssignmentHistory: LeadAssignmentHistory[];
  loading: boolean;
  isOffline: boolean;
  pendingCount: number;
  deadLetterCount: number;
  refreshData: () => Promise<void>;
  insert: (table: string, data: any) => Promise<any>;
  update: (table: string, data: any) => Promise<any>;
  remove: (table: string, id: string) => Promise<any>;
  syncNow: () => Promise<void>;
  createLeadWithDedup: (leadData: Partial<Lead>) => Promise<{ success: boolean; lead_id?: string; reason?: string; message?: string }>;
  convertLeadToCandidate: (leadId: string, overrides?: any) => Promise<{ success: boolean; candidate_id?: string; idempotent?: boolean; was_existing_candidate?: boolean; message?: string }>;
  createLeadFollowupTask: (leadId: string, taskData: { title: string; due_date?: string; priority?: 'Low' | 'Medium' | 'High'; notes?: string; assigned_to_user_id?: string }) => Promise<{ success: boolean; task_id?: string; idempotent?: boolean; message?: string }>;
  recordLeadCall: (callData: { lead_id: string; call_type: CallType; duration?: number; note?: string; telecaller_name?: string }) => Promise<any>;
  assignLead: (leadId: string, assignedToUserId: string | null, reason?: string) => Promise<any>;
  batchImportLeads: (batchInfo: { file_name: string; detected_platform: 'Naukri.com' | 'WorkIndia' | 'Generic'; default_assigned_to?: string | null; notes?: string }, leadsToInsert: Partial<Lead>[]) => Promise<{ batch: LeadImportBatch; insertedCount: number }>;
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
  const [leads, setLeads] = useState<Lead[]>(() => getInitialData('leads', []));
  const [leadImportBatches, setLeadImportBatches] = useState<LeadImportBatch[]>(() => getInitialData('leadImportBatches', []));
  const [leadAssignmentHistory, setLeadAssignmentHistory] = useState<LeadAssignmentHistory[]>(() => getInitialData('leadAssignmentHistory', []));

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
  useEffect(() => { saveToLocalStorage('leads', leads); }, [leads]);
  useEffect(() => { saveToLocalStorage('leadImportBatches', leadImportBatches); }, [leadImportBatches]);
  useEffect(() => { saveToLocalStorage('leadAssignmentHistory', leadAssignmentHistory); }, [leadAssignmentHistory]);

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
      const [candRes, empRes, jobRes, appRes, intRes, logRes, taskRes, payRes, leadsRes, batchesRes, assignRes] = await Promise.all([
        supabase.from('candidates').select('*').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('employers').select('*').eq('is_active', true).order('company_name', { ascending: true }),
        supabase.from('jobs').select('*, employers(company_name)').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('applications').select('*, candidates(name, mobile), jobs(role, company_name)').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('interviews').select('*, candidates(name, mobile), jobs(role, company_name)').eq('is_active', true).order('scheduled_time', { ascending: true }),
        supabase.from('call_logs').select('*, candidates(name), leads(name)').order('timestamp', { ascending: false }).limit(300),
        supabase.from('tasks').select('*').eq('is_active', true).order('due_date', { ascending: true }),
        supabase.from('payments').select('*, candidates(name), employers(company_name)').order('paid_at', { ascending: false }),
        supabase.from('leads').select('*').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('lead_import_batches').select('*').order('created_at', { ascending: false }),
        supabase.from('lead_assignment_history').select('*').order('created_at', { ascending: false }),
      ]);

      if (candRes.data) setCandidates(candRes.data);
      if (empRes.data) setEmployers(empRes.data);
      if (jobRes.data) setJobs(jobRes.data);
      if (appRes.data) setApplications(appRes.data);
      if (intRes.data) setInterviews(intRes.data);
      if (logRes.data) setCallLogs(logRes.data);
      if (taskRes.data) setTasks(taskRes.data);
      if (payRes.data) setPayments(payRes.data);
      if (leadsRes.data) setLeads(leadsRes.data);
      if (batchesRes.data) setLeadImportBatches(batchesRes.data);
      if (assignRes.data) setLeadAssignmentHistory(assignRes.data);
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
      case 'leads': setLeads(updateList); break;
      case 'lead_import_batches': setLeadImportBatches(updateList); break;
      case 'lead_assignment_history': setLeadAssignmentHistory(updateList); break;
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

  // Leads module: Transaction-safe create with cross-table duplicate checking
  const createLeadWithDedup = useCallback(async (leadData: Partial<Lead>) => {
    if (isSupabaseConfigured && navigator.onLine) {
      const { data, error } = await supabase.rpc('create_lead_with_dedup', {
        p_name: leadData.name,
        p_mobile: leadData.mobile,
        p_email: leadData.email || null,
        p_experience: leadData.experience ?? null,
        p_skills: leadData.skills || [],
        p_location: leadData.location || null,
        p_expected_salary: leadData.expected_salary ?? null,
        p_current_salary: leadData.current_salary ?? null,
        p_qualification: leadData.qualification || null,
        p_notice_period: leadData.notice_period || null,
        p_last_role: leadData.last_role || null,
        p_source: leadData.source || 'Manual',
        p_assigned_to: leadData.assigned_to || null,
        p_import_batch_id: leadData.import_batch_id || null,
        p_notes: leadData.notes || null,
      });

      if (error) throw new Error(error.message);

      if (data && data.success && data.lead_id) {
        const newLead: Lead = {
          id: data.lead_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          name: leadData.name || '',
          mobile: leadData.mobile || '',
          email: leadData.email,
          experience: leadData.experience,
          skills: leadData.skills || [],
          location: leadData.location,
          expected_salary: leadData.expected_salary,
          current_salary: leadData.current_salary,
          qualification: leadData.qualification,
          notice_period: leadData.notice_period,
          last_role: leadData.last_role,
          source: leadData.source || 'Manual',
          category: 'New',
          assigned_to: leadData.assigned_to || null,
          import_batch_id: leadData.import_batch_id || null,
          notes: leadData.notes,
          is_active: true,
        };
        applyLocalMutation('leads', 'insert', newLead);
      }
      return data;
    }

    // Offline / Local fallback:
    const existingLead = leads.find(l => l.mobile === leadData.mobile && l.is_active);
    if (existingLead) {
      return { success: false, reason: 'duplicate_lead', message: 'An active lead with this mobile already exists' };
    }
    const existingCand = candidates.find(c => c.mobile === leadData.mobile && c.is_active);
    if (existingCand) {
      return { success: false, reason: 'existing_candidate', message: 'A candidate with this mobile already exists in CRM' };
    }
    const newLead: Lead = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      name: leadData.name || '',
      mobile: leadData.mobile || '',
      email: leadData.email,
      experience: leadData.experience,
      skills: leadData.skills || [],
      location: leadData.location,
      expected_salary: leadData.expected_salary,
      current_salary: leadData.current_salary,
      qualification: leadData.qualification,
      notice_period: leadData.notice_period,
      last_role: leadData.last_role,
      source: leadData.source || 'Manual',
      category: 'New',
      assigned_to: leadData.assigned_to || null,
      import_batch_id: leadData.import_batch_id || null,
      notes: leadData.notes,
      is_active: true,
    };
    await enqueueMutation('leads', 'insert', newLead);
    applyLocalMutation('leads', 'insert', newLead);
    return { success: true, lead_id: newLead.id, message: 'Lead created successfully' };
  }, [leads, candidates, applyLocalMutation]);

  // Leads module: Atomic Lead to Candidate conversion
  const convertLeadToCandidate = useCallback(async (leadId: string, overrides: any = {}) => {
    if (isSupabaseConfigured && navigator.onLine) {
      const { data, error } = await supabase.rpc('convert_lead_to_candidate', {
        p_lead_id: leadId,
        p_override_name: overrides.name || null,
        p_override_email: overrides.email || null,
        p_override_experience: overrides.experience ?? null,
        p_override_skills: overrides.skills || null,
        p_override_location: overrides.location || null,
        p_override_expected_salary: overrides.expected_salary ?? null,
        p_override_current_salary: overrides.current_salary ?? null,
        p_override_qualification: overrides.qualification || null,
        p_override_notice_period: overrides.notice_period || null,
        p_override_last_role: overrides.last_role || null,
      });

      if (error) throw new Error(error.message);
      await fetchData();
      return data;
    }

    // Offline fallback
    const targetLead = leads.find(l => l.id === leadId);
    if (!targetLead) throw new Error('Lead not found');
    if (targetLead.converted_candidate_id) {
      return { success: true, idempotent: true, candidate_id: targetLead.converted_candidate_id, message: 'Already converted' };
    }
    let candId = candidates.find(c => c.mobile === targetLead.mobile && c.is_active)?.id;
    let wasExisting = Boolean(candId);
    if (!candId) {
      const newCand: Candidate = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        name: overrides.name || targetLead.name,
        mobile: targetLead.mobile,
        email: overrides.email || targetLead.email,
        experience: overrides.experience ?? targetLead.experience ?? 0,
        skills: overrides.skills || targetLead.skills || [],
        location: overrides.location || targetLead.location || '',
        expected_salary: overrides.expected_salary ?? targetLead.expected_salary ?? 0,
        current_salary: overrides.current_salary ?? targetLead.current_salary,
        qualification: overrides.qualification || targetLead.qualification,
        notice_period: overrides.notice_period || targetLead.notice_period,
        last_role: overrides.last_role || targetLead.last_role || '',
        status: 'Active',
        source: targetLead.source,
        owner_id: targetLead.assigned_to || '',
        is_active: true,
      };
      await insert('candidates', newCand);
      candId = newCand.id;
    }
    const updatedLead = {
      ...targetLead,
      converted_candidate_id: candId,
      converted_at: new Date().toISOString(),
      category: 'Converted' as LeadCategory,
    };
    await update('leads', updatedLead);
    return { success: true, idempotent: false, candidate_id: candId, was_existing_candidate: wasExisting };
  }, [leads, candidates, fetchData, insert, update]);

  // Leads module: Idempotent follow-up task creation
  const createLeadFollowupTask = useCallback(async (leadId: string, taskData: any) => {
    if (isSupabaseConfigured && navigator.onLine) {
      const { data, error } = await supabase.rpc('create_lead_followup', {
        p_lead_id: leadId,
        p_title: taskData.title,
        p_due_date: taskData.due_date || undefined,
        p_assigned_to_user_id: taskData.assigned_to_user_id || null,
        p_priority: taskData.priority || 'Medium',
        p_notes: taskData.notes || null,
      });

      if (error) throw new Error(error.message);
      await fetchData();
      return data;
    }

    // Offline fallback
    const newTask = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      due_date: taskData.due_date || new Date(Date.now() + 86400000).toISOString().split('T')[0],
      title: taskData.title,
      notes: taskData.notes,
      entity_type: 'lead' as const,
      entity_id: leadId,
      lead_entity_id: leadId,
      assigned_to: taskData.assigned_to || 'Assigned User',
      priority: taskData.priority || 'Medium',
      status: 'Pending' as const,
      is_active: true,
    };
    await insert('tasks', newTask);
    return { success: true, task_id: newTask.id, message: 'Follow-up created' };
  }, [fetchData, insert]);

  // Leads module: Record lead call attempt and maintain hot lead & lifecycle status
  const recordLeadCall = useCallback(async (callData: { lead_id: string; call_type: CallType; duration?: number; note?: string; telecaller_name?: string }) => {
    const targetLead = leads.find(l => l.id === callData.lead_id);
    if (!targetLead) throw new Error('Lead not found');

    const newLog: CallLog = {
      id: crypto.randomUUID(),
      lead_id: callData.lead_id,
      candidate_id: null,
      telecaller_name: callData.telecaller_name || 'Telecaller',
      call_type: callData.call_type,
      duration: callData.duration || 0,
      note: callData.note || '',
      timestamp: new Date().toISOString(),
    };

    await insert('call_logs', newLog);

    // Business Rule: any recorded call attempt removes lead from Hot / New
    let newCategory = targetLead.category;
    if (callData.call_type === 'Not Interested') {
      newCategory = 'Rejected';
    } else if (callData.call_type === 'Interested') {
      newCategory = 'Warm';
    } else if (callData.call_type === 'Converted') {
      newCategory = 'Converted';
    } else if (targetLead.category === 'New' || targetLead.category === 'Hot') {
      newCategory = 'Warm';
    }

    if (newCategory !== targetLead.category) {
      await update('leads', { ...targetLead, category: newCategory });
    }

    // Auto-create next-day follow-up for unanswered/busy/callback
    if (['No Answer', 'Busy', 'SwitchOff', 'Call Back Later'].includes(callData.call_type)) {
      try {
        await createLeadFollowupTask(callData.lead_id, {
          title: `Retry Call (${callData.call_type}): ${targetLead.name}`,
          priority: 'Medium',
          notes: `Follow-up after ${callData.call_type}. Notes: ${callData.note || 'None'}`,
        });
      } catch (e) {
        console.warn('Auto follow-up note:', e);
      }
    }

    return newLog;
  }, [leads, insert, update, createLeadFollowupTask]);

  // Leads module: Assignment and re-assignment
  const assignLead = useCallback(async (leadId: string, assignedToUserId: string | null, reason?: string) => {
    const targetLead = leads.find(l => l.id === leadId);
    if (!targetLead) throw new Error('Lead not found');

    const updated = {
      ...targetLead,
      assigned_to: assignedToUserId,
    };

    const res = await update('leads', updated);

    if (isSupabaseConfigured && navigator.onLine) {
      const { data: hist } = await supabase.from('lead_assignment_history').select('*').order('created_at', { ascending: false });
      if (hist) setLeadAssignmentHistory(hist);
    } else {
      const histRecord: LeadAssignmentHistory = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        lead_id: leadId,
        assigned_from: targetLead.assigned_to || null,
        assigned_to: assignedToUserId,
        assigned_by: 'Current User',
        reason: reason || 'Reassigned from CRM',
      };
      applyLocalMutation('lead_assignment_history', 'insert', histRecord);
    }

    return res;
  }, [leads, update, applyLocalMutation]);

  // Leads module: Batch import
  const batchImportLeads = useCallback(async (
    batchInfo: { file_name: string; detected_platform: 'Naukri.com' | 'WorkIndia' | 'Generic'; default_assigned_to?: string | null; notes?: string },
    leadsToInsert: Partial<Lead>[]
  ) => {
    const batchId = crypto.randomUUID();
    let currentUserId = '00000000-0000-0000-0000-000000000000';
    if (isSupabaseConfigured) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) currentUserId = user.id;
    }

    const batchRecord: LeadImportBatch = {
      id: batchId,
      created_at: new Date().toISOString(),
      imported_by: currentUserId,
      file_name: batchInfo.file_name,
      detected_platform: batchInfo.detected_platform,
      total_rows: leadsToInsert.length,
      imported_count: leadsToInsert.length,
      skipped_duplicate_count: 0,
      skipped_invalid_count: 0,
      default_assigned_to: batchInfo.default_assigned_to || null,
      notes: batchInfo.notes || null,
    };

    await insert('lead_import_batches', batchRecord);

    let insertedCount = 0;
    for (const item of leadsToInsert) {
      const leadData = {
        ...item,
        import_batch_id: batchId,
        assigned_to: item.assigned_to || batchInfo.default_assigned_to || null,
      };
      const res = await createLeadWithDedup(leadData);
      if (res && res.success) {
        insertedCount++;
      }
    }

    await fetchData();
    return { batch: batchRecord, insertedCount };
  }, [createLeadWithDedup, insert, fetchData]);

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
      leads,
      leadImportBatches,
      leadAssignmentHistory,
      loading,
      isOffline,
      pendingCount,
      deadLetterCount,
      refreshData: fetchData,
      insert,
      update,
      remove,
      syncNow,
      createLeadWithDedup,
      convertLeadToCandidate,
      createLeadFollowupTask,
      recordLeadCall,
      assignLead,
      batchImportLeads,
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