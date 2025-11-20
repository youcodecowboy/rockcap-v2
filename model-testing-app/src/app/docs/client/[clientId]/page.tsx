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
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import FolderCard from '@/components/FolderCard';
import DocumentCodeEditor from '@/components/DocumentCodeEditor';
import { Building2, FolderKanban, FileText, ChevronRight, ArrowLeft } from 'lucide-react';

export default function ClientFolderPage() {
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
      <div className="bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <p className="text-gray-900 font-medium">Client not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumbs */}
        <div className="mb-6">
          <nav className="flex items-center gap-2 text-sm text-gray-600">
            <Link href="/docs" className="hover:text-gray-900">
              Docs
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-900 font-medium">{client.name}</span>
          </nav>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/docs')}
              className="mr-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Building2 className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{client.name}</h1>
              <p className="text-sm text-gray-600 mt-1">
                {clientDocuments.length} document(s) • {projects.length} project(s)
              </p>
            </div>
          </div>
        </div>

        {/* Projects Section */}
        {projectStats.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Projects</h2>
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Client-Level Documents
            <Badge variant="outline" className="ml-2">
              {clientLevelDocs.length}
            </Badge>
          </h2>
          {clientLevelDocs.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-900 font-medium mb-1">No client-level documents</p>
              <p className="text-sm text-gray-500">
                Documents not assigned to a specific project will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {clientLevelDocs.map((doc) => (
                <div
                  key={doc._id}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <DocumentCodeEditor
                          documentCode={doc.documentCode}
                          fileName={doc.fileName}
                          onSave={async (newCode) => {
                            await updateDocumentCode({ id: doc._id, documentCode: newCode });
                          }}
                        />
                      </div>
                      <div className="text-sm text-gray-600 mb-1">
                        {doc.summary.substring(0, 150)}...
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{doc.category}</span>
                        <span>•</span>
                        <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/docs/${doc._id}`)}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Linked Internal Documents */}
        {internalDocuments.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Linked Internal Documents
              <Badge variant="outline" className="ml-2">
                {internalDocuments.length}
              </Badge>
            </h2>
            <div className="space-y-3">
              {internalDocuments.map((doc) => (
                <div
                  key={doc._id}
                  className="bg-purple-50 rounded-lg border border-purple-200 p-4 hover:border-purple-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <DocumentCodeEditor
                          documentCode={doc.documentCode}
                          fileName={doc.fileName}
                          onSave={async (newCode) => {
                            await updateInternalDocumentCode({ id: doc._id, documentCode: newCode });
                          }}
                          isInternal={true}
                        />
                        <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
                          Internal
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600 mb-1">
                        {doc.summary.substring(0, 150)}...
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{doc.category}</span>
                        {doc.linkedProjectIds && doc.linkedProjectIds.length > 0 && (
                          <>
                            <span>•</span>
                            <span>{doc.linkedProjectIds.length} project(s)</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/docs/${doc._id}`)}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

