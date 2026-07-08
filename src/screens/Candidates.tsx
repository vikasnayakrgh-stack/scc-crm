import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Button, Input, Modal, Label, Badge, CardSkeleton } from '../components/ui';
import { Phone, MessageCircle, Calendar, AlertTriangle, UserPlus, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Candidate } from '../types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { candidateSchema, type CandidateInput } from '../lib/validation';

export default function Candidates() {
  const { candidates, jobs, interviews, loading, insert } = useData();
  const { currentUser } = useUser();
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  const form = useForm<CandidateInput>({
    resolver: zodResolver(candidateSchema),
    defaultValues: {
      name: '',
      mobile: '',
      experience: 0,
      skills: [],
      location: '',
      expected_salary: 0,
      last_role: '',
    },
  });

  const filteredCandidates = useMemo(() => {
    return candidates.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.mobile.includes(search) ||
      c.skills.some(s => s.toLowerCase().includes(search.toLowerCase()))
    );
  }, [candidates, search]);

  const handleCall = async (c: Candidate) => {
    try {
      window.location.href = `tel:${c.mobile}`;
      await insert('call_logs', {
        candidate_id: c.id,
        telecaller_name: currentUser,
        call_type: 'Connected',
        timestamp: new Date().toISOString(),
        duration: 0,
        note: 'Auto-logged call'
      });
      toast.success('Call log add ho gaya!');
    } catch (e) {
      toast.error('Log save nahi hua, net check karein!');
    }
  };

  const handleWhatsApp = (c: Candidate) => {
    const msg = `Namaste ${c.name}, SCC se hum job opportunity ke regarding baat karna chahte hain.`;
    window.open(`https://wa.me/${c.mobile}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const onSubmitCandidate = async (data: CandidateInput) => {
    try {
      await insert('candidates', {
        ...data,
        owner_id: currentUser,
        status: 'Active',
        is_active: true
      });
      toast.success('Candidate add ho gaya!');
      form.reset();
      setIsAddOpen(false);
    } catch (e) {
      toast.error('Add fail hua. Shayad mobile duplicate hai?');
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
        is_active: true
      });
      toast.success('Interview fix ho gaya!');
      setSelectedCandidate(null);
    } catch (e) {
      toast.error('Schedule fail hua!');
    }
  };

  const getMatchScore = (c: Candidate, j: any) => {
    let score = 0;
    const skillMatch = j.skills_req.filter((req: string) =>
      c.skills.some(cs => cs.toLowerCase().includes(req.toLowerCase()))
    ).length;
    if (skillMatch > 0) score += 40;
    if (j.location.toLowerCase() === c.location.toLowerCase()) score += 20;
    if (c.experience >= j.min_exp && c.experience <= j.max_exp) score += 30;
    if (c.expected_salary <= j.salary_max) score += 10;
    return score;
  };

  const getRiskStatus = (c: Candidate) => {
    const noShows = interviews.filter(i => i.candidate_id === c.id && i.status === 'NoShow').length;
    return noShows >= 2;
  };

  return (
    <div className="pb-20 p-4">
      {/* Header & Search */}
      <div className="sticky top-0 bg-[#f1f5f9] pt-2 pb-4 z-10 space-y-3">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-slate-800">Candidates ({filteredCandidates.length})</h1>
          <Button onClick={() => { form.reset(); setIsAddOpen(true); }} className="flex items-center gap-1 text-sm">
            <UserPlus size={16} /> New
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <Input
            placeholder="Search Naam, Mobile, Skill..."
            className="pl-10"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCandidates.map(c => {
            const isRisky = getRiskStatus(c);
            return (
              <div key={c.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                      {c.name}
                      {isRisky && <Badge color="bg-red-100 text-red-600 flex items-center gap-1"><AlertTriangle size={10} /> Risk</Badge>}
                    </h3>
                    <p className="text-sm text-slate-500">{c.last_role} • {c.experience} yrs</p>
                    <p className="text-sm text-slate-500">{c.location}</p>
                  </div>
                  <div className="text-right">
                    <Badge color={c.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}>
                      {c.status}
                    </Badge>
                    <p className="text-xs text-slate-400 mt-1">₹{Math.round(c.expected_salary / 1000)}k</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {c.skills.slice(0, 3).map(s => (
                    <span key={s} className="text-xs bg-slate-50 text-slate-600 px-2 py-1 rounded border border-slate-100">{s}</span>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Button variant="success" className="flex justify-center items-center py-2" onClick={() => handleCall(c)}>
                    <Phone size={18} />
                  </Button>
                  <Button className="flex justify-center items-center bg-green-500 hover:bg-green-600 py-2" onClick={() => handleWhatsApp(c)}>
                    <MessageCircle size={18} />
                  </Button>
                  <Button variant="secondary" className="flex justify-center items-center py-2 text-sm" onClick={() => setSelectedCandidate(c)}>
                    <Calendar size={18} className="mr-1" /> Fix
                  </Button>
                </div>
              </div>
            );
          })}
          {filteredCandidates.length === 0 && !search && <p className="text-center text-slate-500 mt-8">No candidates yet. Add your first candidate!</p>}
          {filteredCandidates.length === 0 && search && <p className="text-center text-slate-500 mt-8">No matches found for "{search}"</p>}
        </div>
      )}

      {/* Add Candidate Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Naya Candidate">
        <form onSubmit={form.handleSubmit(onSubmitCandidate)} className="space-y-3">
          <div>
            <Label>Naam</Label>
            <Input
              {...form.register('name')}
              error={form.formState.errors.name?.message}
            />
          </div>
          <div>
            <Label>Mobile</Label>
            <Input
              type="tel"
              placeholder="+91 98765 43210"
              {...form.register('mobile')}
              error={form.formState.errors.mobile?.message}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Exp (Saal)</Label>
              <Input
                type="number"
                {...form.register('experience', { valueAsNumber: true })}
                error={form.formState.errors.experience?.message}
              />
            </div>
            <div>
              <Label>Tankhah (Maang)</Label>
              <Input
                type="number"
                {...form.register('expected_salary', { valueAsNumber: true })}
                error={form.formState.errors.expected_salary?.message}
              />
            </div>
          </div>
          <div>
            <Label>Location</Label>
            <Input
              {...form.register('location')}
              error={form.formState.errors.location?.message}
            />
          </div>
          <div>
            <Label>Pichla Role</Label>
            <Input
              {...form.register('last_role')}
              error={form.formState.errors.last_role?.message}
            />
          </div>
          <div>
            <Label>Skills (Comma se alag karein)</Label>
            <Input
              placeholder="Excel, Sales, Typing"
              {...form.register('skills')}
              error={form.formState.errors.skills?.message}
            />
          </div>
          <Button type="submit" className="w-full mt-2" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving...' : 'Save Karein'}
          </Button>
        </form>
      </Modal>

      {/* Schedule Modal */}
      <Modal isOpen={!!selectedCandidate} onClose={() => setSelectedCandidate(null)} title={`Schedule: ${selectedCandidate?.name}`}>
        <div className="space-y-4">
          <h4 className="font-semibold text-slate-700">Recommended Jobs</h4>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {jobs.map(j => {
              const score = selectedCandidate ? getMatchScore(selectedCandidate, j) : 0;
              return (
                <div key={j.id} className="border p-3 rounded-lg bg-slate-50">
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-800">{j.role}</span>
                    <Badge color={score > 50 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                      {score}% Match
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">{j.company_name} • {j.location}</p>
                  <p className="text-xs text-slate-500 mt-1">Budget: ₹{j.salary_max}</p>
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const time = (e.currentTarget.elements.namedItem('time') as HTMLInputElement).value;
                      if (time) handleSchedule(j.id, time);
                      else toast.error("Time select karein");
                    }}
                  >
                    <input name="time" type="datetime-local" className="text-xs border rounded p-1 flex-1" required />
                    <Button type="submit" className="text-xs py-1 px-2">Book</Button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}