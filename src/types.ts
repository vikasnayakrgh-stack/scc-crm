export interface Candidate {
  id: string;
  created_at: string;
  name: string;
  mobile: string;
  email?: string;
  experience: number;
  skills: string[]; // text[] in DB
  location: string;
  expected_salary: number;
  last_role: string;
  status: 'Active' | 'Placed' | 'Blacklisted';
  registration_fee_paid?: boolean;
  qualification?: string;
  notice_period?: string;
  current_salary?: number;
  source?: string;
  notes?: string;
  screening_status?: CandidateScreeningStatus;
  owner_id: string;
  is_active: boolean;
}

export interface Employer {
  id: string;
  created_at: string;
  updated_at?: string;
  company_name: string;
  contact_person: string;
  phone: string;
  email?: string;
  location: string;
  address?: string;
  industry?: string;
  status: 'Active' | 'Inactive' | 'Prospect';
  notes?: string;
  is_active: boolean;
}

export interface Job {
  id: string;
  created_at: string;
  company_name: string;
  employer_id?: string;
  role: string;
  location: string;
  min_exp: number;
  max_exp: number;
  salary_min: number;
  salary_max: number;
  skills_req: string[];
  urgency: number;
  status: 'Open' | 'Closed';
  is_active: boolean;
  // Joins
  employer?: Employer;
}

export type ApplicationStage =
  | 'Applied'
  | 'Screening'
  | 'Shortlisted'
  | 'Employer Submitted'
  | 'Interview Scheduled'
  | 'Interview Completed'
  | 'Selected'
  | 'Offer'
  | 'Joined'
  | 'Placed'
  | 'Rejected'
  | 'Withdrawn'
  | 'On Hold';

export interface Application {
  id: string;
  created_at: string;
  updated_at?: string;
  candidate_id: string;
  job_id: string;
  stage: ApplicationStage;
  notes?: string;
  offered_salary?: number;
  joining_date?: string;
  placed_date?: string;
  assigned_to?: string;
  is_active: boolean;
  // Joins
  candidates?: Candidate;
  jobs?: Job;
}

export type InterviewStatus = 'Scheduled' | 'Done' | 'NoShow' | 'Selected' | 'Rejected' | 'On Hold';

export interface RescheduleEvent {
  previous_time: string;
  new_time: string;
  rescheduled_at: string;
  rescheduled_by: string;
  reason?: string;
}

export interface Interview {
  id: string;
  created_at: string;
  updated_at?: string;
  candidate_id: string;
  job_id: string;
  application_id?: string;
  scheduled_time: string;
  status: InterviewStatus;
  feedback: string; // Interview Remarks / Feedback
  rating?: number | null; // Rating: ⭐ 1-5
  next_action?: string | null;
  reschedule_history?: RescheduleEvent[];
  is_active: boolean;
  // Joins for UI
  candidates?: Candidate;
  jobs?: Job;
  applications?: Application;
}

export type CallType =
  | 'Connected'
  | 'Busy'
  | 'SwitchOff'
  | 'No Answer'
  | 'Not Interested'
  | 'Wrong Number'
  | 'Call Back Later'
  | 'Interested'
  | 'Converted';

export interface CallLog {
  id: string;
  candidate_id?: string | null;
  lead_id?: string | null;
  telecaller_name: string;
  call_type: CallType;
  duration: number;
  note: string;
  timestamp: string;
  created_by?: string | null;
  // Joins for UI
  candidates?: Candidate;
  leads?: Lead;
}

export type TaskKanbanStatus = 'To Do' | 'In Progress' | 'Waiting' | 'Completed';

export interface FollowUpTask {
  id: string;
  created_at: string;
  due_date: string;
  title: string;
  notes?: string;
  next_action?: string;
  entity_type: 'candidate' | 'employer' | 'application' | 'general' | 'lead';
  entity_id: string;
  lead_entity_id?: string | null;
  candidate_entity_id?: string | null;
  employer_entity_id?: string | null;
  application_entity_id?: string | null;
  assigned_to: string;
  assigned_to_user_id?: string | null;
  created_by?: string | null;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Pending' | 'To Do' | 'In Progress' | 'Waiting' | 'Completed' | 'Cancelled';
  kanban_status?: TaskKanbanStatus;
  completed_at?: string;
  is_active: boolean;
  // Joins
  leads?: Lead;
  candidates?: Candidate;
}

