import { z } from 'zod';

// Helper to convert comma separated string to clean string array
export const parseSkills = (val: string | string[]): string[] => {
  if (Array.isArray(val)) return val.map(s => s.trim()).filter(Boolean);
  if (!val || typeof val !== 'string') return [];
  return val.split(',').map(s => s.trim()).filter(Boolean);
};

// Phone: Indian format, 10 digits or +91 prefix
export const phoneSchema = z.string()
  .min(10, 'Mobile number must be at least 10 digits')
  .max(15, 'Mobile number too long')
  .regex(/^(\+91[-\s]?)?[6-9]\d{9}$/, 'Enter valid Indian mobile number');

// Salary: positive number
export const salarySchema = z.number()
  .min(0, 'Salary cannot be negative')
  .max(10000000, 'Salary too high');

// Experience: 0-50 years
export const experienceSchema = z.number()
  .min(0, 'Experience cannot be negative')
  .max(50, 'Experience too high');

// Urgency: 1-5
export const urgencySchema = z.number()
  .min(1, 'Urgency must be 1-5')
  .max(5, 'Urgency must be 1-5');

// ISO datetime string for scheduling
export const datetimeSchema = z.string().min(1, 'Date & time required');

// Standard Dropdown Options for Wave 2A
export const QUALIFICATION_OPTIONS = [
  'Below 10th',
  '10th Pass',
  '12th Pass',
  'Diploma / ITI',
  'Graduate — B.Com',
  'Graduate — B.A. / B.Sc / Other',
  'Graduate — B.Tech / BCA',
  'Post Graduate — MBA / M.Com / Other',
  'Other',
] as const;

export const NOTICE_PERIOD_OPTIONS = [
  'Immediate',
  '7 Days',
  '15 Days',
  '30 Days',
  '45 Days',
  '60 Days',
  '90 Days',
  'Other',
] as const;

export const ACQUISITION_SOURCE_OPTIONS = [
  'WhatsApp',
  'Walk-in',
  'Referral',
  'Job Portal',
  'Website',
  'Social Media',
  'Other',
] as const;

