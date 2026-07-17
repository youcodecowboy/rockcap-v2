'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button, Modal, StatusPill, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { toast } from 'sonner';
import {
  Folder,
  ChevronRight,
  ChevronLeft,
  FileText,
  Loader2,
  FolderInput,
  HardDrive,
} from 'lucide-react';

interface ImportFromDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: Id<'clients'>;
  clientName: string;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const IMPORT_FILES_CAP = 200; // matches importDriveFiles server cap

function formatSize(bytes?: number) {
  if (bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImportFromDriveModal({
  isOpen,
  onClose,
  clientId,
  clientName,
}: ImportFromDriveModalProps) {
  const colors = useColors();

  // undefined = viewing the mirror root. Drilling in sets a folder id.
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  // Dry-run result staged for the "import entire folder" confirm dialog.
  const [folderConfirm, setFolderConfirm] = useState<
    { driveFolderId: string; fileCount: number; alreadyImported: number; folders: number } | null
  >(null);
  const [confirmingFolder, setConfirmingFolder] = useState(false);

  const children = useQuery(
    api.driveSync.listFolderChildren,
    isOpen ? { parentFolderId: folderId } : 'skip',
  );

  const breadcrumb = children?.breadcrumb ?? [];
  const currentFolderId = folderId; // the folder whose subtree we import
  const atRoot = !folderId;

  // Candidates only load once a specific folder is chosen — the root subtree is
  // the whole drive, so we guide the operator to drill into a client folder.
  const candidates = useQuery(
    api.driveSync.listImportCandidates,
    isOpen && currentFolderId ? { driveFolderId: currentFolderId } : 'skip',
  );

  const importFiles = useMutation(api.driveSync.importDriveFiles);
  const importFolder = useMutation(api.driveSync.importDriveFolder);

  // At the root we show only folders that resolve to THIS client (their own
  // mapping or an inherited one). Drilled in, we show every subfolder so the
  // operator can navigate the client's subtree.
  const folders = useMemo(() => {
    const raw = children?.folders ?? [];
    return atRoot ? raw.filter((f) => f.effectiveClientId === clientId) : raw;
  }, [children, atRoot, clientId]);

  const resetAndClose = () => {
    setFolderId(undefined);
    setSelectedFileIds(new Set());
    setFolderConfirm(null);
    onClose();
  };

  const drillInto = (id: string | undefined) => {
    setFolderId(id);
    setSelectedFileIds(new Set());
  };

  const toggleFile = (id: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableFiles = (candidates?.files ?? []).filter((f) => !f.imported);
  const allSelectableSelected =
    selectableFiles.length > 0 && selectableFiles.every((f) => selectedFileIds.has(f.driveFileId));

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(selectableFiles.map((f) => f.driveFileId)));
    }
  };

  const summariseSkips = (skipped: { id?: string; reason: string; driveFileId?: string }[]) => {
    if (!skipped || skipped.length === 0) return '';
    const byReason = skipped.reduce<Record<string, number>>((acc, s) => {
      acc[s.reason] = (acc[s.reason] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(byReason)
      .map(([reason, n]) => `${n} ${reason.replace(/_/g, ' ')}`)
      .join(', ');
  };

  const handleImportSelected = async () => {
    const ids = Array.from(selectedFileIds);
    if (ids.length === 0) return;
    if (ids.length > IMPORT_FILES_CAP) {
      toast.error(`Select at most ${IMPORT_FILES_CAP} files at a time, or use "Import entire folder".`);
      return;
    }
    setImporting(true);
    try {
      const res = await importFiles({ driveFileIds: ids });
      const skipMsg = summariseSkips(res.skipped);
      toast.success(
        `Imported ${res.imported} file${res.imported !== 1 ? 's' : ''}${skipMsg ? ` · skipped ${skipMsg}` : ''}`,
      );
      setSelectedFileIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Step 1: dry run to surface the count before committing.
  const handleImportFolderDryRun = async () => {
    if (!currentFolderId) return;
    setImporting(true);
    try {
      const res = await importFolder({ driveFolderId: currentFolderId });
      if ('dryRun' in res && res.dryRun) {
        setFolderConfirm({
          driveFolderId: currentFolderId,
          fileCount: res.fileCount,
          alreadyImported: res.alreadyImported,
          folders: res.folders,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read the folder');
    } finally {
      setImporting(false);
    }
  };

  // Step 2: commit with confirm.
  const handleConfirmFolderImport = async () => {
    if (!folderConfirm) return;
    setConfirmingFolder(true);
    try {
      const res = await importFolder({ driveFolderId: folderConfirm.driveFolderId, confirm: true });
      if (!('dryRun' in res) || !res.dryRun) {
        const r = res as { imported: number; queuedForImport: number; skipped: { driveFileId: string; reason: string }[] };
        const skipMsg = summariseSkips(r.skipped);
        const queuedMsg = r.queuedForImport > 0 ? ` · ${r.queuedForImport} queued` : '';
        toast.success(
          `Importing ${r.imported}${queuedMsg} file${r.imported !== 1 ? 's' : ''}${skipMsg ? ` · skipped ${skipMsg}` : ''}`,
        );
      }
      setFolderConfirm(null);
      setSelectedFileIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Folder import failed');
    } finally {
      setConfirmingFolder(false);
    }
  };

  const notConnected = children?.notConnected === true;

  return (
    <>
      <Modal
        open={isOpen}
        onClose={resetAndClose}
        title={`Import from Drive — ${clientName}`}
        width={940}
        footer={
          <>
            <span className="text-xs mr-auto self-center" style={{ color: colors.text.muted }}>
              {selectedFileIds.size > 0
                ? `${selectedFileIds.size} selected`
                : currentFolderId
                  ? 'Select files, or import the whole folder'
                  : ''}
            </span>
            <Button variant="secondary" onClick={resetAndClose} disabled={importing || confirmingFolder}>
              Close
            </Button>
            {currentFolderId && (
              <Button variant="secondary" onClick={handleImportFolderDryRun} disabled={importing}>
                <FolderInput className="w-4 h-4" />
                Import entire folder
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handleImportSelected}
              disabled={importing || selectedFileIds.size === 0}
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Import {selectedFileIds.size > 0 ? selectedFileIds.size : ''} file{selectedFileIds.size !== 1 ? 's' : ''}
            </Button>
          </>
        }
      >
        <div className="flex" style={{ height: 460, margin: -16 }}>
          {/* Left — folder tree / drill-down */}
          <div
            className="flex flex-col"
            style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${colors.border.default}` }}
          >
            {/* Breadcrumb */}
            <div
              className="flex items-center gap-1 px-3 py-2 flex-wrap"
              style={{ borderBottom: `1px solid ${colors.border.light}`, minHeight: 40 }}
            >
              {breadcrumb.length > 1 && (
                <button
                  onClick={() => {
                    const parent = breadcrumb[breadcrumb.length - 2];
                    drillInto(breadcrumb.length - 2 === 0 ? undefined : parent?.driveFolderId);
                  }}
                  className="flex items-center justify-center rounded"
                  style={{ width: 22, height: 22, color: colors.text.secondary, background: 'transparent', border: 'none', cursor: 'pointer' }}
                  title="Up one level"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {breadcrumb.map((b, i) => (
                <span key={b.driveFolderId} className="flex items-center gap-1 min-w-0">
                  {i > 0 && <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: colors.text.dim }} />}
                  <button
                    onClick={() => drillInto(i === 0 ? undefined : b.driveFolderId)}
                    className="text-xs truncate hover:underline"
                    style={{ color: i === breadcrumb.length - 1 ? colors.text.primary : colors.text.muted, background: 'transparent', border: 'none', cursor: 'pointer', maxWidth: 120 }}
                  >
                    {i === 0 ? (b.name || 'Drive') : b.name}
                  </button>
                </span>
              ))}
            </div>

            {/* Folder list */}
            <div className="flex-1 overflow-auto">
              {children === undefined ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: colors.text.dim }} />
                </div>
              ) : notConnected ? (
                <div className="p-4">
                  <EmptyState
                    icon={<HardDrive className="w-8 h-8" />}
                    title="Google Drive not connected"
                    body="Connect Drive and map folders to clients first."
                  />
                  <div className="mt-3 flex justify-center">
                    <Link href="/settings/drive" style={{ fontSize: 12, color: colors.accent.blue }}>
                      Open Drive settings
                    </Link>
                  </div>
                </div>
              ) : atRoot && folders.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={<Folder className="w-8 h-8" />}
                    title="No mapped folders"
                    body={`No Drive folders are mapped to ${clientName} yet.`}
                  />
                  <div className="mt-3 flex justify-center">
                    <Link href="/settings/drive" style={{ fontSize: 12, color: colors.accent.blue }}>
                      Map folders in Drive settings
                    </Link>
                  </div>
                </div>
              ) : folders.length === 0 ? (
                <div className="p-4 text-center text-xs" style={{ color: colors.text.muted }}>
                  No subfolders here.
                </div>
              ) : (
                folders.map((f) => (
                  <button
                    key={f.driveFolderId}
                    onClick={() => drillInto(f.driveFolderId)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left"
                    style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${colors.border.light}`, cursor: 'pointer', transition: 'background 100ms linear' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.cardAlt; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Folder className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.yellow }} />
                    <span className="text-[13px] truncate flex-1" style={{ color: colors.text.primary }}>{f.name}</span>
                    {f.effectiveClientId === clientId && !f.isExplicitMapping && (
                      <StatusPill label="inherited" tone={colors.text.muted} />
                    )}
                    {f.isExplicitMapping && f.effectiveClientId === clientId && (
                      <StatusPill label="mapped" tone={colors.accent.green} />
                    )}
                    <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.dim }} />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right — import candidates */}
          <div className="flex-1 flex flex-col min-w-0">
            {!currentFolderId ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <EmptyState
                  icon={<Folder className="w-8 h-8" />}
                  title="Choose a folder"
                  body={`Pick one of ${clientName}'s Drive folders on the left to see its importable files.`}
                />
              </div>
            ) : candidates === undefined ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: colors.text.dim }} />
              </div>
            ) : candidates.files.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <EmptyState icon={<FileText className="w-8 h-8" />} title="No files in this folder" />
              </div>
            ) : (
              <>
                {/* Select-all header */}
                <div
                  className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
                  style={{ borderBottom: `1px solid ${colors.border.default}` }}
                >
                  <input
                    type="checkbox"
                    checked={allSelectableSelected}
                    onChange={toggleSelectAll}
                    disabled={selectableFiles.length === 0}
                    style={{ width: 13, height: 13, accentColor: colors.accent.blue, cursor: 'pointer' }}
                  />
                  <span className="text-xs" style={{ color: colors.text.muted }}>
                    {candidates.files.length} file{candidates.files.length !== 1 ? 's' : ''}
                    {candidates.truncated ? ' (first 500 — use "Import entire folder" for all)' : ''}
                  </span>
                </div>
                <div className="flex-1 overflow-auto">
                  {candidates.files.map((f) => {
                    const checked = f.imported || selectedFileIds.has(f.driveFileId);
                    return (
                      <label
                        key={f.driveFileId}
                        className="flex items-center gap-2 px-3 py-2"
                        style={{ borderBottom: `1px solid ${colors.border.light}`, cursor: f.imported ? 'default' : 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={f.imported}
                          onChange={() => toggleFile(f.driveFileId)}
                          style={{ width: 13, height: 13, accentColor: colors.accent.blue, cursor: f.imported ? 'default' : 'pointer' }}
                        />
                        {f.mimeType === FOLDER_MIME ? (
                          <Folder className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.yellow }} />
                        ) : (
                          <FileText className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.muted }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] truncate" style={{ color: colors.text.primary }}>{f.name}</div>
                          <div className="text-[11px] truncate" style={{ color: colors.text.dim }}>{f.path}</div>
                        </div>
                        <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: colors.text.dim }}>
                          {formatSize(f.size)}
                        </span>
                        {f.imported && <StatusPill label="Imported" tone={colors.accent.green} />}
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* Confirm entire-folder import */}
      <Modal
        open={!!folderConfirm}
        onClose={() => setFolderConfirm(null)}
        title="Import entire folder"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFolderConfirm(null)} disabled={confirmingFolder}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmFolderImport} disabled={confirmingFolder || (folderConfirm?.fileCount ?? 0) === 0}>
              {confirmingFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Import {folderConfirm?.fileCount ?? 0} files
            </Button>
          </>
        }
      >
        {folderConfirm && (
          <div className="text-sm" style={{ color: colors.text.secondary }}>
            <p style={{ marginBottom: 8 }}>
              This will import and extract{' '}
              <strong style={{ color: colors.text.primary }}>{folderConfirm.fileCount}</strong>{' '}
              file{folderConfirm.fileCount !== 1 ? 's' : ''} across {folderConfirm.folders} folder
              {folderConfirm.folders !== 1 ? 's' : ''}.
            </p>
            {folderConfirm.alreadyImported > 0 && (
              <p className="text-xs" style={{ color: colors.text.muted }}>
                {folderConfirm.alreadyImported} already imported and will be skipped.
              </p>
            )}
            {folderConfirm.fileCount === 0 && (
              <p className="text-xs" style={{ color: colors.text.muted }}>
                Nothing new to import in this folder.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
