import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Button, Modal, Label, Badge, CardSkeleton, Input } from '../components/ui';
import { Plus, User, Briefcase } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Application, ApplicationStage } from '../types';

const STAGES: ApplicationStage[] = [
  'Applied',
  'Screening',
  'Shortlisted',
  'Employer Submitted',
  'Interview Scheduled',
  'Interview Completed',
  'Selected',
  'Offer',
  'Joined',
  'Placed',
  'Rejected',
  'Withdrawn',
  'On Hold',
];

const getStageBadgeColor = (stage: ApplicationStage) => {
  switch (stage) {
    case 'Placed': return 'bg-emerald-100 text-emerald-800 font-bold';
    case 'Joined': return 'bg-emerald-50 text-emerald-700';
    case 'Selected':
    case 'Offer': return 'bg-blue-100 text-blue-800';
    case 'Interview Scheduled': return 'bg-purple-100 text-purple-700';
    case 'Rejected':
    case 'Withdrawn': return 'bg-red-100 text-red-700';
    case 'On Hold': return 'bg-amber-100 text-amber-800';
    default: return 'bg-slate-100 text-slate-700';
  }
};

export default function Applications() {
  const { applications, candidates, jobs, loading, insert, update } = useData();
  const { currentUser } = useUser();
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [candidateId, setCandidateId] = useState('');
  const [jobId, setJobId] = useState('');
  const [initialStage, setInitialStage] = useState<ApplicationStage>('Applied');
  const [notes, setNotes] = useState('');

  const filteredApps = applications.filter((app) => {
    if (stageFilter === 'All') return true;
    return app.stage === stageFilter;
  });

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateId || !jobId) {
      toast.error('Select candidate and job opening');
      return;
    }

    // Check for duplicate application
    const duplicate = applications.find(
      (a) => a.candidate_id === candidateId && a.job_id === jobId && a.is_active
    );
    if (duplicate) {
      toast.error('This candidate already has an active application for this job opening!');
      return;
    }

    try {
      await insert('applications', {
        candidate_id: candidateId,
        job_id: jobId,
        stage: initialStage,
        notes: notes.trim() || undefined,
        assigned_to: currentUser,
        is_active: true,
      });

      toast.success('Application created in pipeline!');
      setIsNewOpen(false);
      setCandidateId('');
      setJobId('');
      setNotes('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create application');
    }
  };

  const handleStageTransition = async (appId: string, nextStage: ApplicationStage) => {
    try {
      const updates: Partial<Application> = {
        id: appId,
        stage: nextStage,
      };

      if (nextStage === 'Joined') {
        updates.joining_date = new Date().toISOString();
      } else if (nextStage === 'Placed') {
        updates.placed_date = new Date().toISOString();
      }

      await update('applications', updates);

      if (nextStage === 'Placed') {
        // Also update candidate status to Placed
        const app = applications.find((a) => a.id === appId);
        if (app) {
          await update('candidates', { id: app.candidate_id, status: 'Placed' });
        }
        toast.success('🎉 Candidate placed! Remember to generate placement fee invoice in Payments tab.');
      } else {
        toast.success(`Application moved to stage: ${nextStage}`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update pipeline stage');
    }
  };

  return (
    <div className="pb-20 p-4 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-3 sticky top-0 bg-[#f1f5f9] z-10 py-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Recruitment Pipeline ({filteredApps.length})</h1>
          <p className="text-xs text-slate-500">Stage tracking from submission to placement</p>
        </div>
        <Button onClick={() => setIsNewOpen(true)} className="flex items-center gap-1 text-xs py-1.5 px-3">
          <Plus size={14} /> Apply Candidate
        </Button>
      </div>

      {/* Stage scroll filters */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-3">
        {['All', ...STAGES].map((st) => (
          <button
            key={st}
            onClick={() => setStageFilter(st)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              stageFilter === st
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredApps.length === 0 && (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
              No applications in {stageFilter === 'All' ? 'the pipeline' : `"${stageFilter}" stage`}.
            </div>
          )}

          {filteredApps.map((app) => {
            const cand = candidates.find((c) => c.id === app.candidate_id) || app.candidates;
            const job = jobs.find((j) => j.id === app.job_id) || app.jobs;

            return (
              <div
                key={app.id}
                className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                      <User size={14} className="text-slate-400" />
                      {cand?.name || 'Candidate'}
                    </h3>
                    <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                      <Briefcase size={12} className="text-slate-400" />
                      {job?.role} @ <span className="font-semibold text-slate-700">{job?.company_name}</span>
                    </p>
                  </div>
                  <Badge color={getStageBadgeColor(app.stage)}>{app.stage}</Badge>
                </div>

                {app.notes && (
                  <p className="text-xs bg-slate-50 p-2 rounded text-slate-600 italic">
                    "{app.notes}"
                  </p>
                )}

                {/* Pipeline Transition Selector */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-[11px] text-slate-400">
                    Recruiter: {app.assigned_to || 'SCC'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500 font-medium">Move to:</span>
                    <select
                      value={app.stage}
                      onChange={(e) => handleStageTransition(app.id, e.target.value as ApplicationStage)}
                      className="text-xs border rounded px-2 py-1 bg-white font-medium focus:ring-1 focus:ring-blue-500"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Application Modal */}
      <Modal isOpen={isNewOpen} onClose={() => setIsNewOpen(false)} title="Apply Candidate to Job Opening">
        <form onSubmit={handleCreateApplication} className="space-y-3">
          <div>
            <Label>Select Candidate</Label>
            <select
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              className="w-full text-xs border rounded-md p-2 bg-white"
              required
            >
              <option value="">Select Candidate...</option>
              {candidates
                .filter((c) => c.status !== 'Blacklisted')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.mobile}) - {c.last_role} ({c.location})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <Label>Select Job Opening</Label>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full text-xs border rounded-md p-2 bg-white"
              required
            >
              <option value="">Select Job Opening...</option>
              {jobs
                .filter((j) => j.status === 'Open')
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.role} @ {j.company_name} ({j.location})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <Label>Initial Pipeline Stage</Label>
            <select
              value={initialStage}
              onChange={(e) => setInitialStage(e.target.value as ApplicationStage)}
              className="w-full text-xs border rounded-md p-2 bg-white"
            >
              <option value="Applied">Applied (Resume Received)</option>
              <option value="Screening">Screening (Phone Screening)</option>
              <option value="Shortlisted">Shortlisted for Client</option>
              <option value="Employer Submitted">Employer Submitted (Resume Sent to HR)</option>
            </select>
          </div>

          <div>
            <Label>Recruiter Notes (Optional)</Label>
            <Input
              placeholder="e.g. Good communication, ready for immediate interview"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full mt-3">
            Submit Application
          </Button>
        </form>
      </Modal>
    </div>
  );
}
