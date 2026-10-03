import { Application } from '../types';

export interface ScheduleInterviewParams {
  candidateId: string;
  jobId: string;
  scheduledTime: string;
  currentUser?: string;
  existingApplications: Application[];
  insert: (table: string, data: any) => Promise<any>;
  update: (table: string, data: any) => Promise<any>;
}

export interface ScheduleInterviewResult {
  applicationId: string;
  interviewId: string;
  applicationCreated: boolean;
  applicationUpdated: boolean;
}

/**
 * P0-01: Idempotently links or creates a JobApplication when scheduling an interview.
 * Guarantees that no orphan interview is created and prevents duplicate applications.
 */
export async function scheduleInterviewWithApplication(
  params: ScheduleInterviewParams
): Promise<ScheduleInterviewResult> {
  const {
    candidateId,
    jobId,
    scheduledTime,
    currentUser,
    existingApplications,
    insert,
    update,
  } = params;

  if (!candidateId || !jobId || !scheduledTime) {
    throw new Error('Candidate, Job opening, and scheduled time are required to schedule an interview');
  }

  // 1. Look for existing active application for this candidate + job
  const existingApp = existingApplications.find(
    (a) => a.candidate_id === candidateId && a.job_id === jobId && a.is_active !== false
  );

  let targetAppId = existingApp?.id;
  let applicationCreated = false;
  let applicationUpdated = false;

  if (!targetAppId) {
    // 2. Create application in 'Interview Scheduled' stage
    const newAppRecord = {
      candidate_id: candidateId,
      job_id: jobId,
      stage: 'Interview Scheduled',
      assigned_to: currentUser || 'SCC',
      is_active: true,
    };
    const appRes = await insert('applications', newAppRecord);
    targetAppId = appRes?.data?.id || appRes?.id;
    applicationCreated = true;
  } else {
    // 3. If application exists in an earlier stage, advance it to 'Interview Scheduled'
    const advanceableStages = ['Applied', 'Screening', 'Shortlisted', 'Employer Submitted'];
    if (existingApp && advanceableStages.includes(existingApp.stage)) {
      await update('applications', {
        id: targetAppId,
        stage: 'Interview Scheduled',
      });
      applicationUpdated = true;
    }
  }

  // 4. Create the interview record with guaranteed application_id
  const interviewRes = await insert('interviews', {
    candidate_id: candidateId,
    job_id: jobId,
    application_id: targetAppId,
    scheduled_time: scheduledTime,
    status: 'Scheduled',
    feedback: '',
    is_active: true,
  });

  const interviewId = interviewRes?.data?.id || interviewRes?.id;

  return {
    applicationId: targetAppId!,
    interviewId,
    applicationCreated,
    applicationUpdated,
  };
}

/**
 * P0-02: Permission checks for placement invoices based on user role.
 * - Recruiter: can create Pending/Draft placement invoices only. Cannot mark Paid.
 * - Admin / Manager: can create any placement invoice and mark Paid.
 */
export function canUserMarkPlacementPaid(role: string): boolean {
  const normalized = (role || '').toLowerCase();
  return normalized === 'admin' || normalized === 'manager';
}

export function getAllowedPaymentStatusesForRole(
  role: string,
  paymentType: 'Candidate_Registration' | 'Employer_Placement' | 'Other'
): ('Paid' | 'Pending')[] {
  const normalized = (role || '').toLowerCase();
  const isAdminOrManager = normalized === 'admin' || normalized === 'manager';

  if (paymentType === 'Employer_Placement' || paymentType === 'Other') {
    if (!isAdminOrManager) {
      // Recruiter can only create Pending placement invoices
      return ['Pending'];
    }
  }

  // Admin/Manager or Candidate_Registration can be Paid or Pending
  return ['Paid', 'Pending'];
}

/**
 * P0-03: Helper to determine if candidate registration fee should be marked paid in local state.
 */
export function shouldUpdateCandidateRegistrationPaid(
  paymentType: string,
  status: string
): boolean {
  return paymentType === 'Candidate_Registration' && status === 'Paid';
}
