'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  FileText,
  FolderKanban,
  Calendar,
  ExternalLink,
  Briefcase,
} from 'lucide-react';

interface ClientOverviewTabProps {
  client: {
    _id: string;
    name: string;
    type?: string;
    status?: string;
    companyName?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    phone?: string;
    email?: string;
    website?: string;
    industry?: string;
    notes?: string;
    tags?: string[];
    createdAt: string;
  };
  clientId: Id<"clients">;
  documents: any[];
  projects: any[];
  contacts: any[];
}

export default function ClientOverviewTab({
  client,
  clientId,
  documents,
  projects,
  contacts,
}: ClientOverviewTabProps) {
  const router = useRouter();

  // Calculate recent documents
  const recentDocuments = useMemo(() => {
    return documents
      .sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .slice(0, 5);
  }, [documents]);

  // Format address
  const formatAddress = () => {
    const parts = [];
    if (client.address) parts.push(client.address);
    if (client.city) parts.push(client.city);
    if (client.state) parts.push(client.state);
    if (client.zip) parts.push(client.zip);
    if (client.country) parts.push(client.country);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Company Information */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-4 h-4" />
            Company Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-gray-500">Company Name</p>
            <p className="text-sm font-medium">{client.companyName || client.name}</p>
          </div>

          {client.industry && (
            <div>
              <p className="text-xs text-gray-500">Industry</p>
              <p className="text-sm font-medium">{client.industry}</p>
            </div>
          )}

          {formatAddress() && (
            <div>
              <p className="text-xs text-gray-500">Address</p>
              <p className="text-sm font-medium flex items-start gap-2">
                <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                {formatAddress()}
              </p>
            </div>
          )}

          {client.email && (
            <div>
              <p className="text-xs text-gray-500">Email</p>
              <a 
                href={`mailto:${client.email}`}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
              >
                <Mail className="w-3 h-3" />
                {client.email}
              </a>
            </div>
          )}

          {client.phone && (
            <div>
              <p className="text-xs text-gray-500">Phone</p>
              <a 
                href={`tel:${client.phone}`}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
              >
                <Phone className="w-3 h-3" />
                {client.phone}
              </a>
            </div>
          )}

          {client.website && (
            <div>
              <p className="text-xs text-gray-500">Website</p>
              <a 
                href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
              >
                <Globe className="w-3 h-3" />
                {client.website}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          )}

          <div>
            <p className="text-xs text-gray-500">Created</p>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-gray-400" />
              {new Date(client.createdAt).toLocaleDateString()}
            </p>
          </div>

          {client.tags && client.tags.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Tags</p>
              <div className="flex flex-wrap gap-1">
                {client.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {client.notes && (
            <div>
              <p className="text-xs text-gray-500">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {client.notes.substring(0, 200)}
                {client.notes.length > 200 && '...'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Documents */}
      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" />
            Recent Documents
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            className="text-xs"
            onClick={() => router.push(`/clients/${clientId}?tab=documents`)}
          >
            View All
          </Button>
        </CardHeader>
        <CardContent>
          {recentDocuments.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No documents yet</p>
          ) : (
            <div className="space-y-2">
              {recentDocuments.map((doc: any) => (
                <div
                  key={doc._id}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/docs/${doc._id}`)}
                >
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {doc.documentCode || doc.fileName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{doc.summary}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {doc.category}
                      </Badge>
                      <span className="text-[10px] text-gray-400">
                        {new Date(doc.uploadedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Projects */}
      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderKanban className="w-4 h-4" />
            Projects
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            className="text-xs"
            onClick={() => router.push(`/clients/${clientId}?tab=projects`)}
          >
            View All
          </Button>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No projects yet</p>
          ) : (
            <div className="space-y-2">
              {projects.slice(0, 5).map((project: any) => (
                <div
                  key={project._id}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/clients/${clientId}/projects/${project._id}`)}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    project.status === 'active' ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    <Briefcase className={`w-3.5 h-3.5 ${
                      project.status === 'active' ? 'text-green-600' : 'text-gray-500'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{project.name}</p>
                    {project.projectShortcode && (
                      <p className="text-[10px] text-gray-500 font-mono">{project.projectShortcode}</p>
                    )}
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] px-1.5 py-0 mt-1 ${
                        project.status === 'active' 
                          ? 'bg-green-50 text-green-700 border-green-200' 
                          : 'bg-gray-50 text-gray-700 border-gray-200'
                      }`}
                    >
                      {project.status || 'Unknown'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
