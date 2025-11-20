'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Prospect, ProspectingEmail } from '@/types';
import {
  getProspectById,
  updateProspect,
  convertProspectToClient,
} from '@/lib/prospectStorage';
import {
  getEmailsByProspect,
} from '@/lib/emailStorage';
import {
  getProspectingContextByClient,
} from '@/lib/prospectingStorage';
import {
  aggregateProspectingDataForClient,
} from '@/lib/enrichmentAggregator';
import { getClientById } from '@/lib/clientStorage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Mail,
  Phone,
  Building2,
  TrendingUp,
  Calendar,
  Tag,
  ArrowLeft,
  UserPlus,
  Edit2,
  Save,
  X,
  Plus,
  FileText,
  Sparkles,
  MessageSquare,
  Clock,
} from 'lucide-react';
import ProspectingContextCard from '@/components/ProspectingContextCard';
import { getDocumentsByClient } from '@/lib/documentStorage';
import { getDocumentById } from '@/lib/documentStorage';

const statusColors: Record<Prospect['status'], string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  responded: 'bg-green-100 text-green-800',
  converted: 'bg-purple-100 text-purple-800',
  unqualified: 'bg-gray-100 text-gray-800',
};

export default function ProspectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const prospectId = params.prospectId as string;
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [emails, setEmails] = useState<ProspectingEmail[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    companyName: '',
    email: '',
    phone: '',
    industry: '',
    tags: [] as string[],
  });
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    loadData();
  }, [prospectId]);

  const loadData = () => {
    if (typeof window === 'undefined') return;
    const loadedProspectRaw = getProspectById(prospectId);
    setProspect(loadedProspectRaw || null);

    if (!loadedProspectRaw) {
      return;
    }

    const loadedProspect = loadedProspectRaw as Prospect;

    setEditFormData({
      name: loadedProspect.name,
      companyName: loadedProspect.companyName || '',
      email: loadedProspect.email || '',
      phone: loadedProspect.phone || '',
      industry: loadedProspect.industry || '',
      tags: loadedProspect.tags || [],
    });

    const prospectEmails = getEmailsByProspect(prospectId);
    setEmails(prospectEmails);
  };

  const handleSave = () => {
    if (!prospect) return;
    updateProspect(prospectId, editFormData);
    setIsEditing(false);
    loadData();
  };

  const handleCancel = () => {
    if (!prospect) return;
    setEditFormData({
      name: prospect.name,
      companyName: prospect.companyName || '',
      email: prospect.email || '',
      phone: prospect.phone || '',
      industry: prospect.industry || '',
      tags: prospect.tags || [],
    });
    setIsEditing(false);
  };

  const handleAddTag = () => {
    if (newTag.trim() && !editFormData.tags.includes(newTag.trim())) {
      setEditFormData({
        ...editFormData,
        tags: [...editFormData.tags, newTag.trim()],
      });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setEditFormData({
      ...editFormData,
      tags: editFormData.tags.filter(t => t !== tag),
    });
  };

  const handleConvertToClient = () => {
    if (!prospect) return;
    if (confirm('Convert this prospect to a client?')) {
      const clientId = convertProspectToClient(prospectId);
      if (clientId) {
        router.push(`/clients/${clientId}`);
      }
    }
  };

  const handleCreateEmail = () => {
    router.push(`/prospects/${prospectId}/email`);
  };

  const getEnrichmentScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getEnrichmentData = () => {
    if (!prospect || !prospect.clientId) return null;
    return aggregateProspectingDataForClient(prospect.clientId);
  };

  const getProspectingContexts = () => {
    if (!prospect || !prospect.clientId) return [];
    return getProspectingContextByClient(prospect.clientId);
  };

  const getDocumentName = (documentId: string): string => {
    const doc = getDocumentById(documentId);
    return doc?.fileName || 'Unknown Document';
  };

  if (!prospect) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Prospect not found.</p>
            <Link href="/prospects" className="mt-4 text-blue-600 hover:text-blue-700">
              Back to Prospects
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const enrichmentData = getEnrichmentData();
  const prospectingContexts = getProspectingContexts();
  const client = prospect.clientId ? getClientById(prospect.clientId) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/prospects"
            className="text-blue-600 hover:text-blue-700 mb-4 inline-block flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Prospects
          </Link>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarFallback className="text-lg">
                  {prospect.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-gray-900">{prospect.name}</h1>
                  <Badge className={statusColors[prospect.status]}>
                    {prospect.status.charAt(0).toUpperCase() + prospect.status.slice(1)}
                  </Badge>
                </div>
                <p className="text-gray-600">
                  {prospect.companyName && (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-4 h-4" />
                      {prospect.companyName}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateEmail}>
                <Mail className="w-4 h-4 mr-2" />
                New Email
              </Button>
              {prospect.status !== 'converted' && (
                <Button onClick={handleConvertToClient}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Convert to Client
                </Button>
              )}
              {prospect.clientId && (
                <Button variant="outline" onClick={() => router.push(`/clients/${prospect.clientId}`)}>
                  View Client
                </Button>
              )}
              <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="enrichment">
              Enrichment Intelligence
              {enrichmentData && <Badge variant="secondary" className="ml-2">{prospectingContexts.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="emails">
              Email Outreach
              {emails.length > 0 && <Badge variant="secondary" className="ml-2">{emails.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Info Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Prospect Information</CardTitle>
                  {isEditing && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSave}>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCancel}>
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Name</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editFormData.name}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                      />
                    ) : (
                      <p className="mt-1 text-gray-900">{prospect.name}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Company</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editFormData.companyName}
                        onChange={(e) => setEditFormData({ ...editFormData, companyName: e.target.value })}
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                      />
                    ) : (
                      <p className="mt-1 text-gray-900">{prospect.companyName || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                      <Mail className="w-4 h-4" />
                      Email
                    </label>
                    {isEditing ? (
                      <input
                        type="email"
                        value={editFormData.email}
                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                      />
                    ) : (
                      <p className="mt-1 text-gray-900">{prospect.email || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      Phone
                    </label>
                    {isEditing ? (
                      <input
                        type="tel"
                        value={editFormData.phone}
                        onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                      />
                    ) : (
                      <p className="mt-1 text-gray-900">{prospect.phone || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Industry</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editFormData.industry}
                        onChange={(e) => setEditFormData({ ...editFormData, industry: e.target.value })}
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                      />
                    ) : (
                      <p className="mt-1 text-gray-900">{prospect.industry || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Enrichment Score</label>
                    <div className="flex items-center gap-2 mt-1">
                      <TrendingUp className={`w-5 h-5 ${getEnrichmentScoreColor(prospect.enrichmentScore)}`} />
                      <span className={`text-lg font-semibold ${getEnrichmentScoreColor(prospect.enrichmentScore)}`}>
                        {prospect.enrichmentScore}
                      </span>
                    </div>
                  </div>
                </div>

                <Separator className="my-6" />

                <div>
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1 mb-2">
                    <Tag className="w-4 h-4" />
                    Tags
                  </label>
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {editFormData.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                            {tag}
                            <button onClick={() => handleRemoveTag(tag)} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                          placeholder="Add tag..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                        />
                        <Button size="sm" onClick={handleAddTag}>
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {prospect.tags.length > 0 ? (
                        prospect.tags.map(tag => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-gray-400">No tags</span>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-600">Emails Sent</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">{emails.filter(e => e.status === 'sent').length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-600">Drafts</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">{emails.filter(e => e.status === 'draft').length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-600">Last Contact</div>
                  <div className="text-lg font-semibold text-gray-900 mt-1">
                    {prospect.lastContactDate
                      ? new Date(prospect.lastContactDate).toLocaleDateString()
                      : 'Never'}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Enrichment Intelligence Tab */}
          <TabsContent value="enrichment" className="space-y-6">
            {enrichmentData ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5" />
                      Aggregated Enrichment Data
                    </CardTitle>
                    <CardDescription>
                      Combined intelligence from all documents ({prospectingContexts.length} source{prospectingContexts.length !== 1 ? 's' : ''})
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {enrichmentData.keyPoints.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2">Key Points</h4>
                          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                            {enrichmentData.keyPoints.map((point, idx) => (
                              <li key={idx}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {enrichmentData.painPoints.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2">Pain Points</h4>
                          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                            {enrichmentData.painPoints.map((point, idx) => (
                              <li key={idx}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {enrichmentData.opportunities.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2">Opportunities</h4>
                          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                            {enrichmentData.opportunities.map((opp, idx) => (
                              <li key={idx}>{opp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {prospectingContexts.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Source Documents</h3>
                    <div className="space-y-4">
                      {prospectingContexts.map((context) => (
                        <ProspectingContextCard
                          key={context.documentId}
                          context={context}
                          documentName={getDocumentName(context.documentId)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center text-gray-500">
                  {prospect.clientId
                    ? 'No enrichment data available. Upload documents to generate prospecting intelligence.'
                    : 'Convert this prospect to a client and upload documents to see enrichment data.'}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Email Outreach Tab */}
          <TabsContent value="emails" className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Email History</h3>
              <Button onClick={handleCreateEmail}>
                <Plus className="w-4 h-4 mr-2" />
                Create Email
              </Button>
            </div>

            {emails.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-gray-500">
                  No emails yet. Create your first outreach email.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {emails.map((email) => (
                  <Card key={email.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-base">{email.subject || '(No subject)'}</CardTitle>
                          <CardDescription className="mt-1">
                            {new Date(email.createdAt).toLocaleString()}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={
                            email.status === 'sent' ? 'default' :
                            email.status === 'approved' ? 'secondary' :
                            'outline'
                          }
                        >
                          {email.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-3">
                        {email.body || '(No content)'}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">Prospect Created</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(prospect.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {prospect.lastContactDate && (
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-2 h-2 bg-green-600 rounded-full mt-2"></div>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">Last Contact</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(prospect.lastContactDate).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}

                  {emails.map((email) => (
                    <div key={email.id} className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <MessageSquare className="w-4 h-4 text-gray-400 mt-1"></MessageSquare>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          Email {email.status === 'sent' ? 'sent' : email.status}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(email.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}

                  {prospect.status === 'converted' && (
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-2 h-2 bg-purple-600 rounded-full mt-2"></div>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">Converted to Client</div>
                        {client && (
                          <Link href={`/clients/${client.id}`} className="text-xs text-blue-600 hover:underline mt-1">
                            View Client Profile
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

