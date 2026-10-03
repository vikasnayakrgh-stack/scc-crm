import * as XLSX from 'xlsx';
import { Candidate } from '../types';

export type CandidateImportSource = 'WorkIndia' | 'Naukri' | 'WhatsApp' | 'Walk-in' | 'Other';

export interface ColumnMapping {
  name: string;
  mobile: string;
  email?: string;
  experience?: string;
  skills?: string;
  location?: string;
  expected_salary?: string;
  current_salary?: string;
  qualification?: string;
  notice_period?: string;
  last_role?: string;
  notes?: string;
}

export type RowImportStatus = 
  | 'ready'               // Valid new candidate, ready to import
  | 'duplicate_in_file'  // Duplicate of another row in the same uploaded file
  | 'already_in_crm'     // Normalized mobile already exists in SCC CRM
  | 'invalid';           // Missing name, invalid mobile, or malformed data

export interface ProcessedImportRow {
  rowNumber: number;          // 1-based row number in spreadsheet (header = 1, first data row = 2)
  rawData: Record<string, any>;
  status: RowImportStatus;
  statusReason?: string;
  candidateRef?: string;       // Existing candidate name or ID if already in CRM
  selected: boolean;          // Checkbox toggle for user selection
  // Normalized candidate data
  parsed: {
    name: string;
    mobile: string;
    email?: string;
    experience: number;
    skills: string[];
    location: string;
    expected_salary: number;
    current_salary?: number;
    qualification?: string;
    notice_period?: string;
    last_role: string;
    notes?: string;
    source: string;
  };
}

export interface ImportAnalysisSummary {
  totalRows: number;
  readyCount: number;
  duplicateInFileCount: number;
  alreadyInCrmCount: number;
  invalidCount: number;
  rows: ProcessedImportRow[];
}

/**
 * Normalizes an Indian phone number to a strictly valid 10-digit format.
 * Rules:
 *  - Strips all non-digit characters (spaces, hyphens, plus, parentheses)
 *  - Handles '+91' or '91' prefix if resulting digits = 12
 *  - Handles leading '0' prefix if resulting digits = 11
 *  - Verifies exactly 10 digits starting with [6-9]
 */
export function normalizePhone(raw: any): { isValid: boolean; normalized: string; reason?: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { isValid: false, normalized: '', reason: 'Missing phone number' };
  }

  // Convert to string and strip non-digit characters
  let str = String(raw).trim();
  let digits = str.replace(/\D/g, '');

  if (!digits) {
    return { isValid: false, normalized: '', reason: 'Phone contains no digits' };
  }

  // Handle +91 or 91 country code (12 digits)
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  // Handle leading 0 (11 digits e.g. 09876543210)
  else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Check 10-digit length
  if (digits.length !== 10) {
    return {
      isValid: false,
      normalized: digits,
      reason: `Expected 10 digits, got ${digits.length} digits (${str})`,
    };
  }

  // Check valid Indian mobile starting digit [6-9]
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return {
      isValid: false,
      normalized: digits,
      reason: `Invalid starting digit '${digits[0]}'. Indian mobile must start with 6, 7, 8 or 9`,
    };
  }

  return { isValid: true, normalized: digits };
}

/**
 * Header dictionary aliases for common job portals (WorkIndia, Naukri, Monster, Indeed, etc.)
 */
const HEADER_ALIASES: Record<keyof ColumnMapping, string[]> = {
  name: [
    'name', 'candidate name', 'candidatename', 'full name', 'fullname',
    'candidate', 'seeker name', 'seeker', 'applicant name', 'applicant', 'first name'
  ],
  mobile: [
    'mobile', 'phone', 'contact number', 'contact', 'contact no', 'mobile no',
    'mobile number', 'phone number', 'phonenumber', 'cell', 'whatsapp number', 'mobile_no'
  ],
  email: [
    'email', 'email id', 'emailid', 'email address', 'mail', 'mail id'
  ],
  qualification: [
    'qualification', 'education', 'highest qualification', 'degree', 'course', 'edu'
  ],
  experience: [
    'experience', 'work experience', 'total experience', 'exp', 'exp (yrs)',
    'experience (years)', 'experience in years', 'experience_years', 'total exp'
  ],
  current_salary: [
    'current salary', 'current_salary', 'present salary', 'current ctc', 'ctc', 'current package'
  ],
  expected_salary: [
    'expected salary', 'expected_salary', 'exp salary', 'expected ctc',
    'target salary', 'desired salary', 'exp ctc'
  ],
  location: [
    'city', 'location', 'current location', 'address', 'preferred location',
    'town', 'current city', 'state'
  ],
  skills: [
    'skills', 'key skills', 'skillset', 'technologies', 'it skills',
    'competencies', 'primary skills'
  ],
  last_role: [
    'designation', 'role', 'current role', 'job title', 'profile', 'post',
    'last role', 'current designation', 'applied role', 'job'
  ],
  notice_period: [
    'notice period', 'notice_period', 'notice', 'availability'
  ],
  notes: [
    'notes', 'remarks', 'comment', 'comments', 'recruiter notes', 'summary'
  ],
};

