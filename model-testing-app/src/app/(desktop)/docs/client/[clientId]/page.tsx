'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useDocumentsByClient,
  useInternalDocumentsByClient,
  useUpdateDocumentCode,
  useUpdateInternalDocumentCode,
} from '@/lib/documentStorage';
import { useClient } from '@/lib/clientStorage';
import { useProjectsByClient } from '@/lib/clientStorage';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Button, Panel, EmptyState, StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import FolderCard from '@/components/FolderCard';
import DocumentCodeEditor from '@/components/DocumentCodeEditor';
import { Building2, FileText, ChevronRight, ArrowLeft } from 'lucide-react';

export default function ClientFolderPage() {
  const colors = useColors();
  const params = useParams();
  const router = useRouter();
  const clientId = params.clientId as string;

  const client = useClient(clientId as Id<"clients">);
  const projects = useProjectsByClient(clientId as Id<"clients">) || [];
  const clientDocuments = useDocumentsByClient(clientId as Id<"clients">) || [];
  const internalDocuments = useInternalDocumentsByClient(clientId as Id<"clients">) || [];
  const updateDocumentCode = useUpdateDocumentCode();
  const updateInternalDocumentCode = useUpdateInternalDocumentCode();

  // Get project stats
  const projectStats = projects.map(project => {
    const projectDocs = clientDocuments.filter(doc => doc.projectId === project._id);
    return {
      projectId: project._id,
      projectName: project.name,
      documentCount: projectDocs.length,
      lastUpdated: projectDocs.length > 0
        ? projectDocs.reduce((latest, doc) => {
            const docDate = new Date(doc.uploadedAt).getTime();
            const latestDate = latest ? new Date(latest).getTime() : 0;
            return docDate > latestDate ? doc.uploadedAt : latest;
          }, null as string | null)
        : null,
    };
  }).sort((a, b) => {
    const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
    const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
    return bTime - aTime;
  });

  // Client-level documents (no project)
  const clientLevelDocs = clientDocuments.filter(doc => !doc.projectId);

  if (!client) {
    return (
      <div style={{ background: colors.bg.base, minHeight: '100vh' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <EmptyState icon={<Building2 size={28} />} title="Client not found" />
        </div>
      </div>
    );
  }

  const sectionHeading = (text: string, count?: number) => (
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
        {text}
      </h2>
      {count != null && <StatusPill label={String(count)} tone={colors.entityTypes.client} />}
    </div>
  );

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
            {opts?.internal ? (
              doc.linkedProjectIds && doc.linkedProjectIds.length > 0 && (
                <>
                  <span>•</span>
                  <span>{doc.linkedProjectIds.length} project(s)</span>
                </>
              )
            ) : (
              <>
                <span>•</span>
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {new Date(doc.uploadedAt).toLocaleDateString()}
                </span>
              </>
            )}
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
            <span style={{ color: colors.text.primary, fontWeight: 500 }}>{client.name}</span>
          </nav>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/docs')}>
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Building2 className="w-7 h-7" style={{ color: colors.entityTypes.client }} />
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 300, color: colors.text.primary }}>{client.name}</h1>
              <p style={{ fontSize: 12, color: colors.text.muted, marginTop: 4 }}>
                {clientDocuments.length} document(s) • {projects.length} project(s)
              </p>
            </div>
          </div>
        </div>

        {/* Projects Section */}
        {projectStats.length > 0 && (
          <div className="mb-8">
            {sectionHeading('Projects')}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projectStats.map((project) => (
                <FolderCard
                  key={project.projectId}
                  type="project"
                  id={project.projectId}
                  name={project.projectName}
                  documentCount={project.documentCount}
                  lastUpdated={project.lastUpdated}
                  clientName={client.name}
                />
              ))}
            </div>
          </div>
        )}

        {/* Client-Level Documents */}
        <div className="mb-8">
          {sectionHeading('Client-Level Documents', clientLevelDocs.length)}
          {clientLevelDocs.length === 0 ? (
            <EmptyState
              icon={<FileText size={28} />}
              title="No client-level documents"
              body="Documents not assigned to a specific project will appear here."
            />
          ) : (
            <div className="space-y-3">
              {clientLevelDocs.map((doc) =>
                renderDocRow(doc, async (newCode) => {
                  await updateDocumentCode({ id: doc._id, documentCode: newCode });
                })
              )}
            </div>
          )}
        </div>

        {/* Linked Internal Documents */}
        {internalDocuments.length > 0 && (
          <div className="mb-8">
            {sectionHeading('Linked Internal Documents', internalDocuments.length)}
            <div className="space-y-3">
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
          </div>
        )}
      </div>
    </div>
  );
}
