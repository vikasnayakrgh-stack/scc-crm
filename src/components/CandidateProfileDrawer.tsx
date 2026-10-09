import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Drawer, Button, Badge, Label } from './ui';
import {
  Phone,
  MessageCircle,
  Calendar,
  Pencil,
  Briefcase,
  GraduationCap,
  Clock,
  MapPin,
  IndianRupee,
  Star,
  UserCheck,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  History,
  PhoneCall,
  Save,
  Check,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Candidate, Interview } from '../types';
import { InterviewUpdateModal } from './InterviewUpdateModal';

interface CandidateProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate | null;
  onEditCandidate?: (c: Candidate) => void;
  onScheduleInterview?: (c: Candidate) => void;
}

export const CandidateProfileDrawer: React.FC<CandidateProfileDrawerProps> = ({
  isOpen,
  onClose,
  candidate,
  onEditCandidate,
  onScheduleInterview,
}) => {
  const { interviews, jobs, callLogs, update, insert } = useData();
  const { currentUser } = useUser();

  const [activeTab, setActiveTab] = useState<'overview' | 'interviews' | 'calls'>('overview');
  const [candidateNotes, setCandidateNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Interview edit modal
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null);

  // Keep notes synchronized when candidate changes
  React.useEffect(() => {
    if (candidate) {
      setCandidateNotes(candidate.notes || '');
      setIsEditingNotes(false);
    }
  }, [candidate]);

  if (!candidate) return null;

  // Candidate's interviews, sorted newest first
  const candidateInterviews = interviews
    .filter((i) => i.candidate_id === candidate.id && i.is_active !== false)
    .sort(
      (a, b) =>
        new Date(b.scheduled_time).getTime() - new Date(a.scheduled_time).getTime()
    );

  // Candidate's call logs, sorted newest first
  const candidateCallLogs = callLogs
    .filter((cl) => cl.candidate_id === candidate.id)
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      await update('candidates', {
        id: candidate.id,
        notes: candidateNotes.trim() || null,
      });
      toast.success('Candidate remarks updated!');
      setIsEditingNotes(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update remarks');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleCall = async () => {
    try {
      window.open(`tel:${candidate.mobile}`, '_self');
      await insert('call_logs', {
        candidate_id: candidate.id,
        telecaller_name: currentUser,
        call_type: 'Connected',
        timestamp: new Date().toISOString(),
        duration: 0,
        note: 'Outbound call from Candidate Profile drawer',
      });
      toast.success('Call log recorded');
    } catch (e: any) {
      toast.error('Failed to log call: ' + (e?.message || 'Error'));
    }
  };

  const handleWhatsApp = () => {
    const msg = `Namaste ${candidate.name}, Shree Career Consultancy (SCC) se hum aapke profile aur job opportunities ke regarding baat karna chahte hain.`;
    window.open(
      `https://wa.me/91${candidate.mobile.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`,
      '_blank'
    );
  };

  const renderStars = (rating?: number | null) => {
    if (!rating) return <span className="text-xs text-slate-400 italic">Not rated</span>;
    return (
      <div className="flex items-center gap-1 text-amber-500">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={13}
            className={star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}
          />
        ))}
        <span className="text-[11px] font-bold text-amber-900 ml-1">({rating}/5)</span>
      </div>
    );
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Selected': return 'success';
      case 'Scheduled': return 'info';
      case 'Rejected':
      case 'NoShow': return 'danger';
      case 'Done': return 'neutral';
      default: return 'neutral';
    }
  };

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        width="2xl"
        title={
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  {candidate.name}
                </h2>
                <Badge
                  variant={
                    candidate.status === 'Placed'
                      ? 'success'
                      : candidate.status === 'Blacklisted'
                      ? 'danger'
                      : 'primary'
                  }
                >
                  {candidate.status}
                </Badge>
                {candidate.registration_fee_paid === false && (
                  <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md font-semibold border border-amber-200">
                    ₹200 Fee Due
                  </span>
                )}
                {candidate.registration_fee_paid === true && (
                  <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md font-semibold border border-emerald-200">
                    ✓ Fee Paid
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {candidate.last_role} • {candidate.experience} yrs exp • {candidate.location}
              </p>
            </div>
          </div>
        }
        footer={
          <>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCall}
                className="flex items-center gap-1.5"
                title="Call Candidate"
              >
                <Phone size={13} className="text-blue-600" /> Call
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleWhatsApp}
                className="flex items-center gap-1.5"
                title="Send WhatsApp Message"
              >
                <MessageCircle size={13} className="text-emerald-600" /> WhatsApp
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {onEditCandidate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onEditCandidate(candidate);
                  }}
                  className="flex items-center gap-1"
                >
                  <Pencil size={13} /> Edit Full Profile
                </Button>
              )}
              {onScheduleInterview && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onScheduleInterview(candidate);
                  }}
                  className="flex items-center gap-1"
                >
                  <Calendar size={13} /> Schedule Interview
                </Button>
              )}
            </div>
          </>
        }
      >
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 gap-2 pb-2 text-xs font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileText size={14} /> Profile & Remarks
          </button>
          <button
            onClick={() => setActiveTab('interviews')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'interviews'
                ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Calendar size={14} /> Interview History ({candidateInterviews.length})
          </button>
          <button
            onClick={() => setActiveTab('calls')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'calls'
                ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <History size={14} /> Call Logs ({candidateCallLogs.length})
          </button>
        </div>

        {/* Tab 1: Overview & Candidate Remarks */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Candidate Remarks / Recruiter Notes (Persistent General Assessment) */}
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-4 shadow-2xs">
              <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-800 font-bold text-xs uppercase tracking-wider">
                    Candidate Remarks / Recruiter Notes
                  </span>
                  <span className="text-[10px] text-amber-700/80 font-normal">
                    (Persistent screening notes — not interview remarks)
                  </span>
                </div>
                {!isEditingNotes ? (
                  <button
                    onClick={() => setIsEditingNotes(true)}
                    className="text-xs text-amber-800 hover:text-amber-950 font-semibold flex items-center gap-1 hover:underline"
                  >
                    <Pencil size={12} /> Edit Remark
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setCandidateNotes(candidate.notes || '');
                        setIsEditingNotes(false);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-0.5"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes}
                      className="text-xs bg-amber-700 hover:bg-amber-800 text-white px-2.5 py-0.5 rounded font-medium flex items-center gap-1"
                    >
                      <Save size={12} /> {isSavingNotes ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              {isEditingNotes ? (
                <div className="mt-2">
                  <textarea
                    rows={3}
                    value={candidateNotes}
                    onChange={(e) => setCandidateNotes(e.target.value)}
                    placeholder="e.g. Candidate visited SCC office for initial screening. Good communication and confident personality. Looking for accountant role. Expected salary ₹25,000..."
                    className="w-full text-xs border border-amber-300 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-[11px] text-amber-800/80 mt-1">
                    Describe general impressions, communication quality, personality, and career goals observed by SCC.
                  </p>
                </div>
              ) : (
                <div className="mt-1">
                  {candidate.notes ? (
                    <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-normal">
                      {candidate.notes}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      No general remarks recorded yet. Click &quot;Edit Remark&quot; to add initial screening assessment.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Quick Metrics / Compensation Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">Expected Salary</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                  ₹{Number(candidate.expected_salary || 0).toLocaleString('en-IN')}/mo
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">Current Salary</span>
                <span className="text-sm font-bold text-slate-700 mt-0.5 block">
                  {candidate.current_salary && Number(candidate.current_salary) > 0
                    ? `₹${Number(candidate.current_salary).toLocaleString('en-IN')}/mo`
                    : 'Fresher / Nil'}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">Total Experience</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                  {candidate.experience || 0} years
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">Notice Period</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                  {candidate.notice_period || 'Immediate'}
                </span>
              </div>
            </div>

            {/* Candidate Key Details */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Candidate Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block">Mobile Number</span>
                  <span className="font-mono font-semibold text-slate-800">{candidate.mobile}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Email Address</span>
                  <span className="font-medium text-slate-800">{candidate.email || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Location / City</span>
                  <span className="font-medium text-slate-800">{candidate.location || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Qualification</span>
                  <span className="font-medium text-slate-800">{candidate.qualification || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Current / Last Role</span>
                  <span className="font-medium text-slate-800">{candidate.last_role || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Acquisition Source</span>
                  <span className="font-medium text-slate-800">{candidate.source || 'Manual'}</span>
                </div>
              </div>

              {/* Skills Tags */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-400 text-xs block mb-1.5 font-medium">Verified Skills</span>
                <div className="flex flex-wrap gap-1.5">
                  {(candidate.skills || []).map((skill, idx) => (
                    <span
                      key={idx}
                      className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md font-medium border border-slate-200"
                    >
                      {skill}
                    </span>
                  ))}
                  {(!candidate.skills || candidate.skills.length === 0) && (
                    <span className="text-xs text-slate-400 italic">No skills tagged</span>
                  )}
                </div>
              </div>
            </div>

            {/* Latest Interview Highlight (if any) */}
            {candidateInterviews.length > 0 && (
              <div className="bg-blue-50/50 border border-blue-200/70 rounded-xl p-3.5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">
                    Latest Interview Activity
                  </span>
                  <button
                    onClick={() => setActiveTab('interviews')}
                    className="text-xs text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-0.5"
                  >
                    View All ({candidateInterviews.length}) <ChevronRight size={13} />
                  </button>
                </div>
                {(() => {
                  const latest = candidateInterviews[0];
                  if (!latest) return null;
                  const job = jobs.find((j) => j.id === latest.job_id);
                  return (
                    <div className="mt-2 text-xs flex justify-between items-start gap-2">
                      <div>
                        <span className="font-bold text-slate-900">{job?.company_name}</span> —{' '}
                        <span className="text-slate-600">{job?.role}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {new Date(latest.scheduled_time).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                        {latest.feedback && (
                          <p className="text-xs text-slate-700 italic mt-1 bg-white/80 p-2 rounded border border-blue-100">
                            &ldquo;{latest.feedback}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant={getStatusBadgeVariant(latest.status)}>{latest.status}</Badge>
                        <div className="mt-1">{renderStars(latest.rating)}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Candidate Interview History & Timeline */}
        {activeTab === 'interviews' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700">
                Complete Interview Journey ({candidateInterviews.length} Scheduled)
              </span>
              {onScheduleInterview && (
                <button
                  onClick={() => {
                    onClose();
                    onScheduleInterview(candidate);
                  }}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-2.5 py-1 rounded shadow-2xs"
                >
                  + Match & Schedule New
                </button>
              )}
            </div>

            {candidateInterviews.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                <Calendar className="mx-auto text-slate-300 mb-2" size={32} />
                <p className="font-medium text-slate-700">No interviews attended or scheduled yet.</p>
                <p className="text-slate-400 mt-1">
                  Use the &quot;Schedule Interview&quot; button below to match this candidate with a registered client opening.
                </p>
              </div>
            ) : (
              <div className="relative border-l-2 border-blue-200 ml-4 pl-4 space-y-4">
                {candidateInterviews.map((interview) => {
                  const job = jobs.find((j) => j.id === interview.job_id);

                  return (
                    <div
                      key={interview.id}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs relative group hover:border-blue-300 transition-all"
                    >
                      {/* Timeline Dot */}
                      <div
                        className={`absolute -left-[25px] top-4 w-4 h-4 rounded-full border-2 border-white shadow-xs ${
                          interview.status === 'Selected'
                            ? 'bg-emerald-500 ring-2 ring-emerald-200'
                            : interview.status === 'Scheduled'
                            ? 'bg-blue-500 ring-2 ring-blue-200'
                            : interview.status === 'Rejected' || interview.status === 'NoShow'
                            ? 'bg-red-500 ring-2 ring-red-200'
                            : 'bg-slate-400 ring-2 ring-slate-200'
                        }`}
                      />

                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                            {job?.company_name || 'Employer'}
                            <span className="text-slate-400 font-normal">•</span>
                            <span className="text-blue-700 font-semibold">{job?.role}</span>
                          </h4>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Clock size={12} className="text-slate-400" />
                            {new Date(interview.scheduled_time).toLocaleString('en-IN', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant={getStatusBadgeVariant(interview.status)}>
                            {interview.status}
                          </Badge>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingInterview(interview)}
                            className="text-[11px] py-1 px-2"
                            title="Edit status, remarks & rating"
                          >
                            <Pencil size={11} className="mr-1" /> Update
                          </Button>
                        </div>
                      </div>

                      {/* Rating section */}
                      <div className="mt-2.5 flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 font-medium">Interview Rating:</span>
                        {renderStars(interview.rating)}
                      </div>

                      {/* Interview Remarks / Feedback */}
                      {interview.feedback ? (
                        <div className="mt-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">
                            Interview Remarks / Client Feedback:
                          </span>
                          <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                            {interview.feedback}
                          </p>
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] text-slate-400 italic">
                          No interview feedback recorded yet. Click &quot;Update&quot; to log interview remarks.
                        </div>
                      )}

                      {/* Next Action */}
                      {interview.next_action && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-800 bg-blue-50/60 p-2 rounded-lg border border-blue-100 font-medium">
                          <ChevronRight size={13} className="text-blue-600" />
                          <span>Next Action: {interview.next_action}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Call History & Engagement */}
        {activeTab === 'calls' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700">
                Call Engagement History ({candidateCallLogs.length} Calls)
              </span>
              <Button size="sm" variant="secondary" onClick={handleCall} className="text-xs py-1">
                <PhoneCall size={12} className="mr-1 text-blue-600" /> Dial Call
              </Button>
            </div>

            {candidateCallLogs.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                <PhoneCall className="mx-auto text-slate-300 mb-2" size={28} />
                <p>No phone call records logged yet for this candidate.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {candidateCallLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs text-xs flex justify-between items-start gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            log.call_type === 'Connected'
                              ? 'success'
                              : log.call_type === 'Not Interested'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {log.call_type}
                        </Badge>
                        <span className="font-medium text-slate-700">by {log.telecaller_name}</span>
                        {log.duration > 0 && (
                          <span className="text-[11px] text-slate-400">({log.duration}s)</span>
                        )}
                      </div>
                      {log.note && (
                        <p className="text-slate-600 mt-1 italic leading-relaxed">{log.note}</p>
                      )}
                    </div>
                    <span className="text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('en-IN', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Edit Interview Modal */}
      {editingInterview && (
        <InterviewUpdateModal
          isOpen={Boolean(editingInterview)}
          onClose={() => setEditingInterview(null)}
          interview={editingInterview}
          candidate={candidate}
          onSuccess={() => {
            // Updated interview is reflected via DataContext
          }}
        />
      )}
    </>
  );
};
