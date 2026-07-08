import React from 'react';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabaseClient';
import { Badge, CardSkeleton } from '../components/ui';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Interview } from '../types';

const getStatusColor = (s: string) => {
  switch(s) {
      case 'Scheduled': return 'bg-blue-100 text-blue-700';
      case 'Selected': return 'bg-green-100 text-green-700';
      case 'NoShow': return 'bg-red-100 text-red-700';
      case 'Done': return 'bg-slate-100 text-slate-700';
      default: return 'bg-slate-100 text-slate-700';
  }
};

const getStatusBorderColor = (s: string) => {
  switch(s) {
      case 'Scheduled': return 'border-blue-300';
      case 'Selected': return 'border-green-300';
      case 'NoShow': return 'border-red-300';
      case 'Done': return 'border-slate-300';
      default: return 'border-slate-300';
  }
};

export default function Interviews() {
  const { interviews, loading } = useData();

  const updateStatus = async (id: string, status: Interview['status']) => {
    try {
      const { error } = await supabase.from('interviews').update({ status }).eq('id', id);
      if (error) throw error;

      if (status === 'Selected') {
        // Find the interview first
        const interview = interviews.find(i => i.id === id);
        if (!interview) {
          toast.error('Interview not found');
          return;
        }
        
        // Update candidate status in same transaction-like flow
        const { error: candError } = await supabase.from('candidates').update({ status: 'Placed' }).eq('id', interview.candidate_id);
        if (candError) throw candError;

        toast((t) => (
          <div className="flex items-center gap-2">
            💰 <b>Candidate Selected!</b> <br/> Collection due in 30 days.
          </div>
        ), { duration: 5000, icon: '🎉' });
      } else {
        toast.success(`Status updated to ${status}`);
      }
    } catch (e) {
      console.error('Update failed:', e);
      toast.error('Update failed');
    }
  };

  return (
    <div className="pb-20 p-4">
      <h1 className="text-xl font-bold text-slate-800 mb-4 sticky top-0 bg-[#f1f5f9] z-10 py-2">Interviews</h1>
     
      {loading ? <div className="space-y-4"><CardSkeleton /><CardSkeleton /></div> : (
        <div className="space-y-4">
            {interviews.length === 0 && <p className="text-center text-slate-500 mt-10">No interviews scheduled.</p>}
            {interviews.map(i => (
                <div key={i.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden">
                    {/* Status Strip */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${getStatusBorderColor(i.status)}`}></div>
                   
                    <div className="pl-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-slate-800">{i.candidates?.name || 'Unknown'}</h3>
                                <p className="text-sm text-slate-600">{i.jobs?.role} @ {i.jobs?.company_name}</p>
                            </div>
                            <Badge color={getStatusColor(i.status)}>{i.status}</Badge>
                        </div>
                       
                        <div className="flex items-center gap-2 mt-3 text-sm text-slate-500">
                            <Clock size={14} />
                            {new Date(i.scheduled_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>

                        {i.status === 'Scheduled' && (
                            <div className="mt-4 flex gap-2">
                                <button onClick={() => updateStatus(i.id, 'Selected')} className="flex-1 bg-green-50 text-green-600 py-2 rounded-lg text-xs font-bold border border-green-100 flex justify-center items-center gap-1">
                                    <CheckCircle size={14} /> Selected
                                </button>
                                <button onClick={() => updateStatus(i.id, 'NoShow')} className="flex-1 bg-red-50 text-red-600 py-2 rounded-lg text-xs font-bold border border-red-100 flex justify-center items-center gap-1">
                                    <XCircle size={14} /> No Show
                                </button>
                                <button onClick={() => updateStatus(i.id, 'Done')} className="flex-1 bg-slate-50 text-slate-600 py-2 rounded-lg text-xs font-bold border border-slate-200">
                                    Done
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
      )}
    </div>
  );
}