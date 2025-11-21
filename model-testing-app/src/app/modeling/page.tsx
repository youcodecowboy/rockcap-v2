'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ChevronLeft, ChevronRight, Calculator, Play, Save, Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ExcelDataEditor from '@/components/ExcelDataEditor';
import WorkbookEditor from '@/components/WorkbookEditor';
import ModelOutputSummary from '@/components/ModelOutputSummary';
import CreateScenarioModal from '@/components/CreateScenarioModal';
import SaveVersionModal from '@/components/SaveVersionModal';
import PlaceholderMappingModal from '@/components/PlaceholderMappingModal';
import { loadExcelTemplate, loadExcelTemplateMetadata, loadSheetData, SheetData, exportToExcel, ExportOptions, SheetMetadata } from '@/lib/templateLoader';
import { populateTemplateWithPlaceholders, PopulationResult } from '@/lib/placeholderMapper';
import { getPlaceholderConfig } from '@/lib/placeholderConfigs';

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
  const [exportMetadata, setExportMetadata] = useState<ExportOptions | null>(null);
  const [hyperFormulaEngine, setHyperFormulaEngine] = useState<any>(null);

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

  // Mutations
  const updateScenarioData = useMutation(api.scenarios.updateData);

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

  // Get Excel document with extracted data for selected project
  const excelDocument = useMemo(() => {
    if (!documents) return null;
    return documents.find(doc => {
      const fileType = doc.fileType?.toLowerCase() || "";
      const isExcel = fileType.includes("spreadsheet") || 
                      fileType.includes("excel") || 
                      fileType.includes("xlsx") || 
                      fileType.includes("xls");
      return isExcel && doc.extractedData;
    });
  }, [documents]);

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
  
  const uniqueProjects = useMemo(() => {
    if (!projectsWithData) return [];
    return (projectsWithData as any[]).map((p: any) => p.name).sort();
  }, [projectsWithData]);
  
  // Get client name for a project
  const getClientName = (project: any) => {
    if (!project?.clientRoles || project.clientRoles.length === 0) return 'No Client';
    const firstClientId = project.clientRoles[0].clientId;
    const client = clients?.find(c => c._id === firstClientId);
    return client?.name || 'Unknown Client';
  };

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

  // Handle Run Appraisal Model
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
  }, [effectiveTemplateData, excelDocument, selectedProjectId]);

  // Handle Run Operating Model
  const handleRunOperatingModel = useCallback(async () => {
    if (!excelDocument?.extractedData) {
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
      if (excelDocument.extractedData && selectedProjectId) {
        try {
          const placeholderConfig = getPlaceholderConfig('operating');
          const result = populateTemplateWithPlaceholders(
            workbook.sheets,
            excelDocument.extractedData as any,
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
        if (excelDocument.extractedData && selectedProjectId) {
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
  }, [excelDocument, selectedProjectId]);

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
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Modeling</h2>
              
              {/* Filters */}
              <div className="space-y-2 mb-3">
                <Select value={clientFilter} onValueChange={setClientFilter}>
                  <SelectTrigger className="w-full h-8 text-sm">
                    <SelectValue placeholder="All clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All clients</SelectItem>
                    {uniqueClients.map(client => (
                      <SelectItem key={client} value={client}>{client}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="w-full h-8 text-sm">
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All projects</SelectItem>
                    {uniqueProjects.map((project: any) => (
                      <SelectItem key={project} value={project}>{project}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <p className="text-xs text-gray-500">
                Projects with Excel extracted data
              </p>
            </div>
          </>
        ) : (
          <div className="p-2 border-b border-gray-200 flex justify-center">
            <Calculator className="w-5 h-5 text-gray-600" />
          </div>
        )}

        {/* Projects List */}
        {!isSidebarMinimized && (
          <div className="flex-1 overflow-y-auto">
            {projectsWithData === undefined ? (
              <div className="p-4 text-sm text-gray-500">Loading...</div>
            ) : projectsWithData.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">
                No projects with Excel extracted data found.
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {(projectsWithData as any[])
                  .filter((project: any) => {
                    const clientName = getClientName(project);
                    const projectName = project.name;
                    const matchesClient = clientFilter === 'all' || clientName === clientFilter;
                    const matchesProject = projectFilter === 'all' || projectName === projectFilter;
                    return matchesClient && matchesProject;
                  })
                  .map((project: any) => {
                  const isSelected = selectedProjectId === project._id;
                  const clientName = getClientName(project);
                  const projectScenarios = scenarios?.filter(s => s.projectId === project._id) || [];
                  
                  return (
                    <div key={project._id} className="group relative">
                      <button
                        onClick={() => {
                          setSelectedProjectId(project._id);
                          setSelectedScenarioId(null);
                          setIsStandaloneDocument(false); // Clear standalone document when selecting a project
                        }}
                        className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                          isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                        }`}
                      >
                        <div className="font-medium text-gray-900 mb-1">{project.name}</div>
                        <div className="text-xs text-gray-500 mb-1">{clientName}</div>
                        <div className="text-xs text-gray-400 space-y-0.5">
                          {(project as any).extractionDate && (
                            <div>Extracted: {new Date((project as any).extractionDate).toLocaleDateString()}</div>
                          )}
                          {(project as any).lastModified && (
                            <div>Modified: {new Date((project as any).lastModified).toLocaleDateString()}</div>
                          )}
                        </div>
                        {projectScenarios.length > 0 && (
                          <div className="text-xs text-gray-400 mt-1">
                            {projectScenarios.length} scenario{projectScenarios.length !== 1 ? 's' : ''}
                          </div>
                        )}
                      </button>
                      
                      {/* Scenarios for this project */}
                      {isSelected && projectScenarios.length > 0 && (
                        <div className="bg-gray-50 border-t border-gray-200">
                          {projectScenarios.map((scenario) => {
                            const latestRun = getLatestRun(scenario._id);
                            const isScenarioSelected = selectedScenarioId === scenario._id;
                            
                            return (
                              <button
                                key={scenario._id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedScenarioId(scenario._id);
                                  setIsStandaloneDocument(false); // Clear standalone document when selecting a scenario
                                }}
                                className={`w-full text-left px-6 py-2 hover:bg-gray-100 transition-colors text-sm ${
                                  isScenarioSelected ? 'bg-blue-100 border-l-2 border-blue-600' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="font-medium text-gray-800">{scenario.name}</div>
                                  {latestRun && (
                                    <Badge variant="secondary" className="text-xs">
                                      v{latestRun.version}
                                    </Badge>
                                  )}
                                </div>
                                {scenario.description && (
                                  <div className="text-xs text-gray-500 mt-1 truncate">
                                    {scenario.description}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
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
        {/* Coming Soon Disclaimer */}
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm text-yellow-800 font-medium">
              Modeling section incomplete. Coming soon...
            </p>
          </div>
        </div>
        
        {!selectedProjectId && !isStandaloneDocument ? (
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
                  // Create a standalone blank document (not connected to any project)
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
        ) : (
          <>
            {/* Action Buttons */}
            <div className="p-4 border-b border-gray-200 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunAppraisalModel}
                disabled={isLoadingTemplate || !effectiveTemplateData}
                className="flex items-center gap-2"
                title={!effectiveTemplateData ? 'Upload test-sheet.xlsx to enable this feature' : 'Load appraisal model template (will include second sheet if available)'}
              >
                <Play className="w-4 h-4" />
                {isLoadingTemplate ? 'Loading...' : 'Run Appraisal Model'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunOperatingModel}
                disabled={isLoadingTemplate || !excelDocument?.extractedData}
                className="flex items-center gap-2"
                title={!excelDocument?.extractedData ? 'Select a project with extracted data to enable this feature' : 'Load operating model test template'}
              >
                <Play className="w-4 h-4" />
                {isLoadingTemplate ? 'Loading...' : 'Run Operating Model'}
              </Button>
              <Button
                variant="default"
                size="default"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('New Document button clicked');
                  // Create a standalone blank document (not connected to any project)
                  const blankGrid = Array.from({ length: 50 }, () => Array.from({ length: 10 }, () => ''));
                  console.log('Created blank grid:', blankGrid.length, 'rows x', blankGrid[0]?.length, 'cols');
                  setSpreadsheetData(blankGrid);
                  setIsStandaloneDocument(true);
                  setSelectedScenarioId(null);
                  setTemplateSheets(null);
                  setLazyWorkbook(null);
                  setLazyMetadata(null);
                  setLoadedSheets(new Set());
                  setActiveTab('input');
                  console.log('State updated, isStandaloneDocument should be true');
                }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                type="button"
              >
                <Plus className="w-4 h-4" />
                New Document
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={() => setIsCreateScenarioOpen(true)}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Scenario
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSaveVersionOpen(true)}
                disabled={!selectedScenarioId}
                className="flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Version
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportToExcel}
                disabled={(!templateSheets || templateSheets.length === 0) && (!spreadsheetData || spreadsheetData.length === 0)}
                className="flex items-center gap-2"
                title="Export current data to Excel"
              >
                <Download className="w-4 h-4" />
                Export to Excel
              </Button>
              {templateSheets && templateSheets.length > 0 && excelDocument?.extractedData && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (excelDocument?.extractedData && selectedProjectId) {
                      try {
                        const placeholderConfig = getPlaceholderConfig('appraisal');
                        const result = populateTemplateWithPlaceholders(
                          templateSheets,
                          excelDocument.extractedData as any,
                          placeholderConfig
                        );
                        setPopulationResult(result);
                        setTemplateSheets(result.sheets);
                        
                        // Show feedback
                        if (result.unmatchedPlaceholders.length > 0) {
                          console.warn('Unmatched placeholders:', result.unmatchedPlaceholders);
                        }
                        const totalCleaned = result.cleanupReport.rowsHidden.length + result.cleanupReport.rowsDeleted.length;
                        if (totalCleaned > 0) {
                          console.log(`Cleaned up ${totalCleaned} unpopulated rows`);
                        }
                      } catch (error) {
                        console.error('Error refreshing data:', error);
                        alert('Failed to refresh data. Please try again.');
                      }
                    }
                  }}
                  className="flex items-center gap-2"
                  title="Refresh template with latest extracted data"
                >
                  Refresh Data
                </Button>
              )}
            </div>
            
            {/* Population Status */}
            {populationResult && (
              <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 text-sm">
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
                  {(populationResult.cleanupReport.rowsHidden.length > 0 || 
                    populationResult.cleanupReport.rowsDeleted.length > 0) && (
                    <span className="text-gray-600">
                      {populationResult.cleanupReport.rowsHidden.length + populationResult.cleanupReport.rowsDeleted.length} rows cleaned up
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Loading State */}
            {isLoadingTemplate && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-gray-600">Loading template...</p>
                  <p className="text-sm text-gray-500 mt-2">This may take a moment for large files</p>
                </div>
              </div>
            )}

            {/* Tabs with Sheet Dropdown - when template is loaded */}
            {!isLoadingTemplate && !isStandaloneDocument && templateSheets && templateSheets.length > 0 ? (
              <Tabs 
                value={activeTab} 
                onValueChange={(value) => {
                  setActiveTab(value);
                }} 
                className="flex-1 flex flex-col overflow-hidden" 
                style={{ width: '100%', maxWidth: '100%', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
              >
                <div className="px-4 pt-4 border-b border-gray-200 flex-shrink-0 flex items-center gap-4">
                  {/* Sheet Dropdown */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Sheet:</label>
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
                      <SelectTrigger className="w-[250px]">
                        <SelectValue placeholder="Select a sheet" />
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
                  
                  {/* Input/Output Tabs */}
                  <TabsList>
                    <TabsTrigger value="input">Input</TabsTrigger>
                    <TabsTrigger value="output">Output</TabsTrigger>
                  </TabsList>
                </div>

                {/* Input Tab - Shows selected sheet */}
                <TabsContent value="input" className="flex-1 overflow-hidden mt-0 p-0" style={{ width: '100%', maxWidth: '100%', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  {selectedSheet ? (
                    <div className="h-full w-full flex flex-col" style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden', flex: 1, height: '100%', minHeight: 0 }}>
                      <div className="flex-1 overflow-hidden" style={{ flex: 1, minHeight: 0, height: '100%', width: '100%' }}>
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
                </TabsContent>

                {/* Output Tab */}
                <TabsContent value="output" className="flex-1 overflow-hidden mt-0">
                  <ModelOutputSummary
                    scenarioName={selectedScenario?.name}
                    modelType={getLatestRun(selectedScenarioId!)?.modelType || 'appraisal'}
                    version={getLatestRun(selectedScenarioId!)?.version}
                    versionName={getLatestRun(selectedScenarioId!)?.versionName}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="flex-1 flex flex-col overflow-hidden" style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
                <div className="px-4 pt-4 border-b border-gray-200">
                  <TabsList>
                    <TabsTrigger value="input">Input</TabsTrigger>
                    <TabsTrigger value="output">Output</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="input" className="flex-1 overflow-hidden mt-0 p-0" style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
                  <div className="h-full w-full" style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
                    {isStandaloneDocument ? (
                      // Standalone blank document - show Excel editor with blank 50x10 grid
                      <ExcelDataEditor
                        data={spreadsheetData.length > 0 ? spreadsheetData : Array.from({ length: 50 }, () => Array.from({ length: 10 }, () => ''))}
                        onDataChange={(data) => {
                          setSpreadsheetData(data);
                          // Don't auto-save standalone documents to scenarios
                        }}
                        readOnly={false}
                      />
                    ) : selectedScenario ? (
                      <ExcelDataEditor
                        data={spreadsheetData.length > 0 ? spreadsheetData : Array.from({ length: 50 }, () => Array.from({ length: 10 }, () => ''))}
                        onDataChange={handleDataChange}
                        readOnly={false}
                      />
                    ) : excelDocument?.extractedData ? (
                      <ExcelDataEditor
                        data={excelDocument.extractedData}
                        onDataChange={handleDataChange}
                        readOnly={false}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center max-w-md px-4">
                          <Calculator className="w-20 h-20 mx-auto mb-6 text-gray-400" />
                          <h3 className="text-xl font-semibold text-gray-900 mb-2">Create Your First Document</h3>
                          <p className="text-sm text-gray-600 mb-8">Start with a blank Excel-like spreadsheet. Use formulas, formatting, and all the features you're familiar with.</p>
                          <Button
                            onClick={() => {
                              const blankGrid = Array.from({ length: 50 }, () => Array.from({ length: 10 }, () => ''));
                              setSpreadsheetData(blankGrid);
                              setIsStandaloneDocument(true);
                              setSelectedScenarioId(null);
                              setTemplateSheets(null);
                            }}
                            size="lg"
                            className="flex items-center justify-center gap-2 px-8 py-6 text-lg"
                          >
                            <Plus className="w-5 h-5" />
                            New Document
                          </Button>
                          <p className="text-xs text-gray-500 mt-4">Or click "Run Appraisal Model" or "Run Operating Model" to load a template</p>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="output" className="flex-1 overflow-hidden mt-0">
                  <ModelOutputSummary
                    scenarioName={selectedScenario?.name}
                    modelType={getLatestRun(selectedScenarioId!)?.modelType || 'appraisal'}
                    version={getLatestRun(selectedScenarioId!)?.version}
                    versionName={getLatestRun(selectedScenarioId!)?.versionName}
                  />
                </TabsContent>
              </Tabs>
            )}
          </>
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
        extractedData={excelDocument?.extractedData}
      />
    </div>
  );
}

