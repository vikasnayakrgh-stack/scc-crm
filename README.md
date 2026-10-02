# Shree Career Consultancy (SCC) CRM — Production Modernisation

Production-ready Recruitment Consultancy CRM built with **React 19**, **TypeScript**, **Vite 6**, **Tailwind CSS**, **Supabase PostgreSQL**, and **IndexedDB Offline-First Architecture**.

---

## 🏗️ Architecture & Technology Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                          SCC CRM Frontend                              │
│         (React 19 + TypeScript + Vite 6 + Tailwind CSS)                │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 │                                       │
     [Online Mutation / Sync]                 [Offline State / Network Fault]
                 ▼                                       ▼
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│     Supabase Client Data Layer  │     │      IndexedDB Mutation Queue   │
│   (PostgreSQL + Row-Level Sec)  │     │   (DLQ + Backoff + Idempotency) │
└─────────────────────────────────┘     └─────────────────────────────────┘
```

- **Frontend Core:** React 19 (SPA), TypeScript 5.8 strict, Vite 6.4.
- **State & Data Layer:** `DataContext` providing truthful optimistic UI updates, re-throwing server errors, and zero silent failures.
- **Offline Engine:** IndexedDB (`scc-offline-db`) transaction queue with exponential backoff (`Math.min(1000 * 2^retries, 30000)`), Dead Letter Queue (DLQ) for permanent SQL constraint errors (`23505`, `23503`, `42501`) to eliminate head-of-line blocking, and automatic background re-sync on reconnection.
- **Security & Authorization:** Role-based access control (`Admin`, `Manager`, `Recruiter`). Insecure Google Apps Script client webhook removed. Sanitized CSV exports restricted to Admins. No service-role secrets in client bundle.
- **Database:** Supabase PostgreSQL with additive SQL migrations, row-level security (RLS), atomic timestamps, and referential constraints.

---

## 📋 Core Recruitment Modules

1. **Dashboard:** Real-time KPI metrics:
   - Date-aware and year-checked Today's Interviews & Call Logs (`date-fns`).
   - Active Open Jobs count (`status === 'Open'`).
   - Candidate Placements vs. Interviews.
   - Pending Collections and Registration Ledger.
2. **Candidates:** Full lifecycle management (Active, Placed, Blacklisted), skill tag arrays, salary expectations, role history, and live candidate-to-job match recommendation modal.
3. **Employers (Clients):** Corporate accounts registry, HR point of contact, phone/email directory, industry classification, and live open position count.
4. **Jobs (Vacancies):** Relational employer linkage, salary range limits, experience requirements, and status toggles.
5. **Applications Pipeline:** 13-stage auditable recruitment pipeline (`Applied` → `Screening` → `Shortlisted` → `Employer Submitted` → `Interview Scheduled` → `Interview Completed` → `Selected` → `Offer` → `Joined` → `Placed` + `Rejected` / `Withdrawn` / `On Hold`) with duplicate prevention.
6. **Interviews:** Scheduling module strictly **decoupled** from placement (interview `Selected` ≠ candidate `Placed`).
7. **Tasks & Follow-ups:** Recruiter work queue, due dates, overdue badges, priority filters (`High`, `Medium`, `Low`), and candidate/client associations.
8. **Payments & Collections:** Financial tracking for candidate registration fees (default ₹200 from SCC walk-in records, fully editable) and employer placement commission invoices with partial payment handling.
9. **Activities & Audit:** Operational activity logs, Admin-only secure CSV data export, and real-time offline synchronization queue monitor.

---

## ⚙️ Environment Variables (.env)

Create a `.env` file in the project root:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> **Note:** If `.env` is omitted or contains dummy values during development, SCC CRM automatically activates its safe local offline mode, falling back to local memory and IndexedDB queue without crashing the UI.

---

## 🗄️ Database Migrations (Supabase SQL Editor)

Execute the additive SQL migration scripts in [`supabase/migrations/`](file:///c:/Users/Arti/Downloads/antigravity%20projects/scc-crm-main/supabase/migrations) in this exact order:

1. **`20261002_001_core_hardening.sql`**
   - Creates `moddatetime` auto-update triggers for `updated_at`.
   - Adds missing indexing (`idx_candidates_status_created`, `idx_jobs_status_created`, `idx_interviews_scheduled_time`).
   - Upgrades `candidates` and `jobs` tables with safe additive columns.
2. **`20261002_002_recruitment_entities.sql`**
   - Provisions `employers` table.
   - Provisions `job_applications` table with stage constraints and unique `(candidate_id, job_id)` index.
   - Provisions `tasks` table for recruiter work queues.
   - Provisions `payment_records` table for registration and commission tracking.
3. **`20261002_003_rls_and_security.sql`**
   - Enables Row Level Security (RLS) across all tables.
   - Creates helper function `auth.user_role()`.
   - Locks down financial/payment tables to `Admin` and `Manager` roles.
   - Grants controlled read/write access to recruiters.

---

## 🧪 Verification & Testing Commands

All verification commands pass with zero errors:

```bash
# 1. Clean reproducible dependency install
npm ci

# 2. TypeScript static typecheck (Strict 0 errors)
npm run typecheck

# 3. Unit & Integration test suite (Vitest)
npm test

# 4. Production build bundle validation
npm run build

# 5. Code quality and lint verification
npm run lint
```

---

## 🚀 Running Locally

```bash
# Start Vite development server
npm run dev
```

Visit `http://localhost:5173` in your browser. Toggle roles (`Admin`, `Manager`, `Recruiter`) from the top-right header to test role-gated interfaces.
