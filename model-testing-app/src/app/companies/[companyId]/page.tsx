'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  Building2,
  Calendar,
  ExternalLink,
  Mail,
  Phone,
  User,
  TrendingUp,
  Globe,
  MapPin,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { HubSpotLink } from '@/components/HubSpotLink';
import { useState } from 'react';

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const [isPromoting, setIsPromoting] = useState(false);
  
  const company = useQuery(api.companies.get, { id: companyId as any });
  const promoteToClient = useMutation(api.companies.promoteToClient);

  if (company === undefined) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading company...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="container mx-auto p-6">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="size-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-gray-500">Company not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const contacts = company.contacts || [];
  const deals = company.deals || [];

  const handlePromoteToClient = async () => {
    if (isPromoting || company.promotedToClientId) return;
    
    setIsPromoting(true);
    try {
      const clientId = await promoteToClient({ id: companyId as any });
      // Redirect to client dashboard
      router.push(`/clients/${clientId}`);
    } catch (error) {
      console.error('Error promoting company to client:', error);
      alert('Failed to promote company to client. Please try again.');
      setIsPromoting(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="size-4 mr-2" />
          Back
        </Button>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
              {company.name}
              {company.hubspotUrl && <HubSpotLink url={company.hubspotUrl} />}
            </h1>
            {company.industry && (
              <div className="text-lg text-muted-foreground">{company.industry}</div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {company.promotedToClientId ? (
              <Link href={`/clients/${company.promotedToClientId}`}>
                <Button className="bg-green-600 hover:bg-green-700 text-white">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  View Client Dashboard
                </Button>
              </Link>
            ) : (
              <Button
                onClick={handlePromoteToClient}
                disabled={isPromoting}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {isPromoting ? 'Promoting...' : 'Promote to Client'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Company Information */}
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {company.website && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Website</div>
                    <div className="text-base flex items-center gap-2">
                      <Globe className="size-4" />
                      <a
                        href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {company.website}
                      </a>
                    </div>
                  </div>
                )}
                {company.phone && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Phone</div>
                    <div className="text-base flex items-center gap-2">
                      <Phone className="size-4" />
                      <a href={`tel:${company.phone}`} className="text-primary hover:underline">
                        {company.phone}
                      </a>
                    </div>
                  </div>
                )}
                {company.domain && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Domain</div>
                    <div className="text-base">{company.domain}</div>
                  </div>
                )}
                {company.industry && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Industry</div>
                    <div className="text-base">{company.industry}</div>
                  </div>
                )}
                {company.hubspotLifecycleStageName && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Lifecycle Stage</div>
                    <Badge variant="outline">{company.hubspotLifecycleStageName}</Badge>
                  </div>
                )}
                {(company.city || company.state) && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Location</div>
                    <div className="text-base flex items-center gap-2">
                      <MapPin className="size-4" />
                      {[company.city, company.state, company.zip].filter(Boolean).join(', ')}
                    </div>
                  </div>
                )}
                {company.address && (
                  <div className="md:col-span-2">
                    <div className="text-sm text-muted-foreground mb-1">Address</div>
                    <div className="text-base">{company.address}</div>
                  </div>
                )}
                {company.lastContactedDate && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Last Contacted</div>
                    <div className="text-base flex items-center gap-2">
                      <Calendar className="size-4" />
                      {new Date(company.lastContactedDate).toLocaleString()}
                    </div>
                  </div>
                )}
                {company.lastActivityDate && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Last Activity</div>
                    <div className="text-base flex items-center gap-2">
                      <Calendar className="size-4" />
                      {new Date(company.lastActivityDate).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Associated Contacts */}
          {contacts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Associated Contacts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {contacts.map((contact: any) => (
                    <Link
                      key={contact._id}
                      href={`/contacts/${contact._id}`}
                      className="block p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="font-medium flex items-center gap-2">
                        <User className="size-4" />
                        {contact.name}
                        {contact.hubspotUrl && <HubSpotLink url={contact.hubspotUrl} />}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 space-y-1">
                        {contact.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="size-3" />
                            {contact.email}
                          </div>
                        )}
                        {contact.role && <div>{contact.role}</div>}
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Associated Deals */}
          {deals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Associated Deals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {deals.map((deal: any) => (
                    <Link
                      key={deal._id}
                      href={`/deals/${deal._id}`}
                      className="block p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="font-medium flex items-center gap-2">
                        <TrendingUp className="size-4" />
                        {deal.name}
                        {deal.hubspotUrl && <HubSpotLink url={deal.hubspotUrl} />}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-4">
                        {deal.stageName && <span>{deal.stageName}</span>}
                        {deal.amount && (
                          <span>
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            }).format(deal.amount)}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Client Status */}
          {company.promotedToClientId && (
            <Card>
              <CardHeader>
                <CardTitle>Client Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-green-600 mb-3">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Promoted to Client</span>
                </div>
                <Link href={`/clients/${company.promotedToClientId}`}>
                  <Button variant="outline" className="w-full">
                    View Client Dashboard
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* HubSpot Information */}
          {company.hubspotCompanyId && (
            <Card>
              <CardHeader>
                <CardTitle>HubSpot Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Company ID</div>
                  <div className="font-mono">{company.hubspotCompanyId}</div>
                </div>
                {company.lastHubSpotSync && (
                  <div>
                    <div className="text-muted-foreground">Last Synced</div>
                    <div>{new Date(company.lastHubSpotSync).toLocaleString()}</div>
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

