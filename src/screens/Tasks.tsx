import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { Button, Input, Modal, Label, Badge, CardSkeleton } from '../components/ui';
import {
  Plus,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  Hourglass,
  CircleDot,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Edit3,
  Search,
  Building2,
  Users as UsersIcon,
  Check,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { FollowUpTask, TaskKanbanStatus, USERS, Candidate, Employer, Lead } from '../types';
import { isPast, isSameDay, isFuture, parseISO, format } from 'date-fns';
import { resolveKanbanStatus, isTaskOverdue } from '../lib/taskHelpers';

const KANBAN_COLUMNS: {
  id: TaskKanbanStatus;
  title: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  color: string;
  bgLight: string;
  border: string;
  badge: string;
}[] = [
  {
    id: 'To Do',
    title: 'To Do',
    icon: CircleDot,
    color: 'text-blue-700',
    bgLight: 'bg-blue-50/50',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-800',
  },
  {
    id: 'In Progress',
    title: 'In Progress',
    icon: Clock,
    color: 'text-amber-700',
    bgLight: 'bg-amber-50/50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-800',
  },
  {
    id: 'Waiting',
    title: 'Waiting',
    icon: Hourglass,
    color: 'text-purple-700',
    bgLight: 'bg-purple-50/50',
    border: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-800',
  },
  {
    id: 'Completed',
    title: 'Completed',
    icon: CheckCircle2,
    color: 'text-emerald-700',
    bgLight: 'bg-emerald-50/40',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-800',
  },
];

export default function Tasks() {
  const { tasks, candidates, employers, leads, loading, insert, update } = useData();
  const { currentUser, userId } = useUser();

  // Filters
  const [filterPeriod, setFilterPeriod] = useState<'All' | 'Today' | 'Overdue' | 'Upcoming' | 'Completed'>('All');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [search, setSearch] = useState<string>('');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<FollowUpTask | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Add Task Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState(new Date().toISOString().split('T')[0] || '');
  const [newKanbanStatus, setNewKanbanStatus] = useState<TaskKanbanStatus>('To Do');
  const [newPriority, setNewPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [newAssignedTo, setNewAssignedTo] = useState<string>(currentUser || USERS[0]);
  const [newEntityType, setNewEntityType] = useState<'candidate' | 'employer' | 'lead' | 'general'>('candidate');
  const [newEntityId, setNewEntityId] = useState('');
  const [newNextAction, setNewNextAction] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Edit Task Form State
  const [editTitle, setEditTitle] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editKanbanStatus, setEditKanbanStatus] = useState<TaskKanbanStatus>('To Do');
  const [editPriority, setEditPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [editAssignedTo, setEditAssignedTo] = useState('');
  const [editNextAction, setEditNextAction] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const now = new Date();


  // Helper to resolve linked entity display name
  const getEntityInfo = (task: FollowUpTask) => {
    if (!task.entity_id || task.entity_id === 'general') {
      return { type: 'General', label: 'General / Internal Task' };
    }
    if (task.entity_type === 'candidate') {
      const cand = candidates.find((c) => c.id === task.entity_id);
      return {
        type: 'Candidate',
        label: cand ? `${cand.name} (${cand.mobile})` : `Candidate #${task.entity_id.slice(0, 8)}`,
      };
    }
    if (task.entity_type === 'employer') {
      const emp = employers.find((e) => e.id === task.entity_id);
      return {
        type: 'Client',
        label: emp ? emp.company_name : `Client #${task.entity_id.slice(0, 8)}`,
      };
    }
    if (task.entity_type === 'lead') {
      const lead = leads.find((l) => l.id === task.entity_id);
      return {
        type: 'Lead',
        label: lead ? `${lead.name} (${lead.mobile})` : `Lead #${task.entity_id.slice(0, 8)}`,
      };
    }
    return { type: 'Entity', label: task.entity_id };
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const col = resolveKanbanStatus(task);
      const isCompleted = col === 'Completed';

      // Period filter
      if (filterPeriod === 'Completed' && !isCompleted) return false;
      if (filterPeriod === 'Today') {
        try {
          if (!isSameDay(parseISO(task.due_date), now)) return false;
        } catch {
          return false;
        }
      } else if (filterPeriod === 'Overdue') {
        try {
          if (isCompleted || !isPast(parseISO(task.due_date)) || isSameDay(parseISO(task.due_date), now)) {
            return false;
          }
        } catch {
          return false;
        }
      } else if (filterPeriod === 'Upcoming') {
        try {
          if (isCompleted || !isFuture(parseISO(task.due_date)) || isSameDay(parseISO(task.due_date), now)) {
            return false;
          }
        } catch {
          return false;
        }
      }

      // Assignee filter
      if (assigneeFilter === 'My' && task.assigned_to !== currentUser) return false;
      if (assigneeFilter !== 'All' && assigneeFilter !== 'My' && task.assigned_to !== assigneeFilter) {
        return false;
      }

      // Priority filter
      if (priorityFilter !== 'All' && task.priority !== priorityFilter) return false;

      // Text search
      if (search.trim()) {
        const q = search.toLowerCase();
        const entity = getEntityInfo(task);
        const matchTitle = task.title.toLowerCase().includes(q);
        const matchNotes = (task.notes || '').toLowerCase().includes(q);
        const matchNext = (task.next_action || '').toLowerCase().includes(q);
        const matchEntity = entity.label.toLowerCase().includes(q);
        if (!matchTitle && !matchNotes && !matchNext && !matchEntity) return false;
      }

      return true;
    });
  }, [tasks, candidates, employers, leads, filterPeriod, assigneeFilter, priorityFilter, search, currentUser]);

  // Group tasks by Kanban column
  const tasksByColumn = useMemo(() => {
    const map: Record<TaskKanbanStatus, FollowUpTask[]> = {
      'To Do': [],
      'In Progress': [],
      'Waiting': [],
      'Completed': [],
    };
    filteredTasks.forEach((task) => {
      const col = resolveKanbanStatus(task);
      map[col].push(task);
    });
    return map;
  }, [filteredTasks]);

  // Status transitions
  const handleMoveColumn = async (task: FollowUpTask, targetStatus: TaskKanbanStatus) => {
    try {
      const isNowCompleted = targetStatus === 'Completed';
      await update('tasks', {
        id: task.id,
        kanban_status: targetStatus,
        status: isNowCompleted ? 'Completed' : (targetStatus as any),
        completed_at: isNowCompleted ? new Date().toISOString() : undefined,
      });
      toast.success(`Moved to ${targetStatus}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to move task');
    }
  };

  const handleQuickNextColumn = (task: FollowUpTask) => {
    const current = resolveKanbanStatus(task);
    const order: TaskKanbanStatus[] = ['To Do', 'In Progress', 'Waiting', 'Completed'];
    const idx = order.indexOf(current);
    if (idx < order.length - 1) {
      const nextCol = order[idx + 1];
      if (nextCol) handleMoveColumn(task, nextCol);
    }
  };

  const handleQuickPrevColumn = (task: FollowUpTask) => {
    const current = resolveKanbanStatus(task);
    const order: TaskKanbanStatus[] = ['To Do', 'In Progress', 'Waiting', 'Completed'];
    const idx = order.indexOf(current);
    if (idx > 0) {
      const prevCol = order[idx - 1];
      if (prevCol) handleMoveColumn(task, prevCol);
    }
  };

  const handleToggleCompleted = async (task: FollowUpTask) => {
    const current = resolveKanbanStatus(task);
    const nextStatus: TaskKanbanStatus = current === 'Completed' ? 'To Do' : 'Completed';
    await handleMoveColumn(task, nextStatus);
  };

  // Open Edit Modal
  const handleOpenEdit = (task: FollowUpTask) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDueDate(task.due_date);
    setEditKanbanStatus(resolveKanbanStatus(task));
    setEditPriority(task.priority);
    setEditAssignedTo(task.assigned_to);
    setEditNextAction(task.next_action || '');
    setEditNotes(task.notes || '');
  };

  // Submit Edit Modal (Updates existing task safely)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    if (!editTitle.trim() || !editDueDate) {
      toast.error('Task title and due date are required');
      return;
    }

    setIsSaving(true);
    try {
      const isNowCompleted = editKanbanStatus === 'Completed';
      await update('tasks', {
        id: editingTask.id,
        title: editTitle.trim(),
        due_date: editDueDate,
        kanban_status: editKanbanStatus,
        status: isNowCompleted ? 'Completed' : (editKanbanStatus as any),
        priority: editPriority,
        assigned_to: editAssignedTo,
        next_action: editNextAction.trim() || undefined,
        notes: editNotes.trim() || undefined,
        completed_at: isNowCompleted ? editingTask.completed_at || new Date().toISOString() : undefined,
      });
      toast.success('Task updated successfully!');
      setEditingTask(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update task');
    } finally {
      setIsSaving(false);
    }
  };

  // Submit New Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDueDate) {
      toast.error('Task title and due date are required');
      return;
    }

    setIsSaving(true);
    try {
      const isNowCompleted = newKanbanStatus === 'Completed';
      await insert('tasks', {
        title: newTitle.trim(),
        due_date: newDueDate,
        kanban_status: newKanbanStatus,
        status: isNowCompleted ? 'Completed' : (newKanbanStatus as any),
        priority: newPriority,
        assigned_to: newAssignedTo,
        entity_type: newEntityType,
        entity_id: newEntityId || 'general',
        next_action: newNextAction.trim() || undefined,
        notes: newNotes.trim() || undefined,
        is_active: true,
        created_by: userId,
      });

      toast.success('Task created successfully!');
      setIsAddOpen(false);
      setNewTitle('');
      setNewNextAction('');
      setNewNotes('');
      setNewEntityId('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create task');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="pb-20 space-y-4 max-w-[1400px] mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-16 bg-[#f8fafc]/95 backdrop-blur-xs z-10 py-2.5 border-b border-slate-200/60">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Tasks & Follow-ups Kanban
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {filteredTasks.length}
            </span>
          </h1>
          <p className="text-xs text-slate-500">
            Interactive pipeline for recruiter callbacks, interviews prep & candidate follow-ups
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-1.5 text-xs py-1.5 px-3 shadow-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          >
            <Plus size={14} /> New Task
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Quick period tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          {(['All', 'Today', 'Overdue', 'Upcoming', 'Completed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilterPeriod(tab)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                filterPeriod === tab
                  ? 'bg-white text-blue-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Right: Search + Assignee + Priority Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search tasks or entity..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-2 py-1 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Assignee Filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="border border-slate-200 rounded-lg py-1 px-2 text-xs bg-slate-50 text-slate-700"
          >
            <option value="All">All Staff</option>
            <option value="My">My Tasks</option>
            {USERS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="border border-slate-200 rounded-lg py-1 px-2 text-xs bg-slate-50 text-slate-700"
          >
            <option value="All">All Priorities</option>
            <option value="High">High Priority</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        /* Kanban Board Grid: 4 columns */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {KANBAN_COLUMNS.map((column) => {
            const columnTasks = tasksByColumn[column.id] || [];
            const Icon = column.icon;

            return (
              <div
                key={column.id}
                className="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3 flex flex-col min-h-[500px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                    <Icon className={`w-4 h-4 ${column.color}`} />
                    <span>{column.title}</span>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${column.badge}`}>
                    {columnTasks.length}
                  </span>
                </div>

                {/* Column Cards */}
                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[72vh] pr-0.5">
                  {columnTasks.length === 0 ? (
                    <div className="text-center py-8 px-2 border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
                      No tasks in {column.title}
                    </div>
                  ) : (
                    columnTasks.map((task) => {
                      const entity = getEntityInfo(task);
                      const isTaskOverdue =
                        column.id !== 'Completed' &&
                        isPast(parseISO(task.due_date)) &&
                        !isSameDay(parseISO(task.due_date), now);

                      return (
                        <div
                          key={task.id}
                          className={`bg-white rounded-xl p-3 border shadow-xs transition-all hover:shadow-md ${
                            column.id === 'Completed'
                              ? 'border-emerald-200/60 bg-emerald-50/20 opacity-80'
                              : isTaskOverdue
                              ? 'border-red-300 bg-red-50/20 ring-1 ring-red-200'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Card Top: Priority & Edit button */}
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <Badge
                              variant={
                                task.priority === 'High'
                                  ? 'danger'
                                  : task.priority === 'Medium'
                                  ? 'warning'
                                  : 'neutral'
                              }
                              className="text-[10px] px-1.5 py-0.2"
                            >
                              {task.priority}
                            </Badge>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(task)}
                                title="Edit Task"
                                className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-slate-100 transition-colors"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleCompleted(task)}
                                title={column.id === 'Completed' ? 'Reopen task' : 'Mark completed'}
                                className={`p-1 rounded transition-colors ${
                                  column.id === 'Completed'
                                    ? 'text-emerald-600 hover:text-emerald-700'
                                    : 'text-slate-300 hover:text-emerald-600'
                                }`}
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Task Title */}
                          <h4
                            onClick={() => handleOpenEdit(task)}
                            className={`text-xs font-bold text-slate-900 cursor-pointer hover:text-blue-600 transition-colors ${
                              column.id === 'Completed' ? 'line-through text-slate-500' : ''
                            }`}
                          >
                            {task.title}
                          </h4>

                          {/* Linked Entity */}
                          {entity.label && (
                            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 truncate">
                              {entity.type === 'Client' ? (
                                <Building2 size={11} className="text-blue-500 shrink-0" />
                              ) : (
                                <UsersIcon size={11} className="text-indigo-500 shrink-0" />
                              )}
                              <span className="font-medium text-slate-700 truncate">{entity.label}</span>
                            </div>
                          )}

                          {/* Next Action Snippet if present */}
                          {task.next_action && (
                            <div className="mt-1.5 p-1.5 rounded bg-blue-50/80 border border-blue-100 text-[11px] text-blue-900 font-medium flex items-start gap-1">
                              <Sparkles size={11} className="text-blue-600 shrink-0 mt-0.5" />
                              <div className="truncate">
                                <span className="text-[10px] uppercase font-bold text-blue-700 tracking-wider block">
                                  Next Action
                                </span>
                                <span className="line-clamp-2">{task.next_action}</span>
                              </div>
                            </div>
                          )}

                          {/* Notes if present */}
                          {task.notes && (
                            <p className="mt-1 text-[11px] text-slate-500 line-clamp-2 italic">
                              "{task.notes}"
                            </p>
                          )}

                          {/* Metadata: Assignee & Due Date */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1 text-[10px]">
                            <span className="flex items-center gap-1 font-semibold text-slate-700">
                              <User size={11} className="text-slate-400" />
                              {task.assigned_to}
                            </span>

                            <span
                              className={`flex items-center gap-1 font-medium ${
                                isTaskOverdue
                                  ? 'text-red-700 font-bold bg-red-100 px-1 py-0.5 rounded'
                                  : 'text-slate-500'
                              }`}
                            >
                              <Calendar size={11} />
                              {task.due_date}
                              {isTaskOverdue && ' !'}
                            </span>
                          </div>

                          {/* Touch / Quick Column Mover Controls */}
                          <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1">
                            <button
                              type="button"
                              disabled={column.id === 'To Do'}
                              onClick={() => handleQuickPrevColumn(task)}
                              title="Move to previous column"
                              className="text-[10px] flex items-center gap-0.5 text-slate-500 hover:text-slate-800 disabled:opacity-20 disabled:cursor-not-allowed px-1.5 py-0.5 rounded hover:bg-slate-100"
                            >
                              <ArrowLeft size={10} />
                              <span>Prev</span>
                            </button>

                            {/* Dropdown status selector for mobile or direct jump */}
                            <select
                              value={column.id}
                              onChange={(e) => handleMoveColumn(task, e.target.value as TaskKanbanStatus)}
                              className="text-[10px] bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-slate-700 font-medium cursor-pointer"
                            >
                              <option value="To Do">To Do</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Waiting">Waiting</option>
                              <option value="Completed">Completed</option>
                            </select>

                            <button
                              type="button"
                              disabled={column.id === 'Completed'}
                              onClick={() => handleQuickNextColumn(task)}
                              title="Move to next column"
                              className="text-[10px] flex items-center gap-0.5 text-slate-500 hover:text-slate-800 disabled:opacity-20 disabled:cursor-not-allowed px-1.5 py-0.5 rounded hover:bg-slate-100"
                            >
                              <span>Next</span>
                              <ArrowRight size={10} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Task Modal */}
      <Modal
        isOpen={Boolean(editingTask)}
        onClose={() => setEditingTask(null)}
        title="Edit Follow-up Task"
        maxWidth="lg"
      >
        {editingTask && (
          <form onSubmit={handleSaveEdit} className="space-y-3">
            <div>
              <Label>Task Title / Action</Label>
              <Input
                placeholder="e.g. Call candidate to confirm interview attendance"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Next Action / Immediate Step</Label>
              <Input
                placeholder="e.g. Verify salary slip before scheduling client interview"
                value={editNextAction}
                onChange={(e) => setEditNextAction(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Kanban Column / Status</Label>
                <select
                  value={editKanbanStatus}
                  onChange={(e) => setEditKanbanStatus(e.target.value as TaskKanbanStatus)}
                  className="w-full text-xs border rounded-md p-2 bg-white"
                >
                  <option value="To Do">To Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Waiting">Waiting</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              <div>
                <Label>Priority</Label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as any)}
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
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label>Assigned Recruiter</Label>
                <select
                  value={editAssignedTo}
                  onChange={(e) => setEditAssignedTo(e.target.value)}
                  className="w-full text-xs border rounded-md p-2 bg-white"
                >
                  {USERS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label>Remarks / Internal Notes</Label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                placeholder="Internal notes or conversation summary..."
                className="w-full text-xs border border-slate-200 rounded-md p-2 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setEditingTask(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving Changes...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Add Task Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Create Follow-up Task" maxWidth="lg">
        <form onSubmit={handleCreateTask} className="space-y-3">
          <div>
            <Label>Task Title / Action</Label>
            <Input
              placeholder="e.g. Call candidate to confirm interview attendance"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <Label>Next Action (Optional)</Label>
            <Input
              placeholder="e.g. Collect address proof on WhatsApp"
              value={newNextAction}
              onChange={(e) => setNewNextAction(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Due Date</Label>
              <Input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Column / Status</Label>
              <select
                value={newKanbanStatus}
                onChange={(e) => setNewKanbanStatus(e.target.value as TaskKanbanStatus)}
                className="w-full text-xs border rounded-md p-2 bg-white"
              >
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="Waiting">Waiting</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Priority</Label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as any)}
                className="w-full text-xs border rounded-md p-2 bg-white"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>

            <div>
              <Label>Assign Recruiter</Label>
              <select
                value={newAssignedTo}
                onChange={(e) => setNewAssignedTo(e.target.value)}
                className="w-full text-xs border rounded-md p-2 bg-white"
              >
                {USERS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Related Entity Type</Label>
              <select
                value={newEntityType}
                onChange={(e) => {
                  setNewEntityType(e.target.value as any);
                  setNewEntityId('');
                }}
                className="w-full text-xs border rounded-md p-2 bg-white"
              >
                <option value="candidate">Candidate</option>
                <option value="employer">Employer / Client</option>
                <option value="lead">Lead</option>
                <option value="general">General / Internal</option>
              </select>
            </div>

            <div>
              <Label>Select Entity</Label>
              {newEntityType === 'candidate' && (
                <select
                  value={newEntityId}
                  onChange={(e) => setNewEntityId(e.target.value)}
                  className="w-full text-xs border rounded-md p-2 bg-white"
                >
                  <option value="">Select Candidate...</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.mobile})
                    </option>
                  ))}
                </select>
              )}

              {newEntityType === 'employer' && (
                <select
                  value={newEntityId}
                  onChange={(e) => setNewEntityId(e.target.value)}
                  className="w-full text-xs border rounded-md p-2 bg-white"
                >
                  <option value="">Select Client...</option>
                  {employers.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.company_name}
                    </option>
                  ))}
                </select>
              )}

              {newEntityType === 'lead' && (
                <select
                  value={newEntityId}
                  onChange={(e) => setNewEntityId(e.target.value)}
                  className="w-full text-xs border rounded-md p-2 bg-white"
                >
                  <option value="">Select Lead...</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.mobile})
                    </option>
                  ))}
                </select>
              )}

              {newEntityType === 'general' && (
                <Input value="General Task" disabled className="bg-slate-50 text-slate-500" />
              )}
            </div>
          </div>

          <div>
            <Label>Notes (Optional)</Label>
            <textarea
              placeholder="e.g. Ask for updated resume with salary slip"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
              className="w-full text-xs border border-slate-200 rounded-md p-2 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Creating...' : 'Schedule Task'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
