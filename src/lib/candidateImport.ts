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

export type DetectedPlatform = 'Naukri.com' | 'WorkIndia' | 'Generic';

export const NAUKRI_UNSUPPORTED_METADATA_HEADERS = [
  'Last Workflow activity',
  'Last Workflow activity by',
  'Time of Last Workflow activity Update',
  'Latest Pipeline Stage',
  'Pipeline Status Updated By',
  'Time when Stage updated',
  'Download',
  'Downloaded By',
  'Time Of Download',
  'Viewed',
  'Viewed By',
  'Time Of View',
  'Emailed',
  'Emailed By',
  'Time Of Email',
  'Calling Status',
  'Calling Status updated by',
  'Time of Calling activity update',
  'Comment 1',
  'Comment 1 BY',
  'Time Comment 1 posted',
  'Comment 2',
  'Comment 2 BY',
  'Time Comment 2 posted',
  'Comment 3',
  'Comment 3 BY',
  'Time Comment 3 posted',
  'Comment 4',
  'Comment 4 BY',
  'Time Comment 4 posted',
  'Comment 5',
  'Comment 5 BY',
  'Time Comment 5 posted',
  'Source', // Naukri internal source ('Classified') - must not overwrite CRM acquisition source
];

export function detectPlatform(headers: string[]): {
  platform: DetectedPlatform;
  defaultSource: CandidateImportSource;
  unsupportedMetadata: string[];
} {
  const clean = headers.map(h => String(h).toLowerCase().trim());
  const isNaukri = clean.includes('job title') && (
    clean.includes('date of application') || 
    clean.includes('annual salary') || 
    clean.includes('under graduation degree')
  );

  if (isNaukri) {
    const unsupported = headers.filter(h =>
      NAUKRI_UNSUPPORTED_METADATA_HEADERS.some(uh => uh.toLowerCase() === String(h).toLowerCase().trim())
    );
    return {
      platform: 'Naukri.com',
      defaultSource: 'Naukri',
      unsupportedMetadata: unsupported,
    };
  }

  const isWorkIndia = clean.includes('level of experience') || 
    clean.includes('relevant experience') || 
    clean.includes('applied at') || 
    clean.includes('languages known');

  if (isWorkIndia) {
    return {
      platform: 'WorkIndia',
      defaultSource: 'WorkIndia',
      unsupportedMetadata: [],
    };
  }

  return {
    platform: 'Generic',
    defaultSource: 'Other',
    unsupportedMetadata: [],
  };
}

export interface ImportAnalysisSummary {
  totalRows: number;
  readyCount: number;
  duplicateInFileCount: number;
  alreadyInCrmCount: number;
  invalidCount: number;
  detectedPlatform?: DetectedPlatform;
  unsupportedMetadataHeaders?: string[];
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
    'qualification', 'education', 'highest qualification', 'degree', 'course', 'edu',
    'under graduation degree', 'post graduation degree', 'highest education'
  ],
  experience: [
    'experience', 'work experience', 'total experience', 'exp', 'exp (yrs)',
    'experience (years)', 'experience in years', 'experience_years', 'total exp',
    'level of experience', 'relevant experience'
  ],
  current_salary: [
    'current salary', 'current_salary', 'present salary', 'current ctc', 'ctc', 'current package',
    'annual salary'
  ],
  expected_salary: [
    'expected salary', 'expected_salary', 'exp salary', 'expected ctc',
    'target salary', 'desired salary', 'exp ctc'
  ],
  location: [
    'city', 'location', 'current location', 'address', 'preferred location',
    'town', 'current city', 'state', 'preferred locations'
  ],
  skills: [
    'skills', 'key skills', 'skillset', 'technologies', 'it skills',
    'competencies', 'primary skills'
  ],
  last_role: [
    'designation', 'role', 'current role', 'job title', 'profile', 'post',
    'last role', 'current designation', 'applied role', 'job',
    'previous designation', 'curr company designation'
  ],
  notice_period: [
    'notice period', 'notice_period', 'notice', 'availability',
    'notice period availability to join'
  ],
  notes: [
    'notes', 'remarks', 'comment', 'comments', 'recruiter notes', 'summary',
    'resume headline'
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
  defaultLocation = '',
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

  // Helper to check for placeholder or empty values
  const isPlaceholder = (val: any): boolean => {
    if (val === null || val === undefined) return true;
    const s = String(val).trim().toUpperCase();
    return (
      s === '' ||
      s === 'NA' ||
      s === 'N/A' ||
      s === '-' ||
      s === 'NULL' ||
      s === 'NOT MENTIONED' ||
      s === 'NONE' ||
      s === 'UNDEFINED'
    );
  };

  // Detect platform from headers if available
  const sampleHeaders = rawRows.length > 0 ? Object.keys(rawRows[0] || {}) : [];
  const platformInfo = detectPlatform(sampleHeaders);

  // Check if current_salary is mapped to an Annual Salary column
  const isAnnualSalaryColumn = Boolean(
    mapping.current_salary && /annual|ctc|package/i.test(mapping.current_salary)
  );

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

    // Parse numeric experience (e.g. "Fresher" -> 0, "15 years in HR" -> 15, "2.5 yrs" -> 2.5)
    // Preserves meaningful distinction between Fresher, explicit 0 years, and missing experience
    let experienceNum = 0;
    let expDistinctionNote: string | undefined = undefined;
    if (!isPlaceholder(rawExp)) {
      const expStr = String(rawExp).trim();
      if (/fresher/i.test(expStr)) {
        experienceNum = 0;
        expDistinctionNote = 'Experience: Fresher';
      } else {
        const parsedExp = parseFloat(expStr.replace(/[^0-9.]/g, ''));
        experienceNum = isNaN(parsedExp) ? 0 : Math.min(50, Math.max(0, parsedExp));
      }
    } else {
      experienceNum = 0;
      expDistinctionNote = 'Experience: Not Specified';
    }

    // Parse expected salary (monthly ₹)
    let expSalNum = 0;
    if (!isPlaceholder(rawExpSal)) {
      const parsedSal = parseInt(String(rawExpSal).replace(/[^0-9]/g, ''), 10);
      expSalNum = isNaN(parsedSal) ? 0 : parsedSal;
    }

    // Parse current salary (monthly ₹) vs Annual Salary protection
    let currSalNum: number | undefined = undefined;
    let annualSalaryNote: string | undefined = undefined;

    if (!isPlaceholder(rawCurrSal)) {
      const currSalStr = String(rawCurrSal).trim();
      if (isAnnualSalaryColumn) {
        // Annual Salary: NEVER silently treat as monthly salary!
        // Missing monthly salary remains undefined (NULL in database).
        currSalNum = undefined;
        annualSalaryNote = `Annual CTC (${mapping.current_salary}): ₹${currSalStr}`;
      } else {
        const parsedCurr = parseInt(currSalStr.replace(/[^0-9]/g, ''), 10);
        currSalNum = (!isNaN(parsedCurr) && parsedCurr > 0) ? parsedCurr : undefined;
      }
    }

    // Parse skills list (handles comma, semicolon, slash, pipe delimiters)
    // Do NOT invent skills. Preserve missing skills as an empty array [].
    const skillsList = String(rawSkills || '')
      .split(/[,;|/]/)
      .map(s => s.trim())
      .filter(s => Boolean(s) && !isPlaceholder(s));

    // Location parsing with fallback:
    // Do not silently assign Raipur or any city if missing in source.
    // Preserve as missing ('') unless recruiter explicitly provided a defaultLocation.
    let cleanLocation = '';
    if (!isPlaceholder(rawLoc)) {
      cleanLocation = String(rawLoc).trim();
    } else if (row['City'] && !isPlaceholder(row['City'])) {
      cleanLocation = String(row['City']).trim();
    } else if (defaultLocation && defaultLocation.trim()) {
      cleanLocation = defaultLocation.trim();
    }

    // Role / Designation with portal fallbacks
    let cleanRole = 'Candidate';
    if (!isPlaceholder(rawRole)) {
      cleanRole = String(rawRole).trim();
    } else if (row['Curr. Company Designation'] && !isPlaceholder(row['Curr. Company Designation'])) {
      cleanRole = String(row['Curr. Company Designation']).trim();
    } else if (row['Job Title'] && !isPlaceholder(row['Job Title'])) {
      cleanRole = String(row['Job Title']).trim();
    } else if (row['Previous Designation'] && !isPlaceholder(row['Previous Designation'])) {
      cleanRole = String(row['Previous Designation']).trim();
    }

    // Email & Notice Period sanitization
    const cleanEmail = !isPlaceholder(rawEmail) ? String(rawEmail).trim() : undefined;
    const cleanNotice = !isPlaceholder(rawNotice) ? String(rawNotice).trim() : undefined;

    // Qualification parsing (check degree columns if unmapped or NA)
    let cleanQual: string | undefined = undefined;
    if (!isPlaceholder(rawQual)) {
      cleanQual = String(rawQual).trim();
    } else if (row['Post graduation degree'] && !isPlaceholder(row['Post graduation degree'])) {
      cleanQual = String(row['Post graduation degree']).trim();
    } else if (row['Under Graduation degree'] && !isPlaceholder(row['Under Graduation degree'])) {
      cleanQual = String(row['Under Graduation degree']).trim();
    }

    // Enriched Profile Notes: preserve all meaningful candidate details without corrupting schema
    const noteParts: string[] = [];
    if (!isPlaceholder(rawNotes)) {
      const rawNotesStr = String(rawNotes).trim();
      if (mapping.notes && /headline/i.test(mapping.notes)) {
        noteParts.push(`Resume Headline: ${rawNotesStr}`);
      } else {
        noteParts.push(rawNotesStr);
      }
    }
    if (annualSalaryNote) {
      noteParts.push(annualSalaryNote);
    }
    if (expDistinctionNote) {
      noteParts.push(expDistinctionNote);
    }
    // Naukri profile metadata
    if (row['Date of application'] && !isPlaceholder(row['Date of application'])) {
      noteParts.push(`Applied: ${String(row['Date of application']).trim()}`);
    }
    if (row['Resume Headline'] && !isPlaceholder(row['Resume Headline']) && !noteParts.some(p => p.includes(String(row['Resume Headline']).trim()))) {
      noteParts.push(`Resume Headline: ${String(row['Resume Headline']).trim()}`);
    }
    if (row['Summary'] && !isPlaceholder(row['Summary']) && !noteParts.some(p => p.includes(String(row['Summary']).trim()))) {
      noteParts.push(`Summary: ${String(row['Summary']).trim()}`);
    }
    if (row['Preferred Locations'] && !isPlaceholder(row['Preferred Locations'])) {
      noteParts.push(`Preferred Locations: ${String(row['Preferred Locations']).trim()}`);
    }
    if (row['Curr. Company name'] && !isPlaceholder(row['Curr. Company name'])) {
      noteParts.push(`Company: ${String(row['Curr. Company name']).trim()}`);
    }
    if (row['Department'] && !isPlaceholder(row['Department'])) {
      noteParts.push(`Department: ${String(row['Department']).trim()}`);
    }
    if (row['Industry'] && !isPlaceholder(row['Industry'])) {
      noteParts.push(`Industry: ${String(row['Industry']).trim()}`);
    }
    if (row['Source'] && String(row['Source']).trim().toLowerCase() === 'classified') {
      noteParts.push(`Portal Tag: Classified`);
    }

    // WorkIndia profile metadata
    if (row['Relevant Experience'] && !isPlaceholder(row['Relevant Experience'])) {
      noteParts.push(`Relevant Exp: ${String(row['Relevant Experience']).trim()}`);
    }
    if (row['Languages Known'] && !isPlaceholder(row['Languages Known'])) {
      noteParts.push(`Languages: ${String(row['Languages Known']).trim()}`);
    }
    if (row['English Speaking'] && !isPlaceholder(row['English Speaking'])) {
      noteParts.push(`English: ${String(row['English Speaking']).trim()}`);
    }
    if (row['Profile Link'] && !isPlaceholder(row['Profile Link'])) {
      noteParts.push(`Profile: ${String(row['Profile Link']).trim()}`);
    }
    if (row['College Name'] && !isPlaceholder(row['College Name'])) {
      noteParts.push(`College: ${String(row['College Name']).trim()}`);
    }

    const cleanNotes = noteParts.length > 0 ? noteParts.join(' | ') : undefined;

    // Source Attribution Guarantee:
    // Always use user-selected CRM acquisition source (e.g. 'Naukri.com' or 'WorkIndia')
    // Never allow 'Classified' from Naukri column 71 to overwrite the CRM acquisition source
    const effectiveSource = (source && source.toLowerCase() !== 'classified') ? source : (platformInfo.platform === 'Naukri.com' ? 'Naukri.com' : 'Job Portal');

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
        qualification: cleanQual,
        notice_period: cleanNotice,
        last_role: cleanRole,
        notes: cleanNotes,
        source: effectiveSource,
      },
    });
  });

  return {
    totalRows: processedRows.length,
    readyCount: processedRows.filter(r => r.status === 'ready').length,
    duplicateInFileCount: processedRows.filter(r => r.status === 'duplicate_in_file').length,
    alreadyInCrmCount: processedRows.filter(r => r.status === 'already_in_crm').length,
    invalidCount: processedRows.filter(r => r.status === 'invalid').length,
    detectedPlatform: platformInfo.platform,
    unsupportedMetadataHeaders: platformInfo.unsupportedMetadata,
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
