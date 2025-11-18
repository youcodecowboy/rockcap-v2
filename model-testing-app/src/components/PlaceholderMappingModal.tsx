'use client';

import { PopulationResult } from '@/lib/placeholderMapper';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Info } from 'lucide-react';

interface PlaceholderMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  populationResult: PopulationResult | null;
  extractedData?: any;
}

export default function PlaceholderMappingModal({
  isOpen,
  onClose,
  populationResult,
  extractedData,
}: PlaceholderMappingModalProps) {
  if (!populationResult) return null;

  const matchedEntries = Array.from(populationResult.matchedPlaceholders.entries());
  const unmatchedPlaceholders = populationResult.unmatchedPlaceholders;

  // Helper to get the actual value from extracted data
  const getValueForSource = (source: string): any => {
    if (!extractedData) return 'N/A';
    
    const parts = source.split('.');
    let current: any = extractedData;
    
    for (const part of parts) {
      if (current === undefined || current === null) return 'N/A';
      
      // Handle array notation
      if (part.includes('[]')) {
        const arrayKey = part.replace('[]', '');
        const array = current[arrayKey];
        if (Array.isArray(array)) {
          return `${array.length} items`;
        }
        return 'N/A';
      }
      
      // Handle array index
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, key, index] = arrayMatch;
        current = current[key];
        if (Array.isArray(current)) {
          current = current[parseInt(index, 10)];
        } else {
          return 'N/A';
        }
      } else {
        current = current[part];
      }
    }
    
    if (current === undefined || current === null) return 'N/A';
    if (typeof current === 'object') {
      return JSON.stringify(current);
    }
    return current;
  };

  // Format value for display
  const formatValue = (value: any): string => {
    if (value === 'N/A') return 'N/A';
    if (typeof value === 'number') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    }
    if (typeof value === 'string') {
      if (value.length > 50) {
        return value.substring(0, 50) + '...';
      }
      return value;
    }
    return String(value);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Placeholder Mapping Details</DialogTitle>
          <DialogDescription>
            View how placeholders were mapped to extracted data values
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="matched" className="w-full flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="matched" className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Matched ({matchedEntries.length})
            </TabsTrigger>
            <TabsTrigger value="unmatched" className="flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Unmatched ({unmatchedPlaceholders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matched" className="mt-4 flex-1 overflow-y-auto min-h-0">
            <div className="space-y-3 pr-2">
              {matchedEntries.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No placeholders were matched
                </div>
              ) : (
                matchedEntries.map(([placeholder, source], index) => {
                  const value = getValueForSource(source);
                  return (
                    <div
                      key={index}
                      className="border rounded-lg p-4 bg-green-50 border-green-200"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <Badge variant="outline" className="font-mono text-xs break-all">
                              {placeholder}
                            </Badge>
                            <span className="text-sm text-gray-600 flex-shrink-0">→</span>
                            <Badge variant="secondary" className="font-mono text-xs break-all">
                              {source}
                            </Badge>
                          </div>
                          <div className="mt-2">
                            <div className="text-xs text-gray-500 mb-1">Mapped Value:</div>
                            <div className="text-sm font-medium text-gray-900 break-words">
                              {formatValue(value)}
                            </div>
                          </div>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-1" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="unmatched" className="mt-4 flex-1 overflow-y-auto min-h-0">
            <div className="space-y-3 pr-2">
              {unmatchedPlaceholders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  All placeholders were matched successfully!
                </div>
              ) : (
                <>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-2">
                      <Info className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-yellow-800">
                        <strong>Note:</strong> These placeholders were found in the template but 
                        no matching data source was found in the extracted data. You may need to:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>Add these placeholders to the placeholder configuration</li>
                          <li>Ensure the extracted data contains the corresponding fields</li>
                          <li>Check for typos in placeholder names</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  {unmatchedPlaceholders.map((placeholder, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-4 bg-red-50 border-red-200"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <Badge variant="outline" className="font-mono text-xs break-all">
                            {placeholder}
                          </Badge>
                          <div className="mt-2 text-xs text-gray-600">
                            No matching data source found
                          </div>
                        </div>
                        <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-1" />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Cleanup Report */}
        {(populationResult.cleanupReport.rowsHidden.length > 0 ||
          populationResult.cleanupReport.rowsDeleted.length > 0) && (
          <div className="mt-4 pt-4 border-t flex-shrink-0">
            <div className="text-sm font-medium mb-2">Cleanup Report</div>
            <div className="text-xs text-gray-600">
              {populationResult.cleanupReport.rowsHidden.length + 
               populationResult.cleanupReport.rowsDeleted.length} rows cleaned up
              {populationResult.cleanupReport.sheetsAffected.length > 0 && (
                <span className="ml-2">
                  ({populationResult.cleanupReport.sheetsAffected.join(', ')})
                </span>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end flex-shrink-0">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

