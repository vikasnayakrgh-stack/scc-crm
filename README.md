# SCC Recruitment CRM (Final Production Build)

## 1. Environment Setup (.env)
Create a `.env` file in the root:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 2. Supabase SQL Schema (Run this in Supabase SQL Editor)

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Table: candidates
create table public.candidates (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  mobile text unique not null,
  experience numeric,
  skills text[] default '{}',
  location text,
  expected_salary numeric,
  last_role text,
  status text check (status in ('Active', 'Placed', 'Blacklisted')) default 'Active',
  owner_id text,
  is_active boolean default true
);

-- Table: jobs
create table public.jobs (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  company_name text not null,
  role text not null,
  location text,
  min_exp numeric,
  max_exp numeric,
  salary_min numeric,
  salary_max numeric,
  skills_req text[] default '{}',
  urgency int default 1,
  status text check (status in ('Open', 'Closed')) default 'Open',
  is_active boolean default true
);

-- Table: interviews
create table public.interviews (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  candidate_id uuid references public.candidates(id),
  job_id uuid references public.jobs(id),
  scheduled_time timestamp with time zone not null,
  status text check (status in ('Scheduled', 'Done', 'NoShow', 'Selected')) default 'Scheduled',
  feedback text,
  is_active boolean default true
);

-- Table: call_logs
create table public.call_logs (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  candidate_id uuid references public.candidates(id),
  telecaller_name text,
  call_type text check (call_type in ('Connected', 'Busy', 'SwitchOff')),
  duration numeric default 0,
  note text,
  timestamp timestamp with time zone default timezone('utc'::text, now())
);

-- Enable Realtime
alter publication supabase_realtime add table candidates, jobs, interviews, call_logs;
```

## 3. Google Sheet Sync (Apps Script)

1. Create a Google Sheet.
2. Extensions > Apps Script.
3. Paste code:
```javascript
function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  // Simple dump of names for demo
  data.candidates.forEach(c => {
    sheet.appendRow([new Date(), "Candidate", c.name, c.mobile]);
  });
  return ContentService.createTextOutput("Success");
}
```
4. Deploy > New Deployment > Web App > **Who has access: Anyone**.
5. Copy URL and paste in App Settings.

## 4. Run
`npm install`
`npm run dev`
