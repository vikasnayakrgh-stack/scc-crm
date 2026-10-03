import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Button, Input, Modal, Label, Badge, CardSkeleton } from '../components/ui';
import { Phone, MessageCircle, Calendar, UserPlus, Search, Pencil, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Candidate } from '../types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  candidateSchema,
  type CandidateInput,
  parseSkills,
  QUALIFICATION_OPTIONS,
  NOTICE_PERIOD_OPTIONS,
  ACQUISITION_SOURCE_OPTIONS,
} from '../lib/validation';
import { calculateCandidateJobMatch } from '../lib/matching';
import { scheduleInterviewWithApplication } from '../lib/pipelineHelpers';
import { CandidateImportModal } from '../components/CandidateImportModal';

export default function Candidates() {
  const { candidates, jobs, applications, loading, insert, update } = useData();
  const { currentUser } = useUser();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Placed' | 'Blacklisted'>('All');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);

  // Custom options state for Add modal
  const [addQualSelect, setAddQualSelect] = useState('');
  const [addCustomQual, setAddCustomQual] = useState('');
  const [addNoticeSelect, setAddNoticeSelect] = useState('');
  const [addCustomNotice, setAddCustomNotice] = useState('');
  const [addSourceSelect, setAddSourceSelect] = useState('');
  const [addCustomSource, setAddCustomSource] = useState('');

  // Custom options state for Edit modal
  const [editQualSelect, setEditQualSelect] = useState('');
  const [editCustomQual, setEditCustomQual] = useState('');
  const [editNoticeSelect, setEditNoticeSelect] = useState('');
  const [editCustomNotice, setEditCustomNotice] = useState('');
  const [editSourceSelect, setEditSourceSelect] = useState('');
  const [editCustomSource, setEditCustomSource] = useState('');

  // Auto-open import modal if requested via hash param (e.g. for previewing / verification)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('importStep=')) {
      setIsImportOpen(true);
    }
  }, []);

  const addForm = useForm<CandidateInput>({
    resolver: zodResolver(candidateSchema),
    defaultValues: {
      name: '',
      mobile: '',
      experience: 0,
      skills: '',
      location: '',
      expected_salary: 0,
      current_salary: 0,
      last_role: '',
      email: '',
      notes: '',
      status: 'Active',
    },
  });

  const editForm = useForm<CandidateInput>({
    resolver: zodResolver(candidateSchema),
    defaultValues: {
      name: '',
      mobile: '',
      experience: 0,
      skills: '',
      location: '',
      expected_salary: 0,
      current_salary: 0,
      last_role: '',
      email: '',
      notes: '',
      status: 'Active',
    },
  });

  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.mobile.includes(search) ||
        (c.skills || []).some((s) => s.toLowerCase().includes(search.toLowerCase())) ||
        (c.last_role || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.qualification || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.location || '').toLowerCase().includes(search.toLowerCase());

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

  // Open Edit Modal & prefill form
  const handleOpenEdit = (c: Candidate) => {
    setEditingCandidate(c);

    // Resolve qualification
    if (c.qualification) {
      if (QUALIFICATION_OPTIONS.includes(c.qualification as any) && c.qualification !== 'Other') {
        setEditQualSelect(c.qualification);
        setEditCustomQual('');
      } else {
        setEditQualSelect('Other');
        setEditCustomQual(c.qualification);
      }
    } else {
      setEditQualSelect('');
      setEditCustomQual('');
    }

    // Resolve notice period
    if (c.notice_period) {
      if (NOTICE_PERIOD_OPTIONS.includes(c.notice_period as any) && c.notice_period !== 'Other') {
        setEditNoticeSelect(c.notice_period);
        setEditCustomNotice('');
      } else {
        setEditNoticeSelect('Other');
        setEditCustomNotice(c.notice_period);
      }
    } else {
      setEditNoticeSelect('');
      setEditCustomNotice('');
    }

    // Resolve source
    if (c.source) {
      if (ACQUISITION_SOURCE_OPTIONS.includes(c.source as any) && c.source !== 'Other') {
        setEditSourceSelect(c.source);
        setEditCustomSource('');
      } else {
        setEditSourceSelect('Other');
        setEditCustomSource(c.source);
      }
    } else {
      setEditSourceSelect('');
      setEditCustomSource('');
    }

    editForm.reset({
      name: c.name,
      mobile: c.mobile,
      experience: Number(c.experience || 0),
      skills: (c.skills || []).join(', '),
      location: c.location || '',
      expected_salary: Number(c.expected_salary || 0),
      current_salary: Number(c.current_salary || 0),
      last_role: c.last_role || '',
      email: c.email || '',
      notes: c.notes || '',
      status: c.status || 'Active',
    });

    setIsEditOpen(true);
  };

  const onSubmitAddCandidate = async (data: CandidateInput) => {
    try {
      const skillsArray = parseSkills(data.skills);
      const effectiveQualification =
        addQualSelect === 'Other' ? addCustomQual.trim() : addQualSelect.trim();
      const effectiveNotice =
        addNoticeSelect === 'Other' ? addCustomNotice.trim() : addNoticeSelect.trim();
      const effectiveSource =
        addSourceSelect === 'Other' ? addCustomSource.trim() : addSourceSelect.trim();

      await insert('candidates', {
        name: data.name.trim(),
        mobile: data.mobile.trim(),
        email: data.email?.trim() || undefined,
        experience: Number(data.experience),
        skills: skillsArray,
        location: data.location.trim(),
        expected_salary: Number(data.expected_salary),
        current_salary: data.current_salary !== undefined ? Number(data.current_salary) : 0,
        last_role: data.last_role.trim(),
        qualification: effectiveQualification || undefined,
        notice_period: effectiveNotice || undefined,
        source: effectiveSource || undefined,
        notes: data.notes?.trim() || undefined,
        owner_id: currentUser,
        status: data.status || 'Active',
        is_active: true,
      });

      toast.success('Candidate registered successfully!');
      addForm.reset();
      setAddQualSelect('');
      setAddCustomQual('');
      setAddNoticeSelect('');
      setAddCustomNotice('');
      setAddSourceSelect('');
      setAddCustomSource('');
      setIsAddOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add candidate. Mobile number may already exist.');
    }
  };

  const onSubmitEditCandidate = async (data: CandidateInput) => {
    if (!editingCandidate) return;

    try {
      const skillsArray = parseSkills(data.skills);
      const effectiveQualification =
        editQualSelect === 'Other' ? editCustomQual.trim() : editQualSelect.trim();
      const effectiveNotice =
        editNoticeSelect === 'Other' ? editCustomNotice.trim() : editNoticeSelect.trim();
      const effectiveSource =
        editSourceSelect === 'Other' ? editCustomSource.trim() : editSourceSelect.trim();

      await update('candidates', {
        id: editingCandidate.id,
        name: data.name.trim(),
        mobile: data.mobile.trim(),
        email: data.email?.trim() || undefined,
        experience: Number(data.experience),
        skills: skillsArray,
        location: data.location.trim(),
        expected_salary: Number(data.expected_salary),
        current_salary: data.current_salary !== undefined ? Number(data.current_salary) : 0,
        last_role: data.last_role.trim(),
        qualification: effectiveQualification || undefined,
        notice_period: effectiveNotice || undefined,
        source: effectiveSource || undefined,
        status: data.status || editingCandidate.status,
        notes: data.notes?.trim() || undefined,
      });

      toast.success('Candidate updated successfully!');
      setIsEditOpen(false);
      setEditingCandidate(null);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update candidate');
    }
  };

  const handleSchedule = async (jobId: string, time: string) => {
    if (!selectedCandidate) return;
    try {
      const result = await scheduleInterviewWithApplication({
        candidateId: selectedCandidate.id,
        jobId,
        scheduledTime: time,
        currentUser,
        existingApplications: applications,
        insert,
        update,
      });

      if (result.applicationCreated) {
        toast.success('Application created in pipeline & interview scheduled!');
      } else {
        toast.success('Interview scheduled and linked to existing application!');
      }
      setSelectedCandidate(null);
    } catch (e: any) {
      toast.error('Schedule failed: ' + (e?.message || 'Error'));
    }
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header & Search */}
      <div className="sticky top-16 bg-[#f8fafc]/95 backdrop-blur-xs pt-2 pb-3 z-10 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              Candidates
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {filteredCandidates.length}
              </span>
            </h1>
            <p className="text-xs text-slate-500">Candidate pool & matching</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-1.5 text-xs py-1.5 px-3 shadow-2xs"
            >
              <Upload size={14} className="text-blue-600" /> Import Candidates
            </Button>
            <Button
              onClick={() => {
                addForm.reset();
                setAddQualSelect('');
                setAddCustomQual('');
                setAddNoticeSelect('');
                setAddCustomNotice('');
                setAddSourceSelect('');
                setAddCustomSource('');
                setIsAddOpen(true);
              }}
              className="flex items-center gap-1.5 text-xs py-1.5 px-3 shadow-xs"
            >
              <UserPlus size={14} /> New Candidate
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, skill, role, qualification, or city..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Candidate List */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div>
          {filteredCandidates.length === 0 && (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
              No candidates found matching your search.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {filteredCandidates.map((c) => (
            <div
              key={c.id}
              className="bg-white p-3.5 rounded-xl shadow-sm border border-slate-100 hover:border-slate-200 transition-all"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800 text-sm">{c.name}</h3>
                    {c.registration_fee_paid === false && (
                      <span
                        className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-medium border border-amber-200"
                        title="Registration fee not recorded yet (does not block scheduling)"
                      >
                        ₹200 Fee Due
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
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

              {/* Extended Info Chips */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {c.qualification && (
                  <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium">
                    🎓 {c.qualification}
                  </span>
                )}
                {c.notice_period && (
                  <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-medium">
                    ⏱️ {c.notice_period}
                  </span>
                )}
                {c.source && (
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                    📍 {c.source}
                  </span>
                )}
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
                <div>
                  <span className="font-semibold text-slate-700">
                    ₹{Number(c.expected_salary || 0).toLocaleString('en-IN')} / mo
                  </span>
                  {c.current_salary !== undefined && Number(c.current_salary) > 0 && (
                    <span className="text-[11px] text-slate-400 font-normal ml-1">
                      (Cur: ₹{Number(c.current_salary).toLocaleString('en-IN')})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEdit(c)}
                    className="p-1.5 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200"
                    title="Edit Candidate"
                  >
                    <Pencil size={14} />
                  </button>
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
        </div>
      )}

      {/* Add Candidate Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Candidate" maxWidth="lg">
        <form onSubmit={addForm.handleSubmit(onSubmitAddCandidate)} className="space-y-3">
          <div>
            <Label>Full Name</Label>
            <Input
              placeholder="e.g. Rahul Sharma"
              {...addForm.register('name')}
              error={addForm.formState.errors.name?.message}
            />
          </div>

          <div>
            <Label>Mobile Number (10 digits)</Label>
            <Input
              type="tel"
              placeholder="9876543210"
              {...addForm.register('mobile')}
              error={addForm.formState.errors.mobile?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Experience (Years)</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                {...addForm.register('experience', { valueAsNumber: true })}
                error={addForm.formState.errors.experience?.message}
              />
            </div>
            <div>
              <Label>Expected Salary (₹/mo)</Label>
              <Input
                type="number"
                min="0"
                {...addForm.register('expected_salary', { valueAsNumber: true })}
                error={addForm.formState.errors.expected_salary?.message}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Current Salary (₹/mo, Optional)</Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 15000"
                {...addForm.register('current_salary', { valueAsNumber: true })}
                error={addForm.formState.errors.current_salary?.message}
              />
            </div>
            <div>
              <Label>Current Location / City</Label>
              <Input
                placeholder="e.g. Raipur"
                {...addForm.register('location')}
                error={addForm.formState.errors.location?.message}
              />
            </div>
          </div>

          {/* Qualification Dropdown + Custom Other */}
          <div>
            <Label>Highest Qualification</Label>
            <select
              className="w-full text-xs border rounded-md p-2 bg-white"
              value={addQualSelect}
              onChange={(e) => setAddQualSelect(e.target.value)}
            >
              <option value="">Select Qualification (Optional)...</option>
              {QUALIFICATION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {addQualSelect === 'Other' && (
              <Input
                className="mt-1.5"
                placeholder="Specify custom qualification (e.g. B.Arch, M.Sc Chemistry)"
                value={addCustomQual}
                onChange={(e) => setAddCustomQual(e.target.value)}
              />
            )}
          </div>

          {/* Notice Period Dropdown + Custom Other */}
          <div>
            <Label>Notice Period</Label>
            <select
              className="w-full text-xs border rounded-md p-2 bg-white"
              value={addNoticeSelect}
              onChange={(e) => setAddNoticeSelect(e.target.value)}
            >
              <option value="">Select Notice Period (Optional)...</option>
              {NOTICE_PERIOD_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {addNoticeSelect === 'Other' && (
              <Input
                className="mt-1.5"
                placeholder="Specify custom notice period (e.g. 2 Months, Serving Notice)"
                value={addCustomNotice}
                onChange={(e) => setAddCustomNotice(e.target.value)}
              />
            )}
          </div>

          {/* Acquisition Source Dropdown + Custom Other */}
          <div>
            <Label>Acquisition Source</Label>
            <select
              className="w-full text-xs border rounded-md p-2 bg-white"
              value={addSourceSelect}
              onChange={(e) => setAddSourceSelect(e.target.value)}
            >
              <option value="">Select Acquisition Source (Optional)...</option>
              {ACQUISITION_SOURCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {addSourceSelect === 'Other' && (
              <Input
                className="mt-1.5"
                placeholder="Specify custom source (e.g. Job Fair, Newspaper Ad)"
                value={addCustomSource}
                onChange={(e) => setAddCustomSource(e.target.value)}
              />
            )}
          </div>

          <div>
            <Label>Previous Role / Profile</Label>
            <Input
              placeholder="e.g. Accountant, Telecaller, Sales"
              {...addForm.register('last_role')}
              error={addForm.formState.errors.last_role?.message}
            />
          </div>

          <div>
            <Label>Skills (Comma-separated)</Label>
            <Input
              placeholder="Excel, Tally, Billing, Sales"
              {...addForm.register('skills')}
              error={addForm.formState.errors.skills?.message}
            />
          </div>

          <div>
            <Label>Email (Optional)</Label>
            <Input
              type="email"
              placeholder="rahul@example.com"
              {...addForm.register('email')}
              error={addForm.formState.errors.email?.message}
            />
          </div>

          <div>
            <Label>Notes (Optional)</Label>
            <Input
              placeholder="Candidate background, preferences, etc."
              {...addForm.register('notes')}
              error={addForm.formState.errors.notes?.message}
            />
          </div>

          <Button type="submit" className="w-full mt-3" disabled={addForm.formState.isSubmitting}>
            {addForm.formState.isSubmitting ? 'Registering...' : 'Register Candidate'}
          </Button>
        </form>
      </Modal>

      {/* Edit Candidate Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingCandidate(null);
        }}
        title={`Edit Candidate: ${editingCandidate?.name || ''}`}
        maxWidth="lg"
      >
        <form onSubmit={editForm.handleSubmit(onSubmitEditCandidate)} className="space-y-3">
          <div>
            <Label>Full Name</Label>
            <Input
              placeholder="e.g. Rahul Sharma"
              {...editForm.register('name')}
              error={editForm.formState.errors.name?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Mobile Number</Label>
              <Input
                type="tel"
                placeholder="9876543210"
                {...editForm.register('mobile')}
                error={editForm.formState.errors.mobile?.message}
              />
            </div>
            <div>
              <Label>Candidate Status</Label>
              <select
                className="w-full text-xs border rounded-md p-2 bg-white"
                {...editForm.register('status')}
              >
                <option value="Active">Active</option>
                <option value="Placed">Placed</option>
                <option value="Blacklisted">Blacklisted</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Experience (Years)</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                {...editForm.register('experience', { valueAsNumber: true })}
                error={editForm.formState.errors.experience?.message}
              />
            </div>
            <div>
              <Label>Expected Salary (₹/mo)</Label>
              <Input
                type="number"
                min="0"
                {...editForm.register('expected_salary', { valueAsNumber: true })}
                error={editForm.formState.errors.expected_salary?.message}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Current Salary (₹/mo, Optional)</Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 15000"
                {...editForm.register('current_salary', { valueAsNumber: true })}
                error={editForm.formState.errors.current_salary?.message}
              />
            </div>
            <div>
              <Label>Current Location / City</Label>
              <Input
                placeholder="e.g. Raipur"
                {...editForm.register('location')}
                error={editForm.formState.errors.location?.message}
              />
            </div>
          </div>

          {/* Qualification Dropdown + Custom Other */}
          <div>
            <Label>Highest Qualification</Label>
            <select
              className="w-full text-xs border rounded-md p-2 bg-white"
              value={editQualSelect}
              onChange={(e) => setEditQualSelect(e.target.value)}
            >
              <option value="">Select Qualification (Optional)...</option>
              {QUALIFICATION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {editQualSelect === 'Other' && (
              <Input
                className="mt-1.5"
                placeholder="Specify custom qualification"
                value={editCustomQual}
                onChange={(e) => setEditCustomQual(e.target.value)}
              />
            )}
          </div>

          {/* Notice Period Dropdown + Custom Other */}
          <div>
            <Label>Notice Period</Label>
            <select
              className="w-full text-xs border rounded-md p-2 bg-white"
              value={editNoticeSelect}
              onChange={(e) => setEditNoticeSelect(e.target.value)}
            >
              <option value="">Select Notice Period (Optional)...</option>
              {NOTICE_PERIOD_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {editNoticeSelect === 'Other' && (
              <Input
                className="mt-1.5"
                placeholder="Specify custom notice period"
                value={editCustomNotice}
                onChange={(e) => setEditCustomNotice(e.target.value)}
              />
            )}
          </div>

          {/* Acquisition Source Dropdown + Custom Other */}
          <div>
            <Label>Acquisition Source</Label>
            <select
              className="w-full text-xs border rounded-md p-2 bg-white"
              value={editSourceSelect}
              onChange={(e) => setEditSourceSelect(e.target.value)}
            >
              <option value="">Select Acquisition Source (Optional)...</option>
              {ACQUISITION_SOURCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {editSourceSelect === 'Other' && (
              <Input
                className="mt-1.5"
                placeholder="Specify custom source"
                value={editCustomSource}
                onChange={(e) => setEditCustomSource(e.target.value)}
              />
            )}
          </div>

          <div>
            <Label>Previous Role / Profile</Label>
            <Input
              placeholder="e.g. Accountant, Telecaller, Sales"
              {...editForm.register('last_role')}
              error={editForm.formState.errors.last_role?.message}
            />
          </div>

          <div>
            <Label>Skills (Comma-separated)</Label>
            <Input
              placeholder="Excel, Tally, Billing, Sales"
              {...editForm.register('skills')}
              error={editForm.formState.errors.skills?.message}
            />
          </div>

          <div>
            <Label>Email (Optional)</Label>
            <Input
              type="email"
              placeholder="rahul@example.com"
              {...editForm.register('email')}
              error={editForm.formState.errors.email?.message}
            />
          </div>

          <div>
            <Label>Notes (Optional)</Label>
            <Input
              placeholder="Candidate background, preferences, etc."
              {...editForm.register('notes')}
              error={editForm.formState.errors.notes?.message}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setIsEditOpen(false);
                setEditingCandidate(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={editForm.formState.isSubmitting}
            >
              {editForm.formState.isSubmitting ? 'Saving Changes...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Match & Schedule Modal */}
      <Modal
        isOpen={!!selectedCandidate}
        onClose={() => setSelectedCandidate(null)}
        title={`Matching Jobs: ${selectedCandidate?.name}`}
        maxWidth="lg"
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

      {/* Bulk Candidate Import Modal */}
      <CandidateImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />
    </div>
  );
}