'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useDocumentsByProject,
  useInternalDocumentsByProject,
  useUpdateDocumentCode,
  useUpdateInternalDocumentCode,
} from '@/lib/documentStorage';
import { useProject, useClient } from '@/lib/clientStorage';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Button, EmptyState, StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import DocumentCodeEditor from '@/components/DocumentCodeEditor';
import { FolderKanban, FileText, ChevronRight, ArrowLeft, Building2 } from 'lucide-react';

export default function ProjectFolderPage() {
  const colors = useColors();
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const project = useProject(projectId as Id<"projects">);
  const projectDocuments = useDocumentsByProject(projectId as Id<"projects">) || [];
  const internalDocuments = useInternalDocumentsByProject(projectId as Id<"projects">) || [];
  const updateDocumentCode = useUpdateDocumentCode();
  const updateInternalDocumentCode = useUpdateInternalDocumentCode();

  // Get client info from project
  const clientId = project?.clientRoles?.[0]?.clientId;
  const client = useClient(clientId as Id<"clients"> | undefined);

  if (!project) {
    return (
      <div style={{ background: colors.bg.base, minHeight: '100vh' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <EmptyState icon={<FolderKanban size={28} />} title="Project not found" />
        </div>
      </div>
    );
  }

  const allDocuments = [...projectDocuments, ...internalDocuments].sort((a, b) => {
    const aTime = new Date(a.uploadedAt || a.uploadedAt).getTime();
    const bTime = new Date(b.uploadedAt || b.uploadedAt).getTime();
    return bTime - aTime;
  });

  const renderDocRow = (
    doc: any,
    onSave: (newCode: string) => Promise<void>,
    opts?: { internal?: boolean }
  ) => (
    <div
      key={doc._id}
      style={{
        background: opts?.internal ? `${colors.accent.purple}10` : colors.bg.card,
        border: `1px solid ${opts?.internal ? `${colors.accent.purple}40` : colors.border.default}`,
        borderRadius: 4,
        padding: 14,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <DocumentCodeEditor
              documentCode={doc.documentCode}
              fileName={doc.fileName}
              onSave={onSave}
              {...(opts?.internal ? { isInternal: true } : {})}
            />
            {opts?.internal && <StatusPill label="Internal" tone={colors.accent.purple} />}
          </div>
          <div style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 4 }}>
            {doc.summary.substring(0, 150)}...
          </div>
          <div className="flex items-center gap-4" style={{ fontSize: 11, color: colors.text.muted }}>
            <span>{doc.category}</span>
            <span>•</span>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {new Date(doc.uploadedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/docs/${doc._id}`)}>
            View
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ background: colors.bg.base, minHeight: '100vh' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumbs */}
        <div className="mb-6">
          <nav className="flex items-center gap-2" style={{ fontSize: 12, color: colors.text.secondary }}>
            <Link href="/docs" style={{ color: colors.text.secondary }}>
              Docs
            </Link>
            <ChevronRight className="w-4 h-4" style={{ color: colors.text.dim }} />
            {client && (
              <>
                <Link href={`/docs?clientId=${client._id}`} style={{ color: colors.text.secondary }}>
                  {client.name}
                </Link>
                <ChevronRight className="w-4 h-4" style={{ color: colors.text.dim }} />
              </>
            )}
            <span style={{ color: colors.text.primary, fontWeight: 500 }}>{project.name}</span>
          </nav>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(client ? `/docs?clientId=${client._id}` : '/docs')}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <FolderKanban className="w-7 h-7" style={{ color: colors.entityTypes.project }} />
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 300, color: colors.text.primary }}>{project.name}</h1>
              <div className="flex items-center gap-2" style={{ fontSize: 12, color: colors.text.muted, marginTop: 4 }}>
                {client && (
                  <>
                    <Building2 className="w-4 h-4" />
                    <Link href={`/docs?clientId=${client._id}`} style={{ color: colors.text.secondary }}>
                      {client.name}
                    </Link>
                    <span>•</span>
                  </>
                )}
                <span>{allDocuments.length} document(s)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Documents List */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 9,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: colors.text.muted,
                fontWeight: 500,
              }}
            >
              Project Documents
            </h2>
            <StatusPill label={String(allDocuments.length)} tone={colors.entityTypes.project} />
          </div>
          {allDocuments.length === 0 ? (
            <EmptyState
              icon={<FileText size={28} />}
              title="No documents"
              body="Documents assigned to this project will appear here."
            />
          ) : (
            <div className="space-y-3">
              {projectDocuments.map((doc) =>
                renderDocRow(doc, async (newCode) => {
                  await updateDocumentCode({ id: doc._id, documentCode: newCode });
                })
              )}

              {internalDocuments.map((doc) =>
                renderDocRow(
                  doc,
                  async (newCode) => {
                    await updateInternalDocumentCode({ id: doc._id, documentCode: newCode });
                  },
                  { internal: true }
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