// Candidate Form Schema
export const candidateSchema = z.object({
  name: z.string().min(2, 'Name too short').max(100, 'Name too long'),
  mobile: phoneSchema,
  experience: experienceSchema,
  skills: z.string().min(1, 'At least one skill required'),
  location: z.string().min(1, 'Location required').max(100, 'Location too long'),
  expected_salary: salarySchema,
  last_role: z.string().min(1, 'Last role required').max(100, 'Last role too long'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  qualification: z.string().max(100, 'Qualification too long').optional().or(z.literal('')),
  notice_period: z.string().max(100, 'Notice period too long').optional().or(z.literal('')),
  current_salary: z.number().min(0, 'Current salary cannot be negative').max(10000000, 'Salary too high').optional(),
  source: z.string().max(100, 'Source too long').optional().or(z.literal('')),
  status: z.enum(['Active', 'Placed', 'Blacklisted']).optional(),
  notes: z.string().max(1000, 'Notes too long').optional().or(z.literal('')),
});

// Job Form Schema
export const jobSchema = z.object({
  company_name: z.string().min(1, 'Company required').max(100, 'Company name too long'),
  role: z.string().min(1, 'Role required').max(100, 'Role too long'),
  location: z.string().min(1, 'Location required').max(100, 'Location too long'),
  min_exp: experienceSchema,
  max_exp: experienceSchema,
  salary_min: salarySchema,
  salary_max: salarySchema,
  skills_req: z.string().min(1, 'Required skills are required'),
  urgency: urgencySchema,
  employer_id: z.string().optional().or(z.literal('')),
  status: z.enum(['Open', 'Closed']).optional(),
}).refine(data => data.min_exp <= data.max_exp, {
  message: 'Min experience cannot exceed max experience',
  path: ['max_exp'],
}).refine(data => data.salary_min <= data.salary_max, {
  message: 'Min salary cannot exceed max salary',
  path: ['salary_max'],
});

// Interview Form Schema
export const interviewSchema = z.object({
  candidate_id: z.string().min(1, 'Candidate required'),
  job_id: z.string().min(1, 'Job required'),
  scheduled_time: datetimeSchema,
  notes: z.string().max(500, 'Notes too long').optional(),
});

// Call Log Schema
export const callLogSchema = z.object({
  candidate_id: z.string().optional().or(z.literal('')),
  lead_id: z.string().optional().or(z.literal('')),
  call_type: z.enum([
    'Connected', 'Busy', 'SwitchOff',
    'No Answer', 'Not Interested', 'Wrong Number',
    'Call Back Later', 'Interested', 'Converted'
  ]),
  duration: z.coerce.number().min(0).default(0),
  note: z.string().max(500, 'Note too long').optional(),
}).refine(data => {
  const hasCand = Boolean(data.candidate_id && data.candidate_id.trim());
  const hasLead = Boolean(data.lead_id && data.lead_id.trim());
  return (hasCand && !hasLead) || (!hasCand && hasLead);
}, {
  message: 'Call log must be linked to either a candidate or a lead',
  path: ['candidate_id'],
});

// Employer Form Schema
export const employerSchema = z.object({
  company_name: z.string().min(2, 'Company name required').max(150),
  contact_person: z.string().min(2, 'Contact person required').max(100),
  phone: phoneSchema,
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  location: z.string().min(2, 'City/Location required').max(100),
  industry: z.string().max(100).optional().or(z.literal('')),
  address: z.string().max(250).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
  status: z.enum(['Active', 'Inactive', 'Prospect']).optional(),
});

// Application Form Schema
export const applicationSchema = z.object({
  candidate_id: z.string().min(1, 'Candidate required'),
  job_id: z.string().min(1, 'Job required'),
  stage: z.enum([
    'Applied',
    'Screening',
    'Shortlisted',
    'Employer Submitted',
    'Interview Scheduled',
    'Interview Completed',
    'Selected',
    'Offer',
    'Joined',
    'Placed',
    'Rejected',
    'Withdrawn',
    'On Hold'
  ]),
  notes: z.string().max(1000).optional().or(z.literal('')),
  offered_salary: salarySchema.optional(),
  joining_date: z.string().optional().or(z.literal('')),
});

// Task / Follow-up Schema
export const taskSchema = z.object({
  title: z.string().min(3, 'Title required').max(150),
  due_date: z.string().min(1, 'Due date required'),
  entity_type: z.enum(['candidate', 'employer', 'application', 'general', 'lead']),
  entity_id: z.string().min(1, 'Linked entity required'),
  lead_entity_id: z.string().optional().nullable(),
  priority: z.enum(['Low', 'Medium', 'High']).default('Medium'),
  notes: z.string().max(500).optional().or(z.literal('')),
}).refine(data => data.entity_type !== 'lead' || Boolean(data.lead_entity_id && data.lead_entity_id.trim()), {
  message: 'Lead tasks must include a valid lead_entity_id',
  path: ['lead_entity_id'],
});

// Payment Form Schema
export const paymentSchema = z.object({
  type: z.enum(['Candidate_Registration', 'Employer_Placement', 'Other']),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  payment_method: z.enum(['UPI', 'Cash', 'Bank_Transfer', 'Cheque']),
  candidate_id: z.string().optional().or(z.literal('')),
  employer_id: z.string().optional().or(z.literal('')),
  reference_no: z.string().max(100).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
});

// Lead Form Schema
export const leadSchema = z.object({
  name: z.string().min(2, 'Name required').max(100),
  mobile: phoneSchema,
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  experience: z.coerce.number().min(0).max(50).optional().nullable(),
  skills: z.array(z.string()).default([]),
  location: z.string().max(100).optional().nullable(),
  expected_salary: salarySchema.optional().nullable(),
  current_salary: salarySchema.optional().nullable(),
  qualification: z.string().max(100).optional().nullable(),
  notice_period: z.string().max(50).optional().nullable(),
  last_role: z.string().max(100).optional().nullable(),
  source: z.enum([
    'WorkIndia', 'Naukri.com', 'Indeed', 'LinkedIn',
    'WhatsApp', 'Walk-in', 'Referral', 'Website', 'Manual', 'Other'
  ]).default('Manual'),
  category: z.enum([
    'New', 'Hot', 'Warm', 'Cold', 'Converted', 'Rejected', 'Do Not Contact'
  ]).default('New'),
  assigned_to: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

// Type inference
export type CandidateInput = z.infer<typeof candidateSchema>;
export type JobInput = z.infer<typeof jobSchema>;
export type InterviewInput = z.infer<typeof interviewSchema>;
export type CallLogInput = z.infer<typeof callLogSchema>;
export type EmployerInput = z.infer<typeof employerSchema>;
export type ApplicationInput = z.infer<typeof applicationSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type LeadInput = z.infer<typeof leadSchema>;