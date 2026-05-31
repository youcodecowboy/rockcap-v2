'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button, IconButton, Field, Input, Textarea, Select, TabStrip } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { Building2, X, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface CreateClientDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const TABS = [
  { id: 'search', label: 'Search & Promote' },
  { id: 'client', label: 'New Client' },
  { id: 'company', label: 'New Company' },
];

export default function CreateClientDrawer({
  isOpen,
  onClose,
  onSuccess,
}: CreateClientDrawerProps) {
  const router = useRouter();
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<'search' | 'client' | 'company'>('search');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [promotingCompanyId, setPromotingCompanyId] = useState<Id<'companies'> | null>(null);

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Refs for click outside detection
  const searchRef = useRef<HTMLDivElement>(null);

  // Client form state
  const [clientForm, setClientForm] = useState({
    name: '',
    type: '',
    status: 'active' as 'prospect' | 'active' | 'archived' | 'past',
    companyName: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    phone: '',
    email: '',
    website: '',
    industry: '',
    tags: [] as string[],
    notes: '',
  });

  // HubSpot-autocomplete state for the Client form. When set, submission
  // uses clients.createWithPromotion so the matched HubSpot company's
  // promotedToClientId is set atomically alongside the new client.
  const [promoteFromCompanyId, setPromoteFromCompanyId] =
    useState<Id<'companies'> | null>(null);
  const [nameFocused, setNameFocused] = useState(false);
  const hubspotMatches = useQuery(
    api.companies.searchByName,
    !promoteFromCompanyId && clientForm.name.trim().length >= 2
      ? { query: clientForm.name, limit: 6 }
      : 'skip',
  );

  // Company form state
  const [companyForm, setCompanyForm] = useState({
    name: '',
    domain: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    industry: '',
    type: '',
    website: '',
    notes: '',
  });

  // Fetch existing companies and contacts
  const companies = useQuery(api.companies.getAll) || [];
  const contacts = useQuery(api.contacts.getAll) || [];

  // Filter search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return { companies: [], contacts: [] };
    const query = searchQuery.toLowerCase();

    const filteredCompanies = companies
      .filter((company) =>
        !company.promotedToClientId && // Only show companies not already promoted
        (company.name?.toLowerCase().includes(query) ||
         company.domain?.toLowerCase().includes(query) ||
         company.industry?.toLowerCase().includes(query) ||
         company.city?.toLowerCase().includes(query))
      )
      .slice(0, 10);

    const filteredContacts = contacts
      .filter((contact) =>
        (contact.name?.toLowerCase().includes(query) ||
         contact.email?.toLowerCase().includes(query) ||
         contact.phone?.toLowerCase().includes(query) ||
         contact.role?.toLowerCase().includes(query))
      )
      .slice(0, 10);

    return { companies: filteredCompanies, contacts: filteredContacts };
  }, [searchQuery, companies, contacts]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mutations
  const createClient = useMutation(api.clients.create);
  // `createWithPromotion` lets the HubSpot autocomplete below both create
  // the client AND set `companies.promotedToClientId` on the selected
  // HubSpot company in a single round-trip — so synced deals / contacts /
  // activities immediately bind to the new client.
  const createWithPromotion = useMutation(api.clients.createWithPromotion);
  const createCompany = useMutation(api.companies.create);
  const promoteToClient = useMutation(api.companies.promoteToClient);

  const resetForms = () => {
    setClientForm({
      name: '',
      type: '',
      status: 'active',
      companyName: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      country: '',
      phone: '',
      email: '',
      website: '',
      industry: '',
      tags: [],
      notes: '',
    });
    setCompanyForm({
      name: '',
      domain: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      country: '',
      industry: '',
      type: '',
      website: '',
      notes: '',
    });
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleClose = () => {
    resetForms();
    onClose();
  };

  const handlePromoteCompany = async (companyId: Id<'companies'>) => {
    if (promotingCompanyId) return;

    setPromotingCompanyId(companyId);
    try {
      const clientId = await promoteToClient({ id: companyId });
      resetForms();
      onSuccess?.();
      handleClose();
      router.push(`/clients/${clientId}`);
    } catch (error) {
      console.error('Error promoting company to client:', error);
      alert('Failed to promote company to client. Please try again.');
      setPromotingCompanyId(null);
    }
  };

  const handleCreateClient = async () => {
    if (!clientForm.name.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // If the user picked a HubSpot match from the autocomplete, use
      // createWithPromotion so the company's promotedToClientId is set
      // in the same mutation. Otherwise fall back to the plain create.
      let clientId;
      if (promoteFromCompanyId) {
        clientId = await createWithPromotion({
          name: clientForm.name.trim(),
          companyName: clientForm.companyName.trim() || clientForm.name.trim(),
          industry: clientForm.industry.trim() || undefined,
          website: clientForm.website.trim() || undefined,
          address: clientForm.address.trim() || undefined,
          city: clientForm.city.trim() || undefined,
          country: clientForm.country.trim() || undefined,
          phone: clientForm.phone.trim() || undefined,
          type: clientForm.type.trim() || undefined,
          status: clientForm.status,
          promoteFromCompanyId,
        });
      } else {
        clientId = await createClient({
          name: clientForm.name.trim(),
          type: clientForm.type.trim() || undefined,
          status: clientForm.status,
          companyName: clientForm.companyName.trim() || undefined,
          address: clientForm.address.trim() || undefined,
          city: clientForm.city.trim() || undefined,
          state: clientForm.state.trim() || undefined,
          zip: clientForm.zip.trim() || undefined,
          country: clientForm.country.trim() || undefined,
          phone: clientForm.phone.trim() || undefined,
          email: clientForm.email.trim() || undefined,
          website: clientForm.website.trim() || undefined,
          industry: clientForm.industry.trim() || undefined,
          tags: clientForm.tags.length > 0 ? clientForm.tags : undefined,
          notes: clientForm.notes.trim() || undefined,
        });
      }
      resetForms();
      setPromoteFromCompanyId(null);
      onSuccess?.();
      handleClose();
      router.push(`/clients/${clientId}`);
    } catch (error) {
      console.error('Error creating client:', error);
      alert('Failed to create client. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCompany = async () => {
    if (!companyForm.name.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await createCompany({
        name: companyForm.name.trim(),
        domain: companyForm.domain.trim() || undefined,
        phone: companyForm.phone.trim() || undefined,
        address: companyForm.address.trim() || undefined,
        city: companyForm.city.trim() || undefined,
        state: companyForm.state.trim() || undefined,
        zip: companyForm.zip.trim() || undefined,
        country: companyForm.country.trim() || undefined,
        industry: companyForm.industry.trim() || undefined,
        type: companyForm.type.trim() || undefined,
        website: companyForm.website.trim() || undefined,
        notes: companyForm.notes.trim() || undefined,
      });
      resetForms();
      onSuccess?.();
      // Switch to search tab to show the newly created company
      setActiveTab('search');
      setSearchQuery(companyForm.name);
      setShowSearchResults(true);
    } catch (error) {
      console.error('Error creating company:', error);
      alert('Failed to create company. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const dropdownLabelStyle = {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
    color: colors.text.muted,
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && handleClose()} direction="right">
      <DrawerContent
        className="w-full sm:w-[600px] lg:w-[700px] h-full overflow-hidden flex flex-col"
        style={{ background: colors.bg.base }}
      >
        <DrawerHeader className="flex-shrink-0" style={{ borderBottom: `1px solid ${colors.border.default}` }}>
          <div className="flex items-center justify-between">
            <DrawerTitle style={{ fontSize: 18, fontWeight: 600, color: colors.text.primary }}>
              Create New Client
            </DrawerTitle>
            <DrawerClose asChild>
              <IconButton label="Close">
                <X size={16} />
              </IconButton>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto">
          <TabStrip
            tabs={TABS}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as 'search' | 'client' | 'company')}
            entityType="client"
          />

          <div style={{ padding: 24 }}>
            {/* Search & Promote Tab */}
            {activeTab === 'search' && (
              <Field label="Search Contacts & Companies">
                <div style={{ position: 'relative' }} ref={searchRef}>
                  <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.text.dim, pointerEvents: 'none' }} />
                    <Input
                      placeholder="Search by name, email, phone, or industry..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setShowSearchResults(e.target.value.length > 0);
                      }}
                      onFocus={() => {
                        if (searchQuery.length > 0) {
                          setShowSearchResults(true);
                        }
                      }}
                      style={{ paddingLeft: 32 }}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setShowSearchResults(false);
                        }}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: colors.text.dim, background: 'transparent', border: 'none', cursor: 'pointer' }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  {showSearchResults && (searchResults.companies.length > 0 || searchResults.contacts.length > 0) && (
                    <div style={{ position: 'absolute', zIndex: 50, width: '100%', marginTop: 4, background: colors.bg.card, border: `1px solid ${colors.border.default}`, borderRadius: 4, maxHeight: 384, overflowY: 'auto' }}>
                      {searchResults.companies.length > 0 && (
                        <div style={{ padding: 8, borderBottom: `1px solid ${colors.border.default}` }}>
                          <div style={{ ...dropdownLabelStyle, marginBottom: 8, padding: '0 8px' }}>Companies</div>
                          {searchResults.companies.map((company) => (
                            <button
                              key={company._id}
                              type="button"
                              onClick={() => handlePromoteCompany(company._id)}
                              disabled={promotingCompanyId === company._id}
                              style={{ width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: 13, borderRadius: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: colors.text.primary }}
                            >
                              <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>{company.name}</span>
                                {promotingCompanyId === company._id ? (
                                  <span style={{ fontSize: 11, color: colors.text.muted }}>Promoting...</span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePromoteCompany(company._id);
                                    }}
                                  >
                                    Promote to Client
                                  </Button>
                                )}
                              </div>
                              {company.domain && (
                                <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>{company.domain}</div>
                              )}
                              {company.industry && (
                                <div style={{ fontSize: 11, color: colors.text.muted }}>{company.industry}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      {searchResults.contacts.length > 0 && (
                        <div style={{ padding: 8 }}>
                          <div style={{ ...dropdownLabelStyle, marginBottom: 8, padding: '0 8px' }}>Contacts</div>
                          {searchResults.contacts.map((contact) => (
                            <div
                              key={contact._id}
                              style={{ width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: 13, color: colors.text.primary }}
                            >
                              <div style={{ fontWeight: 500 }}>{contact.name}</div>
                              {contact.email && (
                                <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>{contact.email}</div>
                              )}
                              {contact.phone && (
                                <div style={{ fontSize: 11, color: colors.text.muted }}>{contact.phone}</div>
                              )}
                              {contact.role && (
                                <div style={{ fontSize: 11, color: colors.text.muted }}>{contact.role}</div>
                              )}
                              <p style={{ fontSize: 11, color: colors.text.dim, marginTop: 8 }}>
                                Create a company for this contact first, then promote to client
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {showSearchResults && searchQuery.length > 0 && searchResults.companies.length === 0 && searchResults.contacts.length === 0 && (
                    <div style={{ position: 'absolute', zIndex: 50, width: '100%', marginTop: 4, background: colors.bg.card, border: `1px solid ${colors.border.default}`, borderRadius: 4, padding: 16, fontSize: 13, color: colors.text.muted, textAlign: 'center' }}>
                      No results found matching &quot;{searchQuery}&quot;
                    </div>
                  )}
                </div>
              </Field>
            )}

            {/* Create Client Tab */}
            {activeTab === 'client' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="grid grid-cols-2 gap-4">
                  <div style={{ position: 'relative' }}>
                    <Field
                      label={promoteFromCompanyId ? 'Client Name * — Linked to HubSpot' : 'Client Name *'}
                    >
                      <Input
                        placeholder="Acme Corp"
                        value={clientForm.name}
                        onChange={(e) => {
                          setClientForm({ ...clientForm, name: e.target.value });
                          // If the user edits the name after selecting a match,
                          // unlink — they're starting over.
                          if (promoteFromCompanyId) setPromoteFromCompanyId(null);
                        }}
                        onFocus={() => setNameFocused(true)}
                        onBlur={() => {
                          // Delay so clicks on the dropdown items can fire first.
                          setTimeout(() => setNameFocused(false), 150);
                        }}
                      />
                    </Field>
                    {/* HubSpot autocomplete dropdown — shows matching
                        synced companies when the user is typing a new
                        client name. Selecting one pre-fills the form +
                        marks promoteFromCompanyId so submit atomically
                        links the company to the new client. */}
                    {nameFocused &&
                    hubspotMatches &&
                    hubspotMatches.length > 0 &&
                    !promoteFromCompanyId ? (
                      <div style={{ position: 'absolute', zIndex: 10, left: 0, right: 0, marginTop: 4, background: colors.bg.card, border: `1px solid ${colors.border.default}`, borderRadius: 4, maxHeight: 256, overflowY: 'auto' }}>
                        <div style={{ padding: '6px 12px', background: colors.bg.light, borderBottom: `1px solid ${colors.border.default}` }}>
                          <p style={dropdownLabelStyle}>
                            From HubSpot ({hubspotMatches.length})
                          </p>
                        </div>
                        {hubspotMatches.map((c: any) => {
                          const isExact =
                            c.name.toLowerCase() === clientForm.name.trim().toLowerCase();
                          return (
                            <button
                              key={c._id}
                              type="button"
                              onClick={() => {
                                // Already promoted — navigate instead of creating.
                                if (c.promotedToClientId) {
                                  router.push(`/clients/${c.promotedToClientId}`);
                                  return;
                                }
                                // Pre-fill form from HubSpot company data.
                                setClientForm((prev) => ({
                                  ...prev,
                                  name: c.name,
                                  companyName: c.name,
                                  industry: c.industry ?? prev.industry,
                                  website: c.website ?? c.domain ?? prev.website,
                                  address: c.address ?? prev.address,
                                  city: c.city ?? prev.city,
                                  country: c.country ?? prev.country,
                                  phone: c.phone ?? prev.phone,
                                  type: c.type ?? prev.type,
                                }));
                                setPromoteFromCompanyId(c._id);
                                setNameFocused(false);
                              }}
                              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `1px solid ${colors.border.light}`, cursor: 'pointer' }}
                            >
                              <div style={{ width: 32, height: 32, borderRadius: 4, background: `${colors.accent.blue}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Building2 size={16} style={{ color: colors.accent.blue }} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {c.name}
                                </p>
                                <p style={{ fontSize: 11, color: colors.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {[
                                    c.domain,
                                    c.hubspotLifecycleStageName ?? c.hubspotLifecycleStage,
                                    c.promotedToClientId ? 'already a client' : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </div>
                              {isExact ? (
                                <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: colors.accent.green, background: `${colors.accent.green}20`, padding: '2px 6px', borderRadius: 2 }}>
                                  Match
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <Field label="Type">
                    <Input
                      placeholder="e.g., Lender, Broker, Developer"
                      value={clientForm.type}
                      onChange={(e) => setClientForm({ ...clientForm, type: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label="Status">
                  <Select
                    value={clientForm.status}
                    onChange={(e) => setClientForm({ ...clientForm, status: e.target.value as any })}
                  >
                    <option value="prospect">Prospect</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="past">Past</option>
                  </Select>
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Email">
                    <Input
                      type="email"
                      placeholder="contact@example.com"
                      value={clientForm.email}
                      onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      placeholder="+1 (555) 123-4567"
                      value={clientForm.phone}
                      onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label="Website">
                  <Input
                    placeholder="https://example.com"
                    value={clientForm.website}
                    onChange={(e) => setClientForm({ ...clientForm, website: e.target.value })}
                  />
                </Field>

                <Field label="Address">
                  <Input
                    placeholder="123 Main St"
                    value={clientForm.address}
                    onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                  />
                </Field>

                <div className="grid grid-cols-4 gap-4">
                  <Field label="City">
                    <Input
                      placeholder="New York"
                      value={clientForm.city}
                      onChange={(e) => setClientForm({ ...clientForm, city: e.target.value })}
                    />
                  </Field>
                  <Field label="State">
                    <Input
                      placeholder="NY"
                      value={clientForm.state}
                      onChange={(e) => setClientForm({ ...clientForm, state: e.target.value })}
                    />
                  </Field>
                  <Field label="ZIP">
                    <Input
                      placeholder="10001"
                      value={clientForm.zip}
                      onChange={(e) => setClientForm({ ...clientForm, zip: e.target.value })}
                    />
                  </Field>
                  <Field label="Country">
                    <Input
                      placeholder="USA"
                      value={clientForm.country}
                      onChange={(e) => setClientForm({ ...clientForm, country: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label="Industry">
                  <Input
                    placeholder="Real Estate, Technology, etc."
                    value={clientForm.industry}
                    onChange={(e) => setClientForm({ ...clientForm, industry: e.target.value })}
                  />
                </Field>

                <Field label="Notes">
                  <Textarea
                    placeholder="Additional notes about this client..."
                    value={clientForm.notes}
                    onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                  />
                </Field>
              </div>
            )}

            {/* Create Company Tab */}
            {activeTab === 'company' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Company Name *">
                    <Input
                      placeholder="Acme Corp"
                      value={companyForm.name}
                      onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                    />
                  </Field>
                  <Field label="Type">
                    <Input
                      placeholder="e.g., Developer, Lender"
                      value={companyForm.type}
                      onChange={(e) => setCompanyForm({ ...companyForm, type: e.target.value })}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Website">
                    <Input
                      placeholder="https://example.com"
                      value={companyForm.website}
                      onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                    />
                  </Field>
                  <Field label="Domain">
                    <Input
                      placeholder="example.com"
                      value={companyForm.domain}
                      onChange={(e) => setCompanyForm({ ...companyForm, domain: e.target.value })}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Phone">
                    <Input
                      placeholder="+1 (555) 123-4567"
                      value={companyForm.phone}
                      onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                    />
                  </Field>
                  <Field label="Industry">
                    <Input
                      placeholder="Real Estate, Technology, etc."
                      value={companyForm.industry}
                      onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label="Address">
                  <Input
                    placeholder="123 Main St"
                    value={companyForm.address}
                    onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  />
                </Field>

                <div className="grid grid-cols-4 gap-4">
                  <Field label="City">
                    <Input
                      placeholder="New York"
                      value={companyForm.city}
                      onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                    />
                  </Field>
                  <Field label="State">
                    <Input
                      placeholder="NY"
                      value={companyForm.state}
                      onChange={(e) => setCompanyForm({ ...companyForm, state: e.target.value })}
                    />
                  </Field>
                  <Field label="ZIP">
                    <Input
                      placeholder="10001"
                      value={companyForm.zip}
                      onChange={(e) => setCompanyForm({ ...companyForm, zip: e.target.value })}
                    />
                  </Field>
                  <Field label="Country">
                    <Input
                      placeholder="USA"
                      value={companyForm.country}
                      onChange={(e) => setCompanyForm({ ...companyForm, country: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label="Notes">
                  <Textarea
                    placeholder="Additional notes about this company..."
                    value={companyForm.notes}
                    onChange={(e) => setCompanyForm({ ...companyForm, notes: e.target.value })}
                  />
                </Field>
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${colors.border.default}`, padding: 16 }}>
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          {activeTab === 'search' && (
            <p style={{ fontSize: 12, color: colors.text.muted, marginRight: 'auto' }}>
              Search for companies to promote to clients
            </p>
          )}
          {activeTab === 'client' && (
            <Button
              variant="primary"
              accent={colors.entityTypes.client}
              onClick={handleCreateClient}
              disabled={isSubmitting || !clientForm.name.trim()}
            >
              {isSubmitting ? 'Creating...' : 'Create Client'}
            </Button>
          )}
          {activeTab === 'company' && (
            <Button
              variant="primary"
              accent={colors.entityTypes.client}
              onClick={handleCreateCompany}
              disabled={isSubmitting || !companyForm.name.trim()}
            >
              {isSubmitting ? 'Creating...' : 'Create Company'}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
