'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from 'convex/react';
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
  Briefcase,
  TrendingUp,
} from 'lucide-react';
import { HubSpotLink } from '@/components/HubSpotLink';

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.contactId as string;
  
  const contact = useQuery(api.contacts.get, { id: contactId as any });

  if (contact === undefined) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading contact...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!contact) {
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
            <p className="text-gray-500">Contact not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Associated companies and deals are included in the contact query
  const companies = contact.companies || [];
  const deals = contact.deals || [];

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
              {contact.name}
              {contact.hubspotUrl && <HubSpotLink url={contact.hubspotUrl} />}
            </h1>
            {contact.role && (
              <div className="text-lg text-muted-foreground flex items-center gap-2">
                <Briefcase className="size-4" />
                {contact.role}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {contact.email && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Email</div>
                    <div className="text-base flex items-center gap-2">
                      <Mail className="size-4" />
                      <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                        {contact.email}
                      </a>
                    </div>
                  </div>
                )}
                {contact.phone && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Phone</div>
                    <div className="text-base flex items-center gap-2">
                      <Phone className="size-4" />
                      <a href={`tel:${contact.phone}`} className="text-primary hover:underline">
                        {contact.phone}
                      </a>
                    </div>
                  </div>
                )}
                {contact.company && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Company</div>
                    <div className="text-base flex items-center gap-2">
                      <Building2 className="size-4" />
                      {contact.company}
                    </div>
                  </div>
                )}
                {contact.hubspotLifecycleStageName && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Lifecycle Stage</div>
                    <Badge variant="outline">{contact.hubspotLifecycleStageName}</Badge>
                  </div>
                )}
                {contact.lastContactedDate && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Last Contacted</div>
                    <div className="text-base flex items-center gap-2">
                      <Calendar className="size-4" />
                      {new Date(contact.lastContactedDate).toLocaleString()}
                    </div>
                  </div>
                )}
                {contact.lastActivityDate && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Last Activity</div>
                    <div className="text-base flex items-center gap-2">
                      <Calendar className="size-4" />
                      {new Date(contact.lastActivityDate).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Associated Companies */}
          {companies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Associated Companies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {companies.map((company: any) => (
                    <Link
                      key={company._id}
                      href={`/companies/${company._id}`}
                      className="block p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="font-medium flex items-center gap-2">
                        <Building2 className="size-4" />
                        {company.name}
                        {company.hubspotUrl && <HubSpotLink url={company.hubspotUrl} />}
                      </div>
                      {company.website && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {company.website}
                        </div>
                      )}
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
          {/* HubSpot Information */}
          {contact.hubspotContactId && (
            <Card>
              <CardHeader>
                <CardTitle>HubSpot Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Contact ID</div>
                  <div className="font-mono">{contact.hubspotContactId}</div>
                </div>
                {contact.lastHubSpotSync && (
                  <div>
                    <div className="text-muted-foreground">Last Synced</div>
                    <div>{new Date(contact.lastHubSpotSync).toLocaleString()}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {contact.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{contact.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

