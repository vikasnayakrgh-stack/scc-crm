import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Button, Modal, Badge, Label, Input } from './ui';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Search,
  WifiOff,
  UserCheck,
  Layers,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import {
  parseSpreadsheetFile,
  autoDetectColumnMapping,
  analyzeImportRows,
  generateSkippedReportCSV,
  detectPlatform,
  ColumnMapping,
  ProcessedImportRow,
  CandidateImportSource,
  ImportAnalysisSummary,
  DetectedPlatform,
} from '../lib/candidateImport';

interface CandidateImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'completed';

export const CandidateImportModal: React.FC<CandidateImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { candidates, insert, isOffline } = useData();
  const { currentUser, userId } = useUser();

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [source, setSource] = useState<CandidateImportSource>('WorkIndia');
  const [customSource, setCustomSource] = useState('');
  const [defaultLocation, setDefaultLocation] = useState('');
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({ name: '', mobile: '' });
  const [detectedPlatform, setDetectedPlatform] = useState<DetectedPlatform | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysisSummary | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'ready' | 'already_in_crm' | 'duplicate_in_file' | 'invalid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [importResults, setImportResults] = useState<{
    successful: number;
    failed: number;
    skippedExisting: number;
    skippedInFile: number;
    skippedInvalid: number;
    failedRows: { row: number; name: string; error: string }[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveSource = source === 'Other' ? (customSource.trim() || 'Other') : source;

  // Handle preview/test query param for visual verification
  useEffect(() => {
    if (!isOpen) return;
    const hash = window.location.hash;
    if (!hash.includes('importStep=')) return;
    const urlParams = new URLSearchParams(hash.split('?')[1]);
    const requestedStep = urlParams.get('importStep');

    if (requestedStep === 'mapping') {
      setFile({ name: 'WorkIndia_Candidates_Oct2026.xlsx', size: 18450 } as File);
      setSheetHeaders(['Candidate Name', 'Mobile Number', 'Qualification', 'Experience', 'Expected Salary', 'Location', 'Skills']);
      setRawRows([
        { 'Candidate Name': 'Rohan Deshmukh', 'Mobile Number': '9827012345', 'Qualification': 'B.Com', 'Experience': '2 Years', 'Expected Salary': '22000', 'Location': 'Raipur', 'Skills': 'Tally, GST' },
      ]);
      setColumnMapping({
        name: 'Candidate Name',
        mobile: 'Mobile Number',
        qualification: 'Qualification',
        experience: 'Experience',
        expected_salary: 'Expected Salary',
        location: 'Location',
        skills: 'Skills',
      });
      setStep('mapping');
    } else if (requestedStep === 'preview') {
      setFile({ name: 'WorkIndia_Candidates_Oct2026.xlsx', size: 18450 } as File);
      const mockAnalyzed = analyzeImportRows({
        rawRows: [
          { 'Candidate Name': 'Rohan Deshmukh', 'Mobile Number': '+91 9827012345', 'Qualification': 'B.Com', 'Experience': '2 Years', 'Expected Salary': '22000', 'Location': 'Raipur', 'Skills': 'Tally, GST' },
          { 'Candidate Name': 'Sneha Agrawal', 'Mobile Number': '98270-12345', 'Qualification': 'MBA', 'Experience': '3 Years', 'Expected Salary': '28000', 'Location': 'Raipur', 'Skills': 'HR, Sourcing' },
          { 'Candidate Name': 'Amit Sharma (Existing)', 'Mobile Number': '9826111111', 'Qualification': 'Graduation', 'Experience': '4 Years', 'Expected Salary': '25000', 'Location': 'Raipur', 'Skills': 'Sales, Retail' },
          { 'Candidate Name': 'Kunal Verma', 'Mobile Number': '9827099887', 'Qualification': 'B.Tech IT', 'Experience': '1 Year', 'Expected Salary': '20000', 'Location': 'Bhilai', 'Skills': 'React, TS' },
          { 'Candidate Name': 'Deepak Sahu', 'Mobile Number': '12345', 'Qualification': '12th', 'Experience': '0', 'Expected Salary': '10000', 'Location': 'Durg', 'Skills': 'Office Boy' },
        ],
        mapping: { name: 'Candidate Name', mobile: 'Mobile Number', qualification: 'Qualification', experience: 'Experience', expected_salary: 'Expected Salary', location: 'Location', skills: 'Skills' },
        source: 'WorkIndia',
        existingCandidates: [
          { id: 'c-1', name: 'Amit Sharma (Existing)', mobile: '9826111111', experience: 4, skills: ['Sales'], location: 'Raipur', expected_salary: 25000, last_role: 'Sales Executive', status: 'Active', owner_id: 'u-1', is_active: true, created_at: '' }
        ],
        defaultLocation: 'Raipur',
      });
      setAnalysis(mockAnalyzed);
      setStep('preview');
    } else if (requestedStep === 'complete') {
      setFile({ name: 'WorkIndia_Candidates_Oct2026.xlsx', size: 18450 } as File);
      setImportResults({
        successful: 2,
        failed: 0,
        skippedExisting: 1,
        skippedInFile: 1,
        skippedInvalid: 1,
        failedRows: [],
      });
      setAnalysis({
        totalRows: 5,
        readyCount: 2,
        alreadyInCrmCount: 1,
        duplicateInFileCount: 1,
        invalidCount: 1,
        rows: [
          { rowNumber: 3, rawData: {}, parsed: { name: 'Sneha Agrawal', mobile: '9827012345', skills: [], location: '', experience: 0, expected_salary: 0, last_role: '', source: 'WorkIndia' }, status: 'duplicate_in_file', statusReason: 'Matches Row 2 in this file (+91 9827012345)', selected: false },
          { rowNumber: 4, rawData: {}, parsed: { name: 'Amit Sharma (Existing)', mobile: '9826111111', skills: [], location: '', experience: 0, expected_salary: 0, last_role: '', source: 'WorkIndia' }, status: 'already_in_crm', statusReason: 'Already registered in CRM as "Amit Sharma (Existing)"', selected: false },
          { rowNumber: 6, rawData: {}, parsed: { name: 'Deepak Sahu', mobile: '', skills: [], location: '', experience: 0, expected_salary: 0, last_role: '', source: 'WorkIndia' }, status: 'invalid', statusReason: 'Invalid Indian mobile number (must be 10 digits starting with 6-9)', selected: false },
        ]
      });
      setStep('completed');
    }
  }, [isOpen]);

  // Reset state when closing
  const handleClose = () => {
    if (isProcessing) return; // prevent closing while importing
    setStep('upload');
    setFile(null);
    setSheetHeaders([]);
    setRawRows([]);
    setColumnMapping({ name: '', mobile: '' });
    setAnalysis(null);
    setDetectedPlatform(null);
    setImportResults(null);
    setProgress({ current: 0, total: 0 });
    onClose();
  };

  // Handle File Upload and Parse
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast.error('Invalid file type. Please upload .xlsx, .xls, or .csv');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File size too large. Maximum allowed size is 10 MB.');
      return;
    }

    try {
      const buffer = await selectedFile.arrayBuffer();
      const parsed = parseSpreadsheetFile(buffer);

      if (parsed.rawRows.length === 0) {
        toast.error('The uploaded file is empty.');
        return;
      }

      setFile(selectedFile);
      setSheetHeaders(parsed.headers);
      setRawRows(parsed.rawRows);

      // Auto-detect columns
      const detectedMapping = autoDetectColumnMapping(parsed.headers);
      setColumnMapping(detectedMapping);

      // Auto-detect platform and pre-select source
      const platformInfo = detectPlatform(parsed.headers);
      setDetectedPlatform(platformInfo.platform);
      if (platformInfo.platform === 'Naukri.com') {
        setSource('Naukri');
      } else if (platformInfo.platform === 'WorkIndia') {
        setSource('WorkIndia');
      }

      toast.success(`Loaded ${parsed.rawRows.length} rows from "${selectedFile.name}"`);
      setStep('mapping');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to read spreadsheet file');
    }
  };

  // Proceed from Mapping to Preview
  const handleProceedToPreview = () => {
    if (!columnMapping.name || !columnMapping.mobile) {
      toast.error('Please map both Candidate Name and Mobile Number columns.');
      return;
    }

    const analyzed = analyzeImportRows({
      rawRows,
      mapping: columnMapping,
      source: effectiveSource,
      existingCandidates: candidates,
      defaultLocation: defaultLocation.trim() || undefined,
    });

    setAnalysis(analyzed);
    setStep('preview');
  };

  // Toggle selection for a single row
  const toggleRowSelected = (rowNum: number) => {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      rows: analysis.rows.map((r) =>
        r.rowNumber === rowNum ? { ...r, selected: !r.selected } : r
      ),
    });
  };

  // Toggle all ready rows
  const toggleAllReady = (select: boolean) => {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      rows: analysis.rows.map((r) =>
        r.status === 'ready' ? { ...r, selected: select } : r
      ),
    });
  };

  // Filtered rows for the preview table
  const displayedRows = useMemo(() => {
    if (!analysis) return [];
    return analysis.rows.filter((r) => {
      // Tab filter
      if (filterTab !== 'all' && r.status !== filterTab) return false;
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = r.parsed.name.toLowerCase().includes(q);
        const matchesMobile = r.parsed.mobile.includes(q);
        const matchesRole = r.parsed.last_role.toLowerCase().includes(q);
        return matchesName || matchesMobile || matchesRole;
      }
      return true;
    });
  }, [analysis, filterTab, searchQuery]);

  const selectedReadyCount = useMemo(() => {
    if (!analysis) return 0;
    return analysis.rows.filter((r) => r.status === 'ready' && r.selected).length;
  }, [analysis]);

  // Execute Batch Import
  const handleExecuteImport = async () => {
    if (!analysis) return;
    if (isOffline) {
      toast.error('Bulk Candidate Import requires an active internet connection to ensure real-time duplicate checking.');
      return;
    }

    const rowsToImport = analysis.rows.filter((r) => r.status === 'ready' && r.selected);
    if (rowsToImport.length === 0) {
      toast.error('No eligible candidates selected for import.');
      return;
    }

    setStep('importing');
    setIsProcessing(true);
    setProgress({ current: 0, total: rowsToImport.length });

    let successful = 0;
    let failed = 0;
    const failedRows: { row: number; name: string; error: string }[] = [];

    // Process in batches of 10 to keep UI responsive and handle any partial network hiccups
    const BATCH_SIZE = 10;
    for (let i = 0; i < rowsToImport.length; i += BATCH_SIZE) {
      const batch = rowsToImport.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (item) => {
          try {
            await insert('candidates', {
              name: item.parsed.name,
              mobile: item.parsed.mobile,
              email: item.parsed.email,
              experience: item.parsed.experience,
              skills: item.parsed.skills,
              location: item.parsed.location,
              expected_salary: item.parsed.expected_salary,
              current_salary: item.parsed.current_salary,
              qualification: item.parsed.qualification,
              notice_period: item.parsed.notice_period,
              last_role: item.parsed.last_role,
              notes: item.parsed.notes,
              source: item.parsed.source,
              owner_id: currentUser,
              created_by: userId || undefined,
              assigned_to: userId || undefined,
              status: 'Active',
              is_active: true,
            });
            successful++;
          } catch (err: any) {
            failed++;
            const errMsg = err?.message || 'Insert error';
            const isDuplicate =
              errMsg.includes('idx_candidates_mobile_active') ||
              errMsg.includes('duplicate key') ||
              errMsg.includes('23505');
            failedRows.push({
              row: item.rowNumber,
              name: item.parsed.name,
              error: isDuplicate
                ? 'Mobile number already registered in CRM (Concurrent duplicate prevented)'
                : errMsg,
            });
          }
        })
      );

      setProgress({ current: Math.min(i + BATCH_SIZE, rowsToImport.length), total: rowsToImport.length });
    }

    setIsProcessing(false);
    setImportResults({
      successful,
      failed,
      skippedExisting: analysis.alreadyInCrmCount,
      skippedInFile: analysis.duplicateInFileCount,
      skippedInvalid: analysis.invalidCount,
      failedRows,
    });
    setStep('completed');

    if (successful > 0) {
      toast.success(`🎉 Successfully imported ${successful} new candidates!`);
      if (onSuccess) onSuccess();
    } else {
      toast.error('No candidates could be imported.');
    }
  };

  // Download Skipped / Error CSV Report
  const handleDownloadSkippedReport = () => {
    if (!analysis) return;
    try {
      const csv = generateSkippedReportCSV(analysis.rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `scc_skipped_candidates_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Downloaded skipped candidates report');
    } catch {
      toast.error('Failed to download report');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Bulk Candidate Import from Excel / CSV"
      maxWidth="2xl"
    >
      <div className="space-y-4">
        {/* Wizard Stepper Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                step === 'upload'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              1
            </span>
            <span className={step === 'upload' ? 'font-bold text-slate-800' : 'text-slate-500'}>
              Upload File
            </span>
          </div>
          <ArrowRight size={14} className="text-slate-300" />
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                step === 'mapping'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : ['preview', 'importing', 'completed'].includes(step)
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              2
            </span>
            <span className={step === 'mapping' ? 'font-bold text-slate-800' : 'text-slate-500'}>
              Column Mapping
            </span>
          </div>
          <ArrowRight size={14} className="text-slate-300" />
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                ['preview', 'importing'].includes(step)
                  ? 'bg-blue-600 text-white shadow-xs'
                  : step === 'completed'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              3
            </span>
            <span className={['preview', 'importing'].includes(step) ? 'font-bold text-slate-800' : 'text-slate-500'}>
              Review & Preview
            </span>
          </div>
          <ArrowRight size={14} className="text-slate-300" />
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                step === 'completed' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-400'
              }`}
            >
              4
            </span>
            <span className={step === 'completed' ? 'font-bold text-slate-800' : 'text-slate-500'}>
              Complete
            </span>
          </div>
        </div>

        {/* Offline Alert */}
        {isOffline && (
          <div className="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs flex items-center gap-2 border border-amber-200">
            <WifiOff size={16} className="text-amber-600 shrink-0" />
            <span>
              <strong>Offline Mode Detected:</strong> Internet connection is required for Bulk Candidate Import to verify duplicates against the live talent database.
            </span>
          </div>
        )}

        {/* STEP 1: UPLOAD & SOURCE */}
        {step === 'upload' && (
          <div className="space-y-4">
            {/* Source Selection */}
            <div>
              <Label>Lead Acquisition Source</Label>
              <p className="text-[11px] text-slate-400 mb-2">
                Select where these candidate leads originated from
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['WorkIndia', 'Naukri', 'WhatsApp', 'Other'] as const).map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setSource(src)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all text-center ${
                      source === src
                        ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {src}
                  </button>
                ))}
              </div>

              {source === 'Other' && (
                <div className="mt-2.5">
                  <Input
                    placeholder="Enter custom source (e.g. Indeed, Walk-in Camp, Referral)"
                    value={customSource}
                    onChange={(e) => setCustomSource(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Default Location */}
            <div>
              <Label>Default City / Location</Label>
              <p className="text-[11px] text-slate-400 mb-1">
                Applied if the spreadsheet does not specify a candidate location
              </p>
              <Input
                placeholder="e.g. Raipur, Bilaspur, Bhilai"
                value={defaultLocation}
                onChange={(e) => setDefaultLocation(e.target.value)}
              />
            </div>

            {/* Drag & Drop File Zone */}
            <div>
              <Label>Select Excel or CSV Spreadsheet</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="mt-1.5 border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/20 rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group"
              >
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform shadow-2xs">
                  <Upload size={22} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Click to browse or drag & drop file
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Supports Microsoft Excel (.xlsx, .xls) and CSV (.csv) up to 10 MB
                  </p>
                </div>
              </div>
            </div>

            {/* Duplicate Safety Info Box */}
            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-start gap-2.5 text-xs text-blue-900">
              <UserCheck size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-950">Repeat Upload & Duplicate Protection Guarantee</p>
                <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
                  Candidate mobile numbers are normalized to a consistent 10-digit format (handling +91, 0, spaces, and hyphens). In-file duplicates and existing CRM candidates are automatically detected and skipped.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: COLUMN MAPPING */}
        {step === 'mapping' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-blue-600" />
                <div>
                  <p className="text-xs font-bold text-slate-900">{file?.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {rawRows.length} data rows • {sheetHeaders.length} columns detected
                  </p>
                </div>
              </div>
              <Badge variant="info">Source: {effectiveSource}</Badge>
            </div>

            {/* Platform Identification & Handling Notice */}
            {detectedPlatform === 'Naukri.com' && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5 text-xs text-amber-900">
                <div className="flex items-center gap-1.5 font-semibold text-amber-950">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <span>Naukri.com Profile &amp; Metadata Handling</span>
                </div>
                <ul className="text-[11px] text-amber-800 space-y-0.5 list-disc list-inside">
                  <li><strong>Annual Salary vs Monthly:</strong> Annual Salary (CTC) is saved into candidate notes and never converted into monthly salary.</li>
                  <li><strong>34 Activity Columns Excluded:</strong> Download, Viewed, Emailed, Calling Status, Comments 1-5, and workflow timestamps describe internal Naukri activities and are skipped from CRM tasks/logs.</li>
                  <li><strong>Acquisition Source:</strong> Set to <strong>Naukri.com</strong> (internal portal tag &apos;Classified&apos; is preserved in notes).</li>
                </ul>
              </div>
            )}

            {detectedPlatform === 'WorkIndia' && (
              <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-2 text-xs text-blue-900">
                <UserCheck size={15} className="text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-950">WorkIndia Export Detected</p>
                  <p className="text-[11px] text-blue-800 mt-0.5">
                    Monthly Salary, Relevant Experience, and Profile Links are mapped. Placeholder values (like &apos;-&apos; or &apos;NA&apos;) are treated as empty.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                Map Spreadsheet Columns to Candidate Fields:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                {/* Name (Required) */}
                <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-800">Candidate Name *</span>
                    <Badge variant="danger">Required</Badge>
                  </div>
                  <select
                    value={columnMapping.name}
                    onChange={(e) => setColumnMapping({ ...columnMapping, name: e.target.value })}
                    className="w-full text-xs border rounded-md p-1.5 bg-white border-slate-200 font-medium"
                    required
                  >
                    <option value="">Select column...</option>
                    {sheetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h} {h === columnMapping.name ? '✓' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mobile (Required) */}
                <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-800">Mobile Number *</span>
                    <Badge variant="danger">Required</Badge>
                  </div>
                  <select
                    value={columnMapping.mobile}
                    onChange={(e) => setColumnMapping({ ...columnMapping, mobile: e.target.value })}
                    className="w-full text-xs border rounded-md p-1.5 bg-white border-slate-200 font-medium"
                    required
                  >
                    <option value="">Select column...</option>
                    {sheetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h} {h === columnMapping.mobile ? '✓' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Email */}
                <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-800">Email Address</span>
                    <Badge variant="neutral">Optional</Badge>
                  </div>
                  <select
                    value={columnMapping.email || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, email: e.target.value || undefined })}
                    className="w-full text-xs border rounded-md p-1.5 bg-white border-slate-200"
                  >
                    <option value="">-- None / Do not import --</option>
                    {sheetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Experience */}
                <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-800">Experience (Yrs)</span>
                    <Badge variant="neutral">Optional</Badge>
                  </div>
                  <select
                    value={columnMapping.experience || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, experience: e.target.value || undefined })}
                    className="w-full text-xs border rounded-md p-1.5 bg-white border-slate-200"
                  >
                    <option value="">-- None / Do not import --</option>
                    {sheetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Skills */}
                <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-800">Key Skills</span>
                    <Badge variant="neutral">Optional</Badge>
                  </div>
                  <select
                    value={columnMapping.skills || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, skills: e.target.value || undefined })}
                    className="w-full text-xs border rounded-md p-1.5 bg-white border-slate-200"
                  >
                    <option value="">-- None / Do not import --</option>
                    {sheetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* City / Location */}
                <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-800">City / Location</span>
                    <Badge variant="neutral">Optional</Badge>
                  </div>
                  <select
                    value={columnMapping.location || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, location: e.target.value || undefined })}
                    className="w-full text-xs border rounded-md p-1.5 bg-white border-slate-200"
                  >
                    <option value="">-- None (Leave unassigned / missing) --</option>
                    {sheetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Optional Fallback City for Missing Locations */}
                <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-800">Fallback City (If Missing in File)</span>
                    <Badge variant="neutral">Optional</Badge>
                  </div>
                  <input
                    type="text"
                    value={defaultLocation}
                    onChange={(e) => setDefaultLocation(e.target.value)}
                    placeholder="Leave blank to preserve missing location"
                    className="w-full text-xs border rounded-md p-1.5 bg-white border-slate-200 text-slate-700 placeholder:text-slate-400"
                  />
                  <p className="text-[10px] text-slate-400">
                    Applied only to rows with no location. Leave blank to keep location unassigned.
                  </p>
                </div>

                {/* Expected Salary */}
                <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-800">Expected Salary (₹/mo)</span>
                    <Badge variant="neutral">Optional</Badge>
                  </div>
                  <select
                    value={columnMapping.expected_salary || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, expected_salary: e.target.value || undefined })}
                    className="w-full text-xs border rounded-md p-1.5 bg-white border-slate-200"
                  >
                    <option value="">-- None / Do not import --</option>
                    {sheetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Current Salary */}
                <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-800">Current Salary (₹/mo)</span>
                    <Badge variant="neutral">Optional</Badge>
                  </div>
                  <select
                    value={columnMapping.current_salary || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, current_salary: e.target.value || undefined })}
                    className="w-full text-xs border rounded-md p-1.5 bg-white border-slate-200"
                  >
                    <option value="">-- None / Do not import --</option>
                    {sheetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Qualification */}
                <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-800">Highest Qualification</span>
                    <Badge variant="neutral">Optional</Badge>
                  </div>
                  <select
                    value={columnMapping.qualification || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, qualification: e.target.value || undefined })}
                    className="w-full text-xs border rounded-md p-1.5 bg-white border-slate-200"
                  >
                    <option value="">-- None / Do not import --</option>
                    {sheetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Designation / Role */}
                <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-800">Current / Applied Role</span>
                    <Badge variant="neutral">Optional</Badge>
                  </div>
                  <select
                    value={columnMapping.last_role || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, last_role: e.target.value || undefined })}
                    className="w-full text-xs border rounded-md p-1.5 bg-white border-slate-200"
                  >
                    <option value="">-- None / Do not import --</option>
                    {sheetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep('upload')}
                className="flex items-center gap-1.5"
              >
                <ArrowLeft size={14} /> Back
              </Button>
              <Button
                type="button"
                onClick={handleProceedToPreview}
                className="flex-1 flex items-center justify-center gap-1.5 shadow-xs"
              >
                Analyze & Preview <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: PREVIEW & VERIFICATION */}
        {step === 'preview' && analysis && (
          <div className="space-y-3.5">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Total Rows</p>
                <p className="text-base font-bold text-slate-800">{analysis.totalRows}</p>
              </div>

              <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                <p className="text-[10px] font-bold text-emerald-700 uppercase">Ready to Import</p>
                <p className="text-base font-bold text-emerald-800">{analysis.readyCount}</p>
              </div>

              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-center">
                <p className="text-[10px] font-bold text-amber-700 uppercase">Already in CRM</p>
                <p className="text-base font-bold text-amber-800">{analysis.alreadyInCrmCount}</p>
              </div>

              <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-200 text-center">
                <p className="text-[10px] font-bold text-purple-700 uppercase">File Duplicates</p>
                <p className="text-base font-bold text-purple-800">{analysis.duplicateInFileCount}</p>
              </div>

              <div className="p-2.5 bg-red-50 rounded-xl border border-red-200 text-center">
                <p className="text-[10px] font-bold text-red-700 uppercase">Invalid Data</p>
                <p className="text-base font-bold text-red-800">{analysis.invalidCount}</p>
              </div>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 text-xs overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    filterTab === 'all' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600'
                  }`}
                >
                  All ({analysis.totalRows})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('ready')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    filterTab === 'ready' ? 'bg-emerald-600 text-white shadow-xs font-semibold' : 'text-slate-600'
                  }`}
                >
                  Ready ({analysis.readyCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('already_in_crm')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    filterTab === 'already_in_crm' ? 'bg-amber-600 text-white shadow-xs font-semibold' : 'text-slate-600'
                  }`}
                >
                  In CRM ({analysis.alreadyInCrmCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('duplicate_in_file')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    filterTab === 'duplicate_in_file' ? 'bg-purple-600 text-white shadow-xs font-semibold' : 'text-slate-600'
                  }`}
                >
                  In-File Dupes ({analysis.duplicateInFileCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('invalid')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    filterTab === 'invalid' ? 'bg-red-600 text-white shadow-xs font-semibold' : 'text-slate-600'
                  }`}
                >
                  Invalid ({analysis.invalidCount})
                </button>
              </div>

              <div className="relative w-full sm:w-48">
                <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter preview..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-7 pr-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
                />
              </div>
            </div>

            {/* Selection controls for ready rows */}
            {analysis.readyCount > 0 && filterTab === 'ready' && (
              <div className="flex justify-between items-center text-xs text-slate-500 px-1">
                <span>
                  Selected <strong>{selectedReadyCount}</strong> of <strong>{analysis.readyCount}</strong> ready candidates
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAllReady(true)}
                    className="text-blue-600 hover:underline font-medium text-[11px]"
                  >
                    Select All
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => toggleAllReady(false)}
                    className="text-slate-500 hover:underline font-medium text-[11px]"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            )}

            {/* Preview Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-2 w-8 text-center">#</th>
                    <th className="p-2">Candidate</th>
                    <th className="p-2">Mobile</th>
                    <th className="p-2">Role / Skills</th>
                    <th className="p-2">Location</th>
                    <th className="p-2">Status & Analysis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedRows.map((r) => {
                    const isReady = r.status === 'ready';
                    return (
                      <tr
                        key={r.rowNumber}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          !isReady ? 'bg-slate-50/30' : ''
                        }`}
                      >
                        <td className="p-2 text-center text-slate-400 font-mono text-[11px]">
                          {isReady ? (
                            <input
                              type="checkbox"
                              checked={r.selected}
                              onChange={() => toggleRowSelected(r.rowNumber)}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                          ) : (
                            r.rowNumber
                          )}
                        </td>
                        <td className="p-2 font-medium text-slate-900">
                          {r.parsed.name || <span className="text-red-500 italic">Missing Name</span>}
                        </td>
                        <td className="p-2 font-mono text-slate-700">
                          {r.parsed.mobile ? (
                            r.parsed.mobile
                          ) : (
                            <span className="text-red-500 italic">Invalid Phone</span>
                          )}
                        </td>
                        <td className="p-2 text-slate-600">
                          <p className="font-medium text-slate-800">{r.parsed.last_role}</p>
                          <p className="text-[10px] text-slate-400 truncate max-w-xs">
                            {r.parsed.skills.join(', ')}
                          </p>
                        </td>
                        <td className="p-2 text-slate-600">{r.parsed.location}</td>
                        <td className="p-2">
                          <div className="flex flex-col items-start gap-0.5">
                            <Badge
                              variant={
                                r.status === 'ready'
                                  ? 'success'
                                  : r.status === 'already_in_crm'
                                  ? 'warning'
                                  : r.status === 'duplicate_in_file'
                                  ? 'info'
                                  : 'danger'
                              }
                            >
                              {r.status === 'ready' && 'Ready to Import'}
                              {r.status === 'already_in_crm' && 'Already Exists'}
                              {r.status === 'duplicate_in_file' && 'Duplicate in File'}
                              {r.status === 'invalid' && 'Invalid Data'}
                            </Badge>
                            {r.statusReason && (
                              <span className="text-[10px] text-slate-500 leading-tight">
                                {r.statusReason}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {displayedRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-slate-400 text-xs">
                        No rows matching the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep('mapping')}
                className="flex items-center gap-1.5"
              >
                <ArrowLeft size={14} /> Back to Mapping
              </Button>

              <div className="flex items-center gap-2">
                {(analysis.alreadyInCrmCount > 0 || analysis.duplicateInFileCount > 0 || analysis.invalidCount > 0) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDownloadSkippedReport}
                    className="flex items-center gap-1.5 text-xs py-1.5 px-3"
                    title="Download list of skipped rows and reasons"
                  >
                    <Download size={13} /> Skipped Report
                  </Button>
                )}

                <Button
                  type="button"
                  onClick={handleExecuteImport}
                  disabled={selectedReadyCount === 0 || isOffline}
                  className="flex items-center gap-1.5 shadow-xs"
                >
                  <Upload size={14} /> Import {selectedReadyCount} New Candidates
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: IMPORTING PROGRESS */}
        {step === 'importing' && (
          <div className="py-8 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center animate-spin">
              <RefreshCw size={24} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Importing Candidates...</h3>
              <p className="text-xs text-slate-500 mt-1">
                Saving to candidate pool and verifying database constraints ({progress.current} of {progress.total})
              </p>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden max-w-md mx-auto">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{
                  width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                }}
              ></div>
            </div>
          </div>
        )}

        {/* STEP 5: COMPLETED SUMMARY REPORT */}
        {step === 'completed' && importResults && (
          <div className="space-y-4 py-2">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center shadow-xs">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="font-bold text-slate-900 text-lg">Candidate Import Complete</h3>
              <p className="text-xs text-slate-500">
                Source: <strong className="text-slate-700">{effectiveSource}</strong>
              </p>
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                <p className="text-[10px] font-bold text-emerald-700 uppercase">Imported</p>
                <p className="text-xl font-bold text-emerald-800">{importResults.successful}</p>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-center">
                <p className="text-[10px] font-bold text-amber-700 uppercase">Skipped (In CRM)</p>
                <p className="text-xl font-bold text-amber-800">{importResults.skippedExisting}</p>
              </div>

              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-center">
                <p className="text-[10px] font-bold text-purple-700 uppercase">Skipped (File Dupes)</p>
                <p className="text-xl font-bold text-purple-800">{importResults.skippedInFile}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Skipped (Invalid)</p>
                <p className="text-xl font-bold text-slate-700">{importResults.skippedInvalid}</p>
              </div>
            </div>

            {/* Failed rows if any */}
            {importResults.failed > 0 && (
              <div className="p-3 bg-red-50 text-red-800 rounded-xl text-xs space-y-1 border border-red-200">
                <p className="font-bold flex items-center gap-1">
                  <XCircle size={14} /> {importResults.failed} candidate(s) failed during insertion:
                </p>
                <div className="max-h-24 overflow-y-auto pl-4 list-disc">
                  {importResults.failedRows.map((f, i) => (
                    <li key={i}>
                      Row {f.row} ({f.name}): {f.error}
                    </li>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadSkippedReport}
                className="flex-1 flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <Download size={14} /> Download Skipped Report (CSV)
              </Button>
              <Button
                type="button"
                onClick={handleClose}
                className="flex-1 shadow-xs"
              >
                View Candidates
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
