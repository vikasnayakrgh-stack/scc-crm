import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Drawer, Button, Badge, Label } from './ui';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Users,
  Calendar,
  Pencil,
  Plus,
  Star,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Filter,
  Save,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Employer, Candidate, Interview, Job } from '../types';
import { InterviewUpdateModal } from './InterviewUpdateModal';

interface ClientProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  employer: Employer | null;
  onEditEmployer?: (emp: Employer) => void;
  onOpenCandidateProfile?: (cand: Candidate) => void;
}

export const ClientProfileDrawer: React.FC<ClientProfileDrawerProps> = ({
  isOpen,
  onClose,
  employer,
  onEditEmployer,
  onOpenCandidateProfile,
}) => {
  const { jobs, interviews, candidates, update } = useData();

  const [activeTab, setActiveTab] = useState<'overview' | 'interviews' | 'jobs'>('overview');
  const [clientNotes, setClientNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Filters for client's candidate interview history
  const [positionFilter, setPositionFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [candidateSearch, setCandidateSearch] = useState('');

  // Selected interview for update modal
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null);

  React.useEffect(() => {
    if (employer) {
      setClientNotes(employer.notes || '');
      setIsEditingNotes(false);
      setPositionFilter('All');
      setStatusFilter('All');
      setCandidateSearch('');
    }
  }, [employer]);

  if (!employer) return null;

  // Jobs belonging to this employer
  const clientJobs = jobs.filter(
    (j) => (j.employer_id === employer.id || j.company_name === employer.company_name) && j.is_active !== false
  );
  const clientJobIds = new Set(clientJobs.map((j) => j.id));

  // Interviews conducted for this employer's jobs
  const clientInterviews = interviews
    .filter((i) => clientJobIds.has(i.job_id) && i.is_active !== false)
    .sort(
      (a, b) =>
        new Date(b.scheduled_time).getTime() - new Date(a.scheduled_time).getTime()
    );

  // Filtered interviews for candidate history tab
  const filteredInterviews = clientInterviews.filter((i) => {
    const job = clientJobs.find((j) => j.id === i.job_id);
    const cand = candidates.find((c) => c.id === i.candidate_id);

    if (positionFilter !== 'All' && job?.role !== positionFilter) return false;
    if (statusFilter !== 'All') {
      if (statusFilter === 'Pending') {
        if (i.status !== 'Scheduled' && i.status !== 'Done') return false;
      } else if (i.status !== statusFilter) {
        return false;
      }
    }
    if (candidateSearch.trim()) {
      const q = candidateSearch.toLowerCase();
      const candName = (cand?.name || '').toLowerCase();
      const candMobile = (cand?.mobile || '');
      const jobRole = (job?.role || '').toLowerCase();
      if (!candName.includes(q) && !candMobile.includes(q) && !jobRole.includes(q)) {
        return false;
      }
    }
    return true;
  });

  // Unique job roles for filter dropdown
  const uniqueRoles = Array.from(new Set(clientJobs.map((j) => j.role))).filter(Boolean);

  // Hiring statistics
  const totalSent = clientInterviews.length;
  const totalSelected = clientInterviews.filter((i) => i.status === 'Selected').length;
  const totalRejected = clientInterviews.filter((i) => i.status === 'Rejected').length;
  const totalPending = clientInterviews.filter((i) => i.status === 'Scheduled' || (i.status === 'Done' && !i.feedback)).length;

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      await update('employers', {
        id: employer.id,
        notes: clientNotes.trim() || null,
      });
      toast.success('Client notes updated!');
      setIsEditingNotes(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update client notes');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const renderStars = (rating?: number | null) => {
    if (!rating) return <span className="text-xs text-slate-400 italic">Not rated</span>;
    return (
      <div className="flex items-center gap-0.5 text-amber-500">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={12}
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                  <Building2 size={18} className="text-blue-600" />
                  {employer.company_name}
                </h2>
                <Badge variant={employer.status === 'Active' ? 'success' : 'neutral'}>
                  {employer.status}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Contact: {employer.contact_person} {employer.industry ? `• ${employer.industry}` : ''} • {employer.location}
              </p>
            </div>
          </div>
        }
        footer={
          <>
            <div className="flex items-center gap-2 text-xs">
              <a
                href={`tel:${employer.phone}`}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium flex items-center gap-1"
              >
                <Phone size={13} className="text-blue-600" /> Call HR
              </a>
              {employer.email && (
                <a
                  href={`mailto:${employer.email}`}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium flex items-center gap-1"
                >
                  <Mail size={13} className="text-slate-600" /> Email
                </a>
              )}
            </div>
            {onEditEmployer && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onEditEmployer(employer);
                }}
                className="flex items-center gap-1"
              >
                <Pencil size={13} /> Edit Client Details
              </Button>
            )}
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
            <Building2 size={14} /> Client Overview
          </button>
          <button
            onClick={() => setActiveTab('interviews')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'interviews'
                ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users size={14} /> Candidate Interview History ({clientInterviews.length})
          </button>
          <button
            onClick={() => setActiveTab('jobs')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'jobs'
                ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Briefcase size={14} /> Vacancies ({clientJobs.length})
          </button>
        </div>

        {/* Tab 1: Overview & Client Notes */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Quick Hiring Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">Total Candidates Sent</span>
                <span className="text-lg font-bold text-slate-900 mt-0.5 block">{totalSent}</span>
              </div>
              <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200/80">
                <span className="text-[11px] text-emerald-700 block">Selected</span>
                <span className="text-lg font-bold text-emerald-800 mt-0.5 block">{totalSelected}</span>
              </div>
              <div className="bg-red-50/60 p-3 rounded-xl border border-red-200/80">
                <span className="text-[11px] text-red-700 block">Rejected</span>
                <span className="text-lg font-bold text-red-800 mt-0.5 block">{totalRejected}</span>
              </div>
              <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-200/80">
                <span className="text-[11px] text-blue-700 block">Pending / Scheduled</span>
                <span className="text-lg font-bold text-blue-800 mt-0.5 block">{totalPending}</span>
              </div>
            </div>

            {/* Client Notes / Remarks */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 shadow-2xs">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-slate-800 font-bold text-xs uppercase tracking-wider">
                  Client Notes & Account Requirements
                </span>
                {!isEditingNotes ? (
                  <button
                    onClick={() => setIsEditingNotes(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 hover:underline"
                  >
                    <Pencil size={12} /> Edit Notes
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setClientNotes(employer.notes || '');
                        setIsEditingNotes(false);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-0.5"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-0.5 rounded font-medium flex items-center gap-1"
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
                    value={clientNotes}
                    onChange={(e) => setClientNotes(e.target.value)}
                    placeholder="e.g. Hiring for accounts and billing department. Prefers local Raipur candidates. Salary budget ₹25,000 max..."
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ) : (
                <div className="mt-1">
                  {employer.notes ? (
                    <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-normal">
                      {employer.notes}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      No client notes recorded yet. Click &quot;Edit Notes&quot; to add company preferences.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Corporate & Contact Details */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Corporate Contact Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block">Primary Contact Person</span>
                  <span className="font-semibold text-slate-800">{employer.contact_person}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Phone / Mobile</span>
                  <span className="font-mono font-semibold text-slate-800">{employer.phone}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Email Address</span>
                  <span className="font-medium text-slate-800">{employer.email || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Location / City</span>
                  <span className="font-medium text-slate-800">{employer.location}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Industry</span>
                  <span className="font-medium text-slate-800">{employer.industry || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Address</span>
                  <span className="font-medium text-slate-800">{employer.address || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Candidate Interview History (The core recruitment history view) */}
        {activeTab === 'interviews' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search candidate name, phone or role..."
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                    className="text-xs bg-white border border-slate-200 rounded-lg p-1.5 text-slate-700"
                  >
                    <option value="All">All Positions ({uniqueRoles.length})</option>
                    {uniqueRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-xs bg-white border border-slate-200 rounded-lg p-1.5 text-slate-700"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Selected">Selected</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="Done">Done</option>
                    <option value="Pending">Pending Feedback</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Interview Records Table / Cards */}
            {filteredInterviews.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                <Users className="mx-auto text-slate-300 mb-2" size={32} />
                <p className="font-medium text-slate-700">No candidate interviews match the filter.</p>
                <p className="text-slate-400 mt-1">
                  Total candidates sent to this employer: {clientInterviews.length}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInterviews.map((interview) => {
                  const cand = candidates.find((c) => c.id === interview.candidate_id);
                  const job = clientJobs.find((j) => j.id === interview.job_id);

                  return (
                    <div
                      key={interview.id}
                      className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs hover:border-blue-300 transition-all text-xs"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            {cand && onOpenCandidateProfile ? (
                              <button
                                onClick={() => {
                                  onClose();
                                  onOpenCandidateProfile(cand);
                                }}
                                className="font-bold text-slate-900 text-sm hover:text-blue-600 hover:underline text-left flex items-center gap-1"
                              >
                                {cand.name}
                                <ExternalLink size={11} className="text-slate-400" />
                              </button>
                            ) : (
                              <span className="font-bold text-slate-900 text-sm">
                                {cand?.name || 'Candidate'}
                              </span>
                            )}
                            <span className="text-slate-500 font-mono text-[11px]">
                              ({cand?.mobile})
                            </span>
                          </div>
                          <p className="text-slate-600 mt-0.5">
                            Position: <span className="font-semibold text-slate-800">{job?.role || 'Job'}</span>
                          </p>
                          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock size={11} />
                            {new Date(interview.scheduled_time).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={getStatusBadgeVariant(interview.status)}>
                            {interview.status}
                          </Badge>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingInterview(interview)}
                            className="text-[11px] py-1 px-2"
                          >
                            <Pencil size={11} className="mr-1" /> Update Feedback
                          </Button>
                        </div>
                      </div>

                      {/* Rating & Remark */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400 font-medium">Rating:</span>
                          {renderStars(interview.rating)}
                        </div>
                        {interview.next_action && (
                          <span className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-medium">
                            Next: {interview.next_action}
                          </span>
                        )}
                      </div>

                      {interview.feedback ? (
                        <div className="mt-2 p-2 bg-slate-50 rounded-lg text-slate-700 italic border border-slate-100">
                          &ldquo;{interview.feedback}&rdquo;
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] text-slate-400 italic">
                          Awaiting client interview feedback. Click &quot;Update Feedback&quot; to record notes.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Open Jobs & Vacancies */}
        {activeTab === 'jobs' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700">
                Registered Vacancies ({clientJobs.length})
              </span>
            </div>

            {clientJobs.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                <Briefcase className="mx-auto text-slate-300 mb-2" size={28} />
                <p>No job vacancies currently registered for this client.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {clientJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs text-xs space-y-1.5"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{job.role}</h4>
                        <p className="text-slate-500 text-[11px]">{job.location}</p>
                      </div>
                      <Badge variant={job.status === 'Open' ? 'success' : 'neutral'}>
                        {job.status}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2 text-slate-600 text-[11px]">
                      <span>Experience: {job.min_exp}–{job.max_exp} yrs</span>
                      <span>•</span>
                      <span>
                        Salary: ₹{job.salary_min.toLocaleString()} – ₹{job.salary_max.toLocaleString()}
                      </span>
                    </div>

                    {job.skills_req && job.skills_req.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {job.skills_req.map((skill, idx) => (
                          <span
                            key={idx}
                            className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px]"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
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
        />
      )}
    </>
  );
};
