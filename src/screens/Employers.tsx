import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Button, Input, Modal, Label, Badge, CardSkeleton } from '../components/ui';
import { Plus, Phone, Mail, MapPin, Search, Pencil, Users, ExternalLink } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { employerSchema, type EmployerInput } from '../lib/validation';
import { Employer, Candidate } from '../types';
import { ClientProfileDrawer } from '../components/ClientProfileDrawer';
import { CandidateProfileDrawer } from '../components/CandidateProfileDrawer';

export default function Employers() {
  const { employers, jobs, candidates, loading, insert, update } = useData();
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingEmployer, setEditingEmployer] = useState<Employer | null>(null);
  const [selectedProfileEmployer, setSelectedProfileEmployer] = useState<Employer | null>(null);
  const [selectedProfileCandidate, setSelectedProfileCandidate] = useState<Candidate | null>(null);

  const addForm = useForm<EmployerInput>({
    resolver: zodResolver(employerSchema),
    defaultValues: {
      company_name: '',
      contact_person: '',
      phone: '',
      email: '',
      location: '',
      industry: '',
      address: '',
      notes: '',
      status: 'Active',
    },
  });

  const editForm = useForm<EmployerInput>({
    resolver: zodResolver(employerSchema),
    defaultValues: {
      company_name: '',
      contact_person: '',
      phone: '',
      email: '',
      location: '',
      industry: '',
      address: '',
      notes: '',
      status: 'Active',
    },
  });

  const filteredEmployers = employers.filter((e) => {
    return (
      e.company_name.toLowerCase().includes(search.toLowerCase()) ||
      e.contact_person.toLowerCase().includes(search.toLowerCase()) ||
      e.phone.includes(search) ||
      e.location.toLowerCase().includes(search.toLowerCase()) ||
      (e.industry || '').toLowerCase().includes(search.toLowerCase())
    );
  });

  const handleOpenEdit = (emp: Employer) => {
    setEditingEmployer(emp);
    editForm.reset({
      company_name: emp.company_name,
      contact_person: emp.contact_person,
      phone: emp.phone,
      email: emp.email || '',
      location: emp.location,
      industry: emp.industry || '',
      address: emp.address || '',
      notes: emp.notes || '',
      status: emp.status || 'Active',
    });
    setIsEditOpen(true);
  };

  const onSubmitAddEmployer = async (data: EmployerInput) => {
    try {
      await insert('employers', {
        company_name: data.company_name.trim(),
        contact_person: data.contact_person.trim(),
        phone: data.phone.trim(),
        email: data.email?.trim() || undefined,
        location: data.location.trim(),
        industry: data.industry?.trim() || undefined,
        address: data.address?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
        status: data.status || 'Active',
        is_active: true,
      });

      toast.success('Employer added successfully!');
      addForm.reset();
      setIsAddOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add employer');
    }
  };

  const onSubmitEditEmployer = async (data: EmployerInput) => {
    if (!editingEmployer) return;

    try {
      await update('employers', {
        id: editingEmployer.id,
        company_name: data.company_name.trim(),
        contact_person: data.contact_person.trim(),
        phone: data.phone.trim(),
        email: data.email?.trim() || undefined,
        location: data.location.trim(),
        industry: data.industry?.trim() || undefined,
        address: data.address?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
        status: data.status || editingEmployer.status,
      });

      toast.success('Employer updated successfully!');
      setIsEditOpen(false);
      setEditingEmployer(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update employer');
    }
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-3 sticky top-16 bg-[#f8fafc]/95 backdrop-blur-xs z-10 py-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Employers & Clients ({filteredEmployers.length})</h1>
          <p className="text-xs text-slate-500">Corporate partners & hiring accounts</p>
        </div>
        <Button
          onClick={() => {
            addForm.reset();
            setIsAddOpen(true);
          }}
          className="flex items-center gap-1.5 text-xs py-1.5 px-3"
        >
          <Plus size={14} /> Add Client
        </Button>
      </div>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-3 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company, HR contact, phone or city..."
          className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div>
          {filteredEmployers.length === 0 && (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
              No employers found. Add a hiring company to link vacancies.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">

          {filteredEmployers.map((emp) => {
            const activeJobs = jobs.filter((j) => j.employer_id === emp.id || j.company_name === emp.company_name);

            return (
              <div
                key={emp.id}
                className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:border-slate-200 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <button
                      type="button"
                      onClick={() => setSelectedProfileEmployer(emp)}
                      className="font-bold text-slate-900 text-base hover:text-blue-600 hover:underline text-left transition-colors cursor-pointer flex items-center gap-1"
                      title="Click to view client profile, requirements and candidate interview history"
                    >
                      {emp.company_name}
                      <ExternalLink size={13} className="text-slate-400" />
                    </button>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      Contact: {emp.contact_person} {emp.industry ? `• ${emp.industry}` : ''}
                    </p>
                  </div>
                  <Badge color={emp.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}>
                    {emp.status}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-2.5">
                  <span className="flex items-center gap-1">
                    <MapPin size={13} className="text-slate-400" /> {emp.location}
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone size={13} className="text-slate-400" /> {emp.phone}
                  </span>
                  {emp.email && (
                    <span className="flex items-center gap-1">
                      <Mail size={13} className="text-slate-400" /> {emp.email}
                    </span>
                  )}
                </div>

                {emp.notes && (
                  <p className="text-[11px] text-slate-500 italic mt-2 bg-slate-50 p-2 rounded">
                    {emp.notes}
                  </p>
                )}

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-between items-center text-xs">
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                    {activeJobs.length} Vacanc{activeJobs.length === 1 ? 'y' : 'ies'} Registered
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedProfileEmployer(emp)}
                      className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-medium hover:bg-blue-100 flex items-center gap-1 text-xs"
                      title="View Candidate Interview History"
                    >
                      <Users size={12} /> Interviews
                    </button>
                    <button
                      onClick={() => handleOpenEdit(emp)}
                      className="px-2 py-1 bg-slate-100 text-slate-700 rounded font-medium hover:bg-slate-200 flex items-center gap-1 text-xs"
                      title="Edit Employer"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <a
                      href={`tel:${emp.phone}`}
                      className="px-2 py-1 bg-slate-100 text-slate-700 rounded font-medium hover:bg-slate-200 flex items-center gap-1 text-xs"
                    >
                      <Phone size={12} /> Call
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* Add Employer Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Register Employer / Client" maxWidth="lg">
        <form onSubmit={addForm.handleSubmit(onSubmitAddEmployer)} className="space-y-3">
          <div>
            <Label>Company Name</Label>
            <Input
              placeholder="e.g. Apex Hospital, Shriram Finance"
              {...addForm.register('company_name')}
              error={addForm.formState.errors.company_name?.message}
            />
          </div>

          <div>
            <Label>HR / Contact Person Name</Label>
            <Input
              placeholder="e.g. Vikash Nayak (HR Manager)"
              {...addForm.register('contact_person')}
              error={addForm.formState.errors.contact_person?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Mobile / Phone</Label>
              <Input
                type="tel"
                placeholder="9876543210"
                {...addForm.register('phone')}
                error={addForm.formState.errors.phone?.message}
              />
            </div>
            <div>
              <Label>Location / City</Label>
              <Input
                placeholder="Raipur"
                {...addForm.register('location')}
                error={addForm.formState.errors.location?.message}
              />
            </div>
          </div>

          <div>
            <Label>Email (Optional)</Label>
            <Input
              type="email"
              placeholder="hr@company.com"
              {...addForm.register('email')}
              error={addForm.formState.errors.email?.message}
            />
          </div>

          <div>
            <Label>Industry / Sector (Optional)</Label>
            <Input
              placeholder="e.g. Manufacturing, Retail, IT, Banking"
              {...addForm.register('industry')}
              error={addForm.formState.errors.industry?.message}
            />
          </div>

          <div>
            <Label>Address (Optional)</Label>
            <Input
              placeholder="e.g. Plot 12, Industrial Area, Ring Road No. 1"
              {...addForm.register('address')}
              error={addForm.formState.errors.address?.message}
            />
          </div>

          <div>
            <Label>Notes / Commercial Terms (Optional)</Label>
            <Input
              placeholder="e.g. 8.33% billing fee, 30 days credit"
              {...addForm.register('notes')}
              error={addForm.formState.errors.notes?.message}
            />
          </div>

          <Button type="submit" className="w-full mt-3" disabled={addForm.formState.isSubmitting}>
            {addForm.formState.isSubmitting ? 'Saving...' : 'Register Employer'}
          </Button>
        </form>
      </Modal>

      {/* Edit Employer Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingEmployer(null);
        }}
        title={`Edit Employer: ${editingEmployer?.company_name || ''}`}
        maxWidth="lg"
      >
        <form onSubmit={editForm.handleSubmit(onSubmitEditEmployer)} className="space-y-3">
          <div>
            <Label>Company Name</Label>
            <Input
              placeholder="e.g. Apex Hospital, Shriram Finance"
              {...editForm.register('company_name')}
              error={editForm.formState.errors.company_name?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>HR / Contact Person Name</Label>
              <Input
                placeholder="e.g. Vikash Nayak (HR Manager)"
                {...editForm.register('contact_person')}
                error={editForm.formState.errors.contact_person?.message}
              />
            </div>
            <div>
              <Label>Client Status</Label>
              <select
                className="w-full text-xs border rounded-md p-2 bg-white"
                {...editForm.register('status')}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Prospect">Prospect</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Mobile / Phone</Label>
              <Input
                type="tel"
                placeholder="9876543210"
                {...editForm.register('phone')}
                error={editForm.formState.errors.phone?.message}
              />
            </div>
            <div>
              <Label>Location / City</Label>
              <Input
                placeholder="Raipur"
                {...editForm.register('location')}
                error={editForm.formState.errors.location?.message}
              />
            </div>
          </div>

          <div>
            <Label>Email (Optional)</Label>
            <Input
              type="email"
              placeholder="hr@company.com"
              {...editForm.register('email')}
              error={editForm.formState.errors.email?.message}
            />
          </div>

          <div>
            <Label>Industry / Sector (Optional)</Label>
            <Input
              placeholder="e.g. Manufacturing, Retail, IT, Banking"
              {...editForm.register('industry')}
              error={editForm.formState.errors.industry?.message}
            />
          </div>

          <div>
            <Label>Address (Optional)</Label>
            <Input
              placeholder="e.g. Plot 12, Industrial Area, Ring Road No. 1"
              {...editForm.register('address')}
              error={editForm.formState.errors.address?.message}
            />
          </div>

          <div>
            <Label>Notes / Commercial Terms (Optional)</Label>
            <Input
              placeholder="e.g. 8.33% billing fee, 30 days credit"
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
                setEditingEmployer(null);
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

      {/* Client Profile & Candidate Interview History Drawer */}
      <ClientProfileDrawer
        isOpen={Boolean(selectedProfileEmployer)}
        onClose={() => setSelectedProfileEmployer(null)}
        employer={employers.find((e) => e.id === selectedProfileEmployer?.id) || selectedProfileEmployer}
        onEditEmployer={(emp) => handleOpenEdit(emp)}
        onOpenCandidateProfile={(cand) => setSelectedProfileCandidate(cand)}
      />

      {/* Candidate Profile Drawer (accessible from client interview history) */}
      <CandidateProfileDrawer
        isOpen={Boolean(selectedProfileCandidate)}
        onClose={() => setSelectedProfileCandidate(null)}
        candidate={candidates.find((c) => c.id === selectedProfileCandidate?.id) || selectedProfileCandidate}
      />
    </div>
  );
}
