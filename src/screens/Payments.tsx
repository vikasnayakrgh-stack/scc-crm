import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Button, Input, Modal, Label, Badge, CardSkeleton } from '../components/ui';
import { IndianRupee, Plus, Receipt, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { PaymentRecord } from '../types';

export default function Payments() {
  const { payments, candidates, employers, jobs, loading, insert, update } = useData();
  const { currentUser, appRole } = useUser();
  const [filter, setFilter] = useState<'All' | 'Registration' | 'Placement' | 'Pending'>('All');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const isAdminOrManager = appRole === 'admin' || appRole === 'manager' || currentUser === 'Admin';

  const [paymentType, setPaymentType] = useState<PaymentRecord['type']>('Candidate_Registration');
  const [amount, setAmount] = useState('200'); // Default ₹200 verified from SCC records, but fully editable!
  const [paymentMethod, setPaymentMethod] = useState<PaymentRecord['payment_method']>('UPI');
  const [status, setStatus] = useState<PaymentRecord['status']>('Paid');
  const [candidateId, setCandidateId] = useState('');
  const [employerId, setEmployerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');

  const filteredPayments = payments.filter((p) => {
    if (filter === 'Registration') return p.type === 'Candidate_Registration';
    if (filter === 'Placement') return p.type === 'Employer_Placement';
    if (filter === 'Pending') return p.status === 'Pending';
    return true;
  });

  const totalCollected = payments
    .filter((p) => p.status === 'Paid')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const regFeesTotal = payments
    .filter((p) => p.type === 'Candidate_Registration' && p.status === 'Paid')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const placementFeesTotal = payments
    .filter((p) => p.type === 'Employer_Placement' && p.status === 'Paid')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const pendingReceivables = payments
    .filter((p) => p.status === 'Pending')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }

    // P0-02: Recruiters can only submit Employer_Placement in Pending/Draft status
    const effectiveStatus: PaymentRecord['status'] =
      !isAdminOrManager && (paymentType === 'Employer_Placement' || paymentType === 'Other')
        ? 'Pending'
        : status;

    try {
      await insert('payments', {
        type: paymentType,
        amount: numAmount,
        payment_method: paymentMethod,
        status: effectiveStatus,
        candidate_id: candidateId || undefined,
        employer_id: employerId || undefined,
        job_id: jobId || undefined,
        reference_no: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        paid_at: effectiveStatus === 'Paid' ? new Date().toISOString() : undefined,
        recorded_by: currentUser,
        is_active: true,
      });

      // P0-03: When candidate registration is recorded as Paid, update candidate flag immediately
      if (paymentType === 'Candidate_Registration' && effectiveStatus === 'Paid' && candidateId) {
        try {
          await update('candidates', { id: candidateId, registration_fee_paid: true });
        } catch (err) {
          console.warn('Candidate registration fee update notice:', err);
        }
      }

      toast.success(
        effectiveStatus === 'Pending'
          ? 'Payment entry submitted (Pending clearance)!'
          : 'Payment recorded successfully!'
      );
      setIsAddOpen(false);
      setReferenceNo('');
      setNotes('');
      setCandidateId('');
      setEmployerId('');
      setJobId('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record payment');
    }
  };

  const markPaymentReceived = async (paymentId: string) => {
    if (!isAdminOrManager) {
      toast.error('Unauthorized: Only Admin or Manager can mark payments as received.');
      return;
    }

    try {
      const targetPayment = payments.find((p) => p.id === paymentId);
      await update('payments', {
        id: paymentId,
        status: 'Paid',
        paid_at: new Date().toISOString(),
      });

      // P0-03: If marked received was for candidate registration, ensure candidate flag is set
      if (targetPayment?.type === 'Candidate_Registration' && targetPayment.candidate_id) {
        await update('candidates', {
          id: targetPayment.candidate_id,
          registration_fee_paid: true,
        });
      }

      toast.success('Payment marked as received!');
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    }
  };

  return (
    <div className="pb-20 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-16 bg-[#f8fafc]/95 backdrop-blur-xs z-10 py-2.5 border-b border-slate-200/60">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Financials & Payments
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {filteredPayments.length}
            </span>
          </h1>
          <p className="text-xs text-slate-500">Registration fees, client placement billing & collection records</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter Tabs */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 text-xs">
            {(['All', 'Registration', 'Placement', 'Pending'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  filter === tab
                    ? 'bg-white text-blue-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <Button onClick={() => setIsAddOpen(true)} className="flex items-center gap-1.5 text-xs py-1.5 px-3 shadow-xs">
            <Plus size={14} /> Record Entry
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Total Collected</p>
          <p className="text-xl font-bold text-emerald-600 flex items-center mt-1">
            <IndianRupee size={16} />
            {totalCollected.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Candidate Reg Fees</p>
          <p className="text-xl font-bold text-blue-600 flex items-center mt-1">
            <IndianRupee size={16} />
            {regFeesTotal.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Placement Invoices</p>
          <p className="text-xl font-bold text-indigo-600 flex items-center mt-1">
            <IndianRupee size={16} />
            {placementFeesTotal.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Pending Receivables</p>
          <p className="text-xl font-bold text-amber-600 flex items-center mt-1">
            <IndianRupee size={16} />
            {pendingReceivables.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div>
          {filteredPayments.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
              No payment transactions found in "{filter}" filter.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {filteredPayments.map((p) => {
              const cand = candidates.find((c) => c.id === p.candidate_id) || p.candidates;
              const emp = employers.find((e) => e.id === p.employer_id) || p.employers;

              return (
                <div
                  key={p.id}
                  className="bg-white p-4.5 rounded-xl shadow-xs border border-slate-200/80 hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                          <Receipt size={15} className="text-slate-400" />
                          {p.type === 'Candidate_Registration'
                            ? `Candidate Fee: ${cand?.name || 'Walk-in'}`
                            : `Placement Billing: ${emp?.company_name || 'Client'}`}
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Recorded by <span className="font-medium text-slate-600">{p.recorded_by}</span> • {new Date(p.paid_at || p.created_at).toLocaleDateString('en-IN')}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-base font-bold text-slate-900 flex items-center justify-end">
                          <IndianRupee size={14} />
                          {Number(p.amount).toLocaleString('en-IN')}
                        </span>
                        <Badge variant={p.status === 'Paid' ? 'success' : 'warning'}>
                          {p.status}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-xs pt-3 mt-3 border-t border-slate-100 text-slate-500">
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-medium text-slate-700 border border-slate-200/60">
                        {p.payment_method}
                      </span>
                      {p.reference_no && (
                        <span className="text-[11px] text-slate-600 font-mono">Ref: #{p.reference_no}</span>
                      )}
                    </div>

                    {p.status === 'Pending' && (
                      isAdminOrManager ? (
                        <button
                          onClick={() => markPaymentReceived(p.id)}
                          className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 font-semibold rounded-lg hover:bg-emerald-100 transition-colors flex items-center gap-1 border border-emerald-200 shadow-2xs"
                        >
                          <CheckCircle2 size={13} /> Mark Received
                        </button>
                      ) : (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium border border-amber-200">
                          Pending Admin Clearance
                        </span>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Record Payment / Billing Entry" maxWidth="lg">
        <form onSubmit={handleRecordPayment} className="space-y-3">
          <div>
            <Label>Payment Type</Label>
            <select
              value={paymentType}
              onChange={(e) => {
                const t = e.target.value as PaymentRecord['type'];
                setPaymentType(t);
                if (t === 'Candidate_Registration') {
                  setAmount('200');
                } else if (t === 'Employer_Placement') {
                  setAmount('15000');
                  if (!isAdminOrManager) setStatus('Pending');
                }
              }}
              className="w-full text-xs border rounded-md p-2 bg-white"
            >
              <option value="Candidate_Registration">Candidate Registration Fee (Walk-in / Online)</option>
              <option value="Employer_Placement">Employer Placement Commission / Invoice</option>
              <option value="Other">Other Operational Fee</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Payment Method</Label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full text-xs border rounded-md p-2 bg-white"
              >
                <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                <option value="Cash">Cash</option>
                <option value="Bank_Transfer">NEFT / IMPS / Net Banking</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
          </div>

          <div>
            <Label>Status</Label>
            {!isAdminOrManager && (paymentType === 'Employer_Placement' || paymentType === 'Other') ? (
              <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                <span className="font-semibold">Pending / Due</span> — Recruiters submit placement invoices as Pending for Admin clearance.
              </div>
            ) : (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full text-xs border rounded-md p-2 bg-white"
              >
                <option value="Paid">Received / Paid</option>
                <option value="Pending">Pending / Receivable (Due)</option>
              </select>
            )}
          </div>

          {paymentType === 'Candidate_Registration' && (
            <div>
              <Label>Select Candidate</Label>
              <select
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                className="w-full text-xs border rounded-md p-2 bg-white"
              >
                <option value="">Select Candidate...</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.mobile})
                  </option>
                ))}
              </select>
            </div>
          )}

          {paymentType === 'Employer_Placement' && (
            <>
              <div>
                <Label>Select Employer / Client</Label>
                <select
                  value={employerId}
                  onChange={(e) => setEmployerId(e.target.value)}
                  className="w-full text-xs border rounded-md p-2 bg-white"
                  required
                >
                  <option value="">Select Employer...</option>
                  {employers.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.company_name} ({emp.location})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Select Placed Candidate (Optional)</Label>
                <select
                  value={candidateId}
                  onChange={(e) => setCandidateId(e.target.value)}
                  className="w-full text-xs border rounded-md p-2 bg-white"
                >
                  <option value="">Select Placed Candidate...</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.mobile}) - {c.last_role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Select Job Opening (Optional)</Label>
                <select
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  className="w-full text-xs border rounded-md p-2 bg-white"
                >
                  <option value="">Select Job Opening...</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.role} @ {j.company_name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <Label>Transaction Reference / UTR / Receipt # (Optional)</Label>
            <Input
              placeholder="e.g. UPI-1234567890 or REC-0042"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
            />
          </div>

          <div>
            <Label>Remarks / Commercial Notes</Label>
            <Input
              placeholder="e.g. First installment, balance due on joining"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full mt-3">
            Save Payment Record
          </Button>
        </form>
      </Modal>
    </div>
  );
}
