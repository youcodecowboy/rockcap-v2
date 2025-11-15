'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  ExternalLink,
  TrendingUp,
  User,
  Mail,
  Phone,
} from 'lucide-react';
import { HubSpotLink } from '@/components/HubSpotLink';

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-green-100 text-green-800',
  negotiation: 'bg-purple-100 text-purple-800',
  'closed-won': 'bg-green-100 text-green-800',
  'closed-lost': 'bg-gray-100 text-gray-800',
};

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.dealId as string;
  
  const deal = useQuery(api.deals.getDealById, { dealId: dealId as any });

  if (deal === undefined) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading deal...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="container mx-auto p-6">
        <Button
          variant="ghost"
          onClick={() => router.push('/prospects')}
          className="mb-4"
        >
          <ArrowLeft className="size-4 mr-2" />
          Back to Prospects
        </Button>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-gray-500">Deal not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const contacts = deal.contacts || [];
  const companies = deal.companies || [];

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push('/prospects')}
          className="mb-4"
        >
          <ArrowLeft className="size-4 mr-2" />
          Back to Prospects
        </Button>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
              {deal.name}
              {deal.hubspotUrl && <HubSpotLink url={deal.hubspotUrl} />}
            </h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {deal.pipelineName && (
                <div className="flex items-center gap-1">
                  <TrendingUp className="size-4" />
                  <span>{deal.pipelineName}</span>
                </div>
              )}
              {deal.stageName && (
                <Badge variant="outline" className={statusColors[deal.status || 'new']}>
                  {deal.stageName}
                </Badge>
              )}
              {deal.status && (
                <Badge className={statusColors[deal.status]}>
                  {deal.status.replace('-', ' ')}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Deal Information */}
          <Card>
            <CardHeader>
              <CardTitle>Deal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {deal.amount !== undefined && deal.amount !== null && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Deal Amount</div>
                    <div className="text-lg font-semibold flex items-center gap-2">
                      <DollarSign className="size-4" />
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      }).format(deal.amount)}
                    </div>
                  </div>
                )}
                {deal.closeDate && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Close Date</div>
                    <div className="text-lg font-semibold flex items-center gap-2">
                      <Calendar className="size-4" />
                      {new Date(deal.closeDate).toLocaleDateString()}
                    </div>
                  </div>
                )}
                {deal.dealType && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Deal Type</div>
                    <div className="text-lg font-semibold">{deal.dealType}</div>
                  </div>
                )}
                {deal.createdAt && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Created</div>
                    <div className="text-lg font-semibold">
                      {new Date(deal.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
              
              {deal.nextStep && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Next Step</div>
                  <div className="text-base">{deal.nextStep}</div>
                </div>
              )}
              
              {deal.lastContactedDate && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Last Contacted</div>
                  <div className="text-base">
                    {new Date(deal.lastContactedDate).toLocaleString()}
                  </div>
                </div>
              )}
              
              {deal.lastActivityDate && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Last Activity</div>
                  <div className="text-base">
                    {new Date(deal.lastActivityDate).toLocaleString()}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contacts */}
          {contacts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Associated Contacts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {contacts.map((contact: any) => (
                    <div key={contact._id} className="flex items-start justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-2">
                          <User className="size-4" />
                          <Link 
                            href={`/contacts/${contact._id}`}
                            className="text-primary hover:underline"
                          >
                            {contact.name}
                          </Link>
                          {contact.hubspotUrl && <HubSpotLink url={contact.hubspotUrl} />}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1 space-y-1">
                          {contact.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="size-3" />
                              {contact.email}
                            </div>
                          )}
                          {contact.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="size-3" />
                              {contact.phone}
                            </div>
                          )}
                          {contact.company && (
                            <div className="flex items-center gap-1">
                              <Building2 className="size-3" />
                              {contact.company}
                            </div>
                          )}
                          {contact.role && <div>{contact.role}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Companies */}
          {companies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Associated Companies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {companies.map((company: any) => (
                    <div key={company._id} className="flex items-start justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-2">
                          <Building2 className="size-4" />
                          <Link 
                            href={`/companies/${company._id}`}
                            className="text-primary hover:underline"
                          >
                            {company.name}
                          </Link>
                          {company.hubspotUrl && <HubSpotLink url={company.hubspotUrl} />}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1 space-y-1">
                          {company.website && (
                            <div>
                              <a
                                href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-1"
                              >
                                <ExternalLink className="size-3" />
                                {company.website}
                              </a>
                            </div>
                          )}
                          {company.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="size-3" />
                              {company.phone}
                            </div>
                          )}
                          {company.industry && <div>{company.industry}</div>}
                          {company.city && company.state && (
                            <div>{company.city}, {company.state}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Deal Status */}
          <Card>
            <CardHeader>
              <CardTitle>Deal Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {deal.status && (
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Status</div>
                  <Badge className={statusColors[deal.status]}>
                    {deal.status.replace('-', ' ')}
                  </Badge>
                </div>
              )}
              {deal.pipeline && (
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Pipeline</div>
                  <div className="font-medium">{deal.pipelineName || deal.pipeline}</div>
                </div>
              )}
              {deal.stage && (
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Stage</div>
                  <div className="font-medium">{deal.stageName || deal.stage}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* HubSpot Information */}
          {deal.hubspotDealId && (
            <Card>
              <CardHeader>
                <CardTitle>HubSpot Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Deal ID</div>
                  <div className="font-mono">{deal.hubspotDealId}</div>
                </div>
                {deal.lastHubSpotSync && (
                  <div>
                    <div className="text-muted-foreground">Last Synced</div>
                    <div>{new Date(deal.lastHubSpotSync).toLocaleString()}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