/**
 * Automatically detects column mapping from spreadsheet headers
 */
export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: Partial<ColumnMapping> = {};
  const cleanHeaders = headers.map(h => ({
    original: h,
    normalized: String(h).toLowerCase().trim().replace(/[_\W]+/g, ' '),
  }));

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof ColumnMapping, string[]][]) {
    for (const h of cleanHeaders) {
      if (aliases.includes(h.normalized)) {
        mapping[field] = h.original;
        break;
      }
    }
  }

  // Secondary fuzzy / partial match if exact match wasn't found for required fields
  if (!mapping.name) {
    const match = cleanHeaders.find(h => h.normalized.includes('name'));
    if (match) mapping.name = match.original;
  }
  if (!mapping.mobile) {
    const match = cleanHeaders.find(h => h.normalized.includes('mobile') || h.normalized.includes('phone') || h.normalized.includes('contact'));
    if (match) mapping.mobile = match.original;
  }

  return {
    name: mapping.name || '',
    mobile: mapping.mobile || '',
    email: mapping.email,
    qualification: mapping.qualification,
    experience: mapping.experience,
    current_salary: mapping.current_salary,
    expected_salary: mapping.expected_salary,
    location: mapping.location,
    skills: mapping.skills,
    last_role: mapping.last_role,
    notice_period: mapping.notice_period,
    notes: mapping.notes,
  };
}

/**
 * Parses an Excel or CSV file buffer into headers and row objects
 */
export function parseSpreadsheetFile(buffer: ArrayBuffer | Uint8Array): {
  headers: string[];
  rawRows: Record<string, any>[];
  sheetName: string;
} {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Spreadsheet contains no sheets');
  }

  const sheetName = workbook.SheetNames[0] || 'Sheet1';
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    return { headers: [], rawRows: [], sheetName };
  }

  // Convert sheet to JSON rows with raw header keys
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: '',
    raw: false,
  });

  if (!rows || rows.length === 0) {
    return { headers: [], rawRows: [], sheetName };
  }

  // Extract all distinct keys from rows as headers
  const headerSet = new Set<string>();
  rows.forEach(r => Object.keys(r).forEach(k => headerSet.add(k)));
  const headers = Array.from(headerSet);

  return { headers, rawRows: rows, sheetName };
}

/**
 * Analyzes parsed spreadsheet rows against:
 * 1. Required fields and phone normalization
 * 2. In-file duplicate phone numbers
 * 3. Existing CRM candidates
 */
export function analyzeImportRows({
  rawRows,
  mapping,
  source,
  existingCandidates,
  defaultLocation = 'Raipur',
}: {
  rawRows: Record<string, any>[];
  mapping: ColumnMapping;
  source: string;
  existingCandidates: Candidate[];
  defaultLocation?: string;
}): ImportAnalysisSummary {
  // Index existing CRM candidates by normalized mobile number
  const existingMobileMap = new Map<string, Candidate>();
  for (const c of existingCandidates) {
    if (c.mobile && c.is_active !== false) {
      const norm = normalizePhone(c.mobile);
      if (norm.isValid) {
        existingMobileMap.set(norm.normalized, c);
      }
    }
  }

  // Track phone numbers encountered within this uploaded file
  const seenInFilePhones = new Map<string, number>(); // normalizedPhone -> first row number

  const processedRows: ProcessedImportRow[] = [];

  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2; // Row 1 is header, data starts at Row 2

    const rawName = mapping.name ? row[mapping.name] : '';
    const rawMobile = mapping.mobile ? row[mapping.mobile] : '';
    const rawEmail = mapping.email ? row[mapping.email] : '';
    const rawExp = mapping.experience ? row[mapping.experience] : '';
    const rawSkills = mapping.skills ? row[mapping.skills] : '';
    const rawLoc = mapping.location ? row[mapping.location] : '';
    const rawExpSal = mapping.expected_salary ? row[mapping.expected_salary] : '';
    const rawCurrSal = mapping.current_salary ? row[mapping.current_salary] : '';
    const rawQual = mapping.qualification ? row[mapping.qualification] : '';
    const rawNotice = mapping.notice_period ? row[mapping.notice_period] : '';
    const rawRole = mapping.last_role ? row[mapping.last_role] : '';
    const rawNotes = mapping.notes ? row[mapping.notes] : '';

    const cleanName = String(rawName || '').trim();
    const phoneCheck = normalizePhone(rawMobile);

    // Parse numeric experience (e.g. "2.5 yrs" -> 2.5)
    let experienceNum = 0;
    if (rawExp !== undefined && rawExp !== '') {
      const parsedExp = parseFloat(String(rawExp).replace(/[^0-9.]/g, ''));
      experienceNum = isNaN(parsedExp) ? 0 : Math.min(50, Math.max(0, parsedExp));
    }

    // Parse salaries
    let expSalNum = 0;
    if (rawExpSal !== undefined && rawExpSal !== '') {
      const parsedSal = parseInt(String(rawExpSal).replace(/[^0-9]/g, ''), 10);
      expSalNum = isNaN(parsedSal) ? 0 : parsedSal;
    }

    let currSalNum: number | undefined = undefined;
    if (rawCurrSal !== undefined && rawCurrSal !== '') {
      const parsedCurr = parseInt(String(rawCurrSal).replace(/[^0-9]/g, ''), 10);
      currSalNum = isNaN(parsedCurr) ? undefined : parsedCurr;
    }

    // Parse skills list
    const skillsList = String(rawSkills || '')
      .split(/[,;|/]/)
      .map(s => s.trim())
      .filter(Boolean);
    if (skillsList.length === 0) {
      skillsList.push('General');
    }

    const cleanLocation = String(rawLoc || '').trim() || defaultLocation;
    const cleanRole = String(rawRole || '').trim() || 'Candidate';
    const cleanEmail = String(rawEmail || '').trim() || undefined;

    let status: RowImportStatus = 'ready';
    let statusReason: string | undefined = undefined;
    let candidateRef: string | undefined = undefined;

    // Check 1: Mandatory Name
    if (!cleanName || cleanName.length < 2) {
      status = 'invalid';
      statusReason = !cleanName ? 'Candidate Name is required' : 'Candidate Name is too short';
    }
    // Check 2: Mandatory Valid Phone Number
    else if (!phoneCheck.isValid) {
      status = 'invalid';
      statusReason = phoneCheck.reason || 'Invalid phone number';
    }
    // Check 3: Duplicate within uploaded file
    else if (seenInFilePhones.has(phoneCheck.normalized)) {
      const firstRow = seenInFilePhones.get(phoneCheck.normalized)!;
      status = 'duplicate_in_file';
      statusReason = `Duplicate mobile number in uploaded file (Matches Row ${firstRow})`;
    }
    // Check 4: Existing in SCC CRM
    else if (existingMobileMap.has(phoneCheck.normalized)) {
      const existing = existingMobileMap.get(phoneCheck.normalized)!;
      status = 'already_in_crm';
      statusReason = `Already registered in CRM as "${existing.name}" (${existing.status})`;
      candidateRef = existing.id;
      seenInFilePhones.set(phoneCheck.normalized, rowNumber);
    }
    // Check 5: Eligible new candidate
    else {
      status = 'ready';
      seenInFilePhones.set(phoneCheck.normalized, rowNumber);
    }

    processedRows.push({
      rowNumber,
      rawData: row,
      status,
      statusReason,
      candidateRef,
      selected: status === 'ready', // Default selected only if ready
      parsed: {
        name: cleanName,
        mobile: phoneCheck.normalized,
        email: cleanEmail,
        experience: experienceNum,
        skills: skillsList,
        location: cleanLocation,
        expected_salary: expSalNum,
        current_salary: currSalNum,
        qualification: String(rawQual || '').trim() || undefined,
        notice_period: String(rawNotice || '').trim() || undefined,
        last_role: cleanRole,
        notes: String(rawNotes || '').trim() || undefined,
        source: source || 'Job Portal',
      },
    });
  });

  return {
    totalRows: processedRows.length,
    readyCount: processedRows.filter(r => r.status === 'ready').length,
    duplicateInFileCount: processedRows.filter(r => r.status === 'duplicate_in_file').length,
    alreadyInCrmCount: processedRows.filter(r => r.status === 'already_in_crm').length,
    invalidCount: processedRows.filter(r => r.status === 'invalid').length,
    rows: processedRows,
  };
}

/**
 * Generates and downloads a clean CSV report of skipped/failed rows
 */
export function generateSkippedReportCSV(rows: ProcessedImportRow[]): string {
  const skippedRows = rows.filter(r => r.status !== 'ready');
  const headers = ['Row Number', 'Status', 'Candidate Name', 'Mobile', 'Reason for Skipping'];

  const lines = [headers.join(',')];
  for (const r of skippedRows) {
    const safeName = `"${(r.parsed.name || '').replace(/"/g, '""')}"`;
    const safeMobile = `"${(r.parsed.mobile || '').replace(/"/g, '""')}"`;
    const safeReason = `"${(r.statusReason || r.status).replace(/"/g, '""')}"`;
    lines.push([r.rowNumber, r.status, safeName, safeMobile, safeReason].join(','));
  }

  return lines.join('\n');
}
