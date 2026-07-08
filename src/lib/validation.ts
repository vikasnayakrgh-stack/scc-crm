import { z } from 'zod';

// Phone: Indian format, 10 digits or +91 prefix
const phoneSchema = z.string()
  .min(10, 'Mobile number must be at least 10 digits')
  .max(15, 'Mobile number too long')
  .regex(/^(\+91[\-\s]?)?[6-9]\d{9}$/, 'Enter valid Indian mobile number');

// Salary: positive number, reasonable range
const salarySchema = z.coerce.number()
  .min(0, 'Salary cannot be negative')
  .max(10000000, 'Salary too high');

// Experience: 0-50 years
const experienceSchema = z.coerce.number()
  .min(0, 'Experience cannot be negative')
  .max(50, 'Experience too high');

// Urgency: 1-5
const urgencySchema = z.coerce.number()
  .min(1, 'Urgency must be 1-5')
  .max(5, 'Urgency must be 1-5');

// Skills: comma-separated, non-empty after split
const skillsSchema = z.string()
  .transform(val => val.split(',').map(s => s.trim()).filter(Boolean))
  .refine(arr => arr.length > 0, 'At least one skill required');

// ISO datetime string for interview scheduling
const datetimeSchema = z.string()
  .datetime({ offset: true })
  .refine(val => new Date(val) > new Date(), 'Interview must be in the future');

export const candidateSchema = z.object({
  name: z.string().min(2, 'Name too short').max(100, 'Name too long'),
  mobile: phoneSchema,
  experience: experienceSchema,
  skills: skillsSchema,
  location: z.string().min(1, 'Location required').max(100, 'Location too long'),
  expected_salary: salarySchema,
  last_role: z.string().min(1, 'Last role required').max(100, 'Last role too long'),
});

export const jobSchema = z.object({
  company_name: z.string().min(1, 'Company required').max(100, 'Company name too long'),
  role: z.string().min(1, 'Role required').max(100, 'Role too long'),
  location: z.string().min(1, 'Location required').max(100, 'Location too long'),
  min_exp: experienceSchema,
  max_exp: experienceSchema,
  salary_min: salarySchema,
  salary_max: salarySchema,
  skills_req: skillsSchema,
  urgency: urgencySchema,
}).refine(data => data.min_exp <= data.max_exp, {
  message: 'Min experience cannot exceed max experience',
  path: ['max_exp'],
}).refine(data => data.salary_min <= data.salary_max, {
  message: 'Min salary cannot exceed max salary',
  path: ['salary_max'],
});

export const interviewSchema = z.object({
  candidate_id: z.string().uuid('Invalid candidate'),
  job_id: z.string().uuid('Invalid job'),
  scheduled_time: datetimeSchema,
});

export const callLogSchema = z.object({
  candidate_id: z.string().uuid('Invalid candidate'),
  call_type: z.enum(['Connected', 'Busy', 'SwitchOff']),
  duration: z.coerce.number().min(0).default(0),
  note: z.string().max(500, 'Note too long').optional(),
});

// Type inference
export type CandidateInput = z.infer<typeof candidateSchema>;
export type JobInput = z.infer<typeof jobSchema>;
export type InterviewInput = z.infer<typeof interviewSchema>;
export type CallLogInput = z.infer<typeof callLogSchema>;