import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Button, Input, Modal, Label, Badge, CardSkeleton } from '../components/ui';
import { IndianRupee, Plus, Receipt, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { PaymentRecord } from '../types';

export default function Payments() {
  const { payments, candidates, employers, loading, insert, update } = useData();
  const { currentUser } = useUser();
  const [filter, setFilter] = useState<'All' | 'Registration' | 'Placement' | 'Pending'>('All');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [paymentType, setPaymentType] = useState<PaymentRecord['type']>('Candidate_Registration');
  const [amount, setAmount] = useState('200'); // Default ₹200 verified from SCC records, but fully editable!
  const [paymentMethod, setPaymentMethod] = useState<PaymentRecord['payment_method']>('UPI');
  const [status, setStatus] = useState<PaymentRecord['status']>('Paid');
  const [candidateId, setCandidateId] = useState('');
  const [employerId, setEmployerId] = useState('');
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

    try {
      await insert('payments', {
        type: paymentType,
        amount: numAmount,
        payment_method: paymentMethod,
        status,
        candidate_id: candidateId || undefined,
        employer_id: employerId || undefined,
        reference_no: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        paid_at: new Date().toISOString(),
        recorded_by: currentUser,
        is_active: true,
      });

      toast.success('Payment recorded successfully!');
      setIsAddOpen(false);
      setReferenceNo('');
      setNotes('');
      setCandidateId('');
      setEmployerId('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record payment');
    }
  };

  const markPaymentReceived = async (id: string) => {
    try {
      await update('payments', {
        id,
        status: 'Paid',
        paid_at: new Date().toISOString(),
      });
      toast.success('Payment marked as received!');
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    }
  };

  return (
    <div className="pb-20 p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex justify-between items-center sticky top-0 bg-[#f1f5f9] z-10 py-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Financials & Payments ({filteredPayments.length})</h1>
          <p className="text-xs text-slate-500">Registration fees, client invoices & collections</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)} className="flex items-center gap-1 text-xs py-1.5 px-3">
          <Plus size={14} /> Record Entry
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 font-bold uppercase">Total Collected</p>
          <p className="text-lg font-bold text-emerald-700 flex items-center mt-0.5">
            <IndianRupee size={15} />
            {totalCollected.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 font-bold uppercase">Registration Fees</p>
          <p className="text-lg font-bold text-blue-700 flex items-center mt-0.5">
            <IndianRupee size={15} />
            {regFeesTotal.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 font-bold uppercase">Placement Invoices</p>
          <p className="text-lg font-bold text-purple-700 flex items-center mt-0.5">
            <IndianRupee size={15} />
            {placementFeesTotal.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 font-bold uppercase">Pending</p>
          <p className="text-lg font-bold text-amber-600 flex items-center mt-0.5">
            <IndianRupee size={15} />
            {pendingReceivables.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {(['All', 'Registration', 'Placement', 'Pending'] as const).map((tab) => (
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
        <div className="space-y-3">
          {filteredPayments.length === 0 && (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
              No payment transactions found in "{filter}" filter.
            </div>
          )}

          {filteredPayments.map((p) => {
            const cand = candidates.find((c) => c.id === p.candidate_id) || p.candidates;
            const emp = employers.find((e) => e.id === p.employer_id) || p.employers;

            return (
              <div
                key={p.id}
                className="bg-white p-3.5 rounded-xl shadow-sm border border-slate-100 space-y-2.5"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                      <Receipt size={14} className="text-slate-400" />
                      {p.type === 'Candidate_Registration'
                        ? `Candidate Fee: ${cand?.name || 'Walk-in'}`
                        : `Placement Billing: ${emp?.company_name || 'Client'}`}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Recorded by {p.recorded_by} • {new Date(p.paid_at || p.created_at).toLocaleDateString('en-IN')}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-base font-bold text-slate-800 flex items-center justify-end">
                      <IndianRupee size={14} />
                      {Number(p.amount).toLocaleString('en-IN')}
                    </span>
                    <Badge
                      color={
                        p.status === 'Paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800 font-semibold'
                      }
                    >
                      {p.status}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs pt-2 border-t border-slate-100 text-slate-500">
                  <div className="flex gap-2">
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-medium text-slate-700">
                      {p.payment_method}
                    </span>
                    {p.reference_no && (
                      <span className="text-[11px] text-slate-600">Ref: #{p.reference_no}</span>
                    )}
                  </div>

                  {p.status === 'Pending' && (
                    <button
                      onClick={() => markPaymentReceived(p.id)}
                      className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 font-semibold rounded hover:bg-emerald-100 flex items-center gap-1"
                    >
                      <CheckCircle2 size={13} /> Mark Received
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Record Payment Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Record Payment / Billing Entry">
        <form onSubmit={handleRecordPayment} className="space-y-3">
          <div>
            <Label>Payment Type</Label>
            <select
              value={paymentType}
              onChange={(e) => {
                const t = e.target.value as PaymentRecord['type'];
                setPaymentType(t);
                if (t === 'Candidate_Registration') setAmount('200');
                else if (t === 'Employer_Placement') setAmount('15000');
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
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full text-xs border rounded-md p-2 bg-white"
            >
              <option value="Paid">Received / Paid</option>
              <option value="Pending">Pending / Receivable (Due)</option>
            </select>
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
            <div>
              <Label>Select Employer / Client</Label>
              <select
                value={employerId}
                onChange={(e) => setEmployerId(e.target.value)}
                className="w-full text-xs border rounded-md p-2 bg-white"
              >
                <option value="">Select Employer...</option>
                {employers.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.company_name} ({emp.location})
                  </option>
                ))}
              </select>
            </div>
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
