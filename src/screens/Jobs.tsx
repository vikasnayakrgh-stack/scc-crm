import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Button, Input, Modal, Label, Badge, CardSkeleton } from '../components/ui';
import { Plus, MapPin, IndianRupee, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { jobSchema, type JobInput, parseSkills } from '../lib/validation';

export default function Jobs() {
  const { jobs, employers, loading, insert, update } = useData();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [filter, setFilter] = useState<'All' | 'Open' | 'Closed'>('All');

  const form = useForm<JobInput>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      company_name: '',
      role: '',
      location: '',
      min_exp: 0,
      max_exp: 5,
      salary_min: 15000,
      salary_max: 30000,
      skills_req: '',
      urgency: 2,
      employer_id: '',
    },
  });

  const filteredJobs = jobs.filter((j) => {
    if (filter === 'All') return true;
    return j.status === filter;
  });

  const onSubmitJob = async (data: JobInput) => {
    try {
      const skillsArray = parseSkills(data.skills_req);
      await insert('jobs', {
        company_name: data.company_name.trim(),
        employer_id: data.employer_id || undefined,
        role: data.role.trim(),
        location: data.location.trim(),
        min_exp: Number(data.min_exp),
        max_exp: Number(data.max_exp),
        salary_min: Number(data.salary_min),
        salary_max: Number(data.salary_max),
        skills_req: skillsArray,
        urgency: Number(data.urgency),
        status: 'Open',
        is_active: true,
      });

      toast.success('Job opening created successfully!');
      form.reset();
      setIsAddOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Error creating job opening');
    }
  };

  const toggleJobStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'Open' ? 'Closed' : 'Open';
      await update('jobs', { id, status: newStatus });
      toast.success(`Job marked as ${newStatus}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update job status');
    }
  };

  return (
    <div className="pb-20 p-4 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-3 sticky top-0 bg-[#f1f5f9] z-10 py-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Job Openings ({filteredJobs.length})</h1>
          <p className="text-xs text-slate-500">Employer mandates and vacancies</p>
        </div>
        <Button
          onClick={() => {
            form.reset();
            setIsAddOpen(true);
          }}
          className="flex items-center gap-1 text-xs py-1.5 px-3"
        >
          <Plus size={14} /> Add Job
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3">
        {(['All', 'Open', 'Closed'] as const).map((tab) => (
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
          {filteredJobs.length === 0 && (
            <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
              No {filter !== 'All' ? filter.toLowerCase() : ''} jobs found.
            </div>
          )}

          {filteredJobs.map((j) => (
            <div
              key={j.id}
              className={`bg-white p-4 rounded-xl shadow-sm border ${
                j.status === 'Closed' ? 'border-slate-200 opacity-75' : 'border-slate-100'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">{j.role}</h3>
                  <p className="text-xs font-semibold text-blue-700">{j.company_name}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge color={j.urgency >= 4 ? 'bg-red-100 text-red-700 font-bold' : 'bg-blue-50 text-blue-700'}>
                    {j.urgency >= 4 ? 'Urgent' : 'Normal'}
                  </Badge>
                  <Badge color={j.status === 'Open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}>
                    {j.status}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-2.5">
                <span className="flex items-center gap-1">
                  <MapPin size={13} className="text-slate-400" /> {j.location}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={13} className="text-slate-400" /> {j.min_exp}-{j.max_exp} Yrs Exp
                </span>
                <span className="flex items-center gap-1 font-semibold text-slate-700">
                  <IndianRupee size={13} className="text-slate-400" />
                  {j.salary_min?.toLocaleString('en-IN')} - {j.salary_max?.toLocaleString('en-IN')} / mo
                </span>
              </div>

              {/* Skills */}
              <div className="flex flex-wrap gap-1 mt-3">
                {(j.skills_req || []).map((skill, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>

              {/* Action bar */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-between items-center text-xs">
                <span className="text-[11px] text-slate-400">
                  Added on {new Date(j.created_at).toLocaleDateString('en-IN')}
                </span>
                <button
                  onClick={() => toggleJobStatus(j.id, j.status)}
                  className={`text-xs px-2.5 py-1 rounded font-medium border ${
                    j.status === 'Open'
                      ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                  }`}
                >
                  {j.status === 'Open' ? 'Close Job' : 'Reopen Job'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Job Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Create Job Opening">
        <form onSubmit={form.handleSubmit(onSubmitJob)} className="space-y-3">
          <div>
            <Label>Employer / Company Name</Label>
            {employers.length > 0 ? (
              <div className="space-y-1">
                <select
                  className="w-full text-xs border rounded-md p-2 bg-white"
                  onChange={(e) => {
                    const emp = employers.find((x) => x.id === e.target.value);
                    if (emp) {
                      form.setValue('employer_id', emp.id);
                      form.setValue('company_name', emp.company_name);
                      form.setValue('location', emp.location);
                    }
                  }}
                >
                  <option value="">Select Existing Employer (Optional)...</option>
                  {employers.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.company_name} ({emp.location})
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Or enter company name manually"
                  {...form.register('company_name')}
                  error={form.formState.errors.company_name?.message}
                />
              </div>
            ) : (
              <Input
                placeholder="e.g. Jindal Steel, HDFC Bank, Local Agency"
                {...form.register('company_name')}
                error={form.formState.errors.company_name?.message}
              />
            )}
          </div>

          <div>
            <Label>Designation / Role</Label>
            <Input
              placeholder="e.g. Senior Accountant, Telecaller, Branch Manager"
              {...form.register('role')}
              error={form.formState.errors.role?.message}
            />
          </div>

          <div>
            <Label>Job Location / City</Label>
            <Input
              placeholder="e.g. Raipur, Bilaspur, Work from Home"
              {...form.register('location')}
              error={form.formState.errors.location?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Min Exp (Yrs)</Label>
              <Input
                type="number"
                step="0.5"
                {...form.register('min_exp', { valueAsNumber: true })}
                error={form.formState.errors.min_exp?.message}
              />
            </div>
            <div>
              <Label>Max Exp (Yrs)</Label>
              <Input
                type="number"
                step="0.5"
                {...form.register('max_exp', { valueAsNumber: true })}
                error={form.formState.errors.max_exp?.message}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Min Salary (₹/mo)</Label>
              <Input
                type="number"
                {...form.register('salary_min', { valueAsNumber: true })}
                error={form.formState.errors.salary_min?.message}
              />
            </div>
            <div>
              <Label>Max Salary (₹/mo)</Label>
              <Input
                type="number"
                {...form.register('salary_max', { valueAsNumber: true })}
                error={form.formState.errors.salary_max?.message}
              />
            </div>
          </div>

          <div>
            <Label>Required Skills (Comma-separated)</Label>
            <Input
              placeholder="Tally, GST, Balance Sheet, Excel"
              {...form.register('skills_req')}
              error={form.formState.errors.skills_req?.message}
            />
          </div>

          <div>
            <Label>Urgency Level (1-5)</Label>
            <select
              {...form.register('urgency', { valueAsNumber: true })}
              className="w-full text-xs border rounded-md p-2 bg-white"
            >
              <option value={1}>1 - Low Priority</option>
              <option value={2}>2 - Standard</option>
              <option value={3}>3 - Important</option>
              <option value={4}>4 - High Urgency</option>
              <option value={5}>5 - Immediate Joining</option>
            </select>
          </div>

          <Button type="submit" className="w-full mt-3" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Posting...' : 'Create Job Opening'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}