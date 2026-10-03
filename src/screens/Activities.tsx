import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Button, Badge } from '../components/ui';
import { toast } from 'react-hot-toast';
import { FileSpreadsheet, History, Download, RefreshCw, ShieldAlert, WifiOff, CheckCircle } from 'lucide-react';

export default function Activities() {
  const { callLogs, candidates, jobs, payments, isOffline, pendingCount, deadLetterCount, syncNow } = useData();
  const { currentUser } = useUser();
  const [exporting, setExporting] = useState(false);

  const isAdmin = currentUser === 'Admin';

  // Secure, role-gated CSV export function
  const handleExportCSV = (type: 'candidates' | 'jobs' | 'payments') => {
    if (!isAdmin) {
      toast.error('Security Restriction: Only Admin can export CRM data.');
      return;
    }

    setExporting(true);
    try {
      let csvContent = '';
      const filename = `scc_${type}_${new Date().toISOString().split('T')[0]}.csv`;

      if (type === 'candidates') {
        const headers = ['ID', 'Registration Date', 'Name', 'Mobile', 'Experience (Yrs)', 'Skills', 'Location', 'Expected Salary', 'Role', 'Status'];
        const rows = candidates.map((c) => [
          c.id,
          new Date(c.created_at).toLocaleDateString('en-IN'),
          `"${(c.name || '').replace(/"/g, '""')}"`,
          c.mobile,
          c.experience,
          `"${(c.skills || []).join(', ')}"`,
          `"${(c.location || '').replace(/"/g, '""')}"`,
          c.expected_salary,
          `"${(c.last_role || '').replace(/"/g, '""')}"`,
          c.status,
        ]);
        csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      } else if (type === 'jobs') {
        const headers = ['ID', 'Date Created', 'Company Name', 'Role', 'Location', 'Min Exp', 'Max Exp', 'Min Salary', 'Max Salary', 'Status'];
        const rows = jobs.map((j) => [
          j.id,
          new Date(j.created_at).toLocaleDateString('en-IN'),
          `"${(j.company_name || '').replace(/"/g, '""')}"`,
          `"${(j.role || '').replace(/"/g, '""')}"`,
          `"${(j.location || '').replace(/"/g, '""')}"`,
          j.min_exp,
          j.max_exp,
          j.salary_min,
          j.salary_max,
          j.status,
        ]);
        csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      } else if (type === 'payments') {
        const headers = ['ID', 'Date', 'Type', 'Amount', 'Payment Method', 'Status', 'Reference No', 'Recorded By'];
        const rows = payments.map((p) => [
          p.id,
          new Date(p.paid_at || p.created_at).toLocaleDateString('en-IN'),
          p.type,
          p.amount,
          p.payment_method,
          p.status,
          `"${(p.reference_no || '').replace(/"/g, '""')}"`,
          p.recorded_by,
        ]);
        csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      }

      // Trigger browser download via Blob
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`${type.toUpperCase()} exported securely.`);
    } catch (e) {
      toast.error('Export failed');
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="pb-20 space-y-5 max-w-6xl mx-auto">
      <div className="sticky top-16 bg-[#f8fafc]/95 backdrop-blur-xs z-10 py-2.5 border-b border-slate-200/60">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">System & Operational Activity</h1>
        <p className="text-xs text-slate-500">Sync status, audit history, calling activity and security controls</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sync & Queue Monitor */}
        <div className="bg-white p-5 rounded-xl shadow-xs border border-slate-200/80 space-y-3.5">
          <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <RefreshCw size={16} className="text-blue-600" />
            Offline Sync & Storage Engine
          </h2>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Network Mode</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1.5 mt-1">
                {isOffline ? (
                  <>
                    <WifiOff size={14} className="text-red-500" /> Offline (Local Queue)
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} className="text-emerald-500" /> Online (Synced)
                  </>
                )}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Pending Mutations</span>
              <span className="font-semibold text-slate-800 mt-1 block">
                {pendingCount} item{pendingCount === 1 ? '' : 's'} queued
              </span>
            </div>
          </div>

          {deadLetterCount > 0 && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs flex items-center justify-between border border-red-100">
              <span className="flex items-center gap-2 font-medium">
                <ShieldAlert size={16} />
                {deadLetterCount} constraint failure(s) in Dead Letter Queue (isolated from blocking sync)
              </span>
            </div>
          )}

          <Button onClick={() => syncNow()} className="w-full text-xs py-2 flex justify-center items-center gap-1.5 shadow-xs">
            <RefreshCw size={13} /> Synchronize Pending Queue Now
          </Button>
        </div>

        {/* Role-Gated Secure Export */}
        <div className="bg-white p-5 rounded-xl shadow-xs border border-slate-200/80 space-y-3.5 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-emerald-600" />
                Controlled Data Export
              </h2>
              <Badge variant={isAdmin ? 'success' : 'neutral'}>
                {isAdmin ? 'Admin Authorized' : 'Export Restricted'}
              </Badge>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Unauthenticated public webhook exports have been retired for security compliance. Data export is restricted to authenticated Admin users with sanitized CSV downloads.
            </p>
          </div>

          {isAdmin ? (
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <button
                onClick={() => handleExportCSV('candidates')}
                disabled={exporting}
                className="p-2.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex flex-col items-center gap-1.5 shadow-2xs"
              >
                <Download size={15} className="text-blue-600" />
                <span>Candidates</span>
              </button>
              <button
                onClick={() => handleExportCSV('jobs')}
                disabled={exporting}
                className="p-2.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex flex-col items-center gap-1.5 shadow-2xs"
              >
                <Download size={15} className="text-purple-600" />
                <span>Jobs</span>
              </button>
              <button
                onClick={() => handleExportCSV('payments')}
                disabled={exporting}
                className="p-2.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex flex-col items-center gap-1.5 shadow-2xs"
              >
                <Download size={15} className="text-emerald-600" />
                <span>Payments</span>
              </button>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-500 italic border border-slate-100">
              You are logged in as {currentUser}. Switch to Admin role in the top header to unlock export privileges.
            </div>
          )}
        </div>
      </div>

      {/* Recent Activities Audit Feed */}
      <div className="bg-white p-5 rounded-xl shadow-xs border border-slate-200/80 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <History size={16} className="text-blue-600" />
            Recent Calling Activity Log
          </h2>
          <span className="text-xs text-slate-400 font-medium">{callLogs.length} total calls recorded</span>
        </div>

        <div className="space-y-2">
          {callLogs.slice(0, 20).map((log) => {
            const cand = candidates.find((c) => c.id === log.candidate_id) || log.candidates;
            return (
              <div
                key={log.id}
                className="bg-slate-50/70 p-3 rounded-xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="font-semibold text-slate-900">{cand?.name || 'Candidate'}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Logged by <span className="font-medium text-slate-600">{log.telecaller_name}</span> • {new Date(log.timestamp).toLocaleString('en-IN')}
                  </p>
                  {log.note && (
                    <p className="text-xs text-slate-600 mt-1 italic">
                      "{log.note}"
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <Badge variant={log.call_type === 'Connected' ? 'success' : 'neutral'}>
                    {log.call_type}
                  </Badge>
                </div>
              </div>
            );
          })}
          {callLogs.length === 0 && (
            <p className="text-center text-slate-400 text-xs py-8">No recent calling activities recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
}