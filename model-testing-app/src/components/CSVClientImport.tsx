'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Upload, FileText, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';

interface CSVClientImportProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ParsedClient {
  name: string;
  isDuplicate: boolean;
}

type ImportPhase = 'upload' | 'preview' | 'importing' | 'complete';

export default function CSVClientImport({
  isOpen,
  onClose,
  onSuccess,
}: CSVClientImportProps) {
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [parsedClients, setParsedClients] = useState<ParsedClient[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState({ created: 0, skipped: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingClients = useQuery(api.clients.list, {});
  const createClient = useMutation(api.clients.create);

  const reset = useCallback(() => {
    setPhase('upload');
    setParsedClients([]);
    setImportProgress(0);
    setImportResults({ created: 0, skipped: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const parseCSV = useCallback((text: string): string[] => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) return [];

    // Detect header row
    const firstLine = lines[0].toLowerCase().trim();
    const startIndex =
      firstLine.includes('name') || firstLine.includes('client') ? 1 : 0;

    const names: string[] = [];
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Take first column if CSV has commas, strip quotes
      let name: string;
      if (line.includes(',')) {
        name = line.split(',')[0];
      } else {
        name = line;
      }

      // Strip surrounding quotes
      name = name.replace(/^["']|["']$/g, '').trim();

      if (name) {
        names.push(name);
      }
    }

    return names;
  }, []);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const names = parseCSV(text);

        if (names.length === 0) {
          toast.error('No client names found in the CSV file.');
          return;
        }

        // Check for duplicates against existing clients
        const existingNames = new Set(
          (existingClients || []).map((c) => c.name.toLowerCase().trim())
        );

        const parsed: ParsedClient[] = names.map((name) => ({
          name,
          isDuplicate: existingNames.has(name.toLowerCase().trim()),
        }));

        setParsedClients(parsed);
        setPhase('preview');
      };

      reader.readAsText(file);
    },
    [parseCSV, existingClients]
  );

  const handleImport = useCallback(async () => {
    const toImport = parsedClients.filter((c) => !c.isDuplicate);
    const skipped = parsedClients.filter((c) => c.isDuplicate).length;

    if (toImport.length === 0) {
      toast.info('All clients already exist. Nothing to import.');
      return;
    }

    setPhase('importing');
    setImportProgress(0);
    let created = 0;

    for (let i = 0; i < toImport.length; i++) {
      try {
        await createClient({
          name: toImport[i].name,
          type: 'borrower',
          status: 'prospect',
        });
        created++;
      } catch (error) {
        console.error(`Failed to create client "${toImport[i].name}":`, error);
      }
      setImportProgress(Math.round(((i + 1) / toImport.length) * 100));
    }

    setImportResults({ created, skipped });
    setPhase('complete');

    if (created > 0) {
      toast.success(`Successfully imported ${created} client${created !== 1 ? 's' : ''}.`);
      onSuccess?.();
    }
  }, [parsedClients, createClient, onSuccess]);

  const newCount = parsedClients.filter((c) => !c.isDuplicate).length;
  const dupCount = parsedClients.filter((c) => c.isDuplicate).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            CSV Client Import
          </DialogTitle>
        </DialogHeader>

        {/* Upload Phase */}
        {phase === 'upload' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <Upload className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">
                Upload a CSV file with client names (one per row).
              </p>
              <p className="text-xs text-gray-400">
                Header rows containing &quot;name&quot; or &quot;client&quot; will be skipped automatically.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Select CSV File
            </Button>
          </div>
        )}

        {/* Preview Phase */}
        {phase === 'preview' && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <Badge variant="secondary">{parsedClients.length} total</Badge>
              <Badge variant="default" className="bg-green-600">{newCount} new</Badge>
              {dupCount > 0 && (
                <Badge variant="destructive">{dupCount} duplicate{dupCount !== 1 ? 's' : ''}</Badge>
              )}
            </div>

            <div className="flex-1 overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedClients.map((client, idx) => (
                    <TableRow
                      key={idx}
                      className={client.isDuplicate ? 'opacity-50' : ''}
                    >
                      <TableCell className="text-gray-400 text-xs">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        {client.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">borrower</Badge>
                      </TableCell>
                      <TableCell>
                        {client.isDuplicate ? (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Duplicate
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 border-green-200">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Ready
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between pt-3 border-t">
              <Button variant="outline" onClick={reset}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={newCount === 0}
              >
                Import {newCount} Client{newCount !== 1 ? 's' : ''}
                {dupCount > 0 && ` (skip ${dupCount})`}
              </Button>
            </div>
          </>
        )}

        {/* Importing Phase */}
        {phase === 'importing' && (
          <div className="py-12 px-4 space-y-4">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900 mb-1">
                Importing clients...
              </p>
              <p className="text-xs text-gray-500">
                {importProgress}% complete
              </p>
            </div>
            <Progress value={importProgress} className="w-full" />
          </div>
        )}

        {/* Complete Phase */}
        {phase === 'complete' && (
          <div className="py-12 px-4 space-y-4">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-900">
                  Import Complete
                </p>
                <div className="flex items-center gap-3 justify-center mt-2">
                  <Badge variant="default" className="bg-green-600">
                    {importResults.created} created
                  </Badge>
                  {importResults.skipped > 0 && (
                    <Badge variant="secondary">
                      {importResults.skipped} skipped
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-center pt-2">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
