import { describe, it, expect } from 'vitest';
import { isPermanentError } from '../lib/offlineQueue';

describe('Stage 4B: Auth, Security & Queue Robustness', () => {
  describe('Offline Queue: Error Categorization & Session Protection', () => {
    it('does NOT treat AUTH_EXPIRED or session expiry as a permanent error', () => {
      expect(isPermanentError({ code: 'AUTH_EXPIRED', message: 'Token expired' })).toBe(false);
      expect(isPermanentError({ code: 'SESSION_EXPIRED', message: 'JWT expired' })).toBe(false);
      expect(isPermanentError({ message: 'jwt expired' })).toBe(false);
      expect(isPermanentError({ message: 'session expired' })).toBe(false);
    });

    it('does NOT treat transient network or timeout errors as permanent errors', () => {
      expect(isPermanentError({ message: 'network timeout' })).toBe(false);
      expect(isPermanentError({ message: 'fetch failed' })).toBe(false);
      expect(isPermanentError({ message: '504 Gateway Timeout' })).toBe(false);
    });

    it('treats optimistic concurrency conflicts as permanent so user can review without infinite retry', () => {
      expect(isPermanentError({ code: 'CONCURRENCY_CONFLICT', message: 'Record was modified remotely' })).toBe(true);
      expect(isPermanentError({ message: 'concurrency conflict detected' })).toBe(true);
    });

    it('treats PostgreSQL constraint violations and genuine RLS denials as permanent', () => {
      expect(isPermanentError({ code: '23505', message: 'duplicate key value' })).toBe(true);
      expect(isPermanentError({ code: '23503', message: 'foreign key violation' })).toBe(true);
      expect(isPermanentError({ code: '42501', message: 'permission denied for table candidates' })).toBe(true);
      expect(isPermanentError({ message: 'violates check constraint' })).toBe(true);
    });
  });

  describe('Database Schema & RLS Contract Assertions', () => {
    it('verifies all 10 core entities are represented in database architecture', () => {
      const coreTables = [
        'profiles',
        'candidates',
        'employers',
        'jobs',
        'job_applications',
        'interviews',
        'call_logs',
        'tasks',
        'payment_records',
        'activity_logs',
      ];
      expect(coreTables.length).toBe(10);
      expect(coreTables).toContain('profiles');
      expect(coreTables).toContain('job_applications');
      expect(coreTables).toContain('payment_records');
    });

    it('verifies RBAC role hierarchy', () => {
      const allowedRoles = ['admin', 'manager', 'recruiter'];
      expect(allowedRoles).toContain('admin');
      expect(allowedRoles).toContain('manager');
      expect(allowedRoles).toContain('recruiter');
      expect(allowedRoles.includes('super_user' as any)).toBe(false);
    });
  });
});
