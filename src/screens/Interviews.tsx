import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Badge, Button, CardSkeleton, Modal, Input, Label } from '../components/ui';
import { CheckCircle, XCircle, Clock, Calendar, Briefcase, Plus, UserCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Interview } from '../types';
import { scheduleInterviewWithApplication } from '../lib/pipelineHelpers';

const getStatusColor = (s: string) => {
  switch (s) {
    case 'Scheduled': return 'bg-blue-100 text-blue-700';
    case 'Selected': return 'bg-emerald-100 text-emerald-800';
    case 'NoShow': return 'bg-red-100 text-red-700';
    case 'Done': return 'bg-slate-100 text-slate-700';
    default: return 'bg-slate-100 text-slate-700';
  }
};

const getStatusBorderColor = (s: string) => {
  switch (s) {
    case 'Scheduled': return 'border-blue-300';
    case 'Selected': return 'border-emerald-400';
    case 'NoShow': return 'border-red-300';
    case 'Done': return 'border-slate-300';
    default: return 'border-slate-300';
  }
};

export default function Interviews() {
  const { interviews, candidates, jobs, applications, loading, insert, update } = useData();
  const { currentUser } = useUser();
  const [filter, setFilter] = useState<'All' | 'Scheduled' | 'Selected' | 'Done' | 'NoShow'>('All');
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  const filteredInterviews = interviews.filter((i) => {
    if (filter === 'All') return true;
    return i.status === filter;
  });

  const updateInterviewStatus = async (id: string, status: Interview['status']) => {
    try {
      await update('interviews', { id, status });

      if (status === 'Selected') {
        const targetInterview = interviews.find((i) => i.id === id);
        if (targetInterview) {
          const linkedApp = applications.find(
            (a) =>
              a.id === targetInterview.application_id ||
              (a.candidate_id === targetInterview.candidate_id &&
                a.job_id === targetInterview.job_id &&
                a.is_active !== false)
          );
          if (
            linkedApp &&
            linkedApp.stage !== 'Selected' &&
            linkedApp.stage !== 'Joined' &&
            linkedApp.stage !== 'Placed'
          ) {
            await update('applications', { id: linkedApp.id, stage: 'Selected' });
          }
        }

        toast.success(
          'Candidate selected & pipeline stage updated! (Candidate is not Placed until joining is confirmed)',
          { duration: 4500 }
        );
      } else {
        toast.success(`Interview marked as ${status}`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Status update failed');
    }
  };

  const handleCreateInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidateId || !selectedJobId || !scheduledTime) {
      toast.error('Please select candidate, job and interview time');
      return;
    }

    try {
      const result = await scheduleInterviewWithApplication({
        candidateId: selectedCandidateId,
        jobId: selectedJobId,
        scheduledTime,
        currentUser,
        existingApplications: applications,
        insert,
        update,
      });

      if (result.applicationCreated) {
        toast.success('Application created in pipeline & interview scheduled!');
      } else {
        toast.success('Interview scheduled and linked to existing application!');
      }
      setIsScheduleOpen(false);
      setSelectedCandidateId('');
      setSelectedJobId('');
      setScheduledTime('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to schedule interview');
    }
  };

  return (
    <div className="pb-20 p-4 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4 sticky top-0 bg-[#f1f5f9] z-10 py-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Interviews ({filteredInterviews.length})</h1>
          <p className="text-xs text-slate-500">Scheduled interviews & selection pipeline</p>
        </div>
        <Button onClick={() => setIsScheduleOpen(true)} className="flex items-center gap-1 text-xs py-1.5 px-3">
          <Plus size={14} /> Schedule
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-3">
        {(['All', 'Scheduled', 'Selected', 'Done', 'NoShow'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === tab ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div className="space-y-4">
          {filteredInterviews.length === 0 && (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-200">
              <Calendar className="mx-auto text-slate-300 mb-2" size={32} />
              <p className="text-slate-500 text-sm font-medium">No {filter !== 'All' ? filter.toLowerCase() : ''} interviews found.</p>
            </div>
          )}

          {filteredInterviews.map((i) => {
            const cand = candidates.find((c) => c.id === i.candidate_id) || i.candidates;
            const job = jobs.find((j) => j.id === i.job_id) || i.jobs;

            return (
              <div
                key={i.id}
                className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden"
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${getStatusBorderColor(i.status)}`}></div>

                <div className="pl-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800 text-base">{cand?.name || 'Unknown Candidate'}</h3>
                      <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                        <Briefcase size={12} className="text-slate-400" />
                        {job?.role} @ <span className="font-medium text-slate-700">{job?.company_name}</span>
                      </p>
                    </div>
                    <Badge color={getStatusColor(i.status)}>{i.status}</Badge>
                  </div>

                  <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
                    <Clock size={13} className="text-slate-400" />
                    <span>
                      {new Date(i.scheduled_time).toLocaleString('en-IN', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {i.status === 'Scheduled' && (
                    <div className="mt-4 flex gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => updateInterviewStatus(i.id, 'Selected')}
                        className="flex-1 bg-emerald-50 text-emerald-700 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 flex justify-center items-center gap-1 hover:bg-emerald-100"
                      >
                        <CheckCircle size={13} /> Selected
                      </button>
                      <button
                        onClick={() => updateInterviewStatus(i.id, 'NoShow')}
                        className="flex-1 bg-red-50 text-red-600 py-1.5 rounded-lg text-xs font-semibold border border-red-200 flex justify-center items-center gap-1 hover:bg-red-100"
                      >
                        <XCircle size={13} /> No Show
                      </button>
                      <button
                        onClick={() => updateInterviewStatus(i.id, 'Done')}
                        className="flex-1 bg-slate-50 text-slate-700 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-100"
                      >
                        Done
                      </button>
                    </div>
                  )}

                  {i.status === 'Selected' && (
                    <div className="mt-3 p-2 bg-emerald-50/50 rounded-lg border border-emerald-100 text-xs text-emerald-800 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <UserCheck size={14} className="text-emerald-600" />
                        Selected — Pending offer letter & joining
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Schedule Interview Modal */}
      <Modal isOpen={isScheduleOpen} onClose={() => setIsScheduleOpen(false)} title="Schedule New Interview">
        <form onSubmit={handleCreateInterview} className="space-y-3">
          <div>
            <Label>Candidate</Label>
            <select
              value={selectedCandidateId}
              onChange={(e) => setSelectedCandidateId(e.target.value)}
              className="w-full text-xs border rounded-md p-2 bg-white"
              required
            >
              <option value="">Select Candidate...</option>
              {candidates.filter((c) => c.status !== 'Blacklisted').map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.mobile}) - {c.last_role}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Job Opening</Label>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="w-full text-xs border rounded-md p-2 bg-white"
              required
            >
              <option value="">Select Job...</option>
              {jobs.filter((j) => j.status === 'Open').map((j) => (
                <option key={j.id} value={j.id}>
                  {j.role} @ {j.company_name} ({j.location})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Interview Date & Time</Label>
            <Input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full mt-2">
            Confirm & Schedule
          </Button>
        </form>
      </Modal>
    </div>
  );
}