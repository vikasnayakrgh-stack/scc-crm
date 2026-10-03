import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  normalizePhone,
  autoDetectColumnMapping,
  parseSpreadsheetFile,
  analyzeImportRows,
  generateSkippedReportCSV,
  ColumnMapping,
} from '../lib/candidateImport';
import { Candidate } from '../types';

describe('Candidate Import Engine', () => {
  describe('Mobile Number Normalization (Indian 10-digit format)', () => {
    it('normalizes clean 10-digit mobile number', () => {
      const res = normalizePhone('9876543210');
      expect(res.isValid).toBe(true);
      expect(res.normalized).toBe('9876543210');
    });

    it('handles +91 prefix with spaces and hyphens', () => {
      const res1 = normalizePhone('+91 9876543210');
      expect(res1.isValid).toBe(true);
      expect(res1.normalized).toBe('9876543210');

      const res2 = normalizePhone('+91-98765-43210');
      expect(res2.isValid).toBe(true);
      expect(res2.normalized).toBe('9876543210');
    });

    it('handles 91 prefix without plus sign', () => {
      const res = normalizePhone('919876543210');
      expect(res.isValid).toBe(true);
      expect(res.normalized).toBe('9876543210');
    });

    it('handles leading zero (09876543210)', () => {
      const res = normalizePhone('09876543210');
      expect(res.isValid).toBe(true);
      expect(res.normalized).toBe('9876543210');
    });

    it('rejects numbers not starting with 6, 7, 8, 9', () => {
      const res = normalizePhone('5555555555');
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('Invalid starting digit');
    });

    it('rejects numbers with fewer than 10 digits', () => {
      const res = normalizePhone('987654');
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('Expected 10 digits, got 6');
    });

    it('rejects numbers with more than 10 digits after stripping prefix', () => {
      const res = normalizePhone('98765432109999');
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('Expected 10 digits');
    });

    it('rejects empty, null or undefined input', () => {
      expect(normalizePhone('').isValid).toBe(false);
      expect(normalizePhone(null).isValid).toBe(false);
      expect(normalizePhone(undefined).isValid).toBe(false);
    });
  });

  describe('Column Auto-Detection and Mapping', () => {
    it('auto-detects WorkIndia style headers', () => {
      const headers = ['Candidate Name', 'Contact Number', 'Work Experience', 'Key Skills', 'City', 'Current CTC', 'Expected CTC'];
      const mapping = autoDetectColumnMapping(headers);

      expect(mapping.name).toBe('Candidate Name');
      expect(mapping.mobile).toBe('Contact Number');
      expect(mapping.experience).toBe('Work Experience');
      expect(mapping.skills).toBe('Key Skills');
      expect(mapping.location).toBe('City');
      expect(mapping.current_salary).toBe('Current CTC');
      expect(mapping.expected_salary).toBe('Expected CTC');
    });

    it('auto-detects Naukri style headers', () => {
      const headers = ['Full Name', 'Mobile No', 'Email ID', 'Highest Qualification', 'Total Exp', 'Notice Period', 'Current Designation'];
      const mapping = autoDetectColumnMapping(headers);

      expect(mapping.name).toBe('Full Name');
      expect(mapping.mobile).toBe('Mobile No');
      expect(mapping.email).toBe('Email ID');
      expect(mapping.qualification).toBe('Highest Qualification');
      expect(mapping.experience).toBe('Total Exp');
      expect(mapping.notice_period).toBe('Notice Period');
      expect(mapping.last_role).toBe('Current Designation');
    });

    it('supports manual column mapping overrides', () => {
      const headers = ['Col_A', 'Col_B', 'Col_C'];
      const customMapping: ColumnMapping = {
        name: 'Col_A',
        mobile: 'Col_B',
        skills: 'Col_C',
      };

      const rawRows = [
        { Col_A: 'Rahul Verma', Col_B: '9827100001', Col_C: 'Tally, GST' },
      ];

      const analysis = analyzeImportRows({
        rawRows,
        mapping: customMapping,
        source: 'Other',
        existingCandidates: [],
      });

      expect(analysis.readyCount).toBe(1);
      expect(analysis.rows[0]!.parsed.name).toBe('Rahul Verma');
      expect(analysis.rows[0]!.parsed.mobile).toBe('9827100001');
      expect(analysis.rows[0]!.parsed.skills).toEqual(['Tally', 'GST']);
    });
  });

  describe('Duplicate Detection & Repeat Upload Protection', () => {
    const mockExistingCandidates: Candidate[] = [
      {
        id: 'cand-001',
        name: 'Existing Amit Sharma',
        mobile: '9826111111',
        experience: 3,
        skills: ['Sales'],
        location: 'Raipur',
        expected_salary: 25000,
        last_role: 'Sales Exec',
        status: 'Active',
        owner_id: 'Recruiter-1',
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ];

    it('detects and flags duplicates within the same uploaded file', () => {
      const rawRows = [
        { Name: 'Priya Sahu', Mobile: '+91 9827222222', Skills: 'Receptionist' }, // Row 2 -> Ready
        { Name: 'Priya Sahu Duplicate', Mobile: '9827-222-222', Skills: 'Admin' }, // Row 3 -> Duplicate in file
        { Name: 'Vikas Nayak', Mobile: '9827333333', Skills: 'Accountant' },      // Row 4 -> Ready
      ];

      const mapping: ColumnMapping = { name: 'Name', mobile: 'Mobile', skills: 'Skills' };
      const analysis = analyzeImportRows({
        rawRows,
        mapping,
        source: 'WorkIndia',
        existingCandidates: [],
      });

      expect(analysis.totalRows).toBe(3);
      expect(analysis.readyCount).toBe(2);
      expect(analysis.duplicateInFileCount).toBe(1);

      expect(analysis.rows[0]!.status).toBe('ready');
      expect(analysis.rows[1]!.status).toBe('duplicate_in_file');
      expect(analysis.rows[1]!.statusReason).toContain('Matches Row 2');
      expect(analysis.rows[2]!.status).toBe('ready');
    });

    it('detects candidates that already exist in CRM', () => {
      const rawRows = [
        { Name: 'Amit Sharma', Mobile: '+91-98261-11111' }, // Existing mobile
        { Name: 'Sunil Verma', Mobile: '9826999999' },      // New mobile
      ];

      const mapping: ColumnMapping = { name: 'Name', mobile: 'Mobile' };
      const analysis = analyzeImportRows({
        rawRows,
        mapping,
        source: 'Naukri',
        existingCandidates: mockExistingCandidates,
      });

      expect(analysis.readyCount).toBe(1);
      expect(analysis.alreadyInCrmCount).toBe(1);
      expect(analysis.rows[0]!.status).toBe('already_in_crm');
      expect(analysis.rows[0]!.statusReason).toContain('Already registered in CRM as "Existing Amit Sharma"');
      expect(analysis.rows[1]!.status).toBe('ready');
    });

    it('protects against re-uploading the same Excel (all flagged as existing in CRM)', () => {
      const initialRows = [
        { Name: 'Ramesh Patel', Mobile: '9827555555' },
        { Name: 'Kavita Singh', Mobile: '9827666666' },
      ];

      // Simulate after initial import: candidates now exist in CRM
      const updatedCrmCandidates: Candidate[] = [
        ...mockExistingCandidates,
        {
          id: 'cand-002',
          name: 'Ramesh Patel',
          mobile: '9827555555',
          experience: 2,
          skills: ['Retail'],
          location: 'Raipur',
          expected_salary: 15000,
          last_role: 'Retail Store',
          status: 'Active',
          owner_id: 'Recruiter-1',
          is_active: true,
          created_at: new Date().toISOString(),
        },
        {
          id: 'cand-003',
          name: 'Kavita Singh',
          mobile: '9827666666',
          experience: 1,
          skills: ['Telecalling'],
          location: 'Raipur',
          expected_salary: 12000,
          last_role: 'Telecaller',
          status: 'Active',
          owner_id: 'Recruiter-1',
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ];

      // User re-uploads the exact same Excel sheet
      const mapping: ColumnMapping = { name: 'Name', mobile: 'Mobile' };
      const reUploadAnalysis = analyzeImportRows({
        rawRows: initialRows,
        mapping,
        source: 'WorkIndia',
        existingCandidates: updatedCrmCandidates,
      });

      expect(reUploadAnalysis.totalRows).toBe(2);
      expect(reUploadAnalysis.readyCount).toBe(0); // ZERO new candidates!
      expect(reUploadAnalysis.alreadyInCrmCount).toBe(2);
      expect(reUploadAnalysis.rows.every(r => r.status === 'already_in_crm')).toBe(true);
    });
  });

  describe('Invalid Data & Missing Required Fields', () => {
    it('flags rows with missing or blank candidate name', () => {
      const rawRows = [
        { Name: '', Mobile: '9827112233' },
        { Name: '   ', Mobile: '9827112244' },
      ];

      const mapping: ColumnMapping = { name: 'Name', mobile: 'Mobile' };
      const analysis = analyzeImportRows({
        rawRows,
        mapping,
        source: 'Other',
        existingCandidates: [],
      });

      expect(analysis.invalidCount).toBe(2);
      expect(analysis.rows[0]!.statusReason).toContain('Candidate Name is required');
      expect(analysis.rows[1]!.statusReason).toContain('Candidate Name is required');
    });

    it('flags rows with missing or invalid mobile numbers', () => {
      const rawRows = [
        { Name: 'Aman Deep', Mobile: '' },
        { Name: 'Deepak Roy', Mobile: '12345' },
        { Name: 'Neha Jain', Mobile: 'abcdefghij' },
      ];

      const mapping: ColumnMapping = { name: 'Name', mobile: 'Mobile' };
      const analysis = analyzeImportRows({
        rawRows,
        mapping,
        source: 'Other',
        existingCandidates: [],
      });

      expect(analysis.invalidCount).toBe(3);
      expect(analysis.readyCount).toBe(0);
    });

    it('defaults optional fields safely when missing in file', () => {
      const rawRows = [
        { Name: 'Jyoti Rao', Mobile: '9827998877' }, // No experience, salary, skills
      ];

      const mapping: ColumnMapping = { name: 'Name', mobile: 'Mobile' };
      const analysis = analyzeImportRows({
        rawRows,
        mapping,
        source: 'WorkIndia',
        existingCandidates: [],
        defaultLocation: 'Raipur',
      });

      expect(analysis.readyCount).toBe(1);
      const parsed = analysis.rows[0]!.parsed;
      expect(parsed.experience).toBe(0);
      expect(parsed.expected_salary).toBe(0);
      expect(parsed.current_salary).toBeUndefined();
      expect(parsed.location).toBe('Raipur');
      expect(parsed.last_role).toBe('Candidate');
      expect(parsed.skills).toEqual(['General']);
      expect(parsed.source).toBe('WorkIndia');
    });
  });

  describe('Excel and CSV Parsing', () => {
    it('creates and parses in-memory Excel workbook (.xlsx)', () => {
      const testData = [
        { 'Candidate Name': 'Rajesh Sharma', 'Contact': '9827111222', 'Skills': 'Tally, Excel' },
        { 'Candidate Name': 'Meena Verma', 'Contact': '9827333444', 'Skills': 'Back Office' },
      ];

      const ws = XLSX.utils.json_to_sheet(testData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

      const parsed = parseSpreadsheetFile(buffer);
      expect(parsed.headers).toContain('Candidate Name');
      expect(parsed.headers).toContain('Contact');
      expect(parsed.rawRows.length).toBe(2);
      expect(parsed.rawRows[0]!['Candidate Name']).toBe('Rajesh Sharma');
    });

    it('creates and parses CSV file format', () => {
      const csvContent = 'Full Name,Mobile Number,Location\nSanjay Gupta,9827001122,Bhilai\nAnita Roy,9827003344,Durg';
      const encoder = new TextEncoder();
      const buffer = encoder.encode(csvContent);

      const parsed = parseSpreadsheetFile(buffer);
      expect(parsed.headers).toContain('Full Name');
      expect(parsed.headers).toContain('Mobile Number');
      expect(parsed.rawRows.length).toBe(2);
      expect(parsed.rawRows[1]!['Full Name']).toBe('Anita Roy');
    });
  });

  describe('Skipped & Error CSV Report Generation', () => {
    it('generates well-formatted CSV with row numbers and exact reasons', () => {
      const rawRows = [
        { Name: 'Valid User', Mobile: '9827111111' },
        { Name: 'Duplicate User', Mobile: '9827111111' },
        { Name: 'Invalid Phone User', Mobile: '123' },
      ];

      const mapping: ColumnMapping = { name: 'Name', mobile: 'Mobile' };
      const analysis = analyzeImportRows({
        rawRows,
        mapping,
        source: 'WorkIndia',
        existingCandidates: [],
      });

      const reportCsv = generateSkippedReportCSV(analysis.rows);
      expect(reportCsv).toContain('Row Number,Status,Candidate Name,Mobile,Reason for Skipping');
      expect(reportCsv).toContain('3,duplicate_in_file,"Duplicate User","9827111111"');
      expect(reportCsv).toContain('4,invalid,"Invalid Phone User"');
    });
  });
});
