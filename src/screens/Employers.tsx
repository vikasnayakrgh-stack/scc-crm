import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Button, Input, Modal, Label, Badge, CardSkeleton } from '../components/ui';
import { Plus, Phone, Mail, MapPin, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { employerSchema, type EmployerInput } from '../lib/validation';

export default function Employers() {
  const { employers, jobs, loading, insert } = useData();
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const form = useForm<EmployerInput>({
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
    },
  });

  const filteredEmployers = employers.filter((e) => {
    return (
      e.company_name.toLowerCase().includes(search.toLowerCase()) ||
      e.contact_person.toLowerCase().includes(search.toLowerCase()) ||
      e.phone.includes(search) ||
      e.location.toLowerCase().includes(search.toLowerCase())
    );
  });

  const onSubmitEmployer = async (data: EmployerInput) => {
    try {
      await insert('employers', {
        ...data,
        status: 'Active',
        is_active: true,
      });

      toast.success('Employer added successfully!');
      form.reset();
      setIsAddOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add employer');
    }
  };

  return (
    <div className="pb-20 p-4 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-3 sticky top-0 bg-[#f1f5f9] z-10 py-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Employers & Clients ({filteredEmployers.length})</h1>
          <p className="text-xs text-slate-500">Corporate partners & hiring accounts</p>
        </div>
        <Button
          onClick={() => {
            form.reset();
            setIsAddOpen(true);
          }}
          className="flex items-center gap-1 text-xs py-1.5 px-3"
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
          className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEmployers.length === 0 && (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
              No employers found. Add a hiring company to link vacancies.
            </div>
          )}

          {filteredEmployers.map((emp) => {
            const activeJobs = jobs.filter((j) => j.employer_id === emp.id || j.company_name === emp.company_name);

            return (
              <div
                key={emp.id}
                className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:border-slate-200 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">{emp.company_name}</h3>
                    <p className="text-xs text-slate-600 font-medium">
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

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-between items-center text-xs">
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                    {activeJobs.length} Vacanc{activeJobs.length === 1 ? 'y' : 'ies'} Registered
                  </span>

                  <div className="flex gap-2">
                    <a
                      href={`tel:${emp.phone}`}
                      className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded font-medium hover:bg-slate-200"
                    >
                      Call HR
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Employer Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Register Employer / Client">
        <form onSubmit={form.handleSubmit(onSubmitEmployer)} className="space-y-3">
          <div>
            <Label>Company Name</Label>
            <Input
              placeholder="e.g. Apex Hospital, Shriram Finance"
              {...form.register('company_name')}
              error={form.formState.errors.company_name?.message}
            />
          </div>

          <div>
            <Label>HR / Contact Person Name</Label>
            <Input
              placeholder="e.g. Vikash Nayak (HR Manager)"
              {...form.register('contact_person')}
              error={form.formState.errors.contact_person?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Mobile / Phone</Label>
              <Input
                type="tel"
                placeholder="9876543210"
                {...form.register('phone')}
                error={form.formState.errors.phone?.message}
              />
            </div>
            <div>
              <Label>Location / City</Label>
              <Input
                placeholder="Raipur"
                {...form.register('location')}
                error={form.formState.errors.location?.message}
              />
            </div>
          </div>

          <div>
            <Label>Email (Optional)</Label>
            <Input
              type="email"
              placeholder="hr@company.com"
              {...form.register('email')}
              error={form.formState.errors.email?.message}
            />
          </div>

          <div>
            <Label>Industry / Sector (Optional)</Label>
            <Input
              placeholder="e.g. Manufacturing, Retail, IT, Banking"
              {...form.register('industry')}
              error={form.formState.errors.industry?.message}
            />
          </div>

          <div>
            <Label>Notes / Commercial Terms (Optional)</Label>
            <Input
              placeholder="e.g. 8.33% billing fee, 30 days credit"
              {...form.register('notes')}
              error={form.formState.errors.notes?.message}
            />
          </div>

          <Button type="submit" className="w-full mt-3" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving...' : 'Register Employer'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
