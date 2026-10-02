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
  notes?: string;
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

export interface Interview {
  id: string;
  created_at: string;
  candidate_id: string;
  job_id: string;
  application_id?: string;
  scheduled_time: string;
  status: 'Scheduled' | 'Done' | 'NoShow' | 'Selected';
  feedback: string;
  is_active: boolean;
  // Joins for UI
  candidates?: Candidate;
  jobs?: Job;
  applications?: Application;
}

export interface CallLog {
  id: string;
  candidate_id: string;
  telecaller_name: string;
  call_type: 'Connected' | 'Busy' | 'SwitchOff';
  duration: number;
  note: string;
  timestamp: string;
  // Joins for UI
  candidates?: Candidate;
}

export interface FollowUpTask {
  id: string;
  created_at: string;
  due_date: string;
  title: string;
  notes?: string;
  entity_type: 'candidate' | 'employer' | 'application';
  entity_id: string;
  assigned_to: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Pending' | 'Completed' | 'Cancelled';
  completed_at?: string;
  is_active: boolean;
}

export interface PaymentRecord {
  id: string;
  created_at: string;
  type: 'Candidate_Registration' | 'Employer_Placement' | 'Other';
  amount: number;
  payment_method: 'UPI' | 'Cash' | 'Bank_Transfer' | 'Cheque';
  status: 'Paid' | 'Partial' | 'Pending';
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