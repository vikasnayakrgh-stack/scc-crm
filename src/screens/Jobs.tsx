import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Button, Input, Modal, Label, Badge, CardSkeleton } from '../components/ui';
import { Plus, MapPin, IndianRupee, Clock, Pencil } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { jobSchema, type JobInput, parseSkills } from '../lib/validation';
import { Job } from '../types';

export default function Jobs() {
  const { jobs, employers, loading, insert, update } = useData();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [filter, setFilter] = useState<'All' | 'Open' | 'Closed'>('All');

  const addForm = useForm<JobInput>({
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
      status: 'Open',
    },
  });

  const editForm = useForm<JobInput>({
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
      status: 'Open',
    },
  });

  const filteredJobs = jobs.filter((j) => {
    if (filter === 'All') return true;
    return j.status === filter;
  });

  const handleOpenEdit = (j: Job) => {
    setEditingJob(j);
    editForm.reset({
      company_name: j.company_name,
      role: j.role,
      location: j.location,
      min_exp: Number(j.min_exp || 0),
      max_exp: Number(j.max_exp || 0),
      salary_min: Number(j.salary_min || 0),
      salary_max: Number(j.salary_max || 0),
      skills_req: (j.skills_req || []).join(', '),
      urgency: Number(j.urgency || 2),
      employer_id: j.employer_id || '',
      status: j.status || 'Open',
    });
    setIsEditOpen(true);
  };

  const onSubmitAddJob = async (data: JobInput) => {
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
        status: data.status || 'Open',
        is_active: true,
      });

      toast.success('Job opening created successfully!');
      addForm.reset();
      setIsAddOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Error creating job opening');
    }
  };

  const onSubmitEditJob = async (data: JobInput) => {
    if (!editingJob) return;

    try {
      const skillsArray = parseSkills(data.skills_req);
      await update('jobs', {
        id: editingJob.id,
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
        status: data.status || editingJob.status,
      });

      toast.success('Job opening updated successfully!');
      setIsEditOpen(false);
      setEditingJob(null);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update job opening');
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
            addForm.reset();
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEdit(j)}
                    className="text-xs px-2.5 py-1 rounded font-medium border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                    title="Edit Job"
                  >
                    <Pencil size={13} /> Edit
                  </button>
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
            </div>
          ))}
        </div>
      )}

      {/* Add Job Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Create Job Opening">
        <form onSubmit={addForm.handleSubmit(onSubmitAddJob)} className="space-y-3">
          <div>
            <Label>Employer / Company Name</Label>
            {employers.length > 0 ? (
              <div className="space-y-1">
                <select
                  className="w-full text-xs border rounded-md p-2 bg-white"
                  onChange={(e) => {
                    const emp = employers.find((x) => x.id === e.target.value);
                    if (emp) {
                      addForm.setValue('employer_id', emp.id);
                      addForm.setValue('company_name', emp.company_name);
                      addForm.setValue('location', emp.location);
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
                  {...addForm.register('company_name')}
                  error={addForm.formState.errors.company_name?.message}
                />
              </div>
            ) : (
              <Input
                placeholder="e.g. Jindal Steel, HDFC Bank, Local Agency"
                {...addForm.register('company_name')}
                error={addForm.formState.errors.company_name?.message}
              />
            )}
          </div>

          <div>
            <Label>Designation / Role</Label>
            <Input
              placeholder="e.g. Senior Accountant, Telecaller, Branch Manager"
              {...addForm.register('role')}
              error={addForm.formState.errors.role?.message}
            />
          </div>

          <div>
            <Label>Job Location / City</Label>
            <Input
              placeholder="e.g. Raipur, Bilaspur, Work from Home"
              {...addForm.register('location')}
              error={addForm.formState.errors.location?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Min Exp (Yrs)</Label>
              <Input
                type="number"
                min="0"
                {...addForm.register('min_exp', { valueAsNumber: true })}
                error={addForm.formState.errors.min_exp?.message}
              />
            </div>
            <div>
              <Label>Max Exp (Yrs)</Label>
              <Input
                type="number"
                min="0"
                {...addForm.register('max_exp', { valueAsNumber: true })}
                error={addForm.formState.errors.max_exp?.message}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Min Salary (₹/mo)</Label>
              <Input
                type="number"
                min="0"
                {...addForm.register('salary_min', { valueAsNumber: true })}
                error={addForm.formState.errors.salary_min?.message}
              />
            </div>
            <div>
              <Label>Max Salary (₹/mo)</Label>
              <Input
                type="number"
                min="0"
                {...addForm.register('salary_max', { valueAsNumber: true })}
                error={addForm.formState.errors.salary_max?.message}
              />
            </div>
          </div>

          <div>
            <Label>Required Skills (Comma-separated)</Label>
            <Input
              placeholder="e.g. Tally, Excel, GST, Hindi, English"
              {...addForm.register('skills_req')}
              error={addForm.formState.errors.skills_req?.message}
            />
          </div>

          <div>
            <Label>Urgency Level (1-5)</Label>
            <Input
              type="number"
              min="1"
              max="5"
              {...addForm.register('urgency', { valueAsNumber: true })}
              error={addForm.formState.errors.urgency?.message}
            />
          </div>

          <Button type="submit" className="w-full mt-3" disabled={addForm.formState.isSubmitting}>
            {addForm.formState.isSubmitting ? 'Saving...' : 'Post Job Opening'}
          </Button>
        </form>
      </Modal>

      {/* Edit Job Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingJob(null);
        }}
        title={`Edit Job Opening: ${editingJob?.role || ''}`}
      >
        <form onSubmit={editForm.handleSubmit(onSubmitEditJob)} className="space-y-3">
          <div>
            <Label>Employer / Company Name</Label>
            {employers.length > 0 ? (
              <div className="space-y-1">
                <select
                  className="w-full text-xs border rounded-md p-2 bg-white"
                  value={editForm.watch('employer_id') || ''}
                  onChange={(e) => {
                    const empId = e.target.value;
                    const emp = employers.find((x) => x.id === empId);
                    editForm.setValue('employer_id', empId);
                    if (emp) {
                      editForm.setValue('company_name', emp.company_name);
                    }
                  }}
                >
                  <option value="">Select Employer (Optional)...</option>
                  {employers.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.company_name} ({emp.location})
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Or enter company name manually"
                  {...editForm.register('company_name')}
                  error={editForm.formState.errors.company_name?.message}
                />
              </div>
            ) : (
              <Input
                placeholder="e.g. Jindal Steel, HDFC Bank, Local Agency"
                {...editForm.register('company_name')}
                error={editForm.formState.errors.company_name?.message}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Designation / Role</Label>
              <Input
                placeholder="e.g. Senior Accountant"
                {...editForm.register('role')}
                error={editForm.formState.errors.role?.message}
              />
            </div>
            <div>
              <Label>Job Status</Label>
              <select
                className="w-full text-xs border rounded-md p-2 bg-white"
                {...editForm.register('status')}
              >
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
          </div>

          <div>
            <Label>Job Location / City</Label>
            <Input
              placeholder="e.g. Raipur, Bilaspur, Work from Home"
              {...editForm.register('location')}
              error={editForm.formState.errors.location?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Min Exp (Yrs)</Label>
              <Input
                type="number"
                min="0"
                {...editForm.register('min_exp', { valueAsNumber: true })}
                error={editForm.formState.errors.min_exp?.message}
              />
            </div>
            <div>
              <Label>Max Exp (Yrs)</Label>
              <Input
                type="number"
                min="0"
                {...editForm.register('max_exp', { valueAsNumber: true })}
                error={editForm.formState.errors.max_exp?.message}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Min Salary (₹/mo)</Label>
              <Input
                type="number"
                min="0"
                {...editForm.register('salary_min', { valueAsNumber: true })}
                error={editForm.formState.errors.salary_min?.message}
              />
            </div>
            <div>
              <Label>Max Salary (₹/mo)</Label>
              <Input
                type="number"
                min="0"
                {...editForm.register('salary_max', { valueAsNumber: true })}
                error={editForm.formState.errors.salary_max?.message}
              />
            </div>
          </div>

          <div>
            <Label>Required Skills (Comma-separated)</Label>
            <Input
              placeholder="e.g. Tally, Excel, GST, Hindi, English"
              {...editForm.register('skills_req')}
              error={editForm.formState.errors.skills_req?.message}
            />
          </div>

          <div>
            <Label>Urgency Level (1-5)</Label>
            <Input
              type="number"
              min="1"
              max="5"
              {...editForm.register('urgency', { valueAsNumber: true })}
              error={editForm.formState.errors.urgency?.message}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setIsEditOpen(false);
                setEditingJob(null);
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
    </div>
  );
}