import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Modal, Button, Label, Badge } from './ui';
import {
  Calendar,
  Building2,
  Briefcase,
  User,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Candidate, Employer, Job } from '../types';
import { scheduleInterviewWithApplication, filterActiveJobsForEmployer } from '../lib/pipelineHelpers';
import { isCandidateClientEligible } from '../lib/screeningHelpers';

interface ScheduleInterviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate | null;
  onSuccess?: () => void;
}

const INTERVIEW_ROUNDS = [
  'Round 1 - Face to Face',
  'Round 1 - Telephonic / Screening',
  'Round 1 - Technical',
  'Round 2 - Managerial',
  'HR Round',
  'Final Client Round',
  'Client Assessment / Practical Test',
];

export const ScheduleInterviewModal: React.FC<ScheduleInterviewModalProps> = ({
  isOpen,
  onClose,
  candidate,
  onSuccess,
}) => {
  const { employers, jobs, applications, insert, update } = useData();
  const { currentUser } = useUser();

  const [selectedEmployerId, setSelectedEmployerId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [location, setLocation] = useState('');
  const [roundType, setRoundType] = useState('Round 1 - Face to Face');
  const [remarks, setRemarks] = useState('');
  const [bypassScreening, setBypassScreening] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active employers
  const activeEmployers = employers
    .filter((e) => e.is_active !== false)
    .sort((a, b) => a.company_name.localeCompare(b.company_name));

  // Dynamically filtered open jobs for the selected employer via shared pipeline domain helper
  const selectedEmployer = activeEmployers.find((e) => e.id === selectedEmployerId);
  const availableJobs = filterActiveJobsForEmployer(
    jobs,
    selectedEmployerId,
    selectedEmployer?.company_name
  );

  // Reset job selection if employer changes
  useEffect(() => {
    setSelectedJobId('');
    if (selectedEmployer) {
      setLocation(selectedEmployer.location ? `${selectedEmployer.location} (Client Office)` : 'Client Office');
    } else {
      setLocation('');
    }
  }, [selectedEmployerId, selectedEmployer]);

  // Set default scheduled time to tomorrow at 11:00 AM
  useEffect(() => {
    if (isOpen) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(11, 0, 0, 0);
      const pad = (n: number) => String(n).padStart(2, '0');
      const formatted = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;
      setScheduledTime(formatted);
      setSelectedEmployerId('');
      setSelectedJobId('');
      setRemarks('');
      setBypassScreening(false);
    }
  }, [isOpen]);

  if (!candidate) return null;

  const hasPassedScreening = isCandidateClientEligible(candidate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployerId) {
      toast.error('Please select a client/employer.');
      return;
    }
    if (!selectedJobId) {
      toast.error('Please select an active job opening.');
      return;
    }
    if (!scheduledTime) {
      toast.error('Please specify the interview date and time.');
      return;
    }
    if (!hasPassedScreening && !bypassScreening) {
      toast.error('Please confirm authorization to schedule interview without passed office screening.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isoTime = new Date(scheduledTime).toISOString();

      const result = await scheduleInterviewWithApplication({
        candidateId: candidate.id,
        jobId: selectedJobId,
        scheduledTime: isoTime,
        currentUser,
        existingApplications: applications,
        insert,
        update,
      });

      // If additional remarks, location or round was provided, update interview
      if (remarks.trim() || location.trim() || roundType) {
        const fullFeedback = [
          roundType ? `[${roundType}]` : '',
          location ? `Venue: ${location}` : '',
          remarks.trim() ? `Notes: ${remarks.trim()}` : '',
        ]
          .filter(Boolean)
          .join(' • ');

        await update('interviews', {
          id: result.interviewId,
          feedback: fullFeedback,
        });
      }

      toast.success(
        result.applicationCreated
          ? 'Application created and client interview scheduled!'
          : 'Interview scheduled and linked to client job opening!'
      );

      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to schedule interview');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Schedule Client Interview"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Candidate Profile Summary */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0">
              {candidate.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">{candidate.name}</p>
              <p className="text-[11px] text-slate-500 font-mono">
                {candidate.mobile} • {candidate.last_role || candidate.qualification || 'Candidate'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Screening</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                hasPassedScreening
                  ? 'bg-emerald-100 text-emerald-800'
                  : candidate.screening_status === 'Fail'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {hasPassedScreening && <CheckCircle2 size={11} />}
              {candidate.screening_status || 'Pending'}
            </span>
          </div>
        </div>

        {/* Screening Warning / Override Gate if not passed */}
        {!hasPassedScreening && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Internal Office Screening Not Passed</p>
                <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                  SCC protocol requires preliminary in-house assessment before client submission. Current status is{' '}
                  <strong className="underline">{candidate.screening_status || 'Pending'}</strong>.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 pt-1 border-t border-amber-200/80 cursor-pointer text-[11px] font-medium text-amber-800">
              <input
                type="checkbox"
                checked={bypassScreening}
                onChange={(e) => setBypassScreening(e.target.checked)}
                className="rounded border-amber-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>I am authorized to bypass office screening and schedule this client interview directly</span>
            </label>
          </div>
        )}

        {/* 1. Client / Employer Selection */}
        <div>
          <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-1.5">
            <Building2 size={13} className="text-blue-600" />
            <span>1. Client / Employer *</span>
          </Label>
          <select
            value={selectedEmployerId}
            onChange={(e) => setSelectedEmployerId(e.target.value)}
            required
            disabled={isSubmitting}
            className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
          >
            <option value="">-- Choose active client / company --</option>
            {activeEmployers.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.company_name} {emp.location ? `(${emp.location})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Job Opening Selection (Dynamically filtered) */}
        <div>
          <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-1.5">
            <Briefcase size={13} className="text-blue-600" />
            <span>2. Job Opening *</span>
          </Label>
          {!selectedEmployerId ? (
            <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl">
              Please choose a client above to view their active job openings
            </div>
          ) : availableJobs.length === 0 ? (
            <div className="p-3 text-center text-xs text-amber-700 bg-amber-50/70 border border-amber-200 rounded-xl">
              ⚠️ This client currently has no open job vacancies. Please add an opening under Jobs first.
            </div>
          ) : (
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
            >
              <option value="">-- Select job opening ({availableJobs.length} open) --</option>
              {availableJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.role} • {j.location} • ₹{(j.salary_min || 0).toLocaleString()} - ₹{(j.salary_max || 0).toLocaleString()}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 3. Date, Time & Round Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-1.5">
              <Calendar size={13} className="text-blue-600" />
              <span>Interview Date & Time *</span>
            </Label>
            <input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
            />
          </div>

          <div>
            <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-1.5">
              <Clock size={13} className="text-blue-600" />
              <span>Interview Round / Type</span>
            </Label>
            <select
              value={roundType}
              onChange={(e) => setRoundType(e.target.value)}
              disabled={isSubmitting}
              className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
            >
              {INTERVIEW_ROUNDS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 4. Interview Venue / Location */}
        <div>
          <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-1.5">
            <MapPin size={13} className="text-blue-600" />
            <span>Venue / Location Details</span>
          </Label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Client Office, Plot 14 Urla Industrial Area, Raipur"
            disabled={isSubmitting}
            className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        {/* 5. Remarks / Instructions for Candidate */}
        <div>
          <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-1.5">
            <FileText size={13} className="text-blue-600" />
            <span>Scheduling Remarks & Documents Required (Optional)</span>
          </Label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            placeholder="e.g. Carry 2 copies of resume, Aadhaar card, previous pay slip. Contact person: HR Manager."
            disabled={isSubmitting}
            className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            size="sm"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || !selectedJobId}
            size="sm"
            className="min-w-32"
          >
            {isSubmitting ? 'Booking Interview...' : 'Confirm & Schedule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
