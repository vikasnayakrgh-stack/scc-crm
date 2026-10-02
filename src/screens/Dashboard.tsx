import React from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import {
  Users,
  Briefcase,
  PhoneCall,
  CalendarCheck,
  Clock,
  IndianRupee,
  AlertCircle
} from 'lucide-react';
import { isSameDay, isPast, parseISO } from 'date-fns';

const StatCard = ({
  icon: Icon,
  label,
  value,
  subtext,
  color
}: {
  icon: any;
  label: string;
  value: string | number;
  subtext?: string;
  color: string;
}) => (
  <div className="bg-white p-3.5 rounded-xl shadow-sm border border-slate-100 flex items-center gap-3">
    <div className={`p-2.5 rounded-lg ${color} text-white shrink-0`}>
      <Icon size={20} />
    </div>
    <div className="min-w-0">
      <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider truncate">{label}</p>
      <p className="text-xl font-bold text-slate-800 leading-tight">{value}</p>
      {subtext && <p className="text-[10px] text-slate-400 truncate">{subtext}</p>}
    </div>
  </div>
);

export default function Dashboard() {
  const { candidates, jobs, interviews, callLogs, tasks, payments } = useData();
  const { currentUser } = useUser();
  const now = new Date();

  // 1. Actual calls made today (date-aware, year-aware)
  const todayCalls = callLogs.filter((c) => {
    try {
      return isSameDay(parseISO(c.timestamp), now);
    } catch {
      return false;
    }
  });
  const myTodayCalls = todayCalls.filter((c) => c.telecaller_name === currentUser).length;

  // 2. Today's interviews (strictly date and year aware)
  const todayInterviewsList = interviews.filter((i) => {
    try {
      return isSameDay(parseISO(i.scheduled_time), now) && i.status === 'Scheduled';
    } catch {
      return false;
    }
  });

  // 3. Open Jobs (strictly active and open)
  const openJobsCount = jobs.filter((j) => j.status === 'Open' && j.is_active !== false).length;

  // 4. Selections vs Placements
  const selectedCount = interviews.filter((i) => i.status === 'Selected').length;
  const placedCount = candidates.filter((c) => c.status === 'Placed').length;

  // 5. Follow-ups Due & Overdue
  const pendingTasks = tasks.filter((t) => t.status === 'Pending');
  const overdueTasks = pendingTasks.filter((t) => {
    try {
      return isPast(parseISO(t.due_date)) && !isSameDay(parseISO(t.due_date), now);
    } catch {
      return false;
    }
  });

  // 6. Financial metrics
  const totalCollections = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const pendingReceivables = payments
    .filter((p) => p.status === 'Pending')
    .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  return (
    <div className="p-4 pb-20 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Namaste, {currentUser} 👋</h1>
          <p className="text-xs text-slate-500">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        {overdueTasks.length > 0 && (
          <div className="bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
            <AlertCircle size={13} /> {overdueTasks.length} Overdue
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={PhoneCall}
          label="Today's Calls"
          value={myTodayCalls}
          subtext={`Team: ${todayCalls.length}`}
          color="bg-blue-600"
        />
        <StatCard
          icon={CalendarCheck}
          label="Interviews Today"
          value={todayInterviewsList.length}
          subtext="Scheduled"
          color="bg-purple-600"
        />
        <StatCard
          icon={Briefcase}
          label="Active Jobs"
          value={openJobsCount}
          subtext={`Total: ${jobs.length}`}
          color="bg-emerald-600"
        />
        <StatCard
          icon={Users}
          label="Candidates"
          value={candidates.length}
          subtext={`${placedCount} Placed`}
          color="bg-orange-500"
        />
      </div>

      {/* Secondary Financial & Pipeline Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 font-bold uppercase">Selected vs Placed</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold text-emerald-700">{selectedCount}</span>
            <span className="text-xs text-slate-400">Selected /</span>
            <span className="text-base font-bold text-blue-700">{placedCount}</span>
            <span className="text-xs text-slate-400">Placed</span>
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 font-bold uppercase">Total Collections</p>
          <p className="text-lg font-bold text-slate-800 mt-1 flex items-center">
            <IndianRupee size={15} />
            {totalCollections.toLocaleString('en-IN')}
          </p>
          {pendingReceivables > 0 && (
            <p className="text-[10px] text-amber-600 font-medium">Due: ₹{pendingReceivables.toLocaleString('en-IN')}</p>
          )}
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-[10px] text-slate-400 font-bold uppercase">Pending Follow-ups</p>
          <p className="text-lg font-bold text-amber-600 mt-1 flex items-center gap-1">
            <Clock size={15} />
            {pendingTasks.length} Tasks
          </p>
        </div>
      </div>

      {/* Today's Schedule */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
          <CalendarCheck size={16} className="text-blue-600" />
          Today's Scheduled Interviews ({todayInterviewsList.length})
        </h3>
        <div className="space-y-2">
          {todayInterviewsList.map((i) => {
            const cand = candidates.find((c) => c.id === i.candidate_id) || i.candidates;
            const job = jobs.find((j) => j.id === i.job_id) || i.jobs;
            return (
              <div
                key={i.id}
                className="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg text-xs"
              >
                <div>
                  <p className="font-semibold text-slate-800">{cand?.name || 'Candidate'}</p>
                  <p className="text-slate-500 text-[11px]">
                    {job?.role} @ {job?.company_name}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-medium text-blue-700">
                    {new Date(i.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
          {todayInterviewsList.length === 0 && (
            <p className="text-xs text-slate-400 py-2">No interviews scheduled for today.</p>
          )}
        </div>
      </div>

      {/* Recent Calls */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
          <PhoneCall size={16} className="text-slate-600" /> Recent Calling Activity
        </h3>
        <div className="space-y-2">
          {callLogs.slice(0, 6).map((log) => {
            const cand = candidates.find((c) => c.id === log.candidate_id) || log.candidates;
            return (
              <div
                key={log.id}
                className="flex justify-between items-center text-xs pb-2 border-b border-slate-50 last:border-0"
              >
                <div>
                  <span className="font-medium text-slate-700">{cand?.name || 'Unknown'}</span>
                  <p className="text-[11px] text-slate-400">
                    by {log.telecaller_name} •{' '}
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    log.call_type === 'Connected'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {log.call_type}
                </span>
              </div>
            );
          })}
          {callLogs.length === 0 && <p className="text-xs text-slate-400">No calls recorded yet.</p>}
        </div>
      </div>
    </div>
  );
}