import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Drawer, Button, Badge, Label, Modal } from './ui';
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
  Plus,
  ShieldCheck,
  Receipt,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Candidate, Interview, CandidateScreening, CandidateScreeningResult, PaymentRecord, CallType } from '../types';
import { InterviewUpdateModal } from './InterviewUpdateModal';
import { ScheduleInterviewModal } from './ScheduleInterviewModal';
import { calculateRegistrationFeeStatus, validateRegistrationRefund } from '../lib/registrationFee';
import { isCandidateClientEligible, validateScreeningRatings } from '../lib/screeningHelpers';

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
  const { candidates, interviews, jobs, callLogs, screenings, payments, update, insert } = useData();
  const { currentUser, userId } = useUser();

  // Resolve live active candidate from DataContext so updates immediately reflect
  const activeCandidate = candidates.find((c) => c.id === candidate?.id) || candidate;

  const [activeTab, setActiveTab] = useState<'overview' | 'screening' | 'interviews' | 'payments' | 'calls'>('overview');
  const [candidateNotes, setCandidateNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Client Interview Scheduling & Updating Modals
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  // Office Screening Modal state
  const [isScreeningModalOpen, setIsScreeningModalOpen] = useState(false);
  const [screeningVenue, setScreeningVenue] = useState('SCC Raipur Head Office');
  const [screeningTime, setScreeningTime] = useState('');
  const [screeningSkills, setScreeningSkills] = useState('');
  const [communicationRating, setCommunicationRating] = useState<number | null>(4);
  const [confidenceRating, setConfidenceRating] = useState<number | null>(4);
  const [overallRating, setOverallRating] = useState<number | null>(4);
  const [screeningRemarks, setScreeningRemarks] = useState('');
  const [screeningResult, setScreeningResult] = useState<CandidateScreeningResult>('Pass');
  const [screeningNextAction, setScreeningNextAction] = useState('Eligible for Client Submission');
  const [isSavingScreening, setIsSavingScreening] = useState(false);

  // Registration Fee Modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [feeAmount, setFeeAmount] = useState<number>(200);
  const [feePaymentMethod, setFeePaymentMethod] = useState<'UPI' | 'Cash' | 'Bank_Transfer' | 'Cheque'>('UPI');
  const [feeStatus, setFeeStatus] = useState<'Paid' | 'Partial' | 'Refunded'>('Paid');
  const [feeRefNo, setFeeRefNo] = useState('');
  const [feeNotes, setFeeNotes] = useState('');
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  // Truthful Call Logging Modal state
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [callOutcome, setCallOutcome] = useState<CallType>('Connected');
  const [callDuration, setCallDuration] = useState<number>(60);
  const [callNote, setCallNote] = useState('');
  const [isLoggingCall, setIsLoggingCall] = useState(false);

  // Keep notes synchronized when candidate changes
  React.useEffect(() => {
    if (activeCandidate) {
      setCandidateNotes(activeCandidate.notes || '');
      setIsEditingNotes(false);
    }
  }, [activeCandidate?.id, activeCandidate?.notes]);

  // Set default screening time to today
  React.useEffect(() => {
    if (isScreeningModalOpen) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const formatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      setScreeningTime(formatted);
      setScreeningRemarks('');
      setScreeningResult('Pass');
      setScreeningNextAction('Eligible for Client Submission');
    }
  }, [isScreeningModalOpen]);

  if (!activeCandidate) return null;

  // Candidate's interviews, sorted newest first
  const candidateInterviews = interviews
    .filter((i) => i.candidate_id === activeCandidate.id && i.is_active !== false)
    .sort(
      (a, b) =>
        new Date(b.scheduled_time).getTime() - new Date(a.scheduled_time).getTime()
    );

  // Candidate's screening history, sorted newest first
  const candidateScreenings = screenings
    .filter((s) => s.candidate_id === activeCandidate.id && s.is_active !== false)
    .sort(
      (a, b) =>
        new Date(b.screening_time).getTime() - new Date(a.screening_time).getTime()
    );

  // Candidate's call logs, sorted newest first
  const candidateCallLogs = callLogs
    .filter((cl) => cl.candidate_id === activeCandidate.id)
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

  // Candidate registration fee payments
  const candidatePayments = payments
    .filter((p) => p.candidate_id === activeCandidate.id && p.type === 'Candidate_Registration' && p.is_active !== false)
    .sort(
      (a, b) => new Date(b.paid_at || b.created_at).getTime() - new Date(a.paid_at || a.created_at).getTime()
    );

  // Registration fee calculations via authoritative domain module
  const feeSummary = calculateRegistrationFeeStatus(
    candidatePayments,
    200,
    Boolean(activeCandidate.registration_fee_paid)
  );
  const expectedFee = feeSummary.expectedFee;
  const netReceived = feeSummary.netReceived;
  const outstandingAmount = feeSummary.outstandingAmount;
  const currentFeeStatus = feeSummary.computedStatus;

  const handleSaveNotes = async () => {
    if (!activeCandidate) return;
    setIsSavingNotes(true);
    try {
      const res = await update('candidates', {
        id: activeCandidate.id,
        notes: candidateNotes.trim() || null,
      });
      toast.success('Candidate remarks saved successfully!');
      setIsEditingNotes(false);
      if (onEditCandidate && res?.data) {
        onEditCandidate(res.data);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update remarks');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleSaveScreening = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!screeningTime) {
      toast.error('Please enter the screening date and time.');
      return;
    }
    const ratingValidation = validateScreeningRatings({
      communicationRating,
      confidenceRating,
      overallRating,
    });
    if (!ratingValidation.valid) {
      toast.error(ratingValidation.error || 'Invalid rating value');
      return;
    }

    setIsSavingScreening(true);
    try {
      const screeningRecord = {
        candidate_id: activeCandidate.id,
        screening_time: new Date(screeningTime).toISOString(),
        venue: screeningVenue.trim() || 'SCC Raipur Head Office',
        skills_assessment: screeningSkills.trim() || null,
        communication_rating: communicationRating,
        confidence_rating: confidenceRating,
        overall_rating: overallRating,
        remarks: screeningRemarks.trim() || null,
        result: screeningResult,
        next_action: screeningNextAction.trim() || null,
        screening_staff: currentUser || 'SCC Recruiter',
        created_by: userId || undefined,
        is_active: true,
      };

      await insert('candidate_screenings', screeningRecord);

      // Update candidate's screening_status field
      await update('candidates', {
        id: activeCandidate.id,
        screening_status: screeningResult,
      });

      toast.success(`Office screening saved! Result: ${screeningResult}`);
      setIsScreeningModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save screening record');
    } finally {
      setIsSavingScreening(false);
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feeAmount || feeAmount <= 0) {
      toast.error('Please enter a valid payment amount.');
      return;
    }

    if (feeStatus === 'Refunded') {
      const validation = validateRegistrationRefund(candidatePayments, feeAmount, expectedFee);
      if (!validation.valid) {
        toast.error(validation.error || 'Invalid refund amount');
        return;
      }
    }

    setIsSavingPayment(true);
    try {
      const paymentRecord = {
        candidate_id: activeCandidate.id,
        type: 'Candidate_Registration' as const,
        amount: feeAmount,
        payment_method: feePaymentMethod,
        status: feeStatus,
        reference_no: feeRefNo.trim() || undefined,
        notes: feeNotes.trim() || undefined,
        paid_at: new Date().toISOString(),
        recorded_by: currentUser || 'SCC Admin',
        recorded_by_user_id: userId || undefined,
        is_active: true,
      };

      await insert('payments', paymentRecord);

      // Reconcile candidate registration_fee_paid boolean state
      const updatedLedger = [
        ...candidatePayments,
        { amount: feeAmount, status: feeStatus, type: 'Candidate_Registration' as const, is_active: true },
      ];
      const newSummary = calculateRegistrationFeeStatus(updatedLedger, expectedFee);
      if (activeCandidate.registration_fee_paid !== newSummary.isRegistrationFeePaid) {
        await update('candidates', {
          id: activeCandidate.id,
          registration_fee_paid: newSummary.isRegistrationFeePaid,
        });
      }

      toast.success(`Registration fee record saved (${feeStatus})!`);
      setIsPaymentModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record payment');
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleCall = () => {
    window.open(`tel:${activeCandidate.mobile}`, '_self');
    setCallOutcome('Connected');
    setCallDuration(60);
    setCallNote('');
    setIsCallModalOpen(true);
  };

  const handleSaveCandidateCall = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingCall(true);
    try {
      await insert('call_logs', {
        candidate_id: activeCandidate.id,
        telecaller_name: currentUser,
        call_type: callOutcome,
        timestamp: new Date().toISOString(),
        duration: callOutcome === 'Connected' ? callDuration : 0,
        note: callNote.trim() || undefined,
      });
      toast.success(`Call logged as ${callOutcome}`);
      setIsCallModalOpen(false);
    } catch (e: any) {
      toast.error('Failed to log call: ' + (e?.message || 'Error'));
    } finally {
      setIsLoggingCall(false);
    }
  };

  const handleWhatsApp = () => {
    const msg = `Namaste ${activeCandidate.name}, Shree Career Consultancy (SCC) se hum aapke profile aur job opportunities ke regarding baat karna chahte hain.`;
    window.open(
      `https://wa.me/91${activeCandidate.mobile.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`,
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

  const getScreeningBadge = (res?: string) => {
    switch (res) {
      case 'Pass':
        return <Badge variant="success">Screening: Passed</Badge>;
      case 'Fail':
        return <Badge variant="danger">Screening: Failed</Badge>;
      case 'Hold':
        return <Badge variant="warning">Screening: On Hold</Badge>;
      case 'Scheduled':
        return <Badge variant="info">Screening: Scheduled</Badge>;
      default:
        return <Badge variant="neutral">Screening: Pending</Badge>;
    }
  };

  const getFeeBadge = (status: 'Unpaid' | 'Partial' | 'Paid' | 'Refunded') => {
    switch (status) {
      case 'Paid':
        return <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">✓ Fee Paid (₹{netReceived})</span>;
      case 'Partial':
        return <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Partial Fee (₹{netReceived}/{expectedFee})</span>;
      case 'Refunded':
        return <span className="text-[11px] font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">Fee Refunded</span>;
      default:
        return <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">Unpaid (₹{expectedFee} Due)</span>;
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
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  {activeCandidate.name}
                </h2>
                <Badge
                  variant={
                    activeCandidate.status === 'Placed'
                      ? 'success'
                      : activeCandidate.status === 'Blacklisted'
                      ? 'danger'
                      : 'primary'
                  }
                >
                  {activeCandidate.status}
                </Badge>
                {getScreeningBadge(activeCandidate.screening_status)}
                {getFeeBadge(currentFeeStatus)}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {activeCandidate.last_role || 'Candidate'} • {activeCandidate.experience || 0} yrs exp • {activeCandidate.location || 'Raipur'}
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
                    onEditCandidate(activeCandidate);
                  }}
                  className="flex items-center gap-1"
                >
                  <Pencil size={13} /> Edit Profile
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsScheduleModalOpen(true)}
                className="flex items-center gap-1"
              >
                <Calendar size={13} /> Schedule Interview
              </Button>
            </div>
          </>
        }
      >
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 gap-1.5 pb-2 text-xs font-medium overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileText size={14} /> Profile & Remarks
          </button>
          <button
            onClick={() => setActiveTab('screening')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'screening'
                ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck size={14} className="text-indigo-600" /> Office Screening ({candidateScreenings.length})
          </button>
          <button
            onClick={() => setActiveTab('interviews')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'interviews'
                ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Calendar size={14} /> Client Interviews ({candidateInterviews.length})
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'payments'
                ? 'bg-blue-50 text-blue-700 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Receipt size={14} className="text-emerald-600" /> Registration Fee
          </button>
          <button
            onClick={() => setActiveTab('calls')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
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
            {/* Candidate General Remarks / Recruiter Assessment */}
            <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-4 shadow-2xs">
              <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-900 font-bold text-xs uppercase tracking-wider">
                    Candidate General Remarks
                  </span>
                  <span className="text-[10px] text-amber-700 font-normal">
                    (Candidate notes — saved directly to candidates.notes)
                  </span>
                </div>
                {!isEditingNotes ? (
                  <button
                    onClick={() => setIsEditingNotes(true)}
                    className="text-xs text-amber-900 hover:text-amber-950 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Pencil size={12} /> Edit Remark
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setCandidateNotes(activeCandidate.notes || '');
                        setIsEditingNotes(false);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-0.5 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes}
                      className="text-xs bg-amber-700 hover:bg-amber-800 text-white px-2.5 py-0.5 rounded font-medium flex items-center gap-1 cursor-pointer disabled:opacity-60"
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
                    className="w-full text-xs border border-amber-300 rounded-lg p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  />
                  <p className="text-[11px] text-amber-800 mt-1">
                    Enter overall assessment, salary flexibility, and recruiter impressions.
                  </p>
                </div>
              ) : (
                <div className="mt-1">
                  {activeCandidate.notes ? (
                    <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-normal bg-white p-3 rounded-lg border border-amber-200/60">
                      {activeCandidate.notes}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      No general remarks recorded yet. Click &quot;Edit Remark&quot; to add notes.
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
                  ₹{Number(activeCandidate.expected_salary || 0).toLocaleString('en-IN')}/mo
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">Current Salary</span>
                <span className="text-sm font-bold text-slate-700 mt-0.5 block">
                  {activeCandidate.current_salary && Number(activeCandidate.current_salary) > 0
                    ? `₹${Number(activeCandidate.current_salary).toLocaleString('en-IN')}/mo`
                    : 'Fresher / Nil'}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">Total Experience</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                  {activeCandidate.experience || 0} years
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">Notice Period</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                  {activeCandidate.notice_period || 'Immediate'}
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
                  <span className="font-mono font-semibold text-slate-800">{activeCandidate.mobile}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Email Address</span>
                  <span className="font-medium text-slate-800">{activeCandidate.email || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Location / City</span>
                  <span className="font-medium text-slate-800">{activeCandidate.location || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Qualification</span>
                  <span className="font-medium text-slate-800">{activeCandidate.qualification || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Current / Last Role</span>
                  <span className="font-medium text-slate-800">{activeCandidate.last_role || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Acquisition Source</span>
                  <span className="font-medium text-slate-800">{activeCandidate.source || 'Manual'}</span>
                </div>
              </div>

              {/* Skills Tags */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-400 text-xs block mb-1.5 font-medium">Verified Skills</span>
                <div className="flex flex-wrap gap-1.5">
                  {(activeCandidate.skills || []).map((skill, idx) => (
                    <span
                      key={idx}
                      className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md font-medium border border-slate-200"
                    >
                      {skill}
                    </span>
                  ))}
                  {(!activeCandidate.skills || activeCandidate.skills.length === 0) && (
                    <span className="text-xs text-slate-400 italic">No skills tagged</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Office Screening Module (Phase 5) */}
        {activeTab === 'screening' && (
          <div className="space-y-4">
            {/* Header & Record Screening CTA */}
            <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-xl p-3.5 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-indigo-600" />
                  Preliminary In-House Office Screening
                </h3>
                <p className="text-[11px] text-indigo-800/90 mt-0.5">
                  SCC in-office evaluation before presenting candidate to corporate clients.
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setIsScreeningModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 border-indigo-600 text-xs"
              >
                <Plus size={13} className="mr-1" /> Record Screening Round
              </Button>
            </div>

            {/* Screening Status Banner */}
            <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Current Eligibility Status:</span>
                <span className="font-bold text-slate-800 text-sm">
                  {activeCandidate.screening_status === 'Pass'
                    ? 'Eligible for Client Interviews'
                    : activeCandidate.screening_status === 'Fail'
                    ? 'Screening Not Cleared'
                    : 'Pending In-Office Assessment'}
                </span>
              </div>
              <div>{getScreeningBadge(activeCandidate.screening_status)}</div>
            </div>

            {/* Screening Rounds History */}
            {candidateScreenings.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                <ShieldCheck className="mx-auto text-slate-300 mb-2" size={32} />
                <p className="font-semibold text-slate-700">No office screening rounds recorded yet.</p>
                <p className="text-slate-400 mt-1 max-w-sm mx-auto">
                  Click &quot;Record Screening Round&quot; above to log the candidate's initial in-person interview, communication rating, and client eligibility.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {candidateScreenings.map((sc, idx) => (
                  <div
                    key={sc.id}
                    className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs">Round {candidateScreenings.length - idx}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 text-xs">{sc.venue}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <Clock size={11} className="text-slate-400" />
                          {new Date(sc.screening_time).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}{' '}
                          • Evaluated by <strong className="text-slate-700">{sc.screening_staff}</strong>
                        </p>
                      </div>
                      <Badge
                        variant={
                          sc.result === 'Pass'
                            ? 'success'
                            : sc.result === 'Fail'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        Result: {sc.result}
                      </Badge>
                    </div>

                    {/* Ratings Grid */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[11px]">
                      <div>
                        <span className="text-slate-400 block">Communication</span>
                        <span className="font-bold text-amber-900">{sc.communication_rating ? `${sc.communication_rating}/5` : '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Confidence</span>
                        <span className="font-bold text-amber-900">{sc.confidence_rating ? `${sc.confidence_rating}/5` : '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Overall Score</span>
                        <span className="font-bold text-amber-900">{sc.overall_rating ? `${sc.overall_rating}/5` : '—'}</span>
                      </div>
                    </div>

                    {/* Skills Assessment */}
                    {sc.skills_assessment && (
                      <div className="text-xs text-slate-700">
                        <span className="font-semibold text-slate-500 text-[11px] block">Skills Assessment:</span>
                        <p className="mt-0.5">{sc.skills_assessment}</p>
                      </div>
                    )}

                    {/* Screening Remarks */}
                    {sc.remarks && (
                      <div className="text-xs bg-indigo-50/40 p-2.5 rounded-lg border border-indigo-100 text-indigo-950">
                        <span className="font-bold text-indigo-900 text-[10px] uppercase tracking-wider block">
                          Office Screening Remarks:
                        </span>
                        <p className="mt-0.5 whitespace-pre-wrap">{sc.remarks}</p>
                      </div>
                    )}

                    {/* Next Action */}
                    {sc.next_action && (
                      <div className="text-[11px] text-slate-600 flex items-center gap-1">
                        <ChevronRight size={12} className="text-blue-600" />
                        <span>Next Step: <strong>{sc.next_action}</strong></span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Client Interviews (Phase 7 & 8) */}
        {activeTab === 'interviews' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700">
                Client Interviews ({candidateInterviews.length} Scheduled)
              </span>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setIsScheduleModalOpen(true)}
                className="text-xs py-1"
              >
                + Schedule Interview
              </Button>
            </div>

            {candidateInterviews.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                <Calendar className="mx-auto text-slate-300 mb-2" size={32} />
                <p className="font-medium text-slate-700">No client interviews attended or scheduled yet.</p>
                <p className="text-slate-400 mt-1 max-w-sm mx-auto">
                  Click &quot;Schedule Interview&quot; above to select an employer and matching job opening for this candidate.
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
                            title="Reschedule or update status"
                          >
                            <Pencil size={11} className="mr-1" /> Update / Reschedule
                          </Button>
                        </div>
                      </div>

                      {/* Reschedule audit badge if present */}
                      {interview.reschedule_history && interview.reschedule_history.length > 0 && (
                        <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          <History size={11} />
                          <span>Rescheduled {interview.reschedule_history.length} time(s) • Last: {interview.reschedule_history[interview.reschedule_history.length - 1]?.reason || 'Adjusted'}</span>
                        </div>
                      )}

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
                          No interview feedback recorded yet.
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

        {/* Tab 4: Registration Fee Tracking (Phase 6) */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            {/* Payment Summary Card */}
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Receipt size={16} className="text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                    Candidate Registration Fee Status
                  </span>
                </div>
                {getFeeBadge(currentFeeStatus)}
              </div>

              <div className="grid grid-cols-3 gap-2.5 bg-white p-3 rounded-xl border border-emerald-100 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Standard Fee</span>
                  <span className="font-bold text-slate-900 text-sm">₹{expectedFee}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Total Received</span>
                  <span className="font-bold text-emerald-700 text-sm">₹{netReceived}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Outstanding Due</span>
                  <span className={`font-bold text-sm ${outstandingAmount > 0 ? 'text-amber-700' : 'text-slate-600'}`}>
                    ₹{outstandingAmount}
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setFeeAmount(outstandingAmount > 0 ? outstandingAmount : 200);
                    setFeeStatus('Paid');
                    setFeeRefNo('');
                    setFeeNotes('');
                    setIsPaymentModalOpen(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-xs"
                >
                  <Plus size={13} className="mr-1" /> Record Fee Payment / Refund
                </Button>
              </div>
            </div>

            {/* Payment Ledger Records */}
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                Payment History & Invoices ({candidatePayments.length})
              </h4>
              {candidatePayments.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                  <Receipt className="mx-auto text-slate-300 mb-1.5" size={28} />
                  <p>No payment records logged for this candidate.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {candidatePayments.map((p) => (
                    <div
                      key={p.id}
                      className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs text-xs flex justify-between items-start gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">₹{p.amount}</span>
                          <Badge
                            variant={
                              p.status === 'Paid'
                                ? 'success'
                                : p.status === 'Partial'
                                ? 'warning'
                                : 'danger'
                            }
                          >
                            {p.status}
                          </Badge>
                          <span className="text-slate-500 font-medium">via {p.payment_method}</span>
                        </div>
                        {p.reference_no && (
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                            Ref / Txn: {p.reference_no}
                          </p>
                        )}
                        {p.notes && (
                          <p className="text-slate-600 text-[11px] italic mt-0.5">{p.notes}</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-1">Recorded by: {p.recorded_by}</p>
                      </div>
                      <span className="text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(p.paid_at || p.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 5: Call History & Engagement */}
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
          candidate={activeCandidate}
          onSuccess={() => {}}
        />
      )}

      {/* Schedule Client Interview Modal (Phase 7) */}
      <ScheduleInterviewModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        candidate={activeCandidate}
        onSuccess={() => {}}
      />

      {/* Record Office Screening Modal (Phase 5) */}
      <Modal
        isOpen={isScreeningModalOpen}
        onClose={() => setIsScreeningModalOpen(false)}
        title={`Record Office Screening: ${activeCandidate.name}`}
        maxWidth="lg"
      >
        <form onSubmit={handleSaveScreening} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Screening Venue *
              </Label>
              <input
                type="text"
                value={screeningVenue}
                onChange={(e) => setScreeningVenue(e.target.value)}
                required
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Screening Date & Time *
              </Label>
              <input
                type="datetime-local"
                value={screeningTime}
                onChange={(e) => setScreeningTime(e.target.value)}
                required
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
          </div>

          {/* Ratings */}
          <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <Label className="text-[11px] font-semibold text-slate-700 block mb-1">Communication</Label>
              <select
                value={communicationRating || 3}
                onChange={(e) => setCommunicationRating(Number(e.target.value))}
                className="w-full text-xs border border-slate-300 rounded p-1.5 bg-white"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{n} ⭐</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[11px] font-semibold text-slate-700 block mb-1">Confidence</Label>
              <select
                value={confidenceRating || 3}
                onChange={(e) => setConfidenceRating(Number(e.target.value))}
                className="w-full text-xs border border-slate-300 rounded p-1.5 bg-white"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{n} ⭐</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[11px] font-semibold text-slate-700 block mb-1">Overall Score</Label>
              <select
                value={overallRating || 3}
                onChange={(e) => setOverallRating(Number(e.target.value))}
                className="w-full text-xs border border-slate-300 rounded p-1.5 bg-white"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{n} ⭐</option>
                ))}
              </select>
            </div>
          </div>

          {/* Skills Assessment */}
          <div>
            <Label className="text-xs font-semibold text-slate-700 block mb-1">
              Skills Assessment / Practical Verification
            </Label>
            <input
              type="text"
              value={screeningSkills}
              onChange={(e) => setScreeningSkills(e.target.value)}
              placeholder="e.g. Basic Tally passed, Typing speed 35 wpm, Good spoken Hindi"
              className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Office Screening Remarks */}
          <div>
            <Label className="text-xs font-semibold text-slate-700 block mb-1">
              Office Screening Remarks *
            </Label>
            <textarea
              rows={3}
              value={screeningRemarks}
              onChange={(e) => setScreeningRemarks(e.target.value)}
              placeholder="e.g. Candidate reached SCC office at 11 AM. Appeared well-groomed. Articulate in answering questions..."
              className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-medium"
            />
          </div>

          {/* Result & Next Action */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Screening Result *
              </Label>
              <select
                value={screeningResult}
                onChange={(e) => {
                  const val = e.target.value as CandidateScreeningResult;
                  setScreeningResult(val);
                  if (val === 'Pass') setScreeningNextAction('Eligible for Client Submission');
                  else if (val === 'Fail') setScreeningNextAction('Archived / Not Qualified');
                  else setScreeningNextAction('Hold / Additional Practice Needed');
                }}
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white font-bold"
              >
                <option value="Pass">Pass (Client-Ready)</option>
                <option value="Hold">Hold (Needs Revision / Pending Decision)</option>
                <option value="Fail">Fail (Unsuitable)</option>
              </select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Next Action / Follow-up
              </Label>
              <input
                type="text"
                value={screeningNextAction}
                onChange={(e) => setScreeningNextAction(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white font-medium"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsScreeningModalOpen(false)}
              disabled={isSavingScreening}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSavingScreening}
              size="sm"
            >
              {isSavingScreening ? 'Saving Screening...' : 'Save Screening Result'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Record Fee Payment Modal (Phase 6) */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Record Registration Fee: ${activeCandidate.name}`}
        maxWidth="md"
      >
        <form onSubmit={handleSavePayment} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Fee Amount (₹) *
              </Label>
              <input
                type="number"
                value={feeAmount}
                onChange={(e) => setFeeAmount(Number(e.target.value))}
                min={1}
                required
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white font-bold"
              />
              {feeStatus === 'Refunded' && (
                <span className="text-[11px] text-amber-600 block mt-1 font-medium">
                  Max refundable: ₹{feeSummary.maxRefundableAmount}
                </span>
              )}
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Payment Status *
              </Label>
              <select
                value={feeStatus}
                onChange={(e) => setFeeStatus(e.target.value as any)}
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white font-medium"
              >
                <option value="Paid">Paid (Full)</option>
                <option value="Partial">Partial</option>
                <option value="Refunded">Refunded</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Payment Method *
              </Label>
              <select
                value={feePaymentMethod}
                onChange={(e) => setFeePaymentMethod(e.target.value as any)}
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white font-medium"
              >
                <option value="UPI">UPI / GPay / PhonePe</option>
                <option value="Cash">Cash at SCC Office</option>
                <option value="Bank_Transfer">Bank Transfer / IMPS</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Transaction / Ref Number
              </Label>
              <input
                type="text"
                value={feeRefNo}
                onChange={(e) => setFeeRefNo(e.target.value)}
                placeholder="UPI Ref / Receipt #"
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white font-medium"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700 block mb-1">
              Internal Payment Remarks
            </Label>
            <input
              type="text"
              value={feeNotes}
              onChange={(e) => setFeeNotes(e.target.value)}
              placeholder="e.g. Paid in cash at reception, Receipt issued #4021"
              className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsPaymentModalOpen(false)}
              disabled={isSavingPayment}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSavingPayment}
              size="sm"
            >
              {isSavingPayment ? 'Recording...' : 'Confirm & Save Receipt'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Truthful Candidate Call Outcome Modal */}
      <Modal
        isOpen={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        title={`Log Call Outcome — ${activeCandidate.name}`}
      >
        <form onSubmit={handleSaveCandidateCall} className="space-y-4 pt-1">
          <div className="bg-blue-50/70 border border-blue-200/60 rounded-xl p-3 flex items-center gap-3 text-xs text-blue-900">
            <PhoneCall className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="font-semibold">Recording Call to {activeCandidate.mobile}</p>
              <p className="text-slate-600">Select the truthful result of this call attempt.</p>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700 block mb-1">
              Call Outcome <span className="text-red-500">*</span>
            </Label>
            <select
              value={callOutcome}
              onChange={(e) => setCallOutcome(e.target.value as CallType)}
              className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white font-medium"
            >
              <option value="Connected">Connected (Spoke with candidate)</option>
              <option value="Busy">Busy</option>
              <option value="No Answer">No Answer / Ringing</option>
              <option value="SwitchOff">Switched Off / Unreachable</option>
              <option value="Call Back Later">Call Back Later requested</option>
              <option value="Wrong Number">Wrong Number</option>
              <option value="Interested">Interested in Job Openings</option>
              <option value="Not Interested">Not Interested</option>
            </select>
          </div>

          {callOutcome === 'Connected' && (
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Duration (Seconds)
              </Label>
              <input
                type="number"
                min="0"
                value={callDuration}
                onChange={(e) => setCallDuration(Number(e.target.value))}
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white font-medium"
              />
            </div>
          )}

          <div>
            <Label className="text-xs font-semibold text-slate-700 block mb-1">
              Call Notes & Feedback
            </Label>
            <textarea
              rows={3}
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              placeholder="e.g. Candidate is looking for Accounts role in Raipur, available immediately..."
              className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsCallModalOpen(false)}
              disabled={isLoggingCall}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isLoggingCall}
              size="sm"
            >
              {isLoggingCall ? 'Saving...' : 'Save Call Log'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};
