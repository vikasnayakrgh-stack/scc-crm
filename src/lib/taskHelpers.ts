import { FollowUpTask, TaskKanbanStatus } from '../types';

/**
 * Maps legacy task statuses ('Pending', 'To Do', 'In Progress', 'Waiting', 'Completed')
 * and explicit kanban_status into the 4 canonical Kanban columns.
 */
export function resolveKanbanStatus(task: Partial<FollowUpTask>): TaskKanbanStatus {
  if (task.kanban_status) return task.kanban_status;
  if (task.status === 'Completed') return 'Completed';
  if (task.status === 'In Progress') return 'In Progress';
  if (task.status === 'Waiting') return 'Waiting';
  return 'To Do';
}

/**
 * Evaluates whether a task is overdue against a reference date (defaults to today).
 * Completed tasks are NEVER overdue.
 */
export function isTaskOverdue(
  task: Partial<FollowUpTask> | { due_date?: string; status?: string; kanban_status?: TaskKanbanStatus },
  referenceDateStr?: string
): boolean {
  const status = resolveKanbanStatus(task as FollowUpTask);
  if (status === 'Completed' || task.status === 'Completed') return false;
  if (!task.due_date) return false;

  const refDate = referenceDateStr || new Date().toISOString().slice(0, 10);
  const dueDateOnly = task.due_date.slice(0, 10);

  return dueDateOnly < refDate;
}
