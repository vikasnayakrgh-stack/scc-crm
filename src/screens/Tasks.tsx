import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Button, Input, Modal, Label, Badge, CardSkeleton } from '../components/ui';
import { Square, Plus, Calendar, User, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { FollowUpTask, USERS } from '../types';
import { isPast, isSameDay, parseISO } from 'date-fns';

export default function Tasks() {
  const { tasks, candidates, employers, loading, insert, update } = useData();
  const { currentUser } = useUser();
  const [filter, setFilter] = useState<'All' | 'My' | 'Today' | 'Overdue' | 'Completed'>('Today');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0] || '');
  const [entityType, setEntityType] = useState<'candidate' | 'employer' | 'application'>('candidate');
  const [entityId, setEntityId] = useState('');
  const [assignedTo, setAssignedTo] = useState(currentUser);
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [notes, setNotes] = useState('');

  const now = new Date();

  const filteredTasks = tasks.filter((t) => {
    const isCompleted = t.status === 'Completed';

    if (filter === 'Completed') return isCompleted;
    if (isCompleted) return false; // Other tabs show uncompleted

    if (filter === 'My') return t.assigned_to === currentUser;

    if (filter === 'Today') {
      try {
        return isSameDay(parseISO(t.due_date), now);
      } catch {
        return false;
      }
    }

    if (filter === 'Overdue') {
      try {
        return isPast(parseISO(t.due_date)) && !isSameDay(parseISO(t.due_date), now);
      } catch {
        return false;
      }
    }

    return true; // All
  });

  const toggleTaskStatus = async (task: FollowUpTask) => {
    try {
      const nextStatus = task.status === 'Completed' ? 'Pending' : 'Completed';
      await update('tasks', {
        id: task.id,
        status: nextStatus,
        completed_at: nextStatus === 'Completed' ? new Date().toISOString() : undefined,
      });
      toast.success(nextStatus === 'Completed' ? 'Task marked complete!' : 'Task reopened');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update task');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !dueDate) {
      toast.error('Task title and due date are required');
      return;
    }

    try {
      await insert('tasks', {
        title: title.trim(),
        due_date: dueDate,
        entity_type: entityType,
        entity_id: entityId || 'general',
        assigned_to: assignedTo,
        priority,
        notes: notes.trim() || undefined,
        status: 'Pending',
        is_active: true,
      });

      toast.success('Task scheduled successfully!');
      setIsAddOpen(false);
      setTitle('');
      setNotes('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create task');
    }
  };

  return (
    <div className="pb-20 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-16 bg-[#f8fafc]/95 backdrop-blur-xs z-10 py-2.5 border-b border-slate-200/60">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Tasks & Follow-ups
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {filteredTasks.length}
            </span>
          </h1>
          <p className="text-xs text-slate-500">Candidate callbacks, client follow-ups & daily recruiter work queue</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter Tabs */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 text-xs">
            {(['Today', 'My', 'Overdue', 'All', 'Completed'] as const).map((tab) => (
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
            <Plus size={14} /> New Task
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div>
          {filteredTasks.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
              No tasks found in "{filter}" filter. You're all caught up!
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {filteredTasks.map((t) => {
              const isTaskOverdue =
                t.status !== 'Completed' &&
                isPast(parseISO(t.due_date)) &&
                !isSameDay(parseISO(t.due_date), now);

              return (
                <div
                  key={t.id}
                  className={`bg-white p-4.5 rounded-xl shadow-xs border flex items-start gap-3 transition-all hover:border-slate-300 ${
                    t.status === 'Completed'
                      ? 'border-slate-200/60 bg-slate-50/50 opacity-70'
                      : isTaskOverdue
                      ? 'border-red-200 bg-red-50/20'
                      : 'border-slate-200/80'
                  }`}
                >
                  <button
                    onClick={() => toggleTaskStatus(t)}
                    className="mt-0.5 text-slate-400 hover:text-blue-600 shrink-0 transition-colors"
                  >
                    {t.status === 'Completed' ? (
                      <CheckCircle2 size={19} className="text-emerald-600" />
                    ) : (
                      <Square size={19} className="text-slate-300 hover:text-blue-500" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <p
                        className={`text-sm font-semibold text-slate-900 ${
                          t.status === 'Completed' ? 'line-through text-slate-400' : ''
                        }`}
                      >
                        {t.title}
                      </p>
                      <Badge
                        variant={
                          t.priority === 'High'
                            ? 'danger'
                            : t.priority === 'Medium'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {t.priority}
                      </Badge>
                    </div>

                    {t.notes && <p className="text-xs text-slate-600 mt-1 bg-slate-50 p-2 rounded-lg border border-slate-100">{t.notes}</p>}

                    <div className="flex flex-wrap items-center gap-3 mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1 font-medium text-slate-700">
                        <User size={12} className="text-slate-400" /> {t.assigned_to}
                      </span>
                      <span
                        className={`flex items-center gap-1 ${
                          isTaskOverdue ? 'text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded' : 'text-slate-500'
                        }`}
                      >
                        <Calendar size={12} className={isTaskOverdue ? 'text-red-500' : 'text-slate-400'} />
                        Due: {t.due_date}
                        {isTaskOverdue && ' (OVERDUE)'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Create Follow-up Task" maxWidth="lg">
        <form onSubmit={handleCreateTask} className="space-y-3">
          <div>
            <Label>Task Title / Action</Label>
            <Input
              placeholder="e.g. Call candidate to confirm interview attendance"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Priority</Label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full text-xs border rounded-md p-2 bg-white"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Assign Recruiter</Label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value as any)}
                className="w-full text-xs border rounded-md p-2 bg-white"
              >
                {USERS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Related Entity</Label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as any)}
                className="w-full text-xs border rounded-md p-2 bg-white"
              >
                <option value="candidate">Candidate</option>
                <option value="employer">Employer / HR</option>
                <option value="application">General Application</option>
              </select>
            </div>
          </div>

          {entityType === 'candidate' && (
            <div>
              <Label>Select Candidate</Label>
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="w-full text-xs border rounded-md p-2 bg-white"
              >
                <option value="">Select Candidate (Optional)...</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.mobile})
                  </option>
                ))}
              </select>
            </div>
          )}

          {entityType === 'employer' && (
            <div>
              <Label>Select Employer</Label>
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="w-full text-xs border rounded-md p-2 bg-white"
              >
                <option value="">Select Employer (Optional)...</option>
                {employers.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.company_name} ({emp.contact_person})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label>Notes (Optional)</Label>
            <Input
              placeholder="e.g. Ask for updated resume with salary slip"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full mt-3">
            Schedule Task
          </Button>
        </form>
      </Modal>
    </div>
  );
}
