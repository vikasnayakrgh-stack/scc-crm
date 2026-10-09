import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Modal, Button, Label, Badge } from './ui';
import { Star, Clock, Calendar, Briefcase, User, Sparkles, AlertCircle, History, RotateCcw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Interview, InterviewStatus, Candidate, Job, Application, RescheduleEvent } from '../types';

interface InterviewUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  interview: Interview | null;
  candidate?: Candidate;
  job?: Job;
  onSuccess?: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Very Poor',
  2: 'Below Average',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

const NEXT_ACTION_SUGGESTIONS = [
  'Awaiting Client Feedback',
  'Schedule Round 2',
  'Send Offer Letter',
  'Follow Up with Candidate',
  'Rejected by Client',
  'Offer Accepted - Awaiting Joining',
];

const RESCHEDULE_REASONS = [
  'Candidate requested later time',
  'Client HR rescheduled',
  'Interviewer unavailable',
  'Candidate travel delay',
  'Mutual schedule adjustment',
];

export const InterviewUpdateModal: React.FC<InterviewUpdateModalProps> = ({
  isOpen,
  onClose,
  interview,
  candidate,
  job,
  onSuccess,
}) => {
  const { candidates, jobs, applications, update } = useData();
  const { currentUser } = useUser();

  const activeCandidate = candidate || candidates.find((c) => c.id === interview?.candidate_id);
  const activeJob = job || jobs.find((j) => j.id === interview?.job_id);

  const [scheduledTime, setScheduledTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [status, setStatus] = useState<InterviewStatus>('Scheduled');
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (interview) {
      // Format scheduled_time for datetime-local input (YYYY-MM-DDTHH:mm)
      try {
        const d = new Date(interview.scheduled_time);
        const pad = (n: number) => String(n).padStart(2, '0');
        const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        setScheduledTime(formatted);
      } catch {
        setScheduledTime(interview.scheduled_time.slice(0, 16));
      }

      setStatus(interview.status || 'Scheduled');
      setRating(interview.rating ?? null);
      setFeedback(interview.feedback || '');
      setNextAction(interview.next_action || '');
      setRescheduleReason('');
    }
  }, [interview]);

  if (!interview) return null;

  const isRescheduled = (() => {
    try {
      if (!scheduledTime) return false;
      const originalTime = new Date(interview.scheduled_time).getTime();
      const newTime = new Date(scheduledTime).getTime();
      return Math.abs(originalTime - newTime) > 60000; // difference greater than 1 minute
    } catch {
      return false;
    }
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledTime) {
      toast.error('Please specify interview date and time.');
      return;
    }

    setIsSubmitting(true);
    try {
      const scheduledIso = new Date(scheduledTime).toISOString();

      const updatePayload: Partial<Interview> & { id: string } = {
        id: interview.id,
        scheduled_time: scheduledIso,
        status,
        feedback: feedback.trim(),
        rating: rating ?? null,
        next_action: nextAction.trim() || null,
      };

      // Record audit history if date/time was modified
      if (isRescheduled) {
        const event: RescheduleEvent = {
          previous_time: interview.scheduled_time,
          new_time: scheduledIso,
          rescheduled_at: new Date().toISOString(),
          rescheduled_by: currentUser || 'SCC Staff',
          reason: rescheduleReason.trim() || 'Schedule updated',
        };
        updatePayload.reschedule_history = [
          ...(interview.reschedule_history || []),
          event,
        ];
      }

      await update('interviews', updatePayload);

      // Handle linked application stage transition if status is 'Selected'
      if (status === 'Selected') {
        const linkedApp = applications.find(
          (a) =>
            a.id === interview.application_id ||
            (a.candidate_id === interview.candidate_id &&
              a.job_id === interview.job_id &&
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

        toast.success(
          'Candidate marked Selected & application updated! (Candidate is not Placed until joining is confirmed)',
          { duration: 4500 }
        );
      } else {
        toast.success('Interview updated successfully!');
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update interview');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit / Update Interview" maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Candidate & Job Summary Card */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 flex items-start justify-between gap-3 text-xs">
          <div>
            <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
              <User size={14} className="text-blue-600" />
              {activeCandidate?.name || 'Candidate'}
              {activeCandidate?.mobile && (
                <span className="text-xs font-mono text-slate-500 font-normal">
                  ({activeCandidate.mobile})
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-slate-600 mt-1">
              <Briefcase size={12} className="text-slate-400" />
              <span className="font-semibold">{activeJob?.role || 'Job Role'}</span> @{' '}
              <span className="font-semibold text-slate-800">{activeJob?.company_name || 'Company'}</span>
            </div>
          </div>
          <Badge
            variant={
              status === 'Selected'
                ? 'success'
                : status === 'Scheduled'
                ? 'info'
                : status === 'NoShow' || status === 'Rejected'
                ? 'danger'
                : 'neutral'
            }
          >
            {status}
          </Badge>
        </div>

        {/* Prominent Current Schedule & Reschedule Notice */}
        <div className="flex items-center justify-between text-xs bg-blue-50/70 border border-blue-200/80 p-2.5 rounded-xl">
          <div className="flex items-center gap-1.5 text-blue-950 font-medium">
            <Clock size={14} className="text-blue-600 shrink-0" />
            <span>Currently Scheduled:</span>
            <strong className="text-blue-900">
              {new Date(interview.scheduled_time).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </strong>
          </div>
          {interview.reschedule_history && interview.reschedule_history.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-md border border-blue-200 shadow-2xs hover:bg-blue-50 transition-colors cursor-pointer"
            >
              <History size={12} />
              <span>{interview.reschedule_history.length} Reschedule{interview.reschedule_history.length > 1 ? 's' : ''}</span>
            </button>
          )}
        </div>

        {/* Reschedule Audit History Drawer / Section */}
        {showHistory && interview.reschedule_history && interview.reschedule_history.length > 0 && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs animate-in fade-in duration-100">
            <div className="flex items-center justify-between font-bold text-slate-800 border-b border-slate-200 pb-1.5">
              <span className="flex items-center gap-1">
                <History size={13} className="text-blue-600" />
                Audit Trail (Rescheduling History)
              </span>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="text-[10px] text-slate-400 hover:text-slate-600"
              >
                Close
              </button>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {interview.reschedule_history.map((ev, idx) => (
                <div key={idx} className="p-2 bg-white border border-slate-200 rounded-lg text-[11px]">
                  <div className="flex justify-between text-slate-500 text-[10px]">
                    <span>
                      {new Date(ev.rescheduled_at).toLocaleString('en-IN', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                    <span className="font-semibold text-slate-700">By {ev.rescheduled_by}</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-800 font-medium mt-0.5">
                    <span className="line-through text-slate-400">
                      {new Date(ev.previous_time).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-blue-600">→</span>
                    <span className="font-bold text-blue-900">
                      {new Date(ev.new_time).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {ev.reason && (
                    <p className="text-slate-600 mt-0.5 italic">Reason: "{ev.reason}"</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Date & Time Picker */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs font-semibold text-slate-700 block mb-0">
              {isRescheduled ? 'New Rescheduled Date & Time *' : 'Interview Date & Time *'}
            </Label>
            {isRescheduled && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                Reschedule In Progress
              </span>
            )}
          </div>
          <input
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className={`w-full text-xs border rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 font-medium ${
              isRescheduled
                ? 'border-amber-400 focus:ring-amber-500 text-amber-950 bg-amber-50/20'
                : 'border-slate-200 focus:ring-blue-500'
            }`}
            required
          />
        </div>

        {/* Reschedule Reason Box (Appears when date/time is adjusted) */}
        {isRescheduled && (
          <div className="p-3 bg-amber-50/70 border border-amber-200/90 rounded-xl space-y-2 text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <RotateCcw size={13} className="text-amber-600" />
              <span>Rescheduling Reason (Audit Log) *</span>
            </div>
            <p className="text-[11px] text-amber-800">
              Please document why the interview date/time was adjusted. This reason and the previous schedule will be permanently recorded in the audit history.
            </p>
            <input
              type="text"
              value={rescheduleReason}
              onChange={(e) => setRescheduleReason(e.target.value)}
              placeholder="e.g. Candidate requested evening slot, Client HR postponed to Friday..."
              className="w-full text-xs border border-amber-300 rounded-lg p-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {RESCHEDULE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRescheduleReason(r)}
                  className="text-[10px] bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded transition-colors"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Interview Status */}
        <div>
          <Label className="text-xs font-semibold text-slate-700 block mb-1">
            Interview Status *
          </Label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {(['Scheduled', 'Done', 'Selected', 'Rejected', 'NoShow', 'On Hold'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all ${
                  status === s
                    ? s === 'Selected'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : s === 'Rejected' || s === 'NoShow'
                      ? 'bg-red-600 text-white border-red-600 shadow-xs'
                      : 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Interview Rating: ⭐ 1-5 */}
        <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/60">
          <div className="flex justify-between items-center mb-1.5">
            <Label className="text-xs font-semibold text-amber-950 block mb-0">
              Interview Rating: ⭐ 1–5
            </Label>
            {rating && (
              <button
                type="button"
                onClick={() => setRating(null)}
                className="text-[11px] text-amber-700 hover:text-amber-900 underline"
              >
                Clear rating
              </button>
            )}
          </div>
          <p className="text-[11px] text-amber-800/80 mb-2">
            Rate candidate performance after interview (Optional initially, can be added after client feedback).
          </p>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const isFilled = (hoverRating ?? rating ?? 0) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(null)}
                    onClick={() => setRating(star)}
                    className="p-1 rounded hover:bg-amber-100 transition-colors focus:outline-none"
                    title={`${star} Star - ${RATING_LABELS[star]}`}
                  >
                    <Star
                      size={22}
                      className={
                        isFilled
                          ? 'text-amber-400 fill-amber-400 drop-shadow-2xs'
                          : 'text-slate-300'
                      }
                    />
                  </button>
                );
              })}
            </div>

            {rating ? (
              <span className="text-xs font-bold text-amber-900 px-2 py-0.5 rounded bg-amber-100 border border-amber-200">
                {rating}/5 — {RATING_LABELS[rating]}
              </span>
            ) : (
              <span className="text-xs text-slate-400 italic">Not rated yet</span>
            )}
          </div>
        </div>

        {/* Interview Remarks / Feedback */}
        <div>
          <Label className="text-xs font-semibold text-slate-700 block mb-1">
            Interview Remarks / Feedback *
          </Label>
          <textarea
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. Candidate reached on time. Communication was good. Client asked candidate to improve Excel skills. Selected for Round 2..."
            className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Remarks belong specifically to this interview with {activeJob?.company_name || 'this employer'}.
          </p>
        </div>

        {/* Next Action */}
        <div>
          <Label className="text-xs font-semibold text-slate-700 block mb-1">
            Next Action / Next Step
          </Label>
          <input
            type="text"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="e.g. Awaiting client feedback, Schedule 2nd round, Send offer letter..."
            className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-wrap gap-1 mt-2">
            {NEXT_ACTION_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setNextAction(suggestion)}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded transition-colors"
              >
                + {suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Interview Updates'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
