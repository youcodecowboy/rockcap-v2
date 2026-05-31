'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Button, Modal, StatusPill, DataTable } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Upload, AlertCircle, CheckCircle2, X } from 'lucide-react';
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
  const colors = useColors();
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
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="CSV Client Import"
      width={680}
      footer={
        phase === 'preview' ? (
          <>
            <Button variant="secondary" onClick={reset}>
              <X size={14} />
              Cancel
            </Button>
            <Button variant="primary" accent={colors.entityTypes.client} onClick={handleImport} disabled={newCount === 0}>
              Import {newCount} Client{newCount !== 1 ? 's' : ''}
              {dupCount > 0 && ` (skip ${dupCount})`}
            </Button>
          </>
        ) : phase === 'complete' ? (
          <Button variant="primary" accent={colors.entityTypes.client} onClick={handleClose}>Done</Button>
        ) : undefined
      }
    >
      {/* Upload Phase */}
      {phase === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 16 }}>
          <div style={{ width: 64, height: 64, background: colors.bg.cardAlt, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Upload size={28} style={{ color: colors.text.dim }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 4 }}>
              Upload a CSV file with client names (one per row).
            </p>
            <p style={{ fontSize: 11, color: colors.text.dim }}>
              Header rows containing &quot;name&quot; or &quot;client&quot; will be skipped automatically.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <Button variant="primary" accent={colors.entityTypes.client} onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} />
            Select CSV File
          </Button>
        </div>
      )}

      {/* Preview Phase */}
      {phase === 'preview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusPill label={`${parsedClients.length} total`} tone={colors.text.muted} />
            <StatusPill label={`${newCount} new`} tone={colors.accent.green} />
            {dupCount > 0 && (
              <StatusPill label={`${dupCount} duplicate${dupCount !== 1 ? 's' : ''}`} tone={colors.accent.red} />
            )}
          </div>

          <div style={{ maxHeight: '45vh', overflowY: 'auto' }}>
            <DataTable
              rows={parsedClients.map((c, idx) => ({ ...c, idx }))}
              getRowKey={(r) => String(r.idx)}
              columns={[
                { key: 'num', header: '#', width: 50, mono: true, render: (r) => <span style={{ color: colors.text.dim }}>{r.idx + 1}</span> },
                { key: 'name', header: 'Name', render: (r) => <span style={{ fontWeight: 500, opacity: r.isDuplicate ? 0.5 : 1 }}>{r.name}</span> },
                { key: 'type', header: 'Type', width: 100, render: () => <StatusPill label="borrower" tone={colors.text.muted} /> },
                {
                  key: 'status',
                  header: 'Status',
                  width: 120,
                  render: (r) =>
                    r.isDuplicate ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <AlertCircle size={12} style={{ color: colors.accent.red }} />
                        <StatusPill label="Duplicate" tone={colors.accent.red} />
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={12} style={{ color: colors.accent.green }} />
                        <StatusPill label="Ready" tone={colors.accent.green} />
                      </span>
                    ),
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* Importing Phase */}
      {phase === 'importing' && (
        <div style={{ padding: '48px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, marginBottom: 4 }}>
              Importing clients...
            </p>
            <p style={{ fontSize: 11, color: colors.text.muted, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {importProgress}% complete
            </p>
          </div>
          <div style={{ width: '100%', height: 6, background: colors.bg.cardAlt, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${importProgress}%`, height: '100%', background: colors.entityTypes.client, transition: 'width 150ms linear' }} />
          </div>
        </div>
      )}

      {/* Complete Phase */}
      {phase === 'complete' && (
        <div style={{ padding: '48px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, background: `${colors.accent.green}15`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={24} style={{ color: colors.accent.green }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary }}>
                Import Complete
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                <StatusPill label={`${importResults.created} created`} tone={colors.accent.green} />
                {importResults.skipped > 0 && (
                  <StatusPill label={`${importResults.skipped} skipped`} tone={colors.text.muted} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
