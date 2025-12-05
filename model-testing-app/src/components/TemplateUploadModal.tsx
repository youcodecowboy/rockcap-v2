'use client';

import { useState, useCallback } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import SheetClassificationModal, { 
  ParsedSheetInfo, 
  SheetClassification, 
  DynamicGroup 
} from './SheetClassificationModal';

type ModelType = 'appraisal' | 'operating' | 'other';

interface TemplateUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type UploadStep = 'form' | 'parsing' | 'classify' | 'uploading' | 'done';

export default function TemplateUploadModal({
  isOpen,
  onClose,
  onSuccess,
}: TemplateUploadModalProps) {
  // Form state
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateModelType, setTemplateModelType] = useState<ModelType>('appraisal');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Process state
  const [step, setStep] = useState<UploadStep>('form');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Parsed data
  const [parsedSheets, setParsedSheets] = useState<ParsedSheetInfo[]>([]);
  
  // Convex mutations
  const createTemplateDefinition = useMutation(api.templateDefinitions.create);
  const updateSheetConfiguration = useMutation(api.templateDefinitions.updateSheetConfiguration);
  const batchCreateSheets = useMutation(api.templateSheets.batchCreate);
  const activateTemplate = useMutation(api.templateDefinitions.activate);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const resetForm = useCallback(() => {
    setTemplateName('');
    setTemplateDescription('');
    setTemplateModelType('appraisal');
    setSelectedFile(null);
    setStep('form');
    setProgress(0);
    setStatusMessage('');
    setError(null);
    setParsedSheets([]);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        setError('Please select an Excel file (.xlsx or .xls)');
        return;
      }
      setSelectedFile(file);
      setError(null);
      
      // Auto-fill template name from file name if empty
      if (!templateName) {
        const baseName = file.name.replace(/\.(xlsx|xls)$/, '');
        setTemplateName(baseName);
      }
    }
  };

  const parseExcelFile = async (file: File): Promise<ParsedSheetInfo[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { 
            type: 'array',
            cellStyles: true,
            cellFormula: true,
          });
          
          const sheets: ParsedSheetInfo[] = [];
          
          workbook.SheetNames.forEach((sheetName, index) => {
            setProgress(Math.round(((index + 1) / workbook.SheetNames.length) * 50));
            
            const worksheet = workbook.Sheets[sheetName];
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
            
            // Get raw data
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
              header: 1,
              raw: true,
              defval: null,
            }) as any[][];
            
            // Extract styles
            const styles: Record<string, any> = {};
            const formulas: Record<string, string> = {};
            
            // Iterate through cells to extract formulas and styles
            Object.keys(worksheet).forEach(cellAddress => {
              if (cellAddress.startsWith('!')) return; // Skip metadata
              
              const cell = worksheet[cellAddress];
              
              // Extract formula
              if (cell.f) {
                formulas[cellAddress] = cell.f;
              }
              
              // Extract style (if present)
              if (cell.s) {
                styles[cellAddress] = cell.s;
              }
            });
            
            // Extract column widths
            const columnWidths: Record<number, number> = {};
            if (worksheet['!cols']) {
              worksheet['!cols'].forEach((col: any, idx: number) => {
                if (col && col.wch) {
                  columnWidths[idx] = col.wch;
                }
              });
            }
            
            // Extract row heights
            const rowHeights: Record<number, number> = {};
            if (worksheet['!rows']) {
              worksheet['!rows'].forEach((row: any, idx: number) => {
                if (row && row.hpt) {
                  rowHeights[idx] = row.hpt;
                }
              });
            }
            
            // Extract merged cells
            const mergedCells = worksheet['!merges'] || [];
            
            sheets.push({
              name: sheetName,
              rowCount: range.e.r - range.s.r + 1,
              colCount: range.e.c - range.s.c + 1,
              hasFormulas: Object.keys(formulas).length > 0,
              hasStyles: Object.keys(styles).length > 0,
              data: jsonData,
              styles,
              formulas,
              columnWidths,
              rowHeights,
              mergedCells,
            });
          });
          
          resolve(sheets);
        } catch (err) {
          reject(err);
        }
      };
      
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleStartParsing = async () => {
    if (!selectedFile || !templateName.trim()) {
      setError('Please provide a template name and select a file');
      return;
    }

    setError(null);
    setStep('parsing');
    setProgress(0);
    setStatusMessage('Parsing Excel file...');

    try {
      const sheets = await parseExcelFile(selectedFile);
      setParsedSheets(sheets);
      setProgress(100);
      setStatusMessage(`Parsed ${sheets.length} sheets`);
      
      // Move to classification step
      setTimeout(() => {
        setStep('classify');
      }, 500);
    } catch (err: any) {
      setError(`Failed to parse Excel file: ${err.message}`);
      setStep('form');
    }
  };

  const handleClassificationConfirm = async (
    classifications: SheetClassification[], 
    dynamicGroups: DynamicGroup[]
  ) => {
    setStep('uploading');
    setProgress(0);
    setStatusMessage('Creating template...');

    try {
      // Step 1: Upload original file to storage
      setProgress(10);
      setStatusMessage('Uploading original file...');
      
      const uploadUrl = await generateUploadUrl();
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': selectedFile!.type },
        body: selectedFile,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const responseText = await uploadResponse.text();
      let fileStorageId: Id<'_storage'>;
      try {
        const responseData = JSON.parse(responseText);
        fileStorageId = responseData.storageId as Id<'_storage'>;
      } catch {
        fileStorageId = responseText.trim() as Id<'_storage'>;
      }

      // Step 2: Create template definition
      setProgress(30);
      setStatusMessage('Creating template definition...');
      
      const templateId = await createTemplateDefinition({
        name: templateName.trim(),
        modelType: templateModelType,
        description: templateDescription.trim() || undefined,
        originalFileStorageId: fileStorageId,
        originalFileName: selectedFile!.name,
      });

      // Step 3: Create sheets in chunks to avoid Convex field limit
      setProgress(50);
      setStatusMessage('Processing sheets...');

      // Build sheet data for batch create
      const sheetsToCreate = parsedSheets.map((sheet, index) => {
        const classification = classifications.find(c => c.sheetName === sheet.name);
        return {
          name: sheet.name,
          order: index,
          type: classification?.type || 'core',
          groupId: classification?.groupId,
          data: sheet.data,
          styles: sheet.styles,
          formulas: sheet.formulas,
          columnWidths: sheet.columnWidths,
          rowHeights: sheet.rowHeights,
          mergedCells: sheet.mergedCells,
        };
      });

      // Upload sheets in chunks of 3 to avoid Convex field limit (1024 fields max)
      const CHUNK_SIZE = 3;
      const chunks = [];
      for (let i = 0; i < sheetsToCreate.length; i += CHUNK_SIZE) {
        chunks.push(sheetsToCreate.slice(i, i + CHUNK_SIZE));
      }

      // Aggregate results from all chunks
      const aggregatedResult: {
        sheetIds: Id<"templateSheets">[];
        coreSheetIds: Id<"templateSheets">[];
        dynamicSheetsByGroup: Record<string, Id<"templateSheets">[]>;
      } = {
        sheetIds: [],
        coreSheetIds: [],
        dynamicSheetsByGroup: {},
      };

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setStatusMessage(`Processing sheets... (${i + 1}/${chunks.length})`);
        setProgress(50 + Math.round((i / chunks.length) * 25));
        
        const chunkResult = await batchCreateSheets({
          templateId,
          sheets: chunk,
        });

        // Merge results
        aggregatedResult.sheetIds.push(...chunkResult.sheetIds);
        aggregatedResult.coreSheetIds.push(...chunkResult.coreSheetIds);
        
        // Merge dynamic sheets by group
        for (const [groupId, sheetIds] of Object.entries(chunkResult.dynamicSheetsByGroup)) {
          if (!aggregatedResult.dynamicSheetsByGroup[groupId]) {
            aggregatedResult.dynamicSheetsByGroup[groupId] = [];
          }
          aggregatedResult.dynamicSheetsByGroup[groupId].push(...sheetIds);
        }
      }

      const result = aggregatedResult;

      setProgress(80);
      setStatusMessage('Configuring template...');

      // Step 4: Update sheet configuration
      const dynamicGroupsConfig = dynamicGroups.map(group => ({
        groupId: group.groupId,
        label: group.label,
        sheetIds: result.dynamicSheetsByGroup[group.groupId] || [],
        min: group.min,
        max: group.max,
        defaultCount: group.defaultCount,
        namePlaceholder: group.namePlaceholder,
      }));

      await updateSheetConfiguration({
        templateId,
        coreSheetIds: result.coreSheetIds,
        dynamicGroups: dynamicGroupsConfig,
      });

      // Step 5: Activate template
      setProgress(90);
      setStatusMessage('Activating template...');
      
      await activateTemplate({ templateId });

      setProgress(100);
      setStatusMessage('Template created successfully!');
      setStep('done');
      
      // Call success callback
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
          handleClose();
        }, 1500);
      }
    } catch (err: any) {
      setError(`Failed to create template: ${err.message}`);
      setStep('form');
    }
  };

  return (
    <>
      <Dialog open={isOpen && step !== 'classify'} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              {step === 'done' ? 'Template Created' : 'Upload Template'}
            </DialogTitle>
            <DialogDescription>
              {step === 'form' && 'Upload an Excel template file (.xlsx) with optional dynamic sheet configuration'}
              {step === 'parsing' && 'Parsing Excel file...'}
              {step === 'uploading' && 'Creating template...'}
              {step === 'done' && 'Your template is ready to use!'}
            </DialogDescription>
          </DialogHeader>

          {/* Form Step */}
          {step === 'form' && (
            <>
              <div className="space-y-4 py-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                  </div>
                )}
                
                <div>
                  <Label htmlFor="template-name">Template Name *</Label>
                  <Input
                    id="template-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Appraisal Model v2.0"
                  />
                </div>
                
                <div>
                  <Label htmlFor="template-description">Description</Label>
                  <Textarea
                    id="template-description"
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Brief description of this template..."
                    rows={3}
                  />
                </div>
                
                <div>
                  <Label htmlFor="template-type">Model Type *</Label>
                  <Select value={templateModelType} onValueChange={(v) => setTemplateModelType(v as ModelType)}>
                    <SelectTrigger id="template-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appraisal">Appraisal</SelectItem>
                      <SelectItem value="operating">Operating</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="template-file">Template File (.xlsx) *</Label>
                  <div className="mt-2">
                    <label
                      htmlFor="template-file"
                      className="flex items-center justify-center w-full h-32 px-4 transition bg-white border-2 border-gray-300 border-dashed rounded-lg appearance-none cursor-pointer hover:border-gray-400 focus:outline-none"
                    >
                      <div className="flex flex-col items-center space-y-2">
                        <Upload className="w-8 h-8 text-gray-400" />
                        <span className="text-sm text-gray-500">
                          {selectedFile ? selectedFile.name : 'Click to select or drag and drop'}
                        </span>
                        {selectedFile && (
                          <span className="text-xs text-gray-400">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        )}
                      </div>
                      <input
                        id="template-file"
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleStartParsing} disabled={!selectedFile || !templateName.trim()}>
                  Continue
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Parsing/Uploading Step */}
          {(step === 'parsing' || step === 'uploading') && (
            <div className="py-8 space-y-4">
              <div className="flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900">{statusMessage}</p>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          {/* Done Step */}
          {step === 'done' && (
            <div className="py-8 space-y-4">
              <div className="flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-green-600" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-gray-900">Template Created Successfully!</p>
                <p className="text-sm text-gray-500 mt-1">
                  {parsedSheets.length} sheets processed
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sheet Classification Modal */}
      {step === 'classify' && (
        <SheetClassificationModal
          isOpen={true}
          onClose={() => setStep('form')}
          sheets={parsedSheets}
          templateName={templateName}
          onConfirm={handleClassificationConfirm}
        />
      )}
    </>
  );
}

