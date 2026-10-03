import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { useAuth } from '../context/AuthContext';
import {
  PhoneCall,
  CalendarCheck,
  Briefcase,
  GitCommit,
  CheckSquare,
  Users,
  IndianRupee,
  Clock,
  AlertCircle,
  Plus,
  Phone,
  MessageCircle,
  ChevronRight,
  TrendingUp,
  UserCheck,
  CheckCircle2,
  Building2,
  Calendar,
  ArrowUpRight,
  Sparkles,
  Search,
  Filter
} from 'lucide-react';
import { isSameDay, isPast, parseISO, format } from 'date-fns';
import { Button, Input, Modal, Label, Badge, Card, EmptyState } from '../components/ui';
import { toast } from 'react-hot-toast';
import { FollowUpTask, ApplicationStage, USERS } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    candidates,
    employers,
    jobs,
    interviews,
    callLogs,
    tasks,
    payments,
    applications,
    insert,
    update
  } = useData();
  const { currentUser, appRole, displayName } = useUser();
  const { isAdmin, isManager, isRecruiter } = useAuth();

  const now = new Date();

  // Role permissions helpers
  const isAdminOrManager = isAdmin || isManager || appRole === 'admin' || appRole === 'manager' || currentUser === 'Admin';
  const isTelecallerRole = currentUser.toLowerCase().includes('telecaller');

  // Dashboard Modals
  const [isLogCallOpen, setIsLogCallOpen] = useState(false);
  const [isQuickTaskOpen, setIsQuickTaskOpen] = useState(false);

  // Quick Call form state
  const [callCandidateId, setCallCandidateId] = useState('');
  const [callType, setCallType] = useState('Connected');
  const [callNote, setCallNote] = useState('');
  const [isSubmittingCall, setIsSubmittingCall] = useState(false);

  // Quick Task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(format(now, 'yyyy-MM-dd'));
  const [taskEntityId, setTaskEntityId] = useState('');
  const [taskPriority, setTaskPriority] = useState<'Low' | 'Medium' | 'High'>('High');
  const [taskNotes, setTaskNotes] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Follow-up tab filter
  const [followUpTab, setFollowUpTab] = useState<'today' | 'overdue' | 'upcoming'>('today');

  // 1. Calling Activity Metrics
  const todayCalls = callLogs.filter((c) => {
    try {
      return isSameDay(parseISO(c.timestamp), now);
    } catch {
      return false;
    }
  });
  const myTodayCalls = todayCalls.filter((c) => c.telecaller_name === currentUser).length;

  // 2. Today's Interviews
  const todayInterviews = interviews.filter((i) => {
    try {
      return isSameDay(parseISO(i.scheduled_time), now) && i.status === 'Scheduled';
    } catch {
      return false;
    }
  });

  // 3. Follow-up Tasks (Due Today, Overdue, Upcoming)
  const pendingTasks = tasks.filter((t) => t.status === 'Pending');

  const overdueTasks = pendingTasks.filter((t) => {
    try {
      const d = parseISO(t.due_date);
      return isPast(d) && !isSameDay(d, now);
    } catch {
      return false;
    }
  });

  const dueTodayTasks = pendingTasks.filter((t) => {
    try {
      return isSameDay(parseISO(t.due_date), now);
    } catch {
      return false;
    }
  });

  const upcomingTasks = pendingTasks.filter((t) => {
    try {
      const d = parseISO(t.due_date);
      return !isPast(d) && !isSameDay(d, now);
    } catch {
      return false;
    }
  });

  // Displayed tasks based on active tab
  const displayedTasks =
    followUpTab === 'overdue'
      ? overdueTasks
      : followUpTab === 'upcoming'
      ? upcomingTasks
      : dueTodayTasks;

  // 4. Job Metrics
  const openJobs = jobs.filter((j) => j.status === 'Open' && j.is_active !== false);

  // 5. Pipeline Stages
  const activeApplications = applications.filter((a) => a.is_active !== false);
  const selectedCount = interviews.filter((i) => i.status === 'Selected').length;
  const placedCandidates = candidates.filter((c) => c.status === 'Placed');

  // Pipeline stage breakdown counts
  const stageCounts: Record<string, number> = {};
  activeApplications.forEach((app) => {
    stageCounts[app.stage] = (stageCounts[app.stage] || 0) + 1;
  });

  const keyPipelineStages: ApplicationStage[] = [
    'Applied',
    'Screening',
    'Shortlisted',
    'Interview Scheduled',
    'Interview Completed',
    'Selected',
    'Placed',
  ];

  // 6. Financial Metrics (for Admin / Manager)
  const totalCollections = payments
    .filter((p) => p.status === 'Paid')
    .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  const pendingReceivables = payments
    .filter((p) => p.status === 'Pending')
    .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  // Dynamic Time-of-day greeting
  const hour = now.getHours();
  const greeting =
    hour < 12
      ? 'Good Morning'
      : hour < 17
      ? 'Good Afternoon'
      : 'Good Evening';

  // Toggle Task Completion
  const handleToggleTask = async (task: FollowUpTask) => {
    try {
      const nextStatus = task.status === 'Completed' ? 'Pending' : 'Completed';
      await update('tasks', {
        id: task.id,
        status: nextStatus,
        completed_at: nextStatus === 'Completed' ? new Date().toISOString() : undefined,
      });
      toast.success(nextStatus === 'Completed' ? 'Task marked complete!' : 'Task reopened');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update task');
    }
  };

  // Quick Log Call Submission
  const handleSubmitQuickCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callCandidateId) {
      toast.error('Please select a candidate');
      return;
    }

    setIsSubmittingCall(true);
    try {
      await insert('call_logs', {
        candidate_id: callCandidateId,
        telecaller_name: currentUser,
        call_type: callType,
        note: callNote.trim() || 'Logged via Dashboard Quick Action',
        timestamp: new Date().toISOString(),
        duration: 0,
      });

      toast.success('Call log recorded successfully!');
      setIsLogCallOpen(false);
      setCallCandidateId('');
      setCallNote('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record call');
    } finally {
      setIsSubmittingCall(false);
    }
  };

  // Quick Task Submission
  const handleSubmitQuickTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle || !taskDueDate) {
      toast.error('Task title and due date are required');
      return;
    }

    setIsSubmittingTask(true);
    try {
      await insert('tasks', {
        title: taskTitle.trim(),
        due_date: taskDueDate,
        entity_type: 'candidate',
        entity_id: taskEntityId || 'general',
        assigned_to: currentUser,
        priority: taskPriority,
        notes: taskNotes.trim() || undefined,
        status: 'Pending',
        is_active: true,
      });

      toast.success('Follow-up task scheduled!');
      setIsQuickTaskOpen(false);
      setTaskTitle('');
      setTaskNotes('');
      setTaskEntityId('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to schedule task');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  // Quick trigger candidate call
  const triggerCandidateCall = async (cand: any) => {
    if (!cand?.mobile) return;
    window.open(`tel:${cand.mobile}`, '_self');
    try {
      await insert('call_logs', {
        candidate_id: cand.id,
        telecaller_name: currentUser,
        call_type: 'Connected',
        timestamp: new Date().toISOString(),
        duration: 0,
        note: 'Direct call from Dashboard queue',
      });
      toast.success(`Calling ${cand.name}... Log saved.`);
    } catch (e: any) {
      console.warn('Auto call-log note:', e);
    }
  };

  const triggerCandidateWhatsApp = (cand: any) => {
    if (!cand?.mobile) return;
    const msg = `Namaste ${cand.name}, Shree Career Consultancy (SCC) se hum aapke profile aur open job opportunities ke regarding connect karna chahte hain.`;
    window.open(`https://wa.me/91${cand.mobile.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* ─── SECTION A: WELCOME BANNER & QUICK ACTIONS ──────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 md:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">
              {greeting}, {displayName || currentUser}
            </span>
            <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200/60 capitalize">
              {appRole || (currentUser === 'Admin' ? 'Admin' : 'Recruiter')}
            </span>
          </div>

          <p className="text-xs md:text-sm text-slate-500 font-medium">
            {format(now, 'EEEE, d MMMM yyyy')} •{' '}
            <span className="text-slate-700">
              {todayInterviews.length > 0
                ? `${todayInterviews.length} interview${todayInterviews.length > 1 ? 's' : ''} scheduled today`
                : 'No interviews today'}
              {dueTodayTasks.length > 0
                ? `, ${dueTodayTasks.length} follow-up${dueTodayTasks.length > 1 ? 's' : ''} due`
                : ''}
              {overdueTasks.length > 0 ? ` (${overdueTasks.length} overdue)` : ''}.
            </span>
          </p>
        </div>

        {/* Action-Oriented Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsLogCallOpen(true)}
            className="text-xs"
          >
            <PhoneCall size={14} className="text-blue-600" />
            <span>Log Call</span>
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsQuickTaskOpen(true)}
            className="text-xs"
          >
            <CheckSquare size={14} className="text-amber-600" />
            <span>Create Follow-up</span>
          </Button>

          {isAdminOrManager && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate('/jobs')}
              className="text-xs"
            >
              <Briefcase size={14} className="text-emerald-600" />
              <span>Post Job</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="primary"
            onClick={() => navigate('/candidates')}
            className="text-xs"
          >
            <Plus size={14} />
            <span>Add Candidate</span>
          </Button>
        </div>
      </div>

      {/* ─── SECTION B: 5 ACTIONABLE KPI CARDS ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* KPI 1: Calls Today */}
        <Card
          onClick={() => setFollowUpTab('today')}
          className="p-4 hover:border-blue-300 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Calls Today
            </span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <PhoneCall size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {myTodayCalls}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              / {todayCalls.length} team
            </span>
          </div>
          <p className="text-[11px] text-blue-600 font-semibold mt-1 flex items-center gap-1">
            <span>Outbound activity</span>
            <ArrowUpRight size={12} />
          </p>
        </Card>

        {/* KPI 2: Follow-ups Due */}
        <Card
          onClick={() => navigate('/tasks')}
          className="p-4 hover:border-amber-300 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Follow-ups Due
            </span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <CheckSquare size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {dueTodayTasks.length}
            </span>
            {overdueTasks.length > 0 && (
              <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">
                {overdueTasks.length} overdue
              </span>
            )}
          </div>
          <p className="text-[11px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
            <span>Work queue items</span>
            <ArrowUpRight size={12} />
          </p>
        </Card>

        {/* KPI 3: Interviews Today */}
        <Card
          onClick={() => navigate('/interviews')}
          className="p-4 hover:border-purple-300 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Interviews Today
            </span>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <CalendarCheck size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {todayInterviews.length}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">Scheduled</span>
          </div>
          <p className="text-[11px] text-purple-700 font-semibold mt-1 flex items-center gap-1">
            <span>Candidate meetings</span>
            <ArrowUpRight size={12} />
          </p>
        </Card>

        {/* KPI 4: Active Jobs */}
        <Card
          onClick={() => navigate('/jobs')}
          className="p-4 hover:border-emerald-300 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Active Jobs
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Briefcase size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {openJobs.length}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              / {jobs.length} total
            </span>
          </div>
          <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
            <span>Open client mandates</span>
            <ArrowUpRight size={12} />
          </p>
        </Card>

        {/* KPI 5: Candidates in Pipeline */}
        <Card
          onClick={() => navigate('/applications')}
          className="p-4 hover:border-indigo-300 transition-all group col-span-2 sm:col-span-1"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              In Pipeline
            </span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <GitCommit size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {activeApplications.length}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              ({candidates.length} pool)
            </span>
          </div>
          <p className="text-[11px] text-indigo-700 font-semibold mt-1 flex items-center gap-1">
            <span>Active hiring tracks</span>
            <ArrowUpRight size={12} />
          </p>
        </Card>
      </div>

      {/* ─── SECTION C & D: MAIN WORKSPACE TWO-COLUMN SPLIT ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Priority Follow-ups & Recruitment Pipeline (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* SECTION C: TODAY'S PRIORITY FOLLOW-UPS */}
          <Card className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
                  <CheckSquare size={18} className="text-blue-600" />
                  Priority Follow-ups & Work Queue
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  High-priority callbacks and daily telecaller action items
                </p>
              </div>

              {/* Follow-up Tabs */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs self-start sm:self-auto">
                <button
                  onClick={() => setFollowUpTab('today')}
                  className={`px-3 py-1 rounded-md font-semibold transition-all ${
                    followUpTab === 'today'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Today ({dueTodayTasks.length})
                </button>
                <button
                  onClick={() => setFollowUpTab('overdue')}
                  className={`px-3 py-1 rounded-md font-semibold transition-all ${
                    followUpTab === 'overdue'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Overdue ({overdueTasks.length})
                </button>
                <button
                  onClick={() => setFollowUpTab('upcoming')}
                  className={`px-3 py-1 rounded-md font-semibold transition-all ${
                    followUpTab === 'upcoming'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Upcoming ({upcomingTasks.length})
                </button>
              </div>
            </div>

            {/* Task Item List */}
            <div className="divide-y divide-slate-100 mt-2">
              {displayedTasks.slice(0, 7).map((task) => {
                const linkedCandidate = candidates.find((c) => c.id === task.entity_id);
                const linkedEmployer = employers.find((e) => e.id === task.entity_id);
                const entityName =
                  linkedCandidate?.name || linkedEmployer?.company_name || 'General Follow-up';
                const entityPhone = linkedCandidate?.mobile || linkedEmployer?.phone;

                const isOverdueItem =
                  isPast(parseISO(task.due_date)) && !isSameDay(parseISO(task.due_date), now);

                return (
                  <div
                    key={task.id}
                    className="py-3 flex items-start justify-between gap-3 hover:bg-slate-50/70 p-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        onClick={() => handleToggleTask(task)}
                        className="mt-0.5 text-slate-400 hover:text-blue-600 transition-colors shrink-0"
                        title="Mark task completed"
                      >
                        <div className="w-4 h-4 rounded border-2 border-slate-300 hover:border-blue-600 transition-colors" />
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold text-slate-800 truncate">{task.title}</p>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              task.priority === 'High'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : task.priority === 'Medium'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {task.priority}
                          </span>
                          {isOverdueItem && (
                            <span className="text-[10px] bg-red-100 text-red-800 font-bold px-1.5 py-0.2 rounded">
                              Overdue
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 font-medium">
                          <span className="text-slate-700 font-semibold">{entityName}</span>
                          {entityPhone && <span>• {entityPhone}</span>}
                          <span>• by {task.assigned_to}</span>
                        </div>

                        {task.notes && (
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-1 italic">
                            "{task.notes}"
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Quick Call & Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      {linkedCandidate && (
                        <>
                          <button
                            onClick={() => triggerCandidateCall(linkedCandidate)}
                            className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                            title="Call candidate"
                          >
                            <Phone size={13} />
                          </button>
                          <button
                            onClick={() => triggerCandidateWhatsApp(linkedCandidate)}
                            className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                            title="Send WhatsApp message"
                          >
                            <MessageCircle size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {displayedTasks.length === 0 && (
                <EmptyState
                  icon={CheckCircle2}
                  title="Queue is completely clear!"
                  description={
                    followUpTab === 'overdue'
                      ? 'No overdue follow-up tasks. Great discipline keeping up with deadlines!'
                      : 'No pending follow-ups scheduled for this timeframe.'
                  }
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsQuickTaskOpen(true)}
                      className="text-xs"
                    >
                      <Plus size={13} /> Schedule New Follow-up
                    </Button>
                  }
                  className="py-10"
                />
              )}
            </div>

            {displayedTasks.length > 7 && (
              <div className="pt-3 border-t border-slate-100 text-center">
                <button
                  onClick={() => navigate('/tasks')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                >
                  <span>View all {displayedTasks.length} tasks in Work Queue</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </Card>

          {/* SECTION E: RECRUITMENT PIPELINE FUNNEL & STAGES */}
          <Card className="p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
                  <GitCommit size={18} className="text-indigo-600" />
                  Recruitment Pipeline Funnel
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Live status across all active candidate job applications
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate('/applications')}
                className="text-xs text-blue-600"
              >
                <span>Full Pipeline</span>
                <ChevronRight size={14} />
              </Button>
            </div>

            {/* Stage Progress Funnel */}
            <div className="space-y-3 mt-4">
              {keyPipelineStages.map((stage) => {
                const count = stageCounts[stage] || 0;
                const percentage =
                  activeApplications.length > 0
                    ? Math.round((count / activeApplications.length) * 100)
                    : 0;

                const stageColors: Record<string, { bg: string; fill: string; text: string }> = {
                  Applied: { bg: 'bg-slate-100', fill: 'bg-slate-400', text: 'text-slate-700' },
                  Screening: { bg: 'bg-blue-50', fill: 'bg-blue-500', text: 'text-blue-700' },
                  Shortlisted: { bg: 'bg-indigo-50', fill: 'bg-indigo-500', text: 'text-indigo-700' },
                  'Interview Scheduled': { bg: 'bg-purple-50', fill: 'bg-purple-500', text: 'text-purple-700' },
                  'Interview Completed': { bg: 'bg-amber-50', fill: 'bg-amber-500', text: 'text-amber-700' },
                  Selected: { bg: 'bg-emerald-50', fill: 'bg-emerald-600', text: 'text-emerald-700 font-bold' },
                  Placed: { bg: 'bg-emerald-100', fill: 'bg-emerald-600', text: 'text-emerald-800 font-black' },
                };

                const colors = stageColors[stage] || {
                  bg: 'bg-slate-100',
                  fill: 'bg-slate-500',
                  text: 'text-slate-700',
                };

                return (
                  <div
                    key={stage}
                    onClick={() => navigate('/applications')}
                    className="p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className={`font-semibold ${colors.text}`}>{stage}</span>
                      <span className="font-bold text-slate-700">
                        {count}{' '}
                        <span className="text-[11px] font-normal text-slate-400">
                          ({percentage}%)
                        </span>
                      </span>
                    </div>
                    <div className={`w-full h-2 rounded-full overflow-hidden ${colors.bg}`}>
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${colors.fill}`}
                        style={{ width: `${Math.max(percentage, count > 0 ? 5 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {activeApplications.length === 0 && (
                <EmptyState
                  icon={GitCommit}
                  title="No active pipeline applications"
                  description="Start matching candidates with job openings to populate the pipeline funnel."
                  action={
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => navigate('/candidates')}
                      className="text-xs"
                    >
                      Browse Candidates
                    </Button>
                  }
                  className="py-8"
                />
              )}
            </div>

            {/* Placed Candidates Highlight Bar */}
            {placedCandidates.length > 0 && (
              <div className="mt-4 p-3 bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200/80 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                    ✓
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-900">
                      {placedCandidates.length} Successfully Placed Candidate{placedCandidates.length > 1 ? 's' : ''}!
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      Total recruitment placements completed
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate('/candidates')}
                  className="text-xs border-emerald-300 text-emerald-800"
                >
                  View
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT COLUMN: Scheduled Interviews & Calling Activity (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* SECTION D: TODAY'S SCHEDULED INTERVIEWS */}
          <Card className="p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
                  <CalendarCheck size={18} className="text-purple-600" />
                  Today's Scheduled Interviews
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scheduled candidate-employer interview rounds
                </p>
              </div>
              <span className="text-xs bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full border border-purple-200/60">
                {todayInterviews.length} Today
              </span>
            </div>

            <div className="divide-y divide-slate-100 mt-2 space-y-1">
              {todayInterviews.map((intv) => {
                const cand = candidates.find((c) => c.id === intv.candidate_id) || intv.candidates;
                const job = jobs.find((j) => j.id === intv.job_id) || intv.jobs;

                return (
                  <div
                    key={intv.id}
                    className="py-3 hover:bg-slate-50/80 p-2 rounded-xl transition-colors space-y-2"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-bold text-slate-900">
                          {cand?.name || 'Candidate'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium">
                          {job?.role} @ <span className="text-slate-700 font-semibold">{job?.company_name}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                          {format(parseISO(intv.scheduled_time), 'hh:mm a')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-slate-400 font-medium">{job?.location || 'Raipur'}</span>
                      <div className="flex items-center gap-1.5">
                        {cand?.mobile && (
                          <button
                            onClick={() => window.open(`tel:${cand.mobile}`, '_self')}
                            className="p-1 text-slate-500 hover:text-blue-600"
                            title="Call candidate"
                          >
                            <Phone size={13} />
                          </button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate('/interviews')}
                          className="text-[11px] py-0.5 px-2 text-blue-600"
                        >
                          Details
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {todayInterviews.length === 0 && (
                <EmptyState
                  icon={Calendar}
                  title="No interviews today"
                  description="No candidate interviews currently scheduled for today's schedule."
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate('/interviews')}
                      className="text-xs"
                    >
                      <Plus size={13} /> Schedule Interview
                    </Button>
                  }
                  className="py-8"
                />
              )}
            </div>
          </Card>

          {/* SECTION F: RECENT CALLING ACTIVITY */}
          <Card className="p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
                  <PhoneCall size={18} className="text-blue-600" />
                  Recent Calling Activity
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Latest outreach by telecallers & recruiters
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsLogCallOpen(true)}
                className="text-xs text-blue-600"
              >
                <Plus size={13} /> Log
              </Button>
            </div>

            <div className="divide-y divide-slate-100 mt-2 space-y-1">
              {callLogs.slice(0, 6).map((log) => {
                const cand = candidates.find((c) => c.id === log.candidate_id) || log.candidates;

                return (
                  <div
                    key={log.id}
                    className="py-2.5 flex items-center justify-between text-xs hover:bg-slate-50/80 p-2 rounded-xl transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-slate-800 truncate">
                        {cand?.name || 'Direct Contact'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        by {log.telecaller_name} •{' '}
                        {format(parseISO(log.timestamp), 'hh:mm a, d MMM')}
                      </p>
                      {log.note && (
                        <p className="text-[10px] text-slate-500 italic mt-0.5 truncate">
                          "{log.note}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          log.call_type === 'Connected'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {log.call_type}
                      </span>
                      {cand?.mobile && (
                        <button
                          onClick={() => triggerCandidateCall(cand)}
                          className="p-1 rounded text-slate-400 hover:text-blue-600 transition-colors"
                          title="Call again"
                        >
                          <Phone size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {callLogs.length === 0 && (
                <EmptyState
                  icon={PhoneCall}
                  title="No calls logged yet"
                  description="Log candidate calls to build institutional calling history and follow-up rhythm."
                  action={
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setIsLogCallOpen(true)}
                      className="text-xs"
                    >
                      Log First Call
                    </Button>
                  }
                  className="py-8"
                />
              )}
            </div>
          </Card>

          {/* FINANCIAL SUMMARY (Admin & Manager Role-Gated) */}
          {isAdminOrManager && (
            <Card className="p-5 border-blue-100 bg-gradient-to-br from-white to-blue-50/30">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <IndianRupee size={15} className="text-blue-600" /> Financial Health
                </span>
                <button
                  onClick={() => navigate('/payments')}
                  className="text-xs text-blue-600 font-semibold hover:underline"
                >
                  Billing →
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Total Collections
                  </p>
                  <p className="text-lg font-black text-slate-800 mt-0.5">
                    ₹{totalCollections.toLocaleString('en-IN')}
                  </p>
                  <span className="text-[10px] text-emerald-600 font-semibold">
                    Verified Paid receipts
                  </span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Pending Receivables
                  </p>
                  <p className="text-lg font-black text-amber-700 mt-0.5">
                    ₹{pendingReceivables.toLocaleString('en-IN')}
                  </p>
                  <span className="text-[10px] text-amber-600 font-semibold">
                    Invoices awaiting payment
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ─── QUICK CALL LOG MODAL ────────────────────────────────────────────── */}
      <Modal
        isOpen={isLogCallOpen}
        onClose={() => setIsLogCallOpen(false)}
        title="Quick Log Call Record"
        maxWidth="md"
      >
        <form onSubmit={handleSubmitQuickCall} className="space-y-4 text-xs">
          <div>
            <Label>Select Candidate *</Label>
            <select
              value={callCandidateId}
              onChange={(e) => setCallCandidateId(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">-- Choose Candidate --</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.mobile}) - {c.last_role || 'Candidate'}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Call Outcome</Label>
              <select
                value={callType}
                onChange={(e) => setCallType(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Connected">Connected & Spoke</option>
                <option value="No Answer">No Answer / Ringing</option>
                <option value="Busy">Busy / Disconnected</option>
                <option value="Switched Off">Switched Off</option>
                <option value="Callback Requested">Callback Requested</option>
              </select>
            </div>

            <div>
              <Label>Logged By</Label>
              <input
                type="text"
                value={currentUser}
                disabled
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
              />
            </div>
          </div>

          <div>
            <Label>Call Discussion Notes (Optional)</Label>
            <textarea
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              placeholder="Candidate interest, salary expectation, availability for interview..."
              rows={3}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setIsLogCallOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={isSubmittingCall}
            >
              {isSubmittingCall ? 'Saving...' : 'Record Call Log'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ─── QUICK FOLLOW-UP TASK MODAL ──────────────────────────────────────── */}
      <Modal
        isOpen={isQuickTaskOpen}
        onClose={() => setIsQuickTaskOpen(false)}
        title="Schedule Follow-up Task"
        maxWidth="md"
      >
        <form onSubmit={handleSubmitQuickTask} className="space-y-4 text-xs">
          <div>
            <Label>Task Title *</Label>
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Call back candidate regarding interview confirmation"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Due Date *</Label>
              <Input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Priority</Label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as any)}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="High">High Priority</option>
                <option value="Medium">Medium Priority</option>
                <option value="Low">Low Priority</option>
              </select>
            </div>
          </div>

          <div>
            <Label>Link to Candidate (Optional)</Label>
            <select
              value={taskEntityId}
              onChange={(e) => setTaskEntityId(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- General Task (No specific candidate) --</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.mobile})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Notes & Instructions (Optional)</Label>
            <textarea
              value={taskNotes}
              onChange={(e) => setTaskNotes(e.target.value)}
              placeholder="Key points to discuss during the follow-up..."
              rows={2}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setIsQuickTaskOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={isSubmittingTask}
            >
              {isSubmittingTask ? 'Scheduling...' : 'Schedule Follow-up'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}