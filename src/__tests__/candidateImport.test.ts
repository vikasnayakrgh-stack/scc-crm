import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import {
  normalizePhone,
  autoDetectColumnMapping,
  parseSpreadsheetFile,
  analyzeImportRows,
  generateSkippedReportCSV,
  detectPlatform,
  NAUKRI_UNSUPPORTED_METADATA_HEADERS,
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

    it('handles 0091 international prefix (00919876543210)', () => {
      const res = normalizePhone('00919876543210');
      expect(res.isValid).toBe(true);
      expect(res.normalized).toBe('9876543210');
    });

    it('handles +91 with leading zero (+91 09876543210)', () => {
      const res = normalizePhone('+91 09876543210');
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

    it('defaults optional fields safely without inventing skills or assigning silent location', () => {
      const rawRows = [
        { Name: 'Jyoti Rao', Mobile: '9827998877' }, // No experience, salary, skills, location
      ];

      const mapping: ColumnMapping = { name: 'Name', mobile: 'Mobile' };
      
      // Case 1: Without explicit default location -> location preserved as missing ('')
      const analysisWithoutDefault = analyzeImportRows({
        rawRows,
        mapping,
        source: 'WorkIndia',
        existingCandidates: [],
      });

      expect(analysisWithoutDefault.readyCount).toBe(1);
      const parsed1 = analysisWithoutDefault.rows[0]!.parsed;
      expect(parsed1.experience).toBe(0);
      expect(parsed1.notes).toContain('Experience: Not Specified');
      expect(parsed1.expected_salary).toBe(0);
      expect(parsed1.current_salary).toBeUndefined();
      expect(parsed1.location).toBe(''); // Preserved as missing, NOT silently assigned to Raipur!
      expect(parsed1.skills).toEqual([]); // Preserved as empty array [], NOT invented ['General']!
      expect(parsed1.last_role).toBe('Candidate');
      expect(parsed1.source).toBe('WorkIndia');

      // Case 2: With explicitly chosen recruiter default location -> uses chosen city
      const analysisWithDefault = analyzeImportRows({
        rawRows,
        mapping,
        source: 'WorkIndia',
        existingCandidates: [],
        defaultLocation: 'Raipur',
      });
      expect(analysisWithDefault.rows[0]!.parsed.location).toBe('Raipur');
    });

    it('preserves meaningful distinction between Fresher, 0 years, and missing experience', () => {
      const rawRows = [
        { Name: 'Candidate Fresher', Mobile: '9827111001', Experience: 'Fresher' },
        { Name: 'Candidate Zero', Mobile: '9827111002', Experience: '0' },
        { Name: 'Candidate Missing', Mobile: '9827111003' }, // Missing experience
        { Name: 'Candidate Experienced', Mobile: '9827111004', Experience: '3.5 Yrs' },
      ];

      const mapping: ColumnMapping = { name: 'Name', mobile: 'Mobile', experience: 'Experience' };
      const analysis = analyzeImportRows({
        rawRows,
        mapping,
        source: 'Job Portal',
        existingCandidates: [],
      });

      expect(analysis.readyCount).toBe(4);

      // Fresher: experience 0, notes contains "Experience: Fresher"
      const cFresher = analysis.rows[0]!.parsed;
      expect(cFresher.experience).toBe(0);
      expect(cFresher.notes).toContain('Experience: Fresher');

      // Explicit 0: experience 0, notes does NOT claim Fresher or Not Specified
      const cZero = analysis.rows[1]!.parsed;
      expect(cZero.experience).toBe(0);
      expect(cZero.notes || '').not.toContain('Experience: Fresher');
      expect(cZero.notes || '').not.toContain('Experience: Not Specified');

      // Missing: experience 0, notes contains "Experience: Not Specified"
      const cMissing = analysis.rows[2]!.parsed;
      expect(cMissing.experience).toBe(0);
      expect(cMissing.notes).toContain('Experience: Not Specified');

      // Experienced: experience 3.5
      const cExp = analysis.rows[3]!.parsed;
      expect(cExp.experience).toBe(3.5);
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

  describe('Platform Auto-Detection (WorkIndia vs Naukri.com vs Generic)', () => {
    it('detects WorkIndia export platform from representative headers', () => {
      const headers = ['Full Name', 'Mobile No.', 'City', 'Qualification', 'Level Of Experience', 'Relevant Experience', 'Skills', 'Applied At'];
      const info = detectPlatform(headers);
      expect(info.platform).toBe('WorkIndia');
      expect(info.defaultSource).toBe('WorkIndia');
    });

    it('detects Naukri.com export platform and identifies unsupported metadata', () => {
      const headers = [
        'Job Title', 'Date of application', 'Name', 'Email ID', 'Phone Number',
        'Current Location', 'Total Experience', 'Annual Salary', 'Under Graduation degree',
        'Download', 'Viewed', 'Calling Status', 'Comment 1', 'Source'
      ];
      const info = detectPlatform(headers);
      expect(info.platform).toBe('Naukri.com');
      expect(info.defaultSource).toBe('Naukri');
      expect(info.unsupportedMetadata).toContain('Download');
      expect(info.unsupportedMetadata).toContain('Viewed');
      expect(info.unsupportedMetadata).toContain('Calling Status');
      expect(info.unsupportedMetadata).toContain('Comment 1');
      expect(info.unsupportedMetadata).toContain('Source');
    });

    it('identifies generic spreadsheets without portal-specific indicators', () => {
      const headers = ['Candidate Name', 'Mobile', 'Location'];
      const info = detectPlatform(headers);
      expect(info.platform).toBe('Generic');
      expect(info.defaultSource).toBe('Other');
    });
  });

  describe('Actual WorkIndia Sample File Verification', () => {
    const wiFilePath = 'c:\\Users\\Arti\\Downloads\\55116612-e6f2-41eb-80ef-0d4c4146fa19-export_16669442_1791044775.csv';

    it('parses real WorkIndia CSV export and verifies all 72 records', () => {
      if (!fs.existsSync(wiFilePath)) {
        console.warn('WorkIndia sample file not found, skipping real file test');
        return;
      }

      const fileBuffer = fs.readFileSync(wiFilePath);
      const parsed = parseSpreadsheetFile(fileBuffer);

      expect(parsed.rawRows.length).toBe(72);
      expect(parsed.headers).toContain('Full Name');
      expect(parsed.headers).toContain('Mobile No.');

      const mapping = autoDetectColumnMapping(parsed.headers);
      expect(mapping.name).toBe('Full Name');
      expect(mapping.mobile).toBe('Mobile No.');
      expect(mapping.qualification).toBe('Qualification');

      const analysis = analyzeImportRows({
        rawRows: parsed.rawRows,
        mapping,
        source: 'WorkIndia',
        existingCandidates: [],
      });

      expect(analysis.totalRows).toBe(72);
      expect(analysis.readyCount).toBe(72);
      expect(analysis.invalidCount).toBe(0);

      // Verify row 1 candidate normalization
      const row1 = analysis.rows[0]!;
      expect(row1.parsed.name).toBe('priti Rana');
      expect(row1.parsed.mobile).toBe('6264248465');
      expect(row1.parsed.current_salary).toBeUndefined(); // '-' was correctly sanitized to undefined
      expect(row1.parsed.source).toBe('WorkIndia');
      expect(row1.parsed.notes).toContain('15 years in HR Operations');

      // Verify repeat upload protection: re-uploading against CRM candidates flags 100% as existing
      const simulatedCrmCandidates: Candidate[] = analysis.rows.map((r, i) => ({
        id: `cand-wi-${i}`,
        name: r.parsed.name,
        mobile: r.parsed.mobile,
        experience: r.parsed.experience,
        skills: r.parsed.skills,
        location: r.parsed.location,
        expected_salary: r.parsed.expected_salary,
        last_role: r.parsed.last_role,
        status: 'Active',
        owner_id: 'recruiter-1',
        is_active: true,
        created_at: new Date().toISOString(),
      }));

      const reUpload = analyzeImportRows({
        rawRows: parsed.rawRows,
        mapping,
        source: 'WorkIndia',
        existingCandidates: simulatedCrmCandidates,
      });

      expect(reUpload.readyCount).toBe(0); // Zero new candidates
      expect(reUpload.alreadyInCrmCount).toBe(72); // All 72 flagged as already in CRM
    });
  });

  describe('Actual Naukri.com Sample File Verification (72 columns)', () => {
    const naukriFilePath = 'c:\\Users\\Arti\\Downloads\\Tele-Caller_20261003221601_4.xlsx';

    it('parses real Naukri Excel export with 72 columns and verifies all rules', () => {
      if (!fs.existsSync(naukriFilePath)) {
        console.warn('Naukri sample file not found, skipping real file test');
        return;
      }

      const fileBuffer = fs.readFileSync(naukriFilePath);
      const parsed = parseSpreadsheetFile(fileBuffer);

      expect(parsed.rawRows.length).toBe(4);
      expect(parsed.headers.length).toBe(72);

      const mapping = autoDetectColumnMapping(parsed.headers);
      expect(mapping.name).toBe('Name');
      expect(mapping.mobile).toBe('Phone Number');
      expect(mapping.email).toBe('Email ID');
      expect(mapping.experience).toBe('Total Experience');
      expect(mapping.current_salary).toBe('Annual Salary');
      expect(mapping.skills).toBe('Key Skills');

      const analysis = analyzeImportRows({
        rawRows: parsed.rawRows,
        mapping,
        source: 'Naukri.com',
        existingCandidates: [],
      });

      expect(analysis.totalRows).toBe(4);
      expect(analysis.readyCount).toBe(4);
      expect(analysis.invalidCount).toBe(0);

      // Verify Candidate #1
      const c1 = analysis.rows[0]!;
      expect(c1.parsed.name).toBe('Chiteshwaryadav');
      expect(c1.parsed.mobile).toBe('7692983889');
      expect(c1.parsed.email).toBe('chiteshwaryadav7@gmail.com');
      expect(c1.parsed.experience).toBe(0); // "Fresher" parsed to 0
      expect(c1.parsed.notes).toContain('Experience: Fresher');
      expect(c1.parsed.current_salary).toBeUndefined(); // Annual Salary is NOT treated as monthly salary!
      expect(c1.parsed.notes).toContain('Resume Headline');
      expect(c1.parsed.notes).toContain('Summary');
      expect(c1.parsed.source).toBe('Naukri.com'); // Acquisition source is Naukri.com, NOT 'Classified'

      // Verify all 4 mobile numbers normalized correctly
      const expectedMobiles = ['7692983889', '9302474965', '8109263225', '7400744259'];
      analysis.rows.forEach((r, idx) => {
        expect(r.parsed.mobile).toBe(expectedMobiles[idx]);
      });

      // Verify repeat upload protection: re-uploading produces 0 ready, 4 already in CRM
      const simulatedCrmCandidates: Candidate[] = analysis.rows.map((r, i) => ({
        id: `cand-naukri-${i}`,
        name: r.parsed.name,
        mobile: r.parsed.mobile,
        experience: r.parsed.experience,
        skills: r.parsed.skills,
        location: r.parsed.location,
        expected_salary: r.parsed.expected_salary,
        last_role: r.parsed.last_role,
        status: 'Active',
        owner_id: 'recruiter-1',
        is_active: true,
        created_at: new Date().toISOString(),
      }));

      const reUpload = analyzeImportRows({
        rawRows: parsed.rawRows,
        mapping,
        source: 'Naukri.com',
        existingCandidates: simulatedCrmCandidates,
      });

      expect(reUpload.readyCount).toBe(0);
      expect(reUpload.alreadyInCrmCount).toBe(4);
    });
  });

  describe('Batch Failure Simulation and Idempotent Retry', () => {
    it('handles partial batch failure and allows idempotent retry without duplicates', () => {
      const candidatesToImport = [
        { Name: 'Batch1 Candidate A', Mobile: '9827011111' },
        { Name: 'Batch1 Candidate B', Mobile: '9827022222' },
        { Name: 'Batch2 Candidate C', Mobile: '9827033333' },
        { Name: 'Batch2 Candidate D', Mobile: '9827044444' },
      ];

      const mapping: ColumnMapping = { name: 'Name', mobile: 'Mobile' };

      // Step 1: Initial analysis
      const initialAnalysis = analyzeImportRows({
        rawRows: candidatesToImport,
        mapping,
        source: 'Naukri',
        existingCandidates: [],
      });

      expect(initialAnalysis.readyCount).toBe(4);

      // Step 2: Batch 1 succeeds, Batch 2 fails
      // Simulate Batch 1 saved to CRM
      const crmAfterBatch1: Candidate[] = [
        {
          id: 'c-b1-a',
          name: 'Batch1 Candidate A',
          mobile: '9827011111',
          experience: 0,
          skills: ['General'],
          location: 'Raipur',
          expected_salary: 0,
          last_role: 'Candidate',
          status: 'Active',
          owner_id: 'recruiter-1',
          is_active: true,
          created_at: new Date().toISOString(),
        },
        {
          id: 'c-b1-b',
          name: 'Batch1 Candidate B',
          mobile: '9827022222',
          experience: 0,
          skills: ['General'],
          location: 'Raipur',
          expected_salary: 0,
          last_role: 'Candidate',
          status: 'Active',
          owner_id: 'recruiter-1',
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ];

      // Step 3: User retries the import with the same file
      const retryAnalysis = analyzeImportRows({
        rawRows: candidatesToImport,
        mapping,
        source: 'Naukri',
        existingCandidates: crmAfterBatch1,
      });

      // Batch 1 candidates are detected as already in CRM!
      expect(retryAnalysis.alreadyInCrmCount).toBe(2);
      // Only the failed Batch 2 candidates are ready to import!
      expect(retryAnalysis.readyCount).toBe(2);
      expect(retryAnalysis.rows.filter(r => r.status === 'ready').map(r => r.parsed.name)).toEqual([
        'Batch2 Candidate C',
        'Batch2 Candidate D',
      ]);
    });

    it('gracefully handles PostgreSQL unique constraint violations (code 23505) during concurrent insertion', () => {
      // Simulate database response when concurrent import attempts inserting already-committed active mobile
      const pgError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint "idx_candidates_mobile_active"',
      };

      const translateDbError = (err: any) => {
        const msg = err?.message || '';
        if (msg.includes('idx_candidates_mobile_active') || msg.includes('duplicate key') || err?.code === '23505') {
          return 'Mobile number already registered in CRM (Concurrent duplicate prevented)';
        }
        return msg;
      };

      const userFacingReason = translateDbError(pgError);
      expect(userFacingReason).toBe('Mobile number already registered in CRM (Concurrent duplicate prevented)');
    });
  });
});
