import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { supabase } from '../lib/supabaseClient';
import { Button, Input, Modal, Label, Badge, CardSkeleton } from '../components/ui';
import { Briefcase, Plus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { jobSchema, type JobInput } from '../lib/validation';

export default function Jobs() {
  const { jobs, loading } = useData();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const form = useForm<JobInput>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      company_name: '',
      role: '',
      location: '',
      min_exp: 0,
      max_exp: 0,
      salary_min: 0,
      salary_max: 0,
      skills_req: [],
      urgency: 1,
    },
  });

  const onSubmitJob = async (data: JobInput) => {
    try {
      const { error } = await supabase.from('jobs').insert({
        ...data,
        status: 'Open',
        is_active: true
      });
      if (error) throw error;
      toast.success('Job create ho gayi!');
      form.reset();
      setIsAddOpen(false);
    } catch (e) {
      toast.error('Error creating job');
    }
  };

  return (
    <div className="pb-20 p-4">
      <div className="flex justify-between items-center mb-4 sticky top-0 bg-[#f1f5f9] z-10 py-2">
        <h1 className="text-xl font-bold text-slate-800">Open Jobs ({jobs.length})</h1>
        <Button onClick={() => { form.reset(); setIsAddOpen(true); }} className="flex items-center gap-1 text-sm">
            <Plus size={16} /> Add Job
        </Button>
      </div>

      {loading ? <div className="space-y-4"><CardSkeleton /><CardSkeleton /></div> : (
        <div className="space-y-4">
            {jobs.map(j => (
                <div key={j.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex justify-between">
                        <h3 className="font-bold text-slate-800 text-lg">{j.role}</h3>
                        <Badge color={j.urgency > 3 ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"}>
                            {j.urgency > 3 ? 'Urgent' : 'Normal'}
                        </Badge>
                    </div>
                    <p className="text-slate-600 font-medium">{j.company_name}</p>
                    <div className="flex gap-4 text-sm text-slate-500 mt-2">
                        <span>📍 {j.location}</span>
                        <span>💼 {j.min_exp}-{j.max_exp} Yrs</span>
                    </div>
                    <div className="mt-2 text-sm text-slate-700 font-medium">
                        ₹{Math.round(j.salary_min/1000)}k - ₹{Math.round(j.salary_max/1000)}k
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                        {j.skills_req.slice(0,4).map(s => <span key={s} className="text-xs bg-slate-50 text-slate-500 px-2 py-1 rounded">{s}</span>)}
                    </div>
                </div>
            ))}
            {jobs.length === 0 && <p className="text-center text-slate-500 mt-8">No jobs yet. Add your first job!</p>}
        </div>
      )}

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Nayi Job Post">
        <form onSubmit={form.handleSubmit(onSubmitJob)} className="space-y-3">
            <div>
              <Label>Company</Label>
              <Input
                {...form.register('company_name')}
                error={form.formState.errors.company_name?.message}
              />
            </div>
            <div>
              <Label>Role</Label>
              <Input
                {...form.register('role')}
                error={form.formState.errors.role?.message}
              />
            </div>
            <div>
              <Label>Location</Label>
              <Input
                {...form.register('location')}
                error={form.formState.errors.location?.message}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Min Exp</Label>
                  <Input
                    type="number"
                    {...form.register('min_exp', { valueAsNumber: true })}
                    error={form.formState.errors.min_exp?.message}
                  />
                </div>
                <div>
                  <Label>Max Exp</Label>
                  <Input
                    type="number"
                    {...form.register('max_exp', { valueAsNumber: true })}
                    error={form.formState.errors.max_exp?.message}
                  />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Min Sal</Label>
                  <Input
                    type="number"
                    {...form.register('salary_min', { valueAsNumber: true })}
                    error={form.formState.errors.salary_min?.message}
                  />
                </div>
                <div>
                  <Label>Max Sal</Label>
                  <Input
                    type="number"
                    {...form.register('salary_max', { valueAsNumber: true })}
                    error={form.formState.errors.salary_max?.message}
                  />
                </div>
            </div>
            <div>
              <Label>Skills Required</Label>
              <Input
                placeholder="Sales, Excel"
                {...form.register('skills_req')}
                error={form.formState.errors.skills_req?.message}
              />
            </div>
            <div>
              <Label>Urgency (1-5)</Label>
              <Input
                type="number"
                max={5}
                min={1}
                {...form.register('urgency', { valueAsNumber: true })}
                error={form.formState.errors.urgency?.message}
              />
            </div>
            <Button type="submit" className="w-full mt-2" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Posting...' : 'Post Karein'}
            </Button>
        </form>
      </Modal>
    </div>
  );
}