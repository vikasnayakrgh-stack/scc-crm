import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Button, Input, Modal, Label, Badge, CardSkeleton } from '../components/ui';
import {
  Flame,
  Phone,
  PhoneCall,
  Calendar,
  UserPlus,
  Search,
  Upload,
  UserCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Eye,
  Filter,
  Users,
  FileSpreadsheet,
  CheckSquare,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Lead, CallType, LeadSource, LeadCategory, FollowUpTask, CallLog, USERS } from '../types';
import { LeadImportModal } from '../components/LeadImportModal';
import { isSameDay, isPast, parseISO, format } from 'date-fns';

type LeadTab = 'all' | 'hot' | 'followups' | 'not_interested' | 'converted' | 'batches';

const SOURCE_OPTIONS: LeadSource[] = [
  'WorkIndia',
  'Naukri.com',
  'Indeed',
  'LinkedIn',
  'WhatsApp',
  'Walk-in',
  'Referral',
  'Website',
  'Manual',
  'Other',
];

export default function Leads() {
  const {
    leads,
    candidates,
    callLogs,
    tasks,
    leadImportBatches,
    leadAssignmentHistory,
    loading,
    createLeadWithDedup,
    convertLeadToCandidate,
    createLeadFollowupTask,
    recordLeadCall,
    assignLead,
    update,
  } = useData();

  const { currentUser, appRole } = useUser();

  const [activeTab, setActiveTab] = useState<LeadTab>('hot');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [assignedFilter, setAssignedFilter] = useState<string>('All');

  // Modals state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Call modal
  const [callModalLead, setCallModalLead] = useState<Lead | null>(null);
  const [callOutcome, setCallOutcome] = useState<CallType>('Connected');
  const [callDuration, setCallDuration] = useState<number>(60);
  const [callNote, setCallNote] = useState<string>('');
  const [autoFollowupDate, setAutoFollowupDate] = useState<string>(
    new Date(Date.now() + 86400000).toISOString().split('T')[0] || ''
  );
  const [autoFollowupTime, setAutoFollowupTime] = useState<string>('11:00');
  const [createFollowupOnCall, setCreateFollowupOnCall] = useState<boolean>(true);

  // Follow-up modal
  const [followupModalLead, setFollowupModalLead] = useState<Lead | null>(null);
  const [followupTitle, setFollowupTitle] = useState('');
  const [followupDate, setFollowupDate] = useState(
    new Date(Date.now() + 86400000).toISOString().split('T')[0]
  );
  const [followupPriority, setFollowupPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [followupNote, setFollowupNote] = useState('');
  const [followupAssignee, setFollowupAssignee] = useState('');

  // Conversion modal
  const [convertModalLead, setConvertModalLead] = useState<Lead | null>(null);
  const [convertOverrides, setConvertOverrides] = useState<Record<string, any>>({});
  const [isConverting, setIsConverting] = useState(false);

  // Reassignment modal
  const [reassignModalLead, setReassignModalLead] = useState<Lead | null>(null);
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  // Reactivate modal
  const [reactivateLead, setReactivateLead] = useState<Lead | null>(null);
  const [reactivateReason, setReactivateReason] = useState('');

  // Manual Add Form State
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadMobile, setNewLeadMobile] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadSource, setNewLeadSource] = useState<LeadSource>('Manual');
  const [newLeadSkills, setNewLeadSkills] = useState('');
  const [newLeadExp, setNewLeadExp] = useState('');
  const [newLeadLocation, setNewLeadLocation] = useState('');
  const [newLeadExpSal, setNewLeadExpSal] = useState('');
  const [newLeadCurrSal, setNewLeadCurrSal] = useState('');
  const [newLeadQual, setNewLeadQual] = useState('');
  const [newLeadNotice, setNewLeadNotice] = useState('');
  const [newLeadRole, setNewLeadRole] = useState('');
  const [newLeadNotes, setNewLeadNotes] = useState('');
  const [newLeadAssignee, setNewLeadAssignee] = useState('');

  // Set of lead IDs that have at least one call log
  const calledLeadIds = useMemo(() => {
    return new Set(callLogs.filter(c => c.lead_id).map(c => c.lead_id));
  }, [callLogs]);

  // Lead Calls lookup: lead_id -> CallLog[]
  const leadCallsMap = useMemo(() => {
    const map = new Map<string, CallLog[]>();
    for (const c of callLogs) {
      if (c.lead_id) {
        const list = map.get(c.lead_id) || [];
        list.push(c);
        map.set(c.lead_id, list);
      }
    }
    return map;
  }, [callLogs]);

  // Lead Tasks lookup: lead_id -> FollowUpTask[]
  const leadTasksMap = useMemo(() => {
    const map = new Map<string, FollowUpTask[]>();
    for (const t of tasks) {
      const lid = t.lead_entity_id || (t.entity_type === 'lead' ? t.entity_id : undefined);
      if (lid) {
        const list = map.get(lid) || [];
        list.push(t);
        map.set(lid, list);
      }
    }
    return map;
  }, [tasks]);

  const now = new Date();

  // Metrics calculation
  const metrics = useMemo(() => {
    const activeLeads = leads.filter(l => l.is_active);
    const hotLeads = activeLeads.filter(
      l => !calledLeadIds.has(l.id) && l.category !== 'Converted' && l.category !== 'Rejected'
    );
    const todayLeads = activeLeads.filter(l => {
      try {
        return isSameDay(parseISO(l.created_at), now);
      } catch {
        return false;
      }
    });

    const leadTasksList = tasks.filter(t => t.is_active && (t.entity_type === 'lead' || t.lead_entity_id));
    const todayFollowups = leadTasksList.filter(t => {
      if (t.status === 'Completed') return false;
      try {
        return isSameDay(parseISO(t.due_date), now);
      } catch {
        return false;
      }
    });
    const overdueFollowups = leadTasksList.filter(t => {
      if (t.status === 'Completed') return false;
      try {
        const d = parseISO(t.due_date);
        return isPast(d) && !isSameDay(d, now);
      } catch {
        return false;
      }
    });

    const convertedLeads = activeLeads.filter(l => l.category === 'Converted' || l.converted_candidate_id);
    const notInterestedLeads = activeLeads.filter(l => l.category === 'Rejected' || l.category === 'Do Not Contact');

    return {
      total: activeLeads.length,
      hot: hotLeads.length,
      today: todayLeads.length,
      todayFollowups: todayFollowups.length,
      overdueFollowups: overdueFollowups.length,
      converted: convertedLeads.length,
      notInterested: notInterestedLeads.length,
    };
  }, [leads, calledLeadIds, tasks, now]);

  // Tab-filtered leads
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (!l.is_active) return false;

      // Tab logic
      if (activeTab === 'hot') {
        // Hot Lead: NEVER called, not converted, not rejected
        if (calledLeadIds.has(l.id) || l.category === 'Converted' || l.category === 'Rejected') {
          return false;
        }
      } else if (activeTab === 'not_interested') {
        if (l.category !== 'Rejected' && l.category !== 'Do Not Contact') {
          return false;
        }
      } else if (activeTab === 'converted') {
        if (l.category !== 'Converted' && !l.converted_candidate_id) {
          return false;
        }
      }

      // Filter: Search name/mobile
      if (search) {
        const q = search.toLowerCase();
        const matchesName = l.name.toLowerCase().includes(q);
        const matchesMobile = l.mobile.includes(q);
        const matchesSkills = (l.skills || []).some(s => s.toLowerCase().includes(q));
        const matchesLoc = l.location?.toLowerCase().includes(q);
        if (!matchesName && !matchesMobile && !matchesSkills && !matchesLoc) return false;
      }

      // Filter: Source
      if (sourceFilter !== 'All' && l.source !== sourceFilter) return false;

      // Filter: Category
      if (categoryFilter !== 'All') {
        if (categoryFilter === 'Hot') {
          if (calledLeadIds.has(l.id) || l.category === 'Converted') return false;
        } else if (l.category !== categoryFilter) {
          return false;
        }
      }

      // Filter: Assigned
      if (assignedFilter !== 'All') {
        if (assignedFilter === 'Unassigned') {
          if (l.assigned_to) return false;
        } else if (l.assigned_to !== assignedFilter) {
          return false;
        }
      }

      return true;
    });
  }, [leads, activeTab, calledLeadIds, search, sourceFilter, categoryFilter, assignedFilter]);

  // Handlers
  const handleOpenCallModal = (lead: Lead) => {
    setCallModalLead(lead);
    setCallOutcome('Connected');
    setCallDuration(60);
    setCallNote('');
    setCreateFollowupOnCall(true);
    setAutoFollowupDate(new Date(Date.now() + 86400000).toISOString().split('T')[0] || '');
  };

  const handleSaveCallLog = async () => {
    if (!callModalLead) return;
    try {
      await recordLeadCall({
        lead_id: callModalLead.id,
        call_type: callOutcome,
        duration: callDuration,
        note: callNote,
        telecaller_name: currentUser || 'Telecaller',
      });

      // If user opted to schedule custom follow-up during call
      if (
        createFollowupOnCall &&
        ['No Answer', 'Busy', 'SwitchOff', 'Call Back Later'].includes(callOutcome)
      ) {
        await createLeadFollowupTask(callModalLead.id, {
          title: `Retry Call (${callOutcome}): ${callModalLead.name}`,
          due_date: autoFollowupDate,
          priority: 'Medium',
          notes: `Follow-up after ${callOutcome}. Note: ${callNote || 'None'}`,
        });
      }

      toast.success('Call logged successfully!');
      setCallModalLead(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to record call');
    }
  };

  const handleOpenFollowupModal = (lead: Lead) => {
    setFollowupModalLead(lead);
    setFollowupTitle(`Follow-up with ${lead.name}`);
    setFollowupDate(new Date(Date.now() + 86400000).toISOString().split('T')[0] || '');
    setFollowupPriority('Medium');
    setFollowupNote('');
    setFollowupAssignee(lead.assigned_to || '');
  };

  const handleSaveFollowup = async () => {
    if (!followupModalLead) return;
    try {
      await createLeadFollowupTask(followupModalLead.id, {
        title: followupTitle,
        due_date: followupDate,
        priority: followupPriority,
        notes: followupNote,
        assigned_to_user_id: followupAssignee || undefined,
      });
      toast.success('Follow-up task scheduled!');
      setFollowupModalLead(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to schedule follow-up');
    }
  };

  const handleOpenConvertModal = (lead: Lead) => {
    setConvertModalLead(lead);
    setConvertOverrides({
      name: lead.name,
      email: lead.email || '',
      experience: lead.experience ?? 0,
      skills: lead.skills || [],
      location: lead.location || '',
      expected_salary: lead.expected_salary ?? 0,
      current_salary: lead.current_salary ?? undefined,
      qualification: lead.qualification || '',
      notice_period: lead.notice_period || '',
      last_role: lead.last_role || '',
    });
  };

  const handleExecuteConversion = async () => {
    if (!convertModalLead) return;
    setIsConverting(true);
    try {
      const res = await convertLeadToCandidate(convertModalLead.id, convertOverrides);
      if (res.was_existing_candidate) {
        toast.success(`Lead successfully linked to existing Candidate profile: ${convertModalLead.name}!`);
      } else {
        toast.success(`Successfully converted Lead into Candidate: ${convertModalLead.name}!`);
      }
      setConvertModalLead(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to convert lead');
    } finally {
      setIsConverting(false);
    }
  };

  const handleOpenReassignModal = (lead: Lead) => {
    setReassignModalLead(lead);
    setNewAssigneeId(lead.assigned_to || '');
    setReassignReason('');
  };

  const handleSaveReassignment = async () => {
    if (!reassignModalLead) return;
    try {
      await assignLead(reassignModalLead.id, newAssigneeId || null, reassignReason);
      toast.success('Lead reassigned successfully!');
      setReassignModalLead(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to reassign lead');
    }
  };

  const handleOpenReactivateModal = (lead: Lead) => {
    setReactivateLead(lead);
    setReactivateReason('');
  };

  const handleExecuteReactivation = async () => {
    if (!reactivateLead) return;
    if (!reactivateReason.trim()) {
      toast.error('Please enter a reactivation reason.');
      return;
    }
    try {
      await update('leads', {
        ...reactivateLead,
        category: 'Warm' as LeadCategory,
        notes: reactivateLead.notes
          ? `${reactivateLead.notes}\n[Reactivated ${format(new Date(), 'dd MMM yyyy')}: ${reactivateReason}]`
          : `[Reactivated ${format(new Date(), 'dd MMM yyyy')}: ${reactivateReason}]`,
      });
      toast.success('Lead reactivated to Warm pipeline!');
      setReactivateLead(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to reactivate lead');
    }
  };

  const handleCreateManualLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadName.trim() || !newLeadMobile.trim()) {
      toast.error('Name and Mobile number are required.');
      return;
    }

    try {
      const skillsArray = newLeadSkills
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const res = await createLeadWithDedup({
        name: newLeadName.trim(),
        mobile: newLeadMobile.trim(),
        email: newLeadEmail.trim() || null,
        source: newLeadSource,
        skills: skillsArray,
        experience: newLeadExp ? parseFloat(newLeadExp) : null,
        location: newLeadLocation.trim() || null,
        expected_salary: newLeadExpSal ? parseInt(newLeadExpSal, 10) : null,
        current_salary: newLeadCurrSal ? parseInt(newLeadCurrSal, 10) : null,
        qualification: newLeadQual.trim() || null,
        notice_period: newLeadNotice.trim() || null,
        last_role: newLeadRole.trim() || null,
        notes: newLeadNotes.trim() || null,
        assigned_to: newLeadAssignee || null,
      });

      if (!res.success) {
        toast.error(res.message || 'Cannot create lead (duplicate detected)');
        return;
      }

      toast.success('Lead created successfully! Added to Hot Leads.');
      setIsAddOpen(false);
      // Reset form
      setNewLeadName('');
      setNewLeadMobile('');
      setNewLeadEmail('');
      setNewLeadSkills('');
      setNewLeadExp('');
      setNewLeadLocation('');
      setNewLeadExpSal('');
      setNewLeadCurrSal('');
      setNewLeadQual('');
      setNewLeadNotice('');
      setNewLeadRole('');
      setNewLeadNotes('');
      setNewLeadAssignee('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create lead');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Leads Management</h1>
            <Badge variant="primary" className="bg-rose-100 text-rose-700 border-rose-200">
              <Flame className="w-3 h-3 mr-1 inline" />
              {metrics.hot} Hot
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Capture, qualify, engage, and convert potential job candidates before pipeline registration.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-2 text-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Excel / CSV
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-2 text-xs bg-blue-600 hover:bg-blue-700"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Lead Manually
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div
          onClick={() => setActiveTab('hot')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            activeTab === 'hot'
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
              Hot Leads
            </span>
            <Flame className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-rose-900">{metrics.hot}</div>
          <div className="text-[11px] text-rose-600 mt-0.5">Never called</div>
        </div>

        <div
          onClick={() => setActiveTab('all')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            activeTab === 'all'
              ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Total Leads
            </span>
            <Users className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics.total}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">+{metrics.today} today</div>
        </div>

        <div
          onClick={() => setActiveTab('followups')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            activeTab === 'followups'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
              Due Today
            </span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-900">{metrics.todayFollowups}</div>
          <div className="text-[11px] text-amber-600 mt-0.5">Follow-up tasks</div>
        </div>

        <div
          onClick={() => setActiveTab('followups')}
          className="p-3.5 rounded-xl border bg-white border-slate-200 hover:border-slate-300 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
              Overdue
            </span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-rose-900">{metrics.overdueFollowups}</div>
          <div className="text-[11px] text-rose-600 mt-0.5">Needs immediate call</div>
        </div>

        <div
          onClick={() => setActiveTab('converted')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            activeTab === 'converted'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
              Converted
            </span>
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-900">{metrics.converted}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Now Candidates</div>
        </div>

        <div
          onClick={() => setActiveTab('not_interested')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            activeTab === 'not_interested'
              ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-400'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Not Interested
            </span>
            <ShieldAlert className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-700">{metrics.notInterested}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Can reactivate</div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-medium">
        <button
          onClick={() => setActiveTab('hot')}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'hot'
              ? 'bg-rose-100 text-rose-800 font-bold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-rose-600" />
          Hot Leads ({metrics.hot})
        </button>

        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'all'
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-blue-600" />
          All Leads ({metrics.total})
        </button>

        <button
          onClick={() => setActiveTab('followups')}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'followups'
              ? 'bg-amber-100 text-amber-800 font-bold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5 text-amber-600" />
          Follow-up Reminders ({metrics.todayFollowups + metrics.overdueFollowups})
        </button>

        <button
          onClick={() => setActiveTab('not_interested')}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'not_interested'
              ? 'bg-slate-200 text-slate-900 font-bold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
          Not Interested ({metrics.notInterested})
        </button>

        <button
          onClick={() => setActiveTab('converted')}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'converted'
              ? 'bg-emerald-100 text-emerald-800 font-bold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
          Converted ({metrics.converted})
        </button>

        <button
          onClick={() => setActiveTab('batches')}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'batches'
              ? 'bg-purple-100 text-purple-800 font-bold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600" />
          Import Batches ({leadImportBatches.length})
        </button>
      </div>

      {/* Main Content Area based on Tab */}
      {activeTab === 'batches' ? (
        /* Batches View */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Lead Import Batch History</h2>
            <span className="text-xs text-slate-500">{leadImportBatches.length} uploads recorded</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                <tr>
                  <th className="p-3">Import Date</th>
                  <th className="p-3">File Name</th>
                  <th className="p-3">Platform</th>
                  <th className="p-3">Imported Rows</th>
                  <th className="p-3">Duplicates Skipped</th>
                  <th className="p-3">Invalid Skipped</th>
                  <th className="p-3">Batch Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leadImportBatches.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-600">
                      {format(parseISO(b.created_at), 'dd MMM yyyy, hh:mm a')}
                    </td>
                    <td className="p-3 font-medium text-slate-900 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" />
                      {b.file_name}
                    </td>
                    <td className="p-3">
                      <Badge variant="neutral">{b.detected_platform}</Badge>
                    </td>
                    <td className="p-3 font-semibold text-emerald-700">{b.imported_count}</td>
                    <td className="p-3 text-amber-700">{b.skipped_duplicate_count}</td>
                    <td className="p-3 text-rose-700">{b.skipped_invalid_count}</td>
                    <td className="p-3 text-slate-500 text-[11px]">{b.notes || '—'}</td>
                  </tr>
                ))}
                {leadImportBatches.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No import batches recorded yet. Upload a file above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'followups' ? (
        /* Followups View */
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Lead Follow-up Tasks</h2>
              <span className="text-xs text-slate-500">
                Auto-generated from unanswered calls & manual follow-ups
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                  <tr>
                    <th className="p-3">Due Date</th>
                    <th className="p-3">Task Title</th>
                    <th className="p-3">Linked Lead</th>
                    <th className="p-3">Priority</th>
                    <th className="p-3">Assigned To</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks
                    .filter(t => t.is_active && (t.entity_type === 'lead' || t.lead_entity_id))
                    .map(task => {
                      const linkedLead = leads.find(
                        l => l.id === task.lead_entity_id || l.id === task.entity_id
                      );
                      const isOverdue =
                        task.status !== 'Completed' &&
                        isPast(parseISO(task.due_date)) &&
                        !isSameDay(parseISO(task.due_date), now);

                      return (
                        <tr key={task.id} className="hover:bg-slate-50">
                          <td className="p-3 whitespace-nowrap">
                            <span
                              className={`font-semibold ${
                                isOverdue ? 'text-rose-600 font-bold' : 'text-slate-800'
                              }`}
                            >
                              {task.due_date}
                              {isOverdue && ' (Overdue)'}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-slate-900">{task.title}</td>
                          <td className="p-3">
                            {linkedLead ? (
                              <button
                                onClick={() => setSelectedLead(linkedLead)}
                                className="text-blue-600 hover:underline font-medium"
                              >
                                {linkedLead.name} ({linkedLead.mobile})
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={
                                task.priority === 'High'
                                  ? 'danger'
                                  : task.priority === 'Medium'
                                  ? 'warning'
                                  : 'neutral'
                              }
                            >
                              {task.priority}
                            </Badge>
                          </td>
                          <td className="p-3 text-slate-600">{task.assigned_to}</td>
                          <td className="p-3">
                            <Badge variant={task.status === 'Completed' ? 'success' : 'neutral'}>
                              {task.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-right space-x-1.5">
                            {linkedLead && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleOpenCallModal(linkedLead)}
                                className="text-[11px]"
                              >
                                <PhoneCall className="w-3 h-3 mr-1" /> Call Now
                              </Button>
                            )}
                            {task.status !== 'Completed' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  await update('tasks', {
                                    ...task,
                                    status: 'Completed',
                                    completed_at: new Date().toISOString(),
                                  });
                                  toast.success('Task marked completed!');
                                }}
                                className="text-[11px]"
                              >
                                Mark Done
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Leads Table View (Hot / All / Not Interested / Converted) */
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, mobile, skills, city..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700"
              >
                <option value="All">All Sources</option>
                {SOURCE_OPTIONS.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                value={assignedFilter}
                onChange={e => setAssignedFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700"
              >
                <option value="All">All Assignees</option>
                <option value="Unassigned">Unassigned (Pool)</option>
                {USERS.map(u => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                  <tr>
                    <th className="p-3">Candidate / Contact</th>
                    <th className="p-3">Categories & Skills</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Status / Engagement</th>
                    <th className="p-3">Assigned Recruiter</th>
                    <th className="p-3">Last Contacted</th>
                    <th className="p-3">Created</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map(lead => {
                    const calls = leadCallsMap.get(lead.id) || [];
                    const isHot = !calledLeadIds.has(lead.id) && lead.category !== 'Converted';
                    const lastCall = calls[0];
                    const assignee = lead.assigned_to || 'Unassigned';

                    return (
                      <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                        {/* Name & Contact */}
                        <td className="p-3">
                          <div className="font-semibold text-slate-900 text-sm">{lead.name}</div>
                          <div className="font-mono text-slate-600 text-xs flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {lead.mobile}
                          </div>
                          {lead.location && (
                            <div className="text-[11px] text-slate-400 mt-0.5">{lead.location}</div>
                          )}
                        </td>

                        {/* Skills / Categories */}
                        <td className="p-3 max-w-[200px]">
                          <div className="flex flex-wrap gap-1">
                            {lead.skills && lead.skills.length > 0 ? (
                              lead.skills.slice(0, 3).map(s => (
                                <span
                                  key={s}
                                  className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-medium"
                                >
                                  {s}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400 italic">None</span>
                            )}
                            {lead.skills && lead.skills.length > 3 && (
                              <span className="text-[10px] text-slate-500">
                                +{lead.skills.length - 3} more
                              </span>
                            )}
                          </div>
                          {lead.experience !== null && lead.experience !== undefined && (
                            <div className="text-[11px] text-slate-500 mt-1">
                              Exp: {lead.experience} yrs
                            </div>
                          )}
                        </td>

                        {/* Source */}
                        <td className="p-3">
                          <Badge variant="neutral" className="font-medium">
                            {lead.source}
                          </Badge>
                        </td>

                        {/* Status & Engagement */}
                        <td className="p-3">
                          {isHot ? (
                            <div className="flex items-center gap-1 text-rose-700 font-bold bg-rose-50 border border-rose-200 px-2 py-1 rounded-md text-[11px] w-fit">
                              <Flame className="w-3.5 h-3.5 text-rose-600 fill-rose-600" />
                              Hot Lead (0 Calls)
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <Badge
                                variant={
                                  lead.category === 'Converted'
                                    ? 'success'
                                    : lead.category === 'Rejected'
                                    ? 'danger'
                                    : lead.category === 'Warm'
                                    ? 'warning'
                                    : 'neutral'
                                }
                              >
                                {lead.category}
                              </Badge>
                              <div className="text-[10px] text-slate-500">
                                {calls.length} call attempt{calls.length > 1 ? 's' : ''}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Assigned Recruiter */}
                        <td className="p-3">
                          {lead.assigned_to ? (
                            <span className="font-medium text-slate-800">{lead.assigned_to}</span>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                          {appRole !== 'recruiter' && (
                            <button
                              onClick={() => handleOpenReassignModal(lead)}
                              className="block text-[10px] text-blue-600 hover:underline mt-0.5"
                            >
                              Change
                            </button>
                          )}
                        </td>

                        {/* Last Contacted */}
                        <td className="p-3 text-slate-600">
                          {lastCall ? (
                            <div>
                              <div>{format(parseISO(lastCall.timestamp), 'dd MMM, hh:mm a')}</div>
                              <span className="text-[10px] text-slate-500 font-medium">
                                {lastCall.call_type}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Never</span>
                          )}
                        </td>

                        {/* Created Date */}
                        <td className="p-3 text-slate-500">
                          {format(parseISO(lead.created_at), 'dd MMM yyyy')}
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Log Call */}
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleOpenCallModal(lead)}
                              className="text-xs flex items-center gap-1"
                              title="Log Call"
                            >
                              <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                              Call
                            </Button>

                            {/* Schedule Followup */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenFollowupModal(lead)}
                              className="text-xs p-1.5"
                              title="Schedule Follow-up"
                            >
                              <Calendar className="w-3.5 h-3.5 text-amber-600" />
                            </Button>

                            {/* Convert to Candidate */}
                            {lead.category !== 'Converted' ? (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleOpenConvertModal(lead)}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
                                title="Convert to Candidate"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                Convert
                              </Button>
                            ) : (
                              <Badge variant="success" className="text-[10px]">
                                Converted
                              </Badge>
                            )}

                            {/* Reactivate if Rejected */}
                            {(lead.category === 'Rejected' || lead.category === 'Do Not Contact') && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenReactivateModal(lead)}
                                className="text-xs text-amber-600 border-amber-300"
                                title="Reactivate Lead"
                              >
                                <RotateCcw className="w-3 h-3 mr-1" />
                                Reactivate
                              </Button>
                            )}

                            {/* View Details Drawer */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedLead(lead)}
                              className="text-xs p-1.5"
                              title="View Details & Timeline"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredLeads.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-400">
                        No leads found in this view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODALS ================= */}

      {/* 1. Log Call Modal */}
      {callModalLead && (
        <Modal
          isOpen={Boolean(callModalLead)}
          onClose={() => setCallModalLead(null)}
          title={`Log Call: ${callModalLead.name}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between text-xs">
              <div>
                <p className="font-semibold text-slate-800">{callModalLead.name}</p>
                <p className="font-mono text-slate-600">{callModalLead.mobile}</p>
              </div>
              <Badge variant="primary">{callModalLead.source}</Badge>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-800 block mb-1.5">
                Call Outcome *
              </Label>
              <select
                value={callOutcome}
                onChange={e => setCallOutcome(e.target.value as CallType)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="Connected">Connected (Spoke with candidate)</option>
                <option value="No Answer">No Answer (Unanswered)</option>
                <option value="Busy">Busy</option>
                <option value="SwitchOff">Switch Off / Out of Coverage</option>
                <option value="Call Back Later">Call Back Later (Follow-up requested)</option>
                <option value="Interested">Interested (Warm candidate)</option>
                <option value="Not Interested">Not Interested (Reject/Do Not Call)</option>
                <option value="Wrong Number">Wrong Number</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">
                  Duration (seconds)
                </Label>
                <Input
                  type="number"
                  value={callDuration}
                  onChange={e => setCallDuration(parseInt(e.target.value, 10) || 0)}
                  className="text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">Caller</Label>
                <Input
                  type="text"
                  disabled
                  value={currentUser || 'Telecaller'}
                  className="text-xs bg-slate-50"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-800 block mb-1">
                Call Notes / Remarks
              </Label>
              <textarea
                rows={2}
                placeholder="Key discussion points, salary expectations, role preference..."
                value={callNote}
                onChange={e => setCallNote(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Auto Follow-up section for Unanswered or Callback */}
            {['No Answer', 'Busy', 'SwitchOff', 'Call Back Later'].includes(callOutcome) && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="autoFollowupToggle"
                    checked={createFollowupOnCall}
                    onChange={e => setCreateFollowupOnCall(e.target.checked)}
                    className="rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <label htmlFor="autoFollowupToggle" className="text-xs font-semibold text-amber-900">
                    Schedule Next-Day Follow-up Reminder
                  </label>
                </div>
                {createFollowupOnCall && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <Label className="text-[11px] text-amber-800 block mb-0.5">Date</Label>
                      <input
                        type="date"
                        value={autoFollowupDate}
                        onChange={e => setAutoFollowupDate(e.target.value)}
                        className="w-full border border-amber-300 rounded p-1.5 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-amber-800 block mb-0.5">Time</Label>
                      <input
                        type="time"
                        value={autoFollowupTime}
                        onChange={e => setAutoFollowupTime(e.target.value)}
                        className="w-full border border-amber-300 rounded p-1.5 text-xs bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button type="button" variant="secondary" onClick={() => setCallModalLead(null)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleSaveCallLog}>
                Save Call Log
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 2. Schedule Follow-up Modal */}
      {followupModalLead && (
        <Modal
          isOpen={Boolean(followupModalLead)}
          onClose={() => setFollowupModalLead(null)}
          title={`Schedule Follow-up: ${followupModalLead.name}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold text-slate-800 block mb-1">
                Follow-up Title *
              </Label>
              <Input
                type="text"
                value={followupTitle}
                onChange={e => setFollowupTitle(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">Due Date *</Label>
                <input
                  type="date"
                  value={followupDate}
                  onChange={e => setFollowupDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">Priority</Label>
                <select
                  value={followupPriority}
                  onChange={e => setFollowupPriority(e.target.value as any)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-800 block mb-1">
                Assigned Employee
              </Label>
              <select
                value={followupAssignee}
                onChange={e => setFollowupAssignee(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
              >
                <option value="">Unassigned (My Task)</option>
                {USERS.map(u => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-800 block mb-1">Notes</Label>
              <textarea
                rows={2}
                placeholder="What needs to be discussed or sent..."
                value={followupNote}
                onChange={e => setFollowupNote(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button type="button" variant="secondary" onClick={() => setFollowupModalLead(null)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleSaveFollowup}>
                Schedule Task
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 3. Convert to Candidate Modal */}
      {convertModalLead && (
        <Modal
          isOpen={Boolean(convertModalLead)}
          onClose={() => setConvertModalLead(null)}
          title={`Convert Lead to Candidate: ${convertModalLead.name}`}
          maxWidth="xl"
        >
          <div className="space-y-4">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
              <p className="font-semibold">Atomic Lead Conversion</p>
              <p className="text-[11px] mt-0.5">
                This will create a full Candidate record with compatible fields while preserving the
                original lead and its call history. If a candidate with this mobile already exists, it
                will link safely.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <Label className="block mb-1">Full Name</Label>
                <Input
                  value={convertOverrides.name || ''}
                  onChange={e => setConvertOverrides({ ...convertOverrides, name: e.target.value })}
                  className="text-xs"
                />
              </div>
              <div>
                <Label className="block mb-1">Mobile (Locked)</Label>
                <Input value={convertModalLead.mobile} disabled className="text-xs bg-slate-50 font-mono" />
              </div>

              <div>
                <Label className="block mb-1">Email</Label>
                <Input
                  value={convertOverrides.email || ''}
                  onChange={e => setConvertOverrides({ ...convertOverrides, email: e.target.value })}
                  className="text-xs"
                />
              </div>
              <div>
                <Label className="block mb-1">Location</Label>
                <Input
                  value={convertOverrides.location || ''}
                  onChange={e => setConvertOverrides({ ...convertOverrides, location: e.target.value })}
                  className="text-xs"
                />
              </div>

              <div>
                <Label className="block mb-1">Experience (Years)</Label>
                <Input
                  type="number"
                  value={convertOverrides.experience ?? ''}
                  onChange={e =>
                    setConvertOverrides({
                      ...convertOverrides,
                      experience: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="text-xs"
                />
              </div>
              <div>
                <Label className="block mb-1">Expected Monthly Salary (₹)</Label>
                <Input
                  type="number"
                  value={convertOverrides.expected_salary ?? ''}
                  onChange={e =>
                    setConvertOverrides({
                      ...convertOverrides,
                      expected_salary: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="text-xs"
                />
              </div>

              <div>
                <Label className="block mb-1">Qualification</Label>
                <Input
                  value={convertOverrides.qualification || ''}
                  onChange={e =>
                    setConvertOverrides({ ...convertOverrides, qualification: e.target.value })
                  }
                  className="text-xs"
                />
              </div>
              <div>
                <Label className="block mb-1">Notice Period</Label>
                <Input
                  value={convertOverrides.notice_period || ''}
                  onChange={e =>
                    setConvertOverrides({ ...convertOverrides, notice_period: e.target.value })
                  }
                  className="text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button type="button" variant="secondary" onClick={() => setConvertModalLead(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleExecuteConversion}
                disabled={isConverting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isConverting ? 'Converting...' : 'Confirm Conversion'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 4. Reassign Employee Modal */}
      {reassignModalLead && (
        <Modal
          isOpen={Boolean(reassignModalLead)}
          onClose={() => setReassignModalLead(null)}
          title={`Reassign Lead: ${reassignModalLead.name}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold text-slate-800 block mb-1">
                Select Assignee *
              </Label>
              <select
                value={newAssigneeId}
                onChange={e => setNewAssigneeId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-xs bg-white"
              >
                <option value="">Unassigned (Open Pool)</option>
                {USERS.map(u => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-800 block mb-1">
                Reason for Reassignment (Audit Log)
              </Label>
              <textarea
                rows={2}
                placeholder="e.g. Territory change, workload balancing..."
                value={reassignReason}
                onChange={e => setReassignReason(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button type="button" variant="secondary" onClick={() => setReassignModalLead(null)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleSaveReassignment}>
                Save Reassignment
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 5. Reactivate Modal */}
      {reactivateLead && (
        <Modal
          isOpen={Boolean(reactivateLead)}
          onClose={() => setReactivateLead(null)}
          title={`Reactivate Lead: ${reactivateLead.name}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              Reactivating this lead will move it back to the active Warm leads pipeline. Existing call
              history will remain intact, and the lead will NOT become a Hot lead again.
            </p>

            <div>
              <Label className="text-xs font-semibold text-slate-800 block mb-1">
                Reactivation Reason *
              </Label>
              <textarea
                rows={3}
                placeholder="e.g. Candidate called back with renewed interest..."
                value={reactivateReason}
                onChange={e => setReactivateReason(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button type="button" variant="secondary" onClick={() => setReactivateLead(null)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleExecuteReactivation}>
                Confirm Reactivation
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 6. Lead Details Drawer / Modal */}
      {selectedLead && (
        <Modal
          isOpen={Boolean(selectedLead)}
          onClose={() => setSelectedLead(null)}
          title={`Lead Profile: ${selectedLead.name}`}
          maxWidth="2xl"
        >
          <div className="space-y-5">
            {/* Header badges */}
            <div className="flex items-center justify-between pb-3 border-b">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedLead.name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedLead.mobile}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="neutral">{selectedLead.source}</Badge>
                <Badge
                  variant={
                    selectedLead.category === 'Converted'
                      ? 'success'
                      : selectedLead.category === 'Rejected'
                      ? 'danger'
                      : 'primary'
                  }
                >
                  {selectedLead.category}
                </Badge>
              </div>
            </div>

            {/* Profile Fields Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl">
              <div>
                <span className="text-slate-400 block">Experience</span>
                <span className="font-semibold text-slate-800">
                  {selectedLead.experience !== null ? `${selectedLead.experience} years` : '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Location</span>
                <span className="font-semibold text-slate-800">{selectedLead.location || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Expected Salary</span>
                <span className="font-semibold text-slate-800">
                  {selectedLead.expected_salary ? `₹${selectedLead.expected_salary.toLocaleString()}` : '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Qualification</span>
                <span className="font-semibold text-slate-800">{selectedLead.qualification || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Current Role</span>
                <span className="font-semibold text-slate-800">{selectedLead.last_role || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Notice Period</span>
                <span className="font-semibold text-slate-800">{selectedLead.notice_period || '—'}</span>
              </div>
            </div>

            {/* Categories & Skills */}
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Categories & Skills
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {selectedLead.skills && selectedLead.skills.length > 0 ? (
                  selectedLead.skills.map(s => (
                    <span
                      key={s}
                      className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium border border-blue-200"
                    >
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400 text-xs italic">No categories assigned</span>
                )}
              </div>
            </div>

            {/* Calling Timeline */}
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-2">
                Calling Timeline ({leadCallsMap.get(selectedLead.id)?.length || 0} attempts)
              </Label>
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {leadCallsMap.get(selectedLead.id)?.map(call => (
                  <div key={call.id} className="p-2.5 text-xs flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            call.call_type === 'Connected'
                              ? 'success'
                              : call.call_type === 'Not Interested'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {call.call_type}
                        </Badge>
                        <span className="text-slate-600 font-medium">{call.telecaller_name}</span>
                        <span className="text-slate-400 text-[11px]">({call.duration}s)</span>
                      </div>
                      {call.note && <p className="text-slate-600 mt-1 italic">{call.note}</p>}
                    </div>
                    <span className="text-slate-400 text-[11px] whitespace-nowrap">
                      {format(parseISO(call.timestamp), 'dd MMM yyyy, hh:mm a')}
                    </span>
                  </div>
                ))}
                {(!leadCallsMap.get(selectedLead.id) ||
                  leadCallsMap.get(selectedLead.id)!.length === 0) && (
                  <div className="p-4 text-center text-slate-400 text-xs italic">
                    No calls recorded yet (Hot Lead).
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions in Drawer */}
            <div className="flex justify-between items-center pt-3 border-t">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  const l = selectedLead;
                  setSelectedLead(null);
                  handleOpenCallModal(l);
                }}
                className="flex items-center gap-1.5"
              >
                <PhoneCall className="w-3.5 h-3.5" /> Log Call
              </Button>

              <Button size="sm" variant="secondary" onClick={() => setSelectedLead(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 7. Manual Add Lead Modal */}
      {isAddOpen && (
        <Modal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          title="Add New Lead Manually"
          maxWidth="2xl"
        >
          <form onSubmit={handleCreateManualLead} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <Label className="block mb-1">Full Name *</Label>
                <Input
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={newLeadName}
                  onChange={e => setNewLeadName(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <Label className="block mb-1">Mobile Number (10 digits) *</Label>
                <Input
                  required
                  placeholder="9876543210"
                  value={newLeadMobile}
                  onChange={e => setNewLeadMobile(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>

              <div>
                <Label className="block mb-1">Email</Label>
                <Input
                  type="email"
                  placeholder="ramesh@example.com"
                  value={newLeadEmail}
                  onChange={e => setNewLeadEmail(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <Label className="block mb-1">Acquisition Source</Label>
                <select
                  value={newLeadSource}
                  onChange={e => setNewLeadSource(e.target.value as LeadSource)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
                >
                  {SOURCE_OPTIONS.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="block mb-1">Categories / Skills (comma separated)</Label>
                <Input
                  placeholder="Accountant, Tally, Excel"
                  value={newLeadSkills}
                  onChange={e => setNewLeadSkills(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <Label className="block mb-1">Location / City</Label>
                <Input
                  placeholder="Raipur, Bilaspur..."
                  value={newLeadLocation}
                  onChange={e => setNewLeadLocation(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <Label className="block mb-1">Experience (Years)</Label>
                <Input
                  type="number"
                  placeholder="2.5"
                  value={newLeadExp}
                  onChange={e => setNewLeadExp(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <Label className="block mb-1">Expected Monthly Salary (₹)</Label>
                <Input
                  type="number"
                  placeholder="25000"
                  value={newLeadExpSal}
                  onChange={e => setNewLeadExpSal(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <Label className="block mb-1">Qualification</Label>
                <Input
                  placeholder="B.Com, MBA..."
                  value={newLeadQual}
                  onChange={e => setNewLeadQual(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <Label className="block mb-1">Current Role / Designation</Label>
                <Input
                  placeholder="Junior Accountant"
                  value={newLeadRole}
                  onChange={e => setNewLeadRole(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="block mb-1">Initial Notes</Label>
              <textarea
                rows={2}
                placeholder="Walk-in notes or background..."
                value={newLeadNotes}
                onChange={e => setNewLeadNotes(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button type="button" variant="secondary" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save & Add to Hot Leads
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* 8. Bulk Lead Import Modal */}
      <LeadImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={() => {
          setActiveTab('hot');
        }}
      />
    </div>
  );
}
