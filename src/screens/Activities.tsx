import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Button, Input, Label } from '../components/ui';
import { toast } from 'react-hot-toast';
import { FileSpreadsheet, History } from 'lucide-react';

export default function Activities() {
  const { callLogs, candidates, jobs, interviews } = useData();
  const [gasUrl, setGasUrl] = useState(localStorage.getItem('scc_gas_url') || '');
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (!gasUrl) {
        toast.error("Google Apps Script URL missing!");
        return;
    }
    setSyncing(true);
    try {
        const payload = { candidates, jobs, interviews, call_logs: callLogs };
        // Using no-cors mode usually for GAS triggers, but for actual response feedback, standard POST is better.
        // However, GAS often has CORS issues. We assume the GAS is deployed correctly as Web App with 'Everyone' access.
        await fetch(gasUrl, {
            method: 'POST',
            mode: 'no-cors', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        localStorage.setItem('scc_gas_url', gasUrl);
        toast.success("Sync command sent to Google Sheet!");
    } catch (e) {
        toast.error("Sync failed.");
    } finally {
        setSyncing(false);
    }
  };

  return (
    <div className="p-4 pb-20">
       <h1 className="text-xl font-bold text-slate-800 mb-4">Settings & Activity</h1>

       {/* Google Sheet Sync Section */}
       <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6">
          <h2 className="font-bold text-slate-700 flex items-center gap-2 mb-2">
            <FileSpreadsheet size={18} className="text-green-600" /> Google Sheet Sync
          </h2>
          <div className="space-y-2">
            <Label>Apps Script URL</Label>
            <Input 
                value={gasUrl} 
                onChange={e => setGasUrl(e.target.value)} 
                placeholder="https://script.google.com/macros/s/..." 
                className="text-xs"
            />
            <Button onClick={handleSync} disabled={syncing} className="w-full mt-2">
                {syncing ? 'Syncing...' : 'Sync Now -> Google Sheet'}
            </Button>
            <p className="text-[10px] text-slate-400">Ensure GAS is deployed as "Web App" with access "Anyone".</p>
          </div>
       </div>

       {/* All Call Logs */}
       <h2 className="font-bold text-slate-700 flex items-center gap-2 mb-2">
            <History size={18} className="text-blue-600" /> Recent Activities
       </h2>
       <div className="space-y-2">
          {callLogs.map(log => (
              <div key={log.id} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex justify-between items-center">
                  <div>
                      <p className="font-medium text-slate-800 text-sm">Called: {log.candidates?.name}</p>
                      <p className="text-xs text-slate-500">by {log.telecaller_name} • {new Date(log.timestamp).toLocaleString()}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${log.call_type === 'Connected' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {log.call_type}
                  </span>
              </div>
          ))}
       </div>
    </div>
  );
}