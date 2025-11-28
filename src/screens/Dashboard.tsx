import React from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Users, Briefcase, PhoneCall, CalendarCheck } from 'lucide-react';

const StatCard = ({ icon: Icon, label, value, color }: any) => (
  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
    <div className={`p-3 rounded-lg ${color} text-white`}>
      <Icon size={24} />
    </div>
    <div>
      <p className="text-slate-500 text-xs uppercase font-bold tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  </div>
);

export default function Dashboard() {
  const { candidates, jobs, interviews, callLogs } = useData();
  const { currentUser } = useUser();

  const myCalls = callLogs.filter(c => c.telecaller_name === currentUser).length;
  const todayInterviews = interviews.filter(i => {
    const d = new Date(i.scheduled_time);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && i.status === 'Scheduled';
  }).length;

  return (
    <div className="p-4 pb-20 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Namaste, {currentUser} 👋</h1>
        <p className="text-slate-500">Aaj ka performance update.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard icon={PhoneCall} label="My Calls" value={myCalls} color="bg-blue-500" />
        <StatCard icon={CalendarCheck} label="Interviews Today" value={todayInterviews} color="bg-purple-500" />
        <StatCard icon={Users} label="Total Candidates" value={candidates.length} color="bg-orange-500" />
        <StatCard icon={Briefcase} label="Active Jobs" value={jobs.length} color="bg-green-500" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-bold text-slate-800 mb-3">Recent Calls</h3>
        <div className="space-y-3">
          {callLogs.slice(0, 5).map(log => (
            <div key={log.id} className="flex justify-between items-center text-sm pb-2 border-b border-slate-50 last:border-0">
               <div>
                 <span className="font-medium text-slate-700">{log.candidates?.name || 'Unknown'}</span>
                 <p className="text-xs text-slate-400">{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
               </div>
               <span className="px-2 py-1 bg-slate-50 rounded text-xs text-slate-600">{log.call_type}</span>
            </div>
          ))}
          {callLogs.length === 0 && <p className="text-xs text-slate-400">No calls made yet.</p>}
        </div>
      </div>
    </div>
  );
}