'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ChevronLeft, ChevronRight, Calculator, Save, Plus, Download, Settings, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
// Tabs removed - using unified toolbar layout
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ExcelDataEditor from '@/components/ExcelDataEditor';
import WorkbookEditor from '@/components/WorkbookEditor';
import ModelOutputSummary from '@/components/ModelOutputSummary';
import CreateScenarioModal from '@/components/CreateScenarioModal';
import SaveVersionModal from '@/components/SaveVersionModal';
import PlaceholderMappingModal from '@/components/PlaceholderMappingModal';
import DataLibrary from '@/components/DataLibrary';
import ModelLibraryDropdown from '@/components/ModelLibraryDropdown';
import ModelingSettings from '@/components/ModelingSettings';
import ScenariosListModal from '@/components/ScenariosListModal';
import SaveModelModal from '@/components/SaveModelModal';
import { AssignToClientModal } from '@/components/AssignToClientModal';
import { loadExcelTemplate, loadExcelTemplateMetadata, loadSheetData, SheetData, exportToExcel, ExportOptions, SheetMetadata } from '@/lib/templateLoader';
import { populateTemplateWithPlaceholders, PopulationResult } from '@/lib/placeholderMapper';
import { getPlaceholderConfig } from '@/lib/placeholderConfigs';
import { buildPlaceholderConfigFromMappings } from '@/lib/mappingConfigBuilder';
import { populateTemplateWithCodifiedData, toLegacyPopulationResult, CodifiedItem, getOverflowSummary, CategoryOverflow, clearUnusedPlaceholders, countRemainingPlaceholders } from '@/lib/codifiedTemplatePopulator';

export default function ModelingPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<Id<"scenarios"> | null>(null);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('input'); // 'input' or 'output'
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null); // Selected sheet from dropdown
  const [isCreateScenarioOpen, setIsCreateScenarioOpen] = useState(false);
  const [isSaveVersionOpen, setIsSaveVersionOpen] = useState(false);
  const [isPlaceholderModalOpen, setIsPlaceholderModalOpen] = useState(false);
  const [spreadsheetData, setSpreadsheetData] = useState<any[][]>([]);
  const [isStandaloneDocument, setIsStandaloneDocument] = useState(false); // Track if we're viewing a standalone blank document
  const [templateSheets, setTemplateSheets] = useState<SheetData[] | null>(null);
  const [originalTemplateSheets, setOriginalTemplateSheets] = useState<SheetData[] | null>(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [lazyWorkbook, setLazyWorkbook] = useState<any>(null); // Store XLSX workbook for lazy loading
  const [lazyMetadata, setLazyMetadata] = useState<SheetMetadata[] | null>(null); // Store metadata for lazy loading
  const [loadedSheets, setLoadedSheets] = useState<Set<string>>(new Set()); // Track which sheets are loaded
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [populationResult, setPopulationResult] = useState<PopulationResult | null>(null);
  const [overflowWarnings, setOverflowWarnings] = useState<string[]>([]); // Track overflow from category fallbacks
  const [remainingPlaceholders, setRemainingPlaceholders] = useState<{ total: number; byCategory: Map<string, number>; specific: string[] } | null>(null);
  const [exportMetadata, setExportMetadata] = useState<ExportOptions | null>(null);
  const [hyperFormulaEngine, setHyperFormulaEngine] = useState<any>(null);
  const [activeDocumentId, setActiveDocumentId] = useState<Id<"documents"> | null>(null);
  const [viewMode, setViewMode] = useState<'data-library' | 'scenario' | 'settings'>('data-library');
  const [selectedTemplateId, setSelectedTemplateId] = useState<Id<"modelingTemplates"> | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScenariosModalOpen, setIsScenariosModalOpen] = useState(false);
  const [isSaveModelModalOpen, setIsSaveModelModalOpen] = useState(false);
  const [isAssignClientModalOpen, setIsAssignClientModalOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<'clients' | 'projects' | 'models'>('clients');
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [isQuickExportMode, setIsQuickExportMode] = useState(false);
  const [isQuickExporting, setIsQuickExporting] = useState(false);

  // Queries
  const projectsWithData = useQuery(
    api.projects.getWithExtractedData, 
    {}
  ) as any;
  const clients = useQuery(api.clients.list, {});
  const selectedProject = useQuery(
    api.projects.get,
    selectedProjectId ? { id: selectedProjectId } : "skip"
  );
  const documents = useQuery(
    api.documents.list,
    selectedProjectId ? { projectId: selectedProjectId } : "skip"
  );
  const scenarios = useQuery(
    api.scenarios.list,
    selectedProjectId ? { projectId: selectedProjectId } : "skip"
  );
  const selectedScenario = useQuery(
    api.scenarios.get,
    selectedScenarioId ? { id: selectedScenarioId } : "skip"
  );
  const modelRuns = useQuery(
    api.modelRuns.getVersions,
    selectedScenarioId ? { scenarioId: selectedScenarioId } : "skip"
  );
  
  // Query all saved model versions for the selected project (for sidebar Level 2)
  const projectModelRuns = useQuery(
    api.modelRuns.getProjectVersions,
    selectedProjectId ? { projectId: selectedProjectId } : "skip"
  );

  // Mutations
  const updateScenarioData = useMutation(api.scenarios.updateData);
  
  // Query code mappings for templates
  const codeMappings = useQuery(api.modelingCodeMappings.list, { activeOnly: true });
  
  // Query selected template and URL
  const selectedTemplate = useQuery(
    api.modelingTemplates.get,
    selectedTemplateId ? { id: selectedTemplateId } : "skip"
  );
  const selectedTemplateUrl = useQuery(
    api.modelingTemplates.getTemplateUrl,
    selectedTemplateId ? { id: selectedTemplateId } : "skip"
  );

  // Query for Excel template - using direct storage ID as fallback
  const APPRAISAL_TEMPLATE_STORAGE_ID = 'kg2ejfhc72k3qhvbn2ahgmnhys7vh4r1' as Id<"_storage">;
  const OPERATING_TEMPLATE_PATH = '/test-template-operating.xlsx';
  const templateData = useQuery(api.excelTemplates.getTemplateByName, { fileName: 'test-sheet.xlsx' });
  const appraisalTemplateUrl = useQuery(api.excelTemplates.getTemplateUrl, { storageId: APPRAISAL_TEMPLATE_STORAGE_ID });
  const allTemplates = useQuery(api.excelTemplates.listTemplates, {});
  
  // Debug: Log appraisal template URL when available
  useEffect(() => {
    if (appraisalTemplateUrl) {
      console.log('Appraisal template URL loaded:', appraisalTemplateUrl);
    }
  }, [appraisalTemplateUrl]);
  
  // Use either the document-based template or the direct storage URL
  // Memoize to prevent infinite loops
  const effectiveTemplateData = useMemo(() => {
    return templateData || (appraisalTemplateUrl ? { url: appraisalTemplateUrl, document: null } : null);
  }, [templateData, appraisalTemplateUrl]);
  
  // Debug: Log available templates only once when they change
  useEffect(() => {
    if (allTemplates && allTemplates.length > 0) {
      console.log('Available Excel templates:', allTemplates.map(t => t.fileName));
    }
  }, [allTemplates?.length]); // Only log when the count changes, not on every render

  // Get Excel documents with extracted data for selected project
  const excelDocuments = useMemo(() => {
    if (!documents) return [];
    return documents.filter(doc => {
      const fileType = doc.fileType?.toLowerCase() || "";
      const isExcel = fileType.includes("spreadsheet") || 
                      fileType.includes("excel") || 
                      fileType.includes("xlsx") || 
                      fileType.includes("xls");
      return isExcel && doc.extractedData;
    });
  }, [documents]);
  
  // Get active document
  const activeDocument = useMemo(() => {
    if (!activeDocumentId && excelDocuments.length > 0) {
      // Use most recent document if none selected
      return excelDocuments.sort((a, b) => 
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      )[0];
    }
    return excelDocuments.find(doc => doc._id === activeDocumentId) || null;
  }, [excelDocuments, activeDocumentId]);
  
  // Query codified extraction for active document (to check confirmation status)
  const codifiedExtraction = useQuery(
    api.codifiedExtractions.getByDocument,
    activeDocument ? { documentId: activeDocument._id } : "skip"
  );
  
  // Get client name for selected project
  const clientName = useMemo(() => {
    if (!selectedProject || !clients) return null;
    if (!selectedProject.clientRoles || selectedProject.clientRoles.length === 0) return null;
    const firstClientId = selectedProject.clientRoles[0].clientId;
    const client = clients.find(c => c._id === firstClientId);
    return client?.name || null;
  }, [selectedProject, clients]);

  // Get unique clients and projects for dropdowns
  const uniqueClients = useMemo(() => {
    if (!projectsWithData || !clients) return [];
    const clientSet = new Set<string>();
    (projectsWithData as any[]).forEach((project: any) => {
      if (!project?.clientRoles || project.clientRoles.length === 0) return;
      const firstClientId = project.clientRoles[0].clientId;
      const client = clients.find(c => c._id === firstClientId);
      const clientName = client?.name || 'Unknown Client';
      if (clientName && clientName !== 'No Client' && clientName !== 'Unknown Client') {
        clientSet.add(clientName);
      }
    });
    return Array.from(clientSet).sort();
  }, [projectsWithData, clients]);

  // Get client name for a project
  const getClientName = (project: any) => {
    if (!project?.clientRoles || project.clientRoles.length === 0) return 'No Client';
    const firstClientId = project.clientRoles[0].clientId;
    const client = clients?.find(c => c._id === firstClientId);
    return client?.name || 'Unknown Client';
  };

  // Group projects by client for 3-level navigation
  const clientsWithProjects = useMemo(() => {
    if (!projectsWithData || !clients) return [];
    
    const clientMap = new Map<string, { name: string; projects: any[]; isNoClient?: boolean }>();
    
    (projectsWithData as any[]).forEach((project: any) => {
      const clientName = getClientName(project);
      // Include all projects, even those without clients
      const displayName = (clientName === 'No Client' || clientName === 'Unknown Client') ? 'No Client' : clientName;
      
      if (!clientMap.has(displayName)) {
        clientMap.set(displayName, { 
          name: displayName, 
          projects: [],
          isNoClient: displayName === 'No Client'
        });
      }
      clientMap.get(displayName)!.projects.push(project);
    });
    
    // Sort clients alphabetically, but put "No Client" at the end
    // Sort projects within each client by name
    return Array.from(clientMap.values())
      .sort((a, b) => {
        if (a.isNoClient) return 1;
        if (b.isNoClient) return -1;
        return a.name.localeCompare(b.name);
      })
      .map(client => ({
        ...client,
        projects: client.projects.sort((a: any, b: any) => a.name.localeCompare(b.name))
      }));
  }, [projectsWithData, clients]);

  // Get projects for selected client
  const projectsForSelectedClient = useMemo(() => {
    if (!selectedClientName || !clientsWithProjects) return [];
    const client = clientsWithProjects.find(c => c.name === selectedClientName);
    return client?.projects || [];
  }, [selectedClientName, clientsWithProjects]);
  
  const uniqueProjects = useMemo(() => {
    if (!projectsWithData) return [];
    return (projectsWithData as any[]).map((p: any) => p.name).sort();
  }, [projectsWithData]);

  // Handle scenario selection
  useEffect(() => {
    // If we're viewing a standalone document, don't override it
    if (isStandaloneDocument) {
      return;
    }
    
    if (selectedScenario) {
      // When a scenario is selected, ALWAYS use scenario data (never extracted data)
      if (selectedScenario.data && Array.isArray(selectedScenario.data) && selectedScenario.data.length > 0) {
        // Check if it's a proper grid (not just a single cell)
        if (selectedScenario.data.length === 1 && selectedScenario.data[0]?.length === 1 && selectedScenario.data[0][0] === '') {
          // Single empty cell - initialize with blank 50x10 grid
          const blankGrid = Array.from({ length: 50 }, () => Array.from({ length: 10 }, () => ''));
          setSpreadsheetData(blankGrid);
        } else {
          // Use the scenario's actual data
          setSpreadsheetData(selectedScenario.data);
        }
      } else {
        // Scenario exists but has no data - initialize with blank 50x10 grid
        const blankGrid = Array.from({ length: 50 }, () => Array.from({ length: 10 }, () => ''));
        setSpreadsheetData(blankGrid);
      }
    } else {
      // No scenario selected - reset to empty
      setSpreadsheetData([]);
    }
  }, [selectedScenario, isStandaloneDocument]);

  // Auto-save spreadsheet data - useCallback to prevent unnecessary re-renders
  const handleDataChange = useCallback(async (data: any[][]) => {
    setSpreadsheetData(data);
    if (selectedScenarioId) {
      try {
        await updateScenarioData({
          id: selectedScenarioId,
          data: data,
        });
      } catch (error) {
        console.error('Error auto-saving data:', error);
      }
    }
  }, [selectedScenarioId, updateScenarioData]);

  // Get latest model run for a scenario
  const getLatestRun = (scenarioId: Id<"scenarios">) => {
    if (!modelRuns) return null;
    const runsForScenario = modelRuns.filter(r => r.scenarioId === scenarioId);
    if (runsForScenario.length === 0) return null;
    return runsForScenario.sort((a, b) => b.version - a.version)[0];
  };

  // Handle Run Model from Template Library
  const handleRunModel = useCallback(async (templateId: Id<"modelingTemplates">, quickExportMode: boolean = false) => {
    if (!activeDocument?.extractedData || !selectedProjectId) {
      alert('Please select a project with extracted data first.');
      return;
    }
    
    // Check if codified extraction exists and is confirmed
    if (codifiedExtraction) {
      if (!codifiedExtraction.isFullyConfirmed) {
        const pendingCount = (codifiedExtraction.mappingStats?.pendingReview || 0) + 
                           (codifiedExtraction.mappingStats?.suggested || 0);
        alert(`${pendingCount} items need confirmation before running the model.\n\nPlease review and confirm the code mappings in the Data Library first.`);
        return;
      }
    } else {
      // No codified extraction - warn but allow (will use raw data)
      console.warn('No codified extraction found. Running model with raw extracted data.');
    }
    
    // QUICK EXPORT MODE: Server-side population and direct download
    if (quickExportMode && codifiedExtraction?.items) {
      setIsQuickExporting(true);
      try {
        console.log('[QuickExport] Starting quick export for template:', templateId);
        
        const response = await fetch('/api/quick-export', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            templateId,
            codifiedItems: codifiedExtraction.items,
            documentName: activeDocument.fileName.replace(/\.[^/.]+$/, ''), // Remove extension
            templateName: selectedTemplate?.name,
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Quick export failed');
        }
        
        // Get the file blob and trigger download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Get filename from Content-Disposition header or generate one
        const disposition = response.headers.get('Content-Disposition');
        let filename = 'export.xlsm';
        if (disposition) {
          const match = disposition.match(/filename="(.+)"/);
          if (match) {
            filename = match[1];
          }
        }
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        // Log stats from headers
        const statsHeader = response.headers.get('X-Population-Stats');
        if (statsHeader) {
          const stats = JSON.parse(statsHeader);
          console.log('[QuickExport] Population stats:', stats);
        }
        
        console.log('[QuickExport] Download triggered successfully');
      } catch (error) {
        console.error('[QuickExport] Error:', error);
        alert(`Quick export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsQuickExporting(false);
      }
      return;
    }
    
    // NORMAL MODE: Set template ID to trigger queries and load into WorkbookEditor
    setSelectedTemplateId(templateId);
    setViewMode('scenario');
  }, [activeDocument, selectedProjectId, codifiedExtraction, selectedTemplate]);

  // Handle Run Model for OPTIMIZED templates (new system)
  const handleRunOptimizedModel = useCallback(async (templateId: Id<"templateDefinitions">, quickExportMode: boolean = false) => {
    if (!activeDocument?.extractedData || !selectedProjectId) {
      alert('Please select a project with extracted data first.');
      return;
    }
    
    // Check if codified extraction exists and is confirmed
    if (codifiedExtraction) {
      if (!codifiedExtraction.isFullyConfirmed) {
        const pendingCount = (codifiedExtraction.mappingStats?.pendingReview || 0) + 
                           (codifiedExtraction.mappingStats?.suggested || 0);
        alert(`${pendingCount} items need confirmation before running the model.\n\nPlease review and confirm the code mappings in the Data Library first.`);
        return;
      }
    } else {
      console.warn('No codified extraction found.');
      return;
    }
    
    // QUICK EXPORT MODE for optimized templates
    if (quickExportMode && codifiedExtraction?.items) {
      setIsQuickExporting(true);
      try {
        console.log('[QuickExport] Starting quick export for optimized template:', templateId);
        
        const response = await fetch('/api/quick-export', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            templateId,
            templateType: 'optimized',
            codifiedItems: codifiedExtraction.items,
            documentName: activeDocument.fileName.replace(/\.[^/.]+$/, ''),
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Quick export failed');
        }
        
        // Get the file blob and trigger download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Get filename from Content-Disposition header or generate one
        const disposition = response.headers.get('Content-Disposition');
        let filename = 'export.xlsm';
        if (disposition) {
          const match = disposition.match(/filename="(.+)"/);
          if (match) {
            filename = match[1];
          }
        }
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        // Log stats from headers
        const statsHeader = response.headers.get('X-Population-Stats');
        if (statsHeader) {
          const stats = JSON.parse(statsHeader);
          console.log('[QuickExport] Population stats:', stats);
        }
        
        console.log('[QuickExport] Download triggered successfully');
      } catch (error) {
        console.error('[QuickExport] Error:', error);
        alert(`Quick export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsQuickExporting(false);
      }
      return;
    }
    
    // NORMAL MODE for optimized templates - show message for now
    alert('Interactive mode for optimized templates is coming soon. Please use Quick Export mode for now.');
  }, [activeDocument, selectedProjectId, codifiedExtraction]);
  
  // Effect to load template when selectedTemplateId and URL are available
  useEffect(() => {
    if (!selectedTemplateId || !selectedTemplateUrl || !selectedTemplate || !activeDocument?.extractedData) {
      return;
    }
    
    const loadTemplate = async () => {
      setIsLoadingTemplate(true);
      try {
        // Load template metadata
        const lazyData = await loadExcelTemplateMetadata(selectedTemplateUrl);
        
        if (lazyData.metadata.length === 0) {
          alert('Template loaded but no sheets were found.');
          setIsLoadingTemplate(false);
          return;
        }
        
        // Store workbook and metadata for lazy loading
        setLazyWorkbook(lazyData.workbook);
        setLazyMetadata(lazyData.metadata);
        setLoadedSheets(new Set());
        
        // Load ALL sheets for population (needed for category fallbacks on other sheets)
        const firstSheetName = lazyData.metadata[0].name;
        console.log('[ModelingPage] Loading all sheets for population...');
        
        const initialSheets: SheetData[] = lazyData.metadata.map(meta => {
          try {
            console.log(`[ModelingPage] Loading sheet: ${meta.name}`);
            return loadSheetData(lazyData.workbook, meta.name, meta);
          } catch (error) {
            console.error(`[ModelingPage] Failed to load sheet ${meta.name}:`, error);
            return {
              name: meta.name,
              data: [],
              columnWidths: meta.columnWidths,
            };
          }
        });
        
        console.log('[ModelingPage] All sheets loaded:', initialSheets.map(s => `${s.name} (${s.data?.length || 0} rows)`).join(', '));
        
        setTemplateSheets(initialSheets);
        setLoadedSheets(new Set(lazyData.metadata.map(m => m.name)));
        setSelectedSheet(firstSheetName);
        setViewMode('scenario');
        
        // Build placeholder config from database mappings
        let placeholderConfig;
        if (codeMappings && codeMappings.length > 0 && selectedTemplate) {
          // Get mappings for this template's placeholder codes
          const templateCodes = selectedTemplate.placeholderCodes || [];
          const relevantMappings = codeMappings.filter(m => 
            templateCodes.includes(m.inputCode)
          );
          if (relevantMappings.length > 0) {
            placeholderConfig = buildPlaceholderConfigFromMappings(relevantMappings);
          } else {
            // Fallback to default config
            placeholderConfig = getPlaceholderConfig(selectedTemplate.modelType);
          }
        } else if (selectedTemplate) {
          // Fallback to default config
          placeholderConfig = getPlaceholderConfig(selectedTemplate.modelType);
        } else {
          placeholderConfig = getPlaceholderConfig('appraisal');
        }
        
        // Populate template with codified data (preferred) or fall back to legacy extracted data
        if (codifiedExtraction?.isFullyConfirmed && codifiedExtraction.items && codifiedExtraction.items.length > 0) {
          // Use the new codified data system
          console.log('[ModelingPage] Using codified data for template population');
          console.log('[ModelingPage] Codified items:', codifiedExtraction.items.length);
          
          const codifiedResult = populateTemplateWithCodifiedData(
            initialSheets,
            codifiedExtraction.items as CodifiedItem[]
          );
          
          // Convert to legacy format for UI compatibility
          const result = toLegacyPopulationResult(codifiedResult);
          setPopulationResult(result);
          setTemplateSheets(result.sheets);
          
          // Check for overflow warnings (items that couldn't fit in category fallback slots)
          const overflowSummary = getOverflowSummary(codifiedResult);
          setOverflowWarnings(overflowSummary);
          
          console.log('[ModelingPage] Codified population result:', {
            matched: codifiedResult.stats.matched,
            unmatched: codifiedResult.stats.unmatched,
            fallbacksInserted: codifiedResult.stats.fallbacksInserted,
            overflow: codifiedResult.stats.overflowCount,
          });
          
          // Count remaining placeholders for cleanup UI
          const remaining = countRemainingPlaceholders(result.sheets);
          setRemainingPlaceholders(remaining);
          
          if (overflowSummary.length > 0) {
            console.warn('[ModelingPage] Overflow warnings:', overflowSummary);
          }
        } else if (activeDocument.extractedData) {
          // Legacy fallback - use path-based extraction
          console.log('[ModelingPage] Using legacy extracted data for template population');
          const result = populateTemplateWithPlaceholders(
            initialSheets,
            activeDocument.extractedData as any,
            placeholderConfig
          );
          setPopulationResult(result);
          setTemplateSheets(result.sheets);
        }
        
        // All sheets already loaded above - no need for background loading
      } catch (error) {
        console.error('Failed to load template:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        alert(`Failed to load template: ${errorMessage}`);
      } finally {
        setIsLoadingTemplate(false);
      }
    };
    
    loadTemplate();
  }, [selectedTemplateId, selectedTemplateUrl, selectedTemplate, activeDocument, codeMappings, codifiedExtraction]);

  // Handle Run Appraisal Model (legacy - kept for backward compatibility)
  const handleRunAppraisalModel = useCallback(async () => {
    if (!effectiveTemplateData?.url) {
      console.error('Template not found');
      return;
    }

    setIsLoadingTemplate(true);
    try {
      console.log('Starting template load from:', effectiveTemplateData.url);
      console.log('Template URL type:', typeof effectiveTemplateData.url);
      
      // Load only metadata first (much faster - lazy loading)
      const lazyData = await loadExcelTemplateMetadata(effectiveTemplateData.url);
      
      console.log('Template metadata loaded successfully!');
      console.log('Number of sheets:', lazyData.metadata.length);
      console.log('Sheet names:', lazyData.metadata.map(s => s.name));
      
      if (lazyData.metadata.length === 0) {
        console.warn('No sheets found in template!');
        alert('Template loaded but no sheets were found. Please check the file.');
        setIsLoadingTemplate(false);
        return;
      }
      
      // Store workbook and metadata for lazy loading
      setLazyWorkbook(lazyData.workbook);
      setLazyMetadata(lazyData.metadata);
      setLoadedSheets(new Set());
      
      // Load first sheet immediately so user sees something
      const firstSheetName = lazyData.metadata[0].name;
      console.log('Loading first sheet:', firstSheetName);
      const firstSheet = loadSheetData(lazyData.workbook, firstSheetName, lazyData.metadata[0]);
      
      // Create initial sheets array with first sheet loaded
      const initialSheets: SheetData[] = lazyData.metadata.map(meta => {
        if (meta.name === firstSheetName) {
          return firstSheet; // Use loaded sheet
        }
        // Create empty placeholder - will be loaded in background
        return {
          name: meta.name,
          data: [], // Empty - will load in background
          columnWidths: meta.columnWidths,
        };
      });
      
      setTemplateSheets(initialSheets);
      setLoadedSheets(new Set([firstSheetName]));
      
      // Switch to first sheet tab
      // Set first sheet as selected and switch to input tab
      console.log('Setting selected sheet to:', firstSheetName);
      setSelectedSheet(firstSheetName);
      setActiveTab('input');
      
      // Load remaining sheets in background after a short delay
      setTimeout(() => {
        console.log('Starting background loading of remaining sheets...');
        const remainingSheets = lazyData.metadata.filter(meta => meta.name !== firstSheetName);
        
        remainingSheets.forEach((meta, index) => {
          // Stagger loading slightly to avoid blocking
          setTimeout(() => {
            try {
              console.log(`Loading sheet ${index + 1}/${remainingSheets.length}: ${meta.name}`);
              const loadedSheet = loadSheetData(lazyData.workbook, meta.name, meta);
              
              setTemplateSheets(prevSheets => {
                if (!prevSheets) return prevSheets;
                return prevSheets.map(sheet => 
                  sheet.name === meta.name ? loadedSheet : sheet
                );
              });
              
              setLoadedSheets(prev => new Set([...prev, meta.name]));
              console.log(`✓ Loaded sheet: ${meta.name}`);
            } catch (error) {
              console.error(`Failed to load sheet ${meta.name}:`, error);
            }
          }, index * 50); // 50ms delay between each sheet
        });
      }, 500); // Start background loading after 500ms
    } catch (error) {
      console.error('Failed to load template:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        url: effectiveTemplateData.url
      });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to load template: ${errorMessage}\n\nPlease check:\n1. The file URL is accessible\n2. The file format is valid Excel (.xlsx)\n3. Browser console for more details`);
    } finally {
      setIsLoadingTemplate(false);
    }
  }, [effectiveTemplateData, activeDocument, selectedProjectId]);

  // Handle Run Operating Model
  const handleRunOperatingModel = useCallback(async () => {
    if (!activeDocument?.extractedData) {
      console.error('No extracted data available');
      alert('Please select a project with extracted data first.');
      return;
    }

    setIsLoadingTemplate(true);
    try {
      // Load the test template from public folder
      // In Next.js, files in public folder are served from root
      const templateUrl = window.location.origin + OPERATING_TEMPLATE_PATH;
      console.log('Loading template from:', templateUrl);
      const workbook = await loadExcelTemplate(templateUrl);
      
      console.log('Operating model template loaded with', workbook.sheets.length, 'sheets');
      
      // Store original template (before population) for comparison
      setOriginalTemplateSheets(workbook.sheets.map(sheet => ({
        ...sheet,
        data: sheet.data.map(row => [...row]), // Deep copy
      })));
      
      // Populate templates with placeholders
      if (activeDocument.extractedData && selectedProjectId) {
        try {
          const placeholderConfig = getPlaceholderConfig('operating');
          const result = populateTemplateWithPlaceholders(
            workbook.sheets,
            activeDocument.extractedData as any,
            placeholderConfig
          );
          
          console.log('Operating model placeholder population result:', {
            matched: Array.from(result.matchedPlaceholders.entries()),
            unmatched: result.unmatchedPlaceholders,
            cleanup: result.cleanupReport,
          });
          
          // Show warnings for unmatched placeholders
          if (result.unmatchedPlaceholders.length > 0) {
            console.warn('Unmatched placeholders:', result.unmatchedPlaceholders);
          }
          
          // Show cleanup report
          if (result.cleanupReport.rowsHidden.length > 0 || result.cleanupReport.rowsDeleted.length > 0) {
            const totalCleaned = result.cleanupReport.rowsHidden.length + result.cleanupReport.rowsDeleted.length;
            console.log(`Cleaned up ${totalCleaned} unpopulated rows`);
          }
          
          setPopulationResult(result);
          setTemplateSheets(result.sheets);
        } catch (error) {
          console.error('Error populating placeholders:', error);
          // Fall back to unpopulated sheets
          setTemplateSheets(workbook.sheets);
        }
        } else {
          // No extracted data, use sheets as-is
          setTemplateSheets(workbook.sheets);
        }
      
      // Switch to original template tab if we stored it (operating model with data), otherwise populated tab
      if (workbook.sheets.length > 0) {
        // If we have extracted data, we stored the original template, so show that first
        if (activeDocument.extractedData && selectedProjectId) {
          setActiveTab(`${workbook.sheets[0].name}-original`);
        } else {
          setActiveTab(workbook.sheets[0].name);
        }
      }
    } catch (error) {
      console.error('Failed to load operating model template:', error);
      alert('Failed to load operating model template. Please try again.');
    } finally {
      setIsLoadingTemplate(false);
    }
  }, [activeDocument, selectedProjectId]);

  // Handle workbook data changes
  const handleWorkbookDataChange = useCallback((sheetName: string, data: any[][]) => {
    // Update the specific sheet in templateSheets
    setTemplateSheets(prev => {
      if (!prev) return prev;
      return prev.map(sheet => 
        sheet.name === sheetName ? { ...sheet, data } : sheet
      );
    });
  }, []); // No dependencies needed - using functional setState

  // Handle export to Excel - works for both templates and regular data
  const handleExportToExcel = useCallback(() => {
    // Check if we have template sheets (workbook mode)
    if (templateSheets && templateSheets.length > 0) {
      const fileName = `workbook-${selectedScenarioId || 'export'}-${new Date().toISOString().split('T')[0]}.xlsx`;
      exportToExcel(templateSheets, fileName, exportMetadata || {});
      return;
    }
    
    // Check if we have regular spreadsheet data (data editor mode)
    if (spreadsheetData && spreadsheetData.length > 0) {
      const sheets: SheetData[] = [{
        name: 'Sheet1',
        data: spreadsheetData
      }];
      const fileName = `data-${selectedScenarioId || 'export'}-${new Date().toISOString().split('T')[0]}.xlsx`;
      exportToExcel(sheets, fileName, exportMetadata || {});
      return;
    }
    
    alert('No data to export.');
  }, [templateSheets, spreadsheetData, selectedScenarioId, exportMetadata]);

  // Handle clearing unused placeholders
  const handleClearUnusedPlaceholders = useCallback(() => {
    if (!templateSheets || templateSheets.length === 0) {
      alert('No template loaded.');
      return;
    }
    
    const { sheets: cleanedSheets, clearedCount, clearedPlaceholders } = clearUnusedPlaceholders(templateSheets);
    
    if (clearedCount === 0) {
      alert('No unused placeholders found.');
      return;
    }
    
    // Update the template sheets with cleaned version
    setTemplateSheets(cleanedSheets);
    
    // Update remaining placeholders count
    const remaining = countRemainingPlaceholders(cleanedSheets);
    setRemainingPlaceholders(remaining);
    
    // Show confirmation
    console.log(`[ModelingPage] Cleared ${clearedCount} placeholders:`, clearedPlaceholders);
    alert(`Cleared ${clearedCount} unused placeholder(s) from the template.`);
  }, [templateSheets]);

  // Handle refresh population - re-run codified template population
  const handleRefreshPopulation = useCallback(() => {
    if (!templateSheets || templateSheets.length === 0) {
      alert('No template loaded.');
      return;
    }
    
    if (!originalTemplateSheets || originalTemplateSheets.length === 0) {
      alert('No original template to refresh from.');
      return;
    }
    
    // Use codified data if available (confirmed or matched items)
    if (codifiedExtraction?.items && codifiedExtraction.items.length > 0) {
      // Filter to only confirmed/matched items for population
      const usableItems = codifiedExtraction.items.filter(
        item => item.mappingStatus === 'matched' || item.mappingStatus === 'confirmed'
      );
      
      console.log('[ModelingPage] Refreshing with codified data...');
      console.log('[ModelingPage] Total items:', codifiedExtraction.items.length, '| Usable (confirmed/matched):', usableItems.length);
      
      if (usableItems.length === 0) {
        alert('No confirmed or matched items available. Please confirm items in the Data Library first.');
        return;
      }
      
      // Use original template sheets to start fresh
      const codifiedResult = populateTemplateWithCodifiedData(
        originalTemplateSheets,
        usableItems as CodifiedItem[]
      );
      
      // Convert to legacy format for UI compatibility
      const result = toLegacyPopulationResult(codifiedResult);
      setPopulationResult(result);
      setTemplateSheets(result.sheets);
      
      // Check for overflow warnings
      const overflowSummary = getOverflowSummary(codifiedResult);
      setOverflowWarnings(overflowSummary);
      
      // Count remaining placeholders
      const remaining = countRemainingPlaceholders(result.sheets);
      setRemainingPlaceholders(remaining);
      
      console.log('[ModelingPage] Refresh population result:', {
        matched: codifiedResult.stats.matched,
        unmatched: codifiedResult.stats.unmatched,
        fallbacksInserted: codifiedResult.stats.fallbacksInserted,
        overflow: codifiedResult.stats.overflowCount,
        remaining: remaining.total,
      });
    } else {
      alert('No codified data available. Please run extraction and codification first.');
    }
  }, [templateSheets, originalTemplateSheets, codifiedExtraction]);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50">
      {/* Left Sidebar - Projects List */}
      <div className={`${isSidebarMinimized ? 'w-16' : 'w-56'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out relative overflow-visible z-30`}>
        {/* Minimize Toggle Button */}
        <button
          onClick={() => setIsSidebarMinimized(!isSidebarMinimized)}
          className="absolute -right-3 top-4 z-10 p-1 bg-white border border-gray-200 rounded-full shadow-sm hover:bg-gray-50 transition-colors"
          title={isSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
        >
          {isSidebarMinimized ? (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {!isSidebarMinimized ? (
          <>
            {/* Level 1 Header - Clients */}
            {sidebarView === 'clients' && (
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-gray-900">Modeling</h2>
                  <button
                    onClick={() => {
                      setIsSettingsOpen(true);
                      setViewMode('settings');
                    }}
                    className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                    title="Modeling Settings"
                  >
                    <Settings className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Select a client to view projects
                </p>
              </div>
            )}

            {/* Level 2 Header - Projects */}
            {sidebarView === 'projects' && (
              <div className="border-b border-gray-200">
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    onClick={() => {
                      setSidebarView('clients');
                      setSelectedClientName(null);
                    }}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>All Clients</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsSettingsOpen(true);
                      setViewMode('settings');
                    }}
                    className="p-1.5 hover:bg-gray-200 rounded-md transition-colors"
                    title="Modeling Settings"
                  >
                    <Settings className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
                <div className={`px-4 py-3 border-t border-gray-200 ${
                  selectedClientName === 'No Client' ? 'bg-amber-50' : 'bg-gray-50'
                }`}>
                  <div className={`font-medium ${
                    selectedClientName === 'No Client' ? 'text-amber-700 italic' : 'text-gray-900'
                  }`}>{selectedClientName}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {projectsForSelectedClient.length} project{projectsForSelectedClient.length !== 1 ? 's' : ''}
                    {selectedClientName === 'No Client' && (
                      <span className="block text-amber-600 mt-1">Assign these projects to a client</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Level 3 Header - Models */}
            {sidebarView === 'models' && (
              <div className="border-b border-gray-200">
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    onClick={() => {
                      setSidebarView('projects');
                      setSelectedProjectId(null);
                      setTemplateSheets(null);
                    }}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>{selectedClientName}</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsSettingsOpen(true);
                      setViewMode('settings');
                    }}
                    className="p-1.5 hover:bg-gray-200 rounded-md transition-colors"
                    title="Modeling Settings"
                  >
                    <Settings className="w-4 h-4 text-gray-600" />
                  </button>
                </div>

                {/* Unassigned Project Banner - Only show for "No Client" projects */}
                {selectedClientName === 'No Client' && selectedProjectId && (
                  <button
                    onClick={() => setIsAssignClientModalOpen(true)}
                    className="w-full px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center gap-2 hover:bg-amber-100 transition-colors text-left"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span className="text-xs text-amber-700 flex-1 truncate">Unassigned</span>
                    <span className="text-xs text-amber-600 font-medium flex-shrink-0">Assign →</span>
                  </button>
                )}

                <div className={`px-4 py-3 border-t border-gray-200 flex items-center justify-between ${
                  selectedClientName === 'No Client' ? 'bg-amber-50/50' : 'bg-gray-50'
                }`}>
                  <div>
                    <div className="font-medium text-gray-900">{selectedProject?.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Saved models</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewMode('data-library')}
                    className="text-xs h-7"
                  >
                    Data Library
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-2 border-b border-gray-200 flex justify-center">
            <Calculator className="w-5 h-5 text-gray-600" />
          </div>
        )}

        {/* Level 1: Clients List */}
        {!isSidebarMinimized && sidebarView === 'clients' && (
          <div className="flex-1 overflow-y-auto animate-in slide-in-from-left-2 duration-200">
            {clientsWithProjects === undefined || clientsWithProjects.length === 0 ? (
              projectsWithData === undefined ? (
                <div className="p-4 text-sm text-gray-500">Loading...</div>
              ) : (
                <div className="p-4 text-sm text-gray-500">
                  No clients with extracted data found.
                </div>
              )
            ) : (
              <div className="divide-y divide-gray-200">
                {clientsWithProjects.map((client) => (
                  <div key={client.name} className="group relative">
                    <button
                      onClick={() => {
                        setSelectedClientName(client.name);
                        setSidebarView('projects');
                      }}
                      className={`w-full text-left p-4 hover:bg-gray-50 transition-colors group ${
                        client.isNoClient ? 'bg-amber-50/50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium mb-1 ${
                            client.isNoClient ? 'text-amber-700 italic' : 'text-gray-900'
                          }`}>
                            {client.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {client.projects.length} project{client.projects.length !== 1 ? 's' : ''}
                            {client.isNoClient && (
                              <span className="ml-1.5 text-amber-600">• needs assignment</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Level 2: Projects for Selected Client */}
        {!isSidebarMinimized && sidebarView === 'projects' && selectedClientName && (
          <div className="flex-1 overflow-y-auto animate-in slide-in-from-right-2 duration-200">
            {projectsForSelectedClient.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">
                No projects found for this client.
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {projectsForSelectedClient.map((project: any) => (
                  <div key={project._id} className="group relative">
                    <button
                      onClick={() => {
                        setSelectedProjectId(project._id);
                        setSelectedScenarioId(null);
                        setIsStandaloneDocument(false);
                        setSidebarView('models');
                        setViewMode('data-library');
                        // Set active document to most recent
                        if (excelDocuments && excelDocuments.length > 0) {
                          const mostRecent = excelDocuments.sort((a, b) => 
                            new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
                          )[0];
                          setActiveDocumentId(mostRecent._id);
                        }
                      }}
                      className="w-full text-left p-4 hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 mb-1">{project.name}</div>
                          <div className="text-xs text-gray-400 space-y-0.5">
                            {(project as any).extractionDate && (
                              <div>Extracted: {new Date((project as any).extractionDate).toLocaleDateString()}</div>
                            )}
                            {(project as any).lastModified && (
                              <div>Modified: {new Date((project as any).lastModified).toLocaleDateString()}</div>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Level 3: Saved Model Versions for Selected Project */}
        {!isSidebarMinimized && sidebarView === 'models' && selectedProjectId && (
          <div className="flex-1 overflow-y-auto animate-in slide-in-from-right-2 duration-200">
              {projectModelRuns === undefined ? (
                <div className="p-4 text-sm text-gray-500">Loading saved models...</div>
              ) : projectModelRuns.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 text-center">
                  <Calculator className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p>No saved models yet</p>
                  <p className="text-xs mt-1">Run a model and save it to see it here</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {projectModelRuns.map((run: any) => {
                    const templateName = run.metadata?.description 
                      || run.inputs?.templateName 
                      || run.modelType?.charAt(0).toUpperCase() + run.modelType?.slice(1) + ' Model';
                    const runDate = new Date(run.runAt);
                    
                    return (
                      <button
                        key={run._id}
                        onClick={() => {
                          // Load this saved version
                          if (run.inputs?.sheets) {
                            setTemplateSheets(run.inputs.sheets);
                            setSelectedSheet(run.inputs.sheets[0]?.name || null);
                            setViewMode('scenario');
                          }
                        }}
                        className="w-full text-left p-4 hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-900 truncate">
                            {templateName}
                          </span>
                          <Badge variant="secondary" className="text-xs flex-shrink-0 ml-2">
                            v{run.version}
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-500">
                          {runDate.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </div>
                        {run.versionName && (
                          <div className="text-xs text-gray-400 mt-1 font-mono">
                            {run.versionName}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
          </div>
        )}

        {/* Minimized view */}
        {isSidebarMinimized && (
          <div className="flex-1 overflow-y-auto py-2">
            {projectsWithData === undefined ? (
              <div className="flex justify-center p-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
              </div>
            ) : projectsWithData.length === 0 ? (
              <div className="flex justify-center p-2">
                <Calculator className="w-5 h-5 text-gray-400" />
              </div>
            ) : (
              <div className="space-y-1 px-2">
                {(projectsWithData as any[]).map((project: any) => (
                  <button
                    key={project._id}
                    onClick={() => {
                      setSelectedProjectId(project._id);
                      setIsSidebarMinimized(false);
                    }}
                    className={`w-full p-2 rounded-md transition-colors flex justify-center ${
                      selectedProjectId === project._id
                        ? 'bg-blue-100 text-blue-600'
                        : 'hover:bg-gray-100 text-gray-600'
                    }`}
                    title={project.name}
                  >
                    <Calculator className="w-5 h-5" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-white relative z-10" style={{ width: 0, minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
        {/* Settings View */}
        {viewMode === 'settings' ? (
          <ModelingSettings onClose={() => {
            setIsSettingsOpen(false);
            setViewMode('data-library');
          }} />
        ) : !selectedProjectId && !isStandaloneDocument ? (
          /* No Project Selected - Empty State */
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center w-full max-w-md px-4">
              <Calculator className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-lg mb-2">Select a project to begin modeling</p>
              <p className="text-sm mb-6">Choose a project with Excel extracted data from the sidebar</p>
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('New Document button clicked (empty state)');
                  const blankGrid = Array.from({ length: 50 }, () => Array.from({ length: 10 }, () => ''));
                  console.log('Created blank grid:', blankGrid.length, 'rows x', blankGrid[0]?.length, 'cols');
                  setSpreadsheetData(blankGrid);
                  setIsStandaloneDocument(true);
                  setSelectedProjectId(null);
                  setSelectedScenarioId(null);
                  setTemplateSheets(null);
                  setLazyWorkbook(null);
                  setLazyMetadata(null);
                  setLoadedSheets(new Set());
                  setActiveTab('input');
                  console.log('State updated, isStandaloneDocument should be true');
                }}
                className="w-full flex items-center justify-center gap-2"
                type="button"
              >
                <Plus className="w-4 h-4" />
                New Document
              </Button>
            </div>
          </div>
        ) : isLoadingTemplate ? (
          /* Loading State */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600">Loading template...</p>
              <p className="text-sm text-gray-500 mt-2">This may take a moment for large files</p>
            </div>
          </div>
        ) : viewMode === 'data-library' && selectedProjectId && excelDocuments.length > 0 ? (
          /* Data Library View - Clean, standalone */
          <DataLibrary
            projectId={selectedProjectId}
            clientName={clientName}
            documents={excelDocuments}
            activeDocumentId={activeDocumentId}
            onDocumentChange={(docId) => {
              setActiveDocumentId(docId);
              setViewMode('data-library');
            }}
            onModelSelect={handleRunModel}
            onOptimizedModelSelect={handleRunOptimizedModel}
            isModelDisabled={isLoadingTemplate || isQuickExporting}
            quickExportMode={isQuickExportMode}
            onQuickExportModeChange={setIsQuickExportMode}
          />
        ) : templateSheets && templateSheets.length > 0 ? (
          /* Model View - Toolbar + Status Bars + Workbook Editor */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Model View Toolbar */}
            <div 
              className="px-4 py-2 border-b border-gray-200 flex items-center gap-3 flex-shrink-0"
              style={{ 
                width: '100%', 
                maxWidth: '100%', 
                overflow: 'hidden',
                flexWrap: 'nowrap',
              }}
            >
              {/* Left side - Model name */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Calculator className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">
                  {selectedTemplate?.name || 'Model'}
                </span>
              </div>

              {/* Center actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setIsSaveModelModalOpen(true)}
                  disabled={!selectedProjectId || !templateSheets || templateSheets.length === 0}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="w-4 h-4" />
                  Save Model
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportToExcel}
                  className="flex items-center gap-2"
                  title="Export current data to Excel"
                >
                  <Download className="w-4 h-4" />
                  Export
                </Button>
                {/* Refresh Population - Re-runs codified template population */}
                {codifiedExtraction?.items && codifiedExtraction.items.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshPopulation}
                    className={`flex items-center gap-1 ${
                      codifiedExtraction.isFullyConfirmed 
                        ? 'text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700' 
                        : 'text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700'
                    }`}
                    title={codifiedExtraction.isFullyConfirmed 
                      ? "Re-run template population with codified data" 
                      : "Re-run population (some items not confirmed)"
                    }
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {/* Spacer */}
              <div className="flex-1 min-w-0" />

              {/* Right side - Sheet dropdown */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <label className="text-sm text-gray-600">Sheet:</label>
                <Select
                  value={selectedSheet || templateSheets[0]?.name || ''}
                  onValueChange={(value) => {
                    setSelectedSheet(value);
                    // Load sheet on demand if not already loaded
                    if (lazyWorkbook && lazyMetadata && templateSheets) {
                      const clickedSheet = templateSheets.find(s => s.name === value);
                      if (clickedSheet && (!clickedSheet.data || clickedSheet.data.length === 0)) {
                        const meta = lazyMetadata.find(m => m.name === value);
                        if (meta) {
                          console.log(`Loading sheet on demand: ${value}`);
                          try {
                            const loadedSheet = loadSheetData(lazyWorkbook, value, meta);
                            setTemplateSheets(prevSheets => {
                              if (!prevSheets) return prevSheets;
                              return prevSheets.map(sheet => 
                                sheet.name === value ? loadedSheet : sheet
                              );
                            });
                            setLoadedSheets(prev => new Set([...prev, value]));
                          } catch (error) {
                            console.error(`Failed to load sheet ${value} on demand:`, error);
                          }
                        }
                      }
                    }
                  }}
                >
                  <SelectTrigger className="w-[180px] h-8 text-sm">
                    <SelectValue placeholder="Select sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {templateSheets.map(sheet => (
                      <SelectItem key={sheet.name} value={sheet.name}>
                        {sheet.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Population Status - Only in model view */}
            {populationResult && (
              <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 text-sm flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-blue-900">
                      {populationResult.matchedPlaceholders.size} placeholders matched
                    </span>
                    {populationResult.unmatchedPlaceholders.length > 0 && (
                      <span className="text-orange-600">
                        ({populationResult.unmatchedPlaceholders.length} unmatched)
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsPlaceholderModalOpen(true)}
                      className="h-6 text-xs"
                    >
                      View Details
                    </Button>
                  </div>
                  <div className="flex items-center gap-3">
                    {remainingPlaceholders && remainingPlaceholders.total > 0 && (
                      <>
                        <span className="text-gray-600 text-xs">
                          {remainingPlaceholders.total} placeholder{remainingPlaceholders.total !== 1 ? 's' : ''} remaining
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleClearUnusedPlaceholders}
                          className="h-6 text-xs flex items-center gap-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                          Clear Unused
                        </Button>
                      </>
                    )}
                    {(populationResult.cleanupReport.rowsHidden.length > 0 || 
                      populationResult.cleanupReport.rowsDeleted.length > 0) && (
                      <span className="text-gray-600">
                        {populationResult.cleanupReport.rowsHidden.length + populationResult.cleanupReport.rowsDeleted.length} rows cleaned up
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Overflow Warnings - Only in model view */}
            {overflowWarnings.length > 0 && (
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm flex-shrink-0">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-amber-800">
                      Some items couldn&apos;t fit in template fallback slots:
                    </span>
                    <ul className="mt-1 space-y-0.5 text-amber-700">
                      {overflowWarnings.map((warning, idx) => (
                        <li key={idx} className="text-xs">• {warning}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-amber-600">
                      Consider adding more fallback rows to your template or reviewing these items.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Workbook Editor */}
            <div 
              className="flex-1 flex flex-col overflow-hidden" 
              style={{ width: '100%', maxWidth: '100%', minWidth: 0, height: '100%' }}
            >
              {selectedSheet ? (
                <div 
                  className="h-full w-full flex flex-col" 
                  style={{ 
                    width: '100%', 
                    maxWidth: '100%', 
                    minWidth: 0, 
                    overflow: 'hidden', 
                    flex: 1, 
                    height: '100%', 
                    minHeight: 0 
                  }}
                >
                  <div 
                    className="flex-1 overflow-hidden" 
                    style={{ flex: 1, minHeight: 0, height: '100%', width: '100%' }}
                  >
                    <WorkbookEditor
                      sheets={templateSheets}
                      activeSheet={selectedSheet}
                      hideTabs={true}
                      onDataChange={(sheetName, data) => {
                        handleWorkbookDataChange(sheetName, data);
                      }}
                      readOnly={false}
                      onExportMetadataReady={(metadata) => {
                        setExportMetadata({
                          hyperFormulaEngine: metadata.hyperFormulaEngine,
                          cellFormats: metadata.cellFormats,
                          numberFormats: metadata.numberFormats,
                          columnWidths: metadata.columnWidths,
                        });
                        setHyperFormulaEngine(metadata.hyperFormulaEngine);
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p>Please select a sheet from the dropdown</p>
                </div>
              )}
            </div>
          </div>
        ) : viewMode === 'scenario' && selectedScenarioId && spreadsheetData.length > 0 ? (
          /* Scenario Editor - ExcelDataEditor for editing scenario data */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">
                  {selectedScenario?.name || 'Scenario'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportToExcel}
                  className="flex items-center gap-2"
                  title="Export to Excel"
                >
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <ExcelDataEditor
                data={spreadsheetData}
                onDataChange={handleDataChange}
                readOnly={false}
              />
            </div>
          </div>
        ) : selectedProjectId && excelDocuments.length > 0 ? (
          /* Fallback Data Library View */
          <DataLibrary
            projectId={selectedProjectId}
            clientName={clientName}
            documents={excelDocuments}
            activeDocumentId={activeDocumentId || excelDocuments[0]._id}
            onDocumentChange={(docId) => {
              setActiveDocumentId(docId);
              setViewMode('data-library');
            }}
            onModelSelect={handleRunModel}
            onOptimizedModelSelect={handleRunOptimizedModel}
            isModelDisabled={isLoadingTemplate || isQuickExporting}
            quickExportMode={isQuickExportMode}
            onQuickExportModeChange={setIsQuickExportMode}
          />
        ) : (
          /* Empty State */
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center max-w-md px-4">
              <Calculator className="w-20 h-20 mx-auto mb-6 text-gray-400" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Select a Project</h3>
              <p className="text-sm text-gray-600 mb-8">Choose a project with extracted data from the sidebar to begin modeling</p>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedProjectId && (
        <CreateScenarioModal
          isOpen={isCreateScenarioOpen}
          onClose={() => setIsCreateScenarioOpen(false)}
          onSuccess={async (scenarioId?: Id<"scenarios">) => {
            setIsCreateScenarioOpen(false);
            if (scenarioId) {
              // Clear template sheets to ensure ExcelDataEditor mode is shown
              setTemplateSheets(null);
              setLazyWorkbook(null);
              setLazyMetadata(null);
              setLoadedSheets(new Set());
              // Set active tab to input
              setActiveTab('input');
              // Initialize with blank 50x10 grid for immediate display
              const blankGrid = Array.from({ length: 50 }, () => Array.from({ length: 10 }, () => ''));
              setSpreadsheetData(blankGrid);
              // Select the scenario (this will trigger the useEffect to load scenario data)
              setSelectedScenarioId(scenarioId);
            }
          }}
          projectId={selectedProjectId}
        />
      )}

      <SaveVersionModal
        isOpen={isSaveVersionOpen}
        onClose={() => setIsSaveVersionOpen(false)}
        onSuccess={() => {
          setIsSaveVersionOpen(false);
        }}
        scenarioId={selectedScenarioId}
        currentData={spreadsheetData}
        hyperFormulaEngine={hyperFormulaEngine}
        sheets={templateSheets || undefined}
      />

      <PlaceholderMappingModal
        isOpen={isPlaceholderModalOpen}
        onClose={() => setIsPlaceholderModalOpen(false)}
        populationResult={populationResult}
        extractedData={activeDocument?.extractedData}
      />

      {/* Scenarios List Modal */}
      {selectedProjectId && scenarios && (
        <ScenariosListModal
          isOpen={isScenariosModalOpen}
          onClose={() => setIsScenariosModalOpen(false)}
          scenarios={scenarios}
          modelRuns={modelRuns}
          selectedScenarioId={selectedScenarioId}
          onScenarioSelect={(scenarioId) => {
            setSelectedScenarioId(scenarioId);
            setIsStandaloneDocument(false);
            setViewMode('scenario');
          }}
          projectName={selectedProject?.name}
        />
      )}

      {/* Save Model Modal - for saving populated templates with versioning */}
      {selectedProjectId && templateSheets && templateSheets.length > 0 && (
        <SaveModelModal
          isOpen={isSaveModelModalOpen}
          onClose={() => setIsSaveModelModalOpen(false)}
          projectId={selectedProjectId}
          templateSheets={templateSheets}
          modelType={(selectedTemplate?.modelType as 'appraisal' | 'operating' | 'other') || 'appraisal'}
          templateName={selectedTemplate?.name}
          onSuccess={(result) => {
            console.log('[ModelingPage] Model saved:', result);
            // Keep the user on the current workbook - don't clear state
            // Optionally refresh the scenarios list
          }}
        />
      )}

      {/* Assign to Client Modal - for assigning unassigned projects */}
      {selectedProjectId && selectedProject && (
        <AssignToClientModal
          isOpen={isAssignClientModalOpen}
          onClose={() => setIsAssignClientModalOpen(false)}
          projectId={selectedProjectId}
          projectName={selectedProject.name}
          onSuccess={() => {
            // After assignment, the project should move to a new client
            // Go back to clients view to see the updated structure
            setSidebarView('clients');
            setSelectedClientName(null);
            setSelectedProjectId(null);
          }}
        />
      )}
    </div>
  );
}