export type CandidateScreeningResult = 'Pass' | 'Hold' | 'Fail';
export type CandidateScreeningStatus = 'Pending' | 'Scheduled' | 'Pass' | 'Hold' | 'Fail';

export interface CandidateScreening {
  id: string;
  created_at: string;
  updated_at?: string;
  candidate_id: string;
  screening_time: string;
  venue: string;
  skills_assessment?: string;
  communication_rating?: number | null; // 1-5
  confidence_rating?: number | null; // 1-5
  overall_rating?: number | null; // 1-5
  remarks?: string;
  result: CandidateScreeningResult;
  next_action?: string;
  followup_date?: string;
  screening_staff: string;
  created_by?: string;
  is_active: boolean;
  // Joins for UI
  candidates?: Candidate;
}

export type LeadCategory =
  | 'New'
  | 'Hot'
  | 'Warm'
  | 'Cold'
  | 'Converted'
  | 'Rejected'
  | 'Do Not Contact';

export type LeadSource =
  | 'WorkIndia'
  | 'Naukri.com'
  | 'Indeed'
  | 'LinkedIn'
  | 'WhatsApp'
  | 'Walk-in'
  | 'Referral'
  | 'Website'
  | 'Manual'
  | 'Other';

export interface Lead {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  mobile: string;
  email?: string | null;
  experience?: number | null;
  skills: string[];
  location?: string | null;
  expected_salary?: number | null;
  current_salary?: number | null;
  qualification?: string | null;
  notice_period?: string | null;
  last_role?: string | null;
  source: LeadSource;
  category: LeadCategory;
  assigned_to?: string | null;
  import_batch_id?: string | null;
  converted_candidate_id?: string | null;
  converted_at?: string | null;
  converted_by?: string | null;
  created_by?: string | null;
  notes?: string | null;
  is_active: boolean;
  // UI Joins
  assigned_profile?: UserProfile;
}

export interface LeadImportBatch {
  id: string;
  created_at: string;
  imported_by: string;
  file_name: string;
  file_hash?: string | null;
  detected_platform: 'Naukri.com' | 'WorkIndia' | 'Generic';
  total_rows: number;
  imported_count: number;
  skipped_duplicate_count: number;
  skipped_invalid_count: number;
  default_assigned_to?: string | null;
  notes?: string | null;
  // UI Joins
  imported_by_profile?: UserProfile;
}

export interface LeadAssignmentHistory {
  id: string;
  created_at: string;
  lead_id: string;
  assigned_from?: string | null;
  assigned_to?: string | null;
  assigned_by: string;
  reason?: string | null;
  // UI Joins
  assigned_from_profile?: UserProfile;
  assigned_to_profile?: UserProfile;
  assigned_by_profile?: UserProfile;
}

export interface PaymentRecord {
  id: string;
  created_at: string;
  type: 'Candidate_Registration' | 'Employer_Placement' | 'Other';
  amount: number;
  payment_method: 'UPI' | 'Cash' | 'Bank_Transfer' | 'Cheque';
  status: 'Paid' | 'Partial' | 'Pending' | 'Refunded';
  candidate_id?: string;
  job_id?: string;
  employer_id?: string;
  application_id?: string;
  reference_no?: string;
  notes?: string;
  due_date?: string;
  paid_at: string;
  recorded_by: string;
  is_active: boolean;
  // Joins
  candidates?: Candidate;
  employers?: Employer;
}

export type UserRole = 'Admin' | 'Telecaller-1' | 'Telecaller-2';

export const USERS: UserRole[] = ['Admin', 'Telecaller-1', 'Telecaller-2'];

export type AppRole = 'admin' | 'manager' | 'recruiter';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  role: AppRole;
  phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}