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
    <div className="p-4 pb-20 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">System & Operational Activity</h1>
        <p className="text-xs text-slate-500">Sync status, audit history, and security controls</p>
      </div>

      {/* Sync & Queue Monitor */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-3">
        <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <RefreshCw size={16} className="text-blue-600" />
          Offline Sync & Storage Engine
        </h2>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 bg-slate-50 rounded-lg">
            <span className="text-slate-400 text-[10px] uppercase font-bold block">Network Mode</span>
            <span className="font-semibold text-slate-700 flex items-center gap-1 mt-0.5">
              {isOffline ? (
                <>
                  <WifiOff size={13} className="text-red-500" /> Offline (Local Queue)
                </>
              ) : (
                <>
                  <CheckCircle size={13} className="text-emerald-500" /> Online
                </>
              )}
            </span>
          </div>

          <div className="p-2.5 bg-slate-50 rounded-lg">
            <span className="text-slate-400 text-[10px] uppercase font-bold block">Pending Mutations</span>
            <span className="font-semibold text-slate-700 mt-0.5 block">
              {pendingCount} item{pendingCount === 1 ? '' : 's'} queued
            </span>
          </div>
        </div>

        {deadLetterCount > 0 && (
          <div className="p-2.5 bg-red-50 text-red-700 rounded-lg text-xs flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldAlert size={15} />
              {deadLetterCount} constraint failure(s) in Dead Letter Queue (isolated from blocking sync)
            </span>
          </div>
        )}

        <Button onClick={() => syncNow()} className="w-full text-xs py-2 flex justify-center items-center gap-1.5">
          <RefreshCw size={13} /> Synchronize Pending Queue Now
        </Button>
      </div>

      {/* Role-Gated Secure Export */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-emerald-600" />
            Controlled Data Export
          </h2>
          <Badge color={isAdmin ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}>
            {isAdmin ? 'Admin Authorized' : 'Export Restricted'}
          </Badge>
        </div>

        <p className="text-xs text-slate-500">
          Unauthenticated public webhook exports have been retired for security compliance. Data export is restricted to authenticated Admin users with sanitized CSV downloads.
        </p>

        {isAdmin ? (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              onClick={() => handleExportCSV('candidates')}
              disabled={exporting}
              className="p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 flex flex-col items-center gap-1"
            >
              <Download size={14} className="text-blue-600" />
              <span>Candidates</span>
            </button>
            <button
              onClick={() => handleExportCSV('jobs')}
              disabled={exporting}
              className="p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 flex flex-col items-center gap-1"
            >
              <Download size={14} className="text-purple-600" />
              <span>Jobs</span>
            </button>
            <button
              onClick={() => handleExportCSV('payments')}
              disabled={exporting}
              className="p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 flex flex-col items-center gap-1"
            >
              <Download size={14} className="text-emerald-600" />
              <span>Payments</span>
            </button>
          </div>
        ) : (
          <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-500 italic">
            You are logged in as {currentUser}. Switch to Admin role in the top header to unlock export privileges.
          </div>
        )}
      </div>

      {/* Recent Activities Audit Feed */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-3">
        <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <History size={16} className="text-blue-600" />
          Recent Call Logs ({callLogs.length})
        </h2>

        <div className="space-y-2">
          {callLogs.slice(0, 10).map((log) => {
            const cand = candidates.find((c) => c.id === log.candidate_id) || log.candidates;
            return (
              <div
                key={log.id}
                className="bg-slate-50 p-2.5 rounded-lg flex justify-between items-center text-xs"
              >
                <div>
                  <p className="font-semibold text-slate-800">{cand?.name || 'Candidate'}</p>
                  <p className="text-[11px] text-slate-400">
                    by {log.telecaller_name} • {new Date(log.timestamp).toLocaleString('en-IN')}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    log.call_type === 'Connected'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {log.call_type}
                </span>
              </div>
            );
          })}
          {callLogs.length === 0 && (
            <p className="text-center text-slate-400 text-xs py-4">No recent calling activities recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
}