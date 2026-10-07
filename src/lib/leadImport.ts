import { Lead, Candidate, LeadSource, LeadCategory } from '../types';
import {
  ColumnMapping,
  detectPlatform,
  autoDetectColumnMapping,
  parseSpreadsheetFile,
  normalizePhone,
  DetectedPlatform,
} from './candidateImport';

export type LeadRowImportStatus =
  | 'ready'
  | 'duplicate_in_file'
  | 'already_in_leads'
  | 'already_in_candidates'
  | 'invalid';

export interface ProcessedLeadImportRow {
  rowNumber: number;
  rawData: Record<string, any>;
  status: LeadRowImportStatus;
  statusReason?: string;
  matchedEntityRef?: string;
  selected: boolean;
  parsed: {
    name: string;
    mobile: string;
    email?: string | null;
    experience?: number | null;
    skills: string[];
    location?: string | null;
    expected_salary?: number | null;
    current_salary?: number | null;
    qualification?: string | null;
    notice_period?: string | null;
    last_role?: string | null;
    notes?: string | null;
    source: LeadSource;
    category: LeadCategory;
    assigned_to?: string | null;
  };
}

export interface LeadImportAnalysisResult {
  rows: ProcessedLeadImportRow[];
  stats: {
    totalRows: number;
    readyCount: number;
    alreadyInLeadsCount: number;
    alreadyInCandidatesCount: number;
    duplicateInFileCount: number;
    invalidCount: number;
  };
}

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

export function parseLeadExperience(rawExp: any): number | null {
  if (isPlaceholder(rawExp)) return null;
  const expStr = String(rawExp).trim();
  if (/fresher/i.test(expStr)) return 0;
  const parsed = parseFloat(expStr.replace(/[^0-9.]/g, ''));
  return isNaN(parsed) ? null : Math.min(50, Math.max(0, parsed));
}

export function parseLeadSalary(rawSal: any): number | null {
  if (isPlaceholder(rawSal)) return null;
  const parsed = parseInt(String(rawSal).replace(/[^0-9]/g, ''), 10);
  return isNaN(parsed) || parsed <= 0 ? null : parsed;
}

export function parseLeadSkills(rawSkills: any): string[] {
  if (isPlaceholder(rawSkills)) return [];
  return String(rawSkills)
    .split(/[,;|/]/)
    .map(s => s.trim())
    .filter(s => Boolean(s) && !isPlaceholder(s));
}

/**
 * Normalizes source string to valid LeadSource enum
 */
export function normalizeLeadSource(sourceStr?: string, defaultSource: LeadSource = 'Manual'): LeadSource {
  if (!sourceStr) return defaultSource;
  const s = sourceStr.toLowerCase().trim();
  if (s.includes('workindia') || s.includes('work india')) return 'WorkIndia';
  if (s.includes('naukri')) return 'Naukri.com';
  if (s.includes('indeed')) return 'Indeed';
  if (s.includes('linkedin')) return 'LinkedIn';
  if (s.includes('whatsapp')) return 'WhatsApp';
  if (s.includes('walk-in') || s.includes('walkin') || s.includes('walk in')) return 'Walk-in';
  if (s.includes('referral') || s.includes('ref')) return 'Referral';
  if (s.includes('website') || s.includes('web')) return 'Website';
  return defaultSource;
}

/**
 * Analyzes parsed spreadsheet rows for Lead import against:
 * 1. Existing Leads (Cross-table check 1)
 * 2. Existing Candidates (Cross-table check 2)
 * 3. In-file duplicate mobile numbers
 * 4. Required name and valid 10-digit Indian phone
 */
export function analyzeLeadImportRows({
  rawRows,
  mapping,
  source,
  categories = [],
  assignedTo = null,
  existingLeads,
  existingCandidates,
}: {
  rawRows: Record<string, any>[];
  mapping: ColumnMapping;
  source: LeadSource;
  categories?: string[];
  assignedTo?: string | null;
  existingLeads: Lead[];
  existingCandidates: Candidate[];
}): LeadImportAnalysisResult {
  // Build lookup maps by normalized 10-digit Indian mobile
  const leadsPhoneMap = new Map<string, Lead>();
  for (const l of existingLeads) {
    if (l.is_active !== false && l.mobile) {
      const norm = normalizePhone(l.mobile);
      if (norm.isValid) leadsPhoneMap.set(norm.normalized, l);
    }
  }

  const candidatesPhoneMap = new Map<string, Candidate>();
  for (const c of existingCandidates) {
    if (c.is_active !== false && c.mobile) {
      const norm = normalizePhone(c.mobile);
      if (norm.isValid) candidatesPhoneMap.set(norm.normalized, c);
    }
  }

  const seenInFileMap = new Map<string, number>(); // mobile -> first rowNumber seen

  const processedRows: ProcessedLeadImportRow[] = [];

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2; // spreadsheet header is row 1
    const rawName = mapping.name ? String(row[mapping.name] || '').trim() : '';
    const rawMobile = mapping.mobile ? String(row[mapping.mobile] || '').trim() : '';
    const rawEmail = mapping.email ? String(row[mapping.email] || '').trim() : undefined;
    const rawExp = mapping.experience ? row[mapping.experience] : undefined;
    const rawSkills = mapping.skills ? row[mapping.skills] : undefined;
    const rawLoc = mapping.location ? String(row[mapping.location] || '').trim() : undefined;
    const rawExpectedSal = mapping.expected_salary ? row[mapping.expected_salary] : undefined;
    const rawCurrentSal = mapping.current_salary ? row[mapping.current_salary] : undefined;
    const rawQual = mapping.qualification ? String(row[mapping.qualification] || '').trim() : undefined;
    const rawNotice = mapping.notice_period ? String(row[mapping.notice_period] || '').trim() : undefined;
    const rawRole = mapping.last_role ? String(row[mapping.last_role] || '').trim() : undefined;
    const rawNotes = mapping.notes ? String(row[mapping.notes] || '').trim() : undefined;

    // Normalize phone
    const phoneCheck = normalizePhone(rawMobile);

    // Parse numeric fields safely (NULL when missing, never invented)
    const experience = parseLeadExperience(rawExp);
    const expectedSalary = parseLeadSalary(rawExpectedSal);
    const currentSalary = parseLeadSalary(rawCurrentSal);

    // Parse row skills and combine with user selected default categories
    const rowSkills = parseLeadSkills(rawSkills);
    const combinedSkills = Array.from(new Set([...rowSkills, ...categories]));

    let status: LeadRowImportStatus = 'ready';
    let statusReason: string | undefined;
    let matchedEntityRef: string | undefined;

    // Validation 1: Required Name
    if (!rawName) {
      status = 'invalid';
      statusReason = 'Candidate name is missing';
    }
    // Validation 2: Indian Mobile Number
    else if (!phoneCheck.isValid) {
      status = 'invalid';
      statusReason = phoneCheck.reason || 'Invalid Indian mobile number';
    }
    // Validation 3: Duplicate inside file
    else if (seenInFileMap.has(phoneCheck.normalized)) {
      status = 'duplicate_in_file';
      const firstRow = seenInFileMap.get(phoneCheck.normalized);
      statusReason = `Duplicate mobile (matches Row ${firstRow})`;
    }
    // Validation 4: Cross-table duplicate in existing Leads
    else if (leadsPhoneMap.has(phoneCheck.normalized)) {
      status = 'already_in_leads';
      const existing = leadsPhoneMap.get(phoneCheck.normalized)!;
      statusReason = `Already in Leads (${existing.category})`;
      matchedEntityRef = existing.name || existing.id;
    }
    // Validation 5: Cross-table duplicate in existing Candidates
    else if (candidatesPhoneMap.has(phoneCheck.normalized)) {
      status = 'already_in_candidates';
      const existing = candidatesPhoneMap.get(phoneCheck.normalized)!;
      statusReason = `Already registered as Candidate in CRM (${existing.status})`;
      matchedEntityRef = existing.name || existing.id;
    }

    // If valid, register phone in file map
    if (phoneCheck.isValid && !seenInFileMap.has(phoneCheck.normalized)) {
      seenInFileMap.set(phoneCheck.normalized, rowNumber);
    }

    processedRows.push({
      rowNumber,
      rawData: row,
      status,
      statusReason,
      matchedEntityRef,
      selected: status === 'ready',
      parsed: {
        name: rawName,
        mobile: phoneCheck.normalized,
        email: rawEmail || null,
        experience,
        skills: combinedSkills,
        location: rawLoc && !isPlaceholder(rawLoc) ? rawLoc : null,
        expected_salary: expectedSalary,
        current_salary: currentSalary,
        qualification: rawQual && !isPlaceholder(rawQual) ? rawQual : null,
        notice_period: rawNotice && !isPlaceholder(rawNotice) ? rawNotice : null,
        last_role: rawRole && !isPlaceholder(rawRole) ? rawRole : null,
        notes: rawNotes && !isPlaceholder(rawNotes) ? rawNotes : null,
        source,
        category: 'New',
        assigned_to: assignedTo || null,
      },
    });
  });

  const stats = {
    totalRows: processedRows.length,
    readyCount: processedRows.filter(r => r.status === 'ready').length,
    alreadyInLeadsCount: processedRows.filter(r => r.status === 'already_in_leads').length,
    alreadyInCandidatesCount: processedRows.filter(r => r.status === 'already_in_candidates').length,
    duplicateInFileCount: processedRows.filter(r => r.status === 'duplicate_in_file').length,
    invalidCount: processedRows.filter(r => r.status === 'invalid').length,
  };

  return { rows: processedRows, stats };
}

export {
  detectPlatform,
  autoDetectColumnMapping,
  parseSpreadsheetFile,
  normalizePhone,
  type ColumnMapping,
  type DetectedPlatform,
};
