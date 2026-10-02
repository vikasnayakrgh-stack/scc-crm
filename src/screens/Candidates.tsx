import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Button, Input, Modal, Label, Badge, CardSkeleton } from '../components/ui';
import { Phone, MessageCircle, Calendar, UserPlus, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Candidate } from '../types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { candidateSchema, type CandidateInput, parseSkills } from '../lib/validation';
import { calculateCandidateJobMatch } from '../lib/matching';

export default function Candidates() {
  const { candidates, jobs, loading, insert } = useData();
  const { currentUser } = useUser();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Placed' | 'Blacklisted'>('All');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  const form = useForm<CandidateInput>({
    resolver: zodResolver(candidateSchema),
    defaultValues: {
      name: '',
      mobile: '',
      experience: 0,
      skills: '',
      location: '',
      expected_salary: 0,
      last_role: '',
      email: '',
      notes: '',
    },
  });

  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.mobile.includes(search) ||
        (c.skills || []).some((s) => s.toLowerCase().includes(search.toLowerCase())) ||
        (c.last_role || '').toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [candidates, search, statusFilter]);

  const handleCall = async (c: Candidate) => {
    try {
      window.open(`tel:${c.mobile}`, '_self');
      await insert('call_logs', {
        candidate_id: c.id,
        telecaller_name: currentUser,
        call_type: 'Connected',
        timestamp: new Date().toISOString(),
        duration: 0,
        note: 'Outbound call from CRM',
      });
      toast.success('Call log recorded');
    } catch (e: any) {
      toast.error('Failed to log call: ' + (e?.message || 'Error'));
    }
  };

  const handleWhatsApp = (c: Candidate) => {
    const msg = `Namaste ${c.name}, Shree Career Consultancy (SCC) se hum aapke profile aur job opportunities ke regarding baat karna chahte hain.`;
    window.open(`https://wa.me/91${c.mobile.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const onSubmitCandidate = async (data: CandidateInput) => {
    try {
      const skillsArray = parseSkills(data.skills);
      await insert('candidates', {
        name: data.name.trim(),
        mobile: data.mobile.trim(),
        email: data.email?.trim() || undefined,
        experience: Number(data.experience),
        skills: skillsArray,
        location: data.location.trim(),
        expected_salary: Number(data.expected_salary),
        last_role: data.last_role.trim(),
        notes: data.notes?.trim() || undefined,
        owner_id: currentUser,
        status: 'Active',
        is_active: true,
      });

      toast.success('Candidate registered successfully!');
      form.reset();
      setIsAddOpen(false);
    } catch (e: any) {
      // Do NOT reset form on error so recruiter does not lose their typed input!
      toast.error(e?.message || 'Failed to add candidate. Mobile number may already exist.');
    }
  };

  const handleSchedule = async (jobId: string, time: string) => {
    if (!selectedCandidate) return;
    try {
      await insert('interviews', {
        candidate_id: selectedCandidate.id,
        job_id: jobId,
        scheduled_time: time,
        status: 'Scheduled',
        feedback: '',
        is_active: true,
      });
      toast.success('Interview scheduled successfully!');
      setSelectedCandidate(null);
    } catch (e: any) {
      toast.error('Schedule failed: ' + (e?.message || 'Error'));
    }
  };

  return (
    <div className="pb-20 p-4 max-w-2xl mx-auto">
      {/* Header & Search */}
      <div className="sticky top-0 bg-[#f1f5f9] pt-2 pb-3 z-10 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Candidates ({filteredCandidates.length})</h1>
            <p className="text-xs text-slate-500">Candidate pool & matching</p>
          </div>
          <Button
            onClick={() => {
              form.reset();
              setIsAddOpen(true);
            }}
            className="flex items-center gap-1 text-xs py-1.5 px-3"
          >
            <UserPlus size={14} /> New Candidate
          </Button>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, skill or role..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Status filters */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {(['All', 'Active', 'Placed', 'Blacklisted'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFilter === tab
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Candidate List */}
      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div className="space-y-3 mt-2">
          {filteredCandidates.length === 0 && (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
              No candidates found matching your search.
            </div>
          )}

          {filteredCandidates.map((c) => (
            <div
              key={c.id}
              className="bg-white p-3.5 rounded-xl shadow-sm border border-slate-100 hover:border-slate-200 transition-all"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">{c.name}</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {c.last_role} • {c.experience} yrs exp • {c.location}
                  </p>
                </div>
                <Badge
                  color={
                    c.status === 'Placed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : c.status === 'Blacklisted'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-blue-50 text-blue-700'
                  }
                >
                  {c.status}
                </Badge>
              </div>

              {/* Skills tags */}
              <div className="flex flex-wrap gap-1 mt-2">
                {(c.skills || []).map((skill, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>

              {/* Actions & Salary */}
              <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100 text-xs">
                <span className="font-semibold text-slate-700">
                  ₹{Number(c.expected_salary || 0).toLocaleString('en-IN')} / mo
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCall(c)}
                    className="p-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100"
                    title="Call"
                  >
                    <Phone size={14} />
                  </button>
                  <button
                    onClick={() => handleWhatsApp(c)}
                    className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-100"
                    title="WhatsApp"
                  >
                    <MessageCircle size={14} />
                  </button>
                  <button
                    onClick={() => setSelectedCandidate(c)}
                    className="px-2.5 py-1.5 bg-slate-100 text-slate-700 font-medium rounded-md hover:bg-slate-200 flex items-center gap-1 text-[11px]"
                  >
                    <Calendar size={13} /> Match & Schedule
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Candidate Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Candidate">
        <form onSubmit={form.handleSubmit(onSubmitCandidate)} className="space-y-3">
          <div>
            <Label>Full Name</Label>
            <Input
              placeholder="e.g. Rahul Sharma"
              {...form.register('name')}
              error={form.formState.errors.name?.message}
            />
          </div>

          <div>
            <Label>Mobile Number (10 digits)</Label>
            <Input
              type="tel"
              placeholder="9876543210"
              {...form.register('mobile')}
              error={form.formState.errors.mobile?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Experience (Years)</Label>
              <Input
                type="number"
                step="0.5"
                {...form.register('experience', { valueAsNumber: true })}
                error={form.formState.errors.experience?.message}
              />
            </div>
            <div>
              <Label>Expected Salary (₹/mo)</Label>
              <Input
                type="number"
                {...form.register('expected_salary', { valueAsNumber: true })}
                error={form.formState.errors.expected_salary?.message}
              />
            </div>
          </div>

          <div>
            <Label>Current Location / City</Label>
            <Input
              placeholder="e.g. Raipur"
              {...form.register('location')}
              error={form.formState.errors.location?.message}
            />
          </div>

          <div>
            <Label>Previous Role / Profile</Label>
            <Input
              placeholder="e.g. Accountant, Telecaller, Sales"
              {...form.register('last_role')}
              error={form.formState.errors.last_role?.message}
            />
          </div>

          <div>
            <Label>Skills (Comma-separated)</Label>
            <Input
              placeholder="Excel, Tally, Billing, Sales"
              {...form.register('skills')}
              error={form.formState.errors.skills?.message}
            />
          </div>

          <Button type="submit" className="w-full mt-3" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Registering...' : 'Register Candidate'}
          </Button>
        </form>
      </Modal>

      {/* Match & Schedule Modal */}
      <Modal
        isOpen={!!selectedCandidate}
        onClose={() => setSelectedCandidate(null)}
        title={`Matching Jobs: ${selectedCandidate?.name}`}
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Transparent match based on skills overlap, experience, location, and salary budget.
          </p>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {jobs
              .filter((j) => j.status === 'Open')
              .map((job) => {
                const match = selectedCandidate
                  ? calculateCandidateJobMatch(selectedCandidate, job)
                  : { score: 0, reasons: [], isEligible: false, skillOverlap: [] };

                return (
                  <div
                    key={job.id}
                    className={`p-3 rounded-lg border text-xs ${
                      match.score >= 60
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : match.score >= 40
                        ? 'bg-amber-50/40 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-slate-800 text-sm">{job.role}</span>
                        <p className="text-slate-500">{job.company_name} • {job.location}</p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          match.score >= 60
                            ? 'bg-emerald-100 text-emerald-800'
                            : match.score >= 40
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {match.score}% Match
                      </span>
                    </div>

                    <div className="mt-2 text-[11px] text-slate-600 space-y-0.5">
                      {match.reasons.map((r, i) => (
                        <p key={i}>• {r}</p>
                      ))}
                    </div>

                    <form
                      className="mt-3 flex gap-2 pt-2 border-t border-slate-200/60"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const time = (e.currentTarget.elements.namedItem('schedule_time') as HTMLInputElement).value;
                        if (time) handleSchedule(job.id, time);
                        else toast.error('Please pick a date and time');
                      }}
                    >
                      <input
                        name="schedule_time"
                        type="datetime-local"
                        className="text-xs border rounded p-1.5 flex-1 bg-white"
                        required
                      />
                      <Button type="submit" className="text-xs py-1 px-3">
                        Book
                      </Button>
                    </form>
                  </div>
                );
              })}
            {jobs.filter((j) => j.status === 'Open').length === 0 && (
              <p className="text-xs text-slate-400 py-3 text-center">No active open jobs to match.</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}