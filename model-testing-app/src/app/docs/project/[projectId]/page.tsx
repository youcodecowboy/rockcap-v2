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
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DocumentCodeEditor from '@/components/DocumentCodeEditor';
import { FolderKanban, FileText, ChevronRight, ArrowLeft, Building2 } from 'lucide-react';

export default function ProjectFolderPage() {
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
      <div className="bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <p className="text-gray-900 font-medium">Project not found</p>
          </div>
        </div>
      </div>
    );
  }

  const allDocuments = [...projectDocuments, ...internalDocuments].sort((a, b) => {
    const aTime = new Date(a.uploadedAt || a.uploadedAt).getTime();
    const bTime = new Date(b.uploadedAt || b.uploadedAt).getTime();
    return bTime - aTime;
  });

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
            {client && (
              <>
                <Link href={`/docs/client/${client._id}`} className="hover:text-gray-900">
                  {client.name}
                </Link>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
            <span className="text-gray-900 font-medium">{project.name}</span>
          </nav>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(client ? `/docs/client/${client._id}` : '/docs')}
              className="mr-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <FolderKanban className="w-8 h-8 text-purple-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
              <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                {client && (
                  <>
                    <Building2 className="w-4 h-4" />
                    <Link href={`/docs/client/${client._id}`} className="hover:text-blue-600">
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Project Documents
            <Badge variant="outline" className="ml-2">
              {allDocuments.length}
            </Badge>
          </h2>
          {allDocuments.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-900 font-medium mb-1">No documents</p>
              <p className="text-sm text-gray-500">
                Documents assigned to this project will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {projectDocuments.map((doc) => (
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
      </div>
    </div>
  );
}

