import React, { useState, useRef, useMemo } from 'react';
import { Button, Modal, Badge, Label } from './ui';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Search,
  Flame,
  UserCheck,
  Tag,
  Briefcase,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import {
  parseSpreadsheetFile,
  autoDetectColumnMapping,
  detectPlatform,
  ColumnMapping,
  DetectedPlatform,
} from '../lib/candidateImport';
import {
  analyzeLeadImportRows,
  ProcessedLeadImportRow,
  LeadRowImportStatus,
  normalizeLeadSource,
} from '../lib/leadImport';
import { LeadSource, USERS } from '../types';

interface LeadImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'upload' | 'config' | 'mapping' | 'preview' | 'importing' | 'completed';

const COMMON_LEAD_CATEGORIES = [
  'Accountant',
  'Back Office',
  'Telecaller',
  'Customer Support',
  'Sales Executive',
  'Business Development',
  'HR / Recruitment',
  'Digital Marketing',
  'IT Support / Developer',
  'Receptionist / Front Desk',
  'Delivery / Field Executive',
  'Graphic Designer',
];

const SOURCE_OPTIONS: LeadSource[] = [
  'WorkIndia',
  'Naukri.com',
  'Indeed',
  'LinkedIn',
  'WhatsApp',
  'Walk-in',
  'Referral',
  'Website',
  'Manual',
  'Other',
];

export const LeadImportModal: React.FC<LeadImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { leads, candidates, batchImportLeads, isOffline } = useData();
  const { currentUser } = useUser();

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [detectedPlatform, setDetectedPlatform] = useState<DetectedPlatform>('Generic');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);

  // Configuration state
  const [selectedSource, setSelectedSource] = useState<LeadSource>('Manual');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [assignedEmployeeId, setAssignedEmployeeId] = useState<string>('');

  // Column mapping
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({ name: '', mobile: '' });

  // Preview & selection state
  const [analyzedRows, setAnalyzedRows] = useState<ProcessedLeadImportRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | LeadRowImportStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Import completion stats
  const [importResults, setImportResults] = useState<{
    batchId: string;
    totalImported: number;
    skippedDuplicates: number;
    skippedInvalid: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleAddCustomCategory = () => {
    const trimmed = customCategoryInput.trim();
    if (trimmed && !selectedCategories.includes(trimmed)) {
      setSelectedCategories(prev => [...prev, trimmed]);
      setCustomCategoryInput('');
    }
  };

  // Step 1: File selection & parsing
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseSpreadsheetFile(buffer);
      if (parsed.rawRows.length === 0) {
        toast.error('The selected file contains no data rows.');
        return;
      }

      setFileName(file.name);
      setRawHeaders(parsed.headers);
      setRawRows(parsed.rawRows);

      // Detect platform
      const detected = detectPlatform(parsed.headers);
      setDetectedPlatform(detected.platform);
      setSelectedSource(normalizeLeadSource(detected.platform));

      // Auto-detect column mapping
      const autoMap = autoDetectColumnMapping(parsed.headers);
      setColumnMapping(autoMap);

      setStep('config');
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse file');
    }
  };

  // Run analysis when moving to preview
  const handleProceedToPreview = () => {
    if (!columnMapping.name || !columnMapping.mobile) {
      toast.error('Please map both Candidate Name and Mobile Number columns.');
      return;
    }

    const result = analyzeLeadImportRows({
      rawRows,
      mapping: columnMapping,
      source: selectedSource,
      categories: selectedCategories,
      assignedTo: assignedEmployeeId || null,
      existingLeads: leads,
      existingCandidates: candidates,
    });

    setAnalyzedRows(result.rows);
    setStep('preview');
  };

  // Toggle selection
  const handleToggleRow = (rowNumber: number) => {
    setAnalyzedRows(prev =>
      prev.map(r => (r.rowNumber === rowNumber ? { ...r, selected: !r.selected } : r))
    );
  };

  const handleSelectAll = (select: boolean) => {
    setAnalyzedRows(prev =>
      prev.map(r => (r.status === 'ready' ? { ...r, selected: select } : r))
    );
  };

  // Execute import
  const handleExecuteImport = async () => {
    const rowsToImport = analyzedRows.filter(r => r.selected && r.status === 'ready');
    if (rowsToImport.length === 0) {
      toast.error('No ready rows selected for import.');
      return;
    }

    setStep('importing');

    try {
      const leadsToInsert = rowsToImport.map(r => ({
        ...r.parsed,
        source: selectedSource,
      }));

      const res = await batchImportLeads(
        {
          file_name: fileName,
          detected_platform: detectedPlatform,
          default_assigned_to: assignedEmployeeId || null,
          notes: `Imported ${leadsToInsert.length} leads with categories: ${selectedCategories.join(', ') || 'None'}`,
        },
        leadsToInsert
      );

      const duplicatesCount = analyzedRows.filter(
        r => r.status === 'already_in_leads' || r.status === 'already_in_candidates' || r.status === 'duplicate_in_file'
      ).length;
      const invalidCount = analyzedRows.filter(r => r.status === 'invalid').length;

      setImportResults({
        batchId: res.batch.id,
        totalImported: res.insertedCount,
        skippedDuplicates: duplicatesCount,
        skippedInvalid: invalidCount,
      });

      setStep('completed');
      toast.success(`Successfully imported ${res.insertedCount} leads!`);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
      setStep('preview');
    }
  };

  const filteredPreviewRows = useMemo(() => {
    return analyzedRows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          r.parsed.name.toLowerCase().includes(q) ||
          r.parsed.mobile.includes(q) ||
          (r.parsed.location && r.parsed.location.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [analyzedRows, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    return {
      total: analyzedRows.length,
      ready: analyzedRows.filter(r => r.status === 'ready').length,
      alreadyLeads: analyzedRows.filter(r => r.status === 'already_in_leads').length,
      alreadyCandidates: analyzedRows.filter(r => r.status === 'already_in_candidates').length,
      fileDupes: analyzedRows.filter(r => r.status === 'duplicate_in_file').length,
      invalid: analyzedRows.filter(r => r.status === 'invalid').length,
    };
  }, [analyzedRows]);

  const resetAll = () => {
    setStep('upload');
    setFileName('');
    setRawRows([]);
    setRawHeaders([]);
    setAnalyzedRows([]);
    setImportResults(null);
    setSelectedCategories([]);
    setAssignedEmployeeId('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        resetAll();
        onClose();
      }}
      title="Bulk Lead Import (Excel / CSV)"
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {/* Step Progress Header */}
        <div className="flex items-center justify-between border-b pb-4 text-xs font-medium text-slate-500">
          <div className={`flex items-center gap-1.5 ${step === 'upload' ? 'text-blue-600 font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center">1</span>
            Upload
          </div>
          <div className={`flex items-center gap-1.5 ${step === 'config' ? 'text-blue-600 font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center">2</span>
            Source & Category
          </div>
          <div className={`flex items-center gap-1.5 ${step === 'mapping' ? 'text-blue-600 font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center">3</span>
            Mapping
          </div>
          <div className={`flex items-center gap-1.5 ${step === 'preview' ? 'text-blue-600 font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center">4</span>
            Preview & Filter
          </div>
          <div className={`flex items-center gap-1.5 ${step === 'completed' ? 'text-emerald-600 font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center">5</span>
            Summary
          </div>
        </div>

        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <div className="text-center py-10 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />
            <FileSpreadsheet className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800 mb-1">
              Select Excel or CSV Spreadsheet
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
              Supported formats: .xlsx, .xls, .csv. Automatic detection for Naukri.com, WorkIndia, and custom spreadsheets.
            </p>
            <Button
              type="button"
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Choose File
            </Button>
          </div>
        )}

        {/* STEP 2: Source & Multi-Category Configuration */}
        {step === 'config' && (
          <div className="space-y-6">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-900">File: {fileName}</p>
                <p className="text-xs text-blue-700">
                  Detected Platform: <span className="font-bold">{detectedPlatform}</span> ({rawRows.length} rows)
                </p>
              </div>
              <Badge variant="primary">{detectedPlatform}</Badge>
            </div>

            {/* Select Source */}
            <div>
              <Label className="text-sm font-semibold text-slate-800 mb-1.5 block">
                Acquisition Source
              </Label>
              <select
                value={selectedSource}
                onChange={e => setSelectedSource(e.target.value as LeadSource)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
              >
                {SOURCE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Multi-Category Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-sm font-semibold text-slate-800">
                  Assign Lead Categories / Roles (Select multiple)
                </Label>
                <span className="text-xs text-slate-500">
                  {selectedCategories.length} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {COMMON_LEAD_CATEGORIES.map(cat => {
                  const isSelected = selectedCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {cat} {isSelected && '✓'}
                    </button>
                  );
                })}
              </div>

              {/* Add custom category */}
              <div className="flex items-center gap-2 max-w-sm">
                <input
                  type="text"
                  placeholder="Add custom category..."
                  value={customCategoryInput}
                  onChange={e => setCustomCategoryInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCustomCategory())}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-full"
                />
                <Button type="button" variant="secondary" size="sm" onClick={handleAddCustomCategory}>
                  Add
                </Button>
              </div>
            </div>

            {/* Optional Assignment */}
            <div>
              <Label className="text-sm font-semibold text-slate-800 mb-1.5 block">
                Assign to Recruiter / Telecaller (Optional)
              </Label>
              <select
                value={assignedEmployeeId}
                onChange={e => setAssignedEmployeeId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Unassigned (Open Pool)</option>
                {USERS.map(u => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button type="button" variant="secondary" onClick={() => setStep('upload')}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button type="button" variant="primary" onClick={() => setStep('mapping')}>
                Next: Column Mapping <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Column Mapping */}
        {step === 'mapping' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              Verify column mapping from your spreadsheet to CRM Lead fields. Required: Candidate Name & Mobile Number.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto pr-2">
              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">
                  Candidate Name *
                </Label>
                <select
                  value={columnMapping.name}
                  onChange={e => setColumnMapping({ ...columnMapping, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
                >
                  <option value="">-- Select Header --</option>
                  {rawHeaders.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">
                  Mobile Number *
                </Label>
                <select
                  value={columnMapping.mobile}
                  onChange={e => setColumnMapping({ ...columnMapping, mobile: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
                >
                  <option value="">-- Select Header --</option>
                  {rawHeaders.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">Email</Label>
                <select
                  value={columnMapping.email || ''}
                  onChange={e => setColumnMapping({ ...columnMapping, email: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
                >
                  <option value="">-- Optional --</option>
                  {rawHeaders.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">Experience</Label>
                <select
                  value={columnMapping.experience || ''}
                  onChange={e => setColumnMapping({ ...columnMapping, experience: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
                >
                  <option value="">-- Optional --</option>
                  {rawHeaders.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">Skills</Label>
                <select
                  value={columnMapping.skills || ''}
                  onChange={e => setColumnMapping({ ...columnMapping, skills: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
                >
                  <option value="">-- Optional --</option>
                  {rawHeaders.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">Location</Label>
                <select
                  value={columnMapping.location || ''}
                  onChange={e => setColumnMapping({ ...columnMapping, location: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
                >
                  <option value="">-- Optional --</option>
                  {rawHeaders.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">Expected Salary</Label>
                <select
                  value={columnMapping.expected_salary || ''}
                  onChange={e => setColumnMapping({ ...columnMapping, expected_salary: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
                >
                  <option value="">-- Optional --</option>
                  {rawHeaders.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">Current Salary</Label>
                <select
                  value={columnMapping.current_salary || ''}
                  onChange={e => setColumnMapping({ ...columnMapping, current_salary: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
                >
                  <option value="">-- Optional --</option>
                  {rawHeaders.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">Qualification</Label>
                <select
                  value={columnMapping.qualification || ''}
                  onChange={e => setColumnMapping({ ...columnMapping, qualification: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
                >
                  <option value="">-- Optional --</option>
                  {rawHeaders.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-800 block mb-1">Current Role / Designation</Label>
                <select
                  value={columnMapping.last_role || ''}
                  onChange={e => setColumnMapping({ ...columnMapping, last_role: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white"
                >
                  <option value="">-- Optional --</option>
                  {rawHeaders.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button type="button" variant="secondary" onClick={() => setStep('config')}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button type="button" variant="primary" onClick={handleProceedToPreview}>
                Review & Preview <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: Review & Preview */}
        {step === 'preview' && (
          <div className="space-y-4">
            {/* Summary KPI Pills */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-center text-xs">
              <div
                onClick={() => setStatusFilter('all')}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                  statusFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="text-base font-bold">{stats.total}</div>
                <div className="text-[11px]">Total Rows</div>
              </div>
              <div
                onClick={() => setStatusFilter('ready')}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                  statusFilter === 'ready' ? 'bg-emerald-600 text-white font-bold' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                <div className="text-base font-bold">{stats.ready}</div>
                <div className="text-[11px]">Ready to Import</div>
              </div>
              <div
                onClick={() => setStatusFilter('already_in_leads')}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                  statusFilter === 'already_in_leads' ? 'bg-amber-600 text-white font-bold' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <div className="text-base font-bold">{stats.alreadyLeads}</div>
                <div className="text-[11px]">In Leads</div>
              </div>
              <div
                onClick={() => setStatusFilter('already_in_candidates')}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                  statusFilter === 'already_in_candidates' ? 'bg-purple-600 text-white font-bold' : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
                }`}
              >
                <div className="text-base font-bold">{stats.alreadyCandidates}</div>
                <div className="text-[11px]">In Candidates</div>
              </div>
              <div
                onClick={() => setStatusFilter('duplicate_in_file')}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                  statusFilter === 'duplicate_in_file' ? 'bg-orange-600 text-white font-bold' : 'bg-orange-50 text-orange-800 hover:bg-orange-100'
                }`}
              >
                <div className="text-base font-bold">{stats.fileDupes}</div>
                <div className="text-[11px]">File Duplicate</div>
              </div>
              <div
                onClick={() => setStatusFilter('invalid')}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                  statusFilter === 'invalid' ? 'bg-rose-600 text-white font-bold' : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                }`}
              >
                <div className="text-base font-bold">{stats.invalid}</div>
                <div className="text-[11px]">Invalid Rows</div>
              </div>
            </div>

            {/* Quick Actions & Search */}
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter preview..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => handleSelectAll(true)}>
                  Select All Ready
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => handleSelectAll(false)}>
                  Deselect All
                </Button>
              </div>
            </div>

            {/* Data Table */}
            <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-[45vh]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b sticky top-0">
                  <tr>
                    <th className="p-2 w-10 text-center">Import</th>
                    <th className="p-2">Row</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Mobile</th>
                    <th className="p-2">Location</th>
                    <th className="p-2">Exp</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Reason / Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPreviewRows.map(r => (
                    <tr
                      key={r.rowNumber}
                      className={r.status === 'ready' ? 'hover:bg-slate-50' : 'bg-slate-50/40 text-slate-400'}
                    >
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={r.selected}
                          disabled={r.status !== 'ready'}
                          onChange={() => handleToggleRow(r.rowNumber)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="p-2 font-mono text-[11px] text-slate-500">#{r.rowNumber}</td>
                      <td className="p-2 font-medium text-slate-900">{r.parsed.name || '—'}</td>
                      <td className="p-2 font-mono">{r.parsed.mobile || '—'}</td>
                      <td className="p-2">{r.parsed.location || '—'}</td>
                      <td className="p-2">{r.parsed.experience !== null ? `${r.parsed.experience} yrs` : '—'}</td>
                      <td className="p-2">
                        {r.status === 'ready' && <Badge variant="success">Ready</Badge>}
                        {r.status === 'already_in_leads' && <Badge variant="warning">In Leads</Badge>}
                        {r.status === 'already_in_candidates' && <Badge variant="info">In Candidates</Badge>}
                        {r.status === 'duplicate_in_file' && <Badge variant="neutral">File Duplicate</Badge>}
                        {r.status === 'invalid' && <Badge variant="danger">Invalid</Badge>}
                      </td>
                      <td className="p-2 text-[11px] text-slate-500">{r.statusReason || '—'}</td>
                    </tr>
                  ))}
                  {filteredPreviewRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-400">
                        No rows matching filter
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button type="button" variant="secondary" onClick={() => setStep('mapping')}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600">
                  {analyzedRows.filter(r => r.selected && r.status === 'ready').length} leads selected
                </span>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleExecuteImport}
                  disabled={analyzedRows.filter(r => r.selected && r.status === 'ready').length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Confirm & Import Leads
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Importing */}
        {step === 'importing' && (
          <div className="text-center py-16 space-y-4">
            <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
            <h3 className="text-base font-semibold text-slate-800">Importing Leads...</h3>
            <p className="text-xs text-slate-500">
              Transaction-safe duplicate checking, batch registration, and hot leads cataloging in progress.
            </p>
          </div>
        )}

        {/* STEP 6: Completion Report */}
        {step === 'completed' && importResults && (
          <div className="space-y-6 text-center py-6">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Import Completed Successfully!</h3>
              <p className="text-xs text-slate-500 mt-1">
                Batch ID: <span className="font-mono text-slate-700">{importResults.batchId}</span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto text-center">
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <div className="text-xl font-bold text-emerald-700">{importResults.totalImported}</div>
                <div className="text-xs text-emerald-800 font-medium">Imported as Hot Leads</div>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="text-xl font-bold text-amber-700">{importResults.skippedDuplicates}</div>
                <div className="text-xs text-amber-800 font-medium">Skipped Duplicates</div>
              </div>
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                <div className="text-xl font-bold text-rose-700">{importResults.skippedInvalid}</div>
                <div className="text-xs text-rose-800 font-medium">Skipped Invalid</div>
              </div>
            </div>

            <div className="pt-4 border-t flex justify-center gap-3">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  resetAll();
                  onClose();
                }}
              >
                Close & View Leads
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
