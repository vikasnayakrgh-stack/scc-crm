export interface Candidate {
  id: string;
  created_at: string;
  name: string;
  mobile: string;
  experience: number;
  skills: string[]; // Stored as text array in DB
  location: string;
  expected_salary: number;
  last_role: string;
  status: 'Active' | 'Placed' | 'Blacklisted';
  owner_id: string;
  is_active: boolean;
}

export interface Job {
  id: string;
  created_at: string;
  company_name: string;
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
}

export interface Interview {
  id: string;
  created_at: string;
  candidate_id: string;
  job_id: string;
  scheduled_time: string;
  status: 'Scheduled' | 'Done' | 'NoShow' | 'Selected';
  feedback: string;
  is_active: boolean;
  // Joins for UI
  candidates?: Candidate;
  jobs?: Job;
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

export type UserRole = 'Admin' | 'Telecaller-1' | 'Telecaller-2';

export const USERS: UserRole[] = ['Admin', 'Telecaller-1', 'Telecaller-2'];