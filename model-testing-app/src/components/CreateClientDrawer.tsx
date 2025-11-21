'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Building2, User, X, Search, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface CreateClientDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CreateClientDrawer({
  isOpen,
  onClose,
  onSuccess,
}: CreateClientDrawerProps) {
  const router = useRouter();
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
      const clientId = await createClient({
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
      resetForms();
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

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && handleClose()} direction="right">
      <DrawerContent className="w-full sm:w-[600px] lg:w-[700px] h-full overflow-hidden flex flex-col">
        <DrawerHeader className="border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-xl font-semibold">Create New Client</DrawerTitle>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'search' | 'client' | 'company')} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="search" className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                Search & Promote
              </TabsTrigger>
              <TabsTrigger value="client" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                New Client
              </TabsTrigger>
              <TabsTrigger value="company" className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New Company
              </TabsTrigger>
            </TabsList>

            {/* Search & Promote Tab */}
            <TabsContent value="search" className="space-y-4 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="search">Search Contacts & Companies</Label>
                  <div className="relative" ref={searchRef}>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        id="search"
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
                        className="pl-10"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setShowSearchResults(false);
                          }}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {showSearchResults && (searchResults.companies.length > 0 || searchResults.contacts.length > 0) && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-96 overflow-y-auto">
                        {searchResults.companies.length > 0 && (
                          <div className="p-2 border-b border-gray-200">
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-2 px-2">Companies</div>
                            {searchResults.companies.map((company) => (
                              <button
                                key={company._id}
                                type="button"
                                onClick={() => handlePromoteCompany(company._id)}
                                disabled={promotingCompanyId === company._id}
                                className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors text-sm border-b border-gray-100 last:border-b-0 rounded-md mb-1"
                              >
                                <div className="font-medium flex items-center justify-between">
                                  <span>{company.name}</span>
                                  {promotingCompanyId === company._id ? (
                                    <span className="text-xs text-gray-500">Promoting...</span>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs"
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
                                  <div className="text-xs text-gray-500 mt-1">{company.domain}</div>
                                )}
                                {company.industry && (
                                  <div className="text-xs text-gray-500">{company.industry}</div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                        {searchResults.contacts.length > 0 && (
                          <div className="p-2">
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-2 px-2">Contacts</div>
                            {searchResults.contacts.map((contact) => (
                              <div
                                key={contact._id}
                                className="w-full text-left px-4 py-3 text-sm border-b border-gray-100 last:border-b-0 rounded-md mb-1"
                              >
                                <div className="font-medium">{contact.name}</div>
                                {contact.email && (
                                  <div className="text-xs text-gray-500 mt-1">{contact.email}</div>
                                )}
                                {contact.phone && (
                                  <div className="text-xs text-gray-500">{contact.phone}</div>
                                )}
                                {contact.role && (
                                  <div className="text-xs text-gray-500">{contact.role}</div>
                                )}
                                <p className="text-xs text-gray-400 mt-2">
                                  Create a company for this contact first, then promote to client
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {showSearchResults && searchQuery.length > 0 && searchResults.companies.length === 0 && searchResults.contacts.length === 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-4 text-sm text-gray-500 text-center">
                        No results found matching "{searchQuery}"
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Create Client Tab */}
            <TabsContent value="client" className="space-y-4 mt-0">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="client-name">Client Name *</Label>
                    <Input
                      id="client-name"
                      placeholder="Acme Corp"
                      value={clientForm.name}
                      onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client-type">Type</Label>
                    <Input
                      id="client-type"
                      placeholder="e.g., Lender, Broker, Developer"
                      value={clientForm.type}
                      onChange={(e) => setClientForm({ ...clientForm, type: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-status">Status</Label>
                  <select
                    id="client-status"
                    value={clientForm.status}
                    onChange={(e) => setClientForm({ ...clientForm, status: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                  >
                    <option value="prospect">Prospect</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="past">Past</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="client-email">Email</Label>
                    <Input
                      id="client-email"
                      type="email"
                      placeholder="contact@example.com"
                      value={clientForm.email}
                      onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client-phone">Phone</Label>
                    <Input
                      id="client-phone"
                      placeholder="+1 (555) 123-4567"
                      value={clientForm.phone}
                      onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-website">Website</Label>
                  <Input
                    id="client-website"
                    placeholder="https://example.com"
                    value={clientForm.website}
                    onChange={(e) => setClientForm({ ...clientForm, website: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-address">Address</Label>
                  <Input
                    id="client-address"
                    placeholder="123 Main St"
                    value={clientForm.address}
                    onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="client-city">City</Label>
                    <Input
                      id="client-city"
                      placeholder="New York"
                      value={clientForm.city}
                      onChange={(e) => setClientForm({ ...clientForm, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client-state">State</Label>
                    <Input
                      id="client-state"
                      placeholder="NY"
                      value={clientForm.state}
                      onChange={(e) => setClientForm({ ...clientForm, state: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client-zip">ZIP</Label>
                    <Input
                      id="client-zip"
                      placeholder="10001"
                      value={clientForm.zip}
                      onChange={(e) => setClientForm({ ...clientForm, zip: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client-country">Country</Label>
                    <Input
                      id="client-country"
                      placeholder="USA"
                      value={clientForm.country}
                      onChange={(e) => setClientForm({ ...clientForm, country: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-industry">Industry</Label>
                  <Input
                    id="client-industry"
                    placeholder="Real Estate, Technology, etc."
                    value={clientForm.industry}
                    onChange={(e) => setClientForm({ ...clientForm, industry: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-notes">Notes</Label>
                  <textarea
                    id="client-notes"
                    className="w-full min-h-[80px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                    placeholder="Additional notes about this client..."
                    value={clientForm.notes}
                    onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Create Company Tab */}
            <TabsContent value="company" className="space-y-4 mt-0">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-name">Company Name *</Label>
                    <Input
                      id="company-name"
                      placeholder="Acme Corp"
                      value={companyForm.name}
                      onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-type">Type</Label>
                    <Input
                      id="company-type"
                      placeholder="e.g., Developer, Lender"
                      value={companyForm.type}
                      onChange={(e) => setCompanyForm({ ...companyForm, type: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-website">Website</Label>
                    <Input
                      id="company-website"
                      placeholder="https://example.com"
                      value={companyForm.website}
                      onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-domain">Domain</Label>
                    <Input
                      id="company-domain"
                      placeholder="example.com"
                      value={companyForm.domain}
                      onChange={(e) => setCompanyForm({ ...companyForm, domain: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-phone">Phone</Label>
                    <Input
                      id="company-phone"
                      placeholder="+1 (555) 123-4567"
                      value={companyForm.phone}
                      onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-industry">Industry</Label>
                    <Input
                      id="company-industry"
                      placeholder="Real Estate, Technology, etc."
                      value={companyForm.industry}
                      onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-address">Address</Label>
                  <Input
                    id="company-address"
                    placeholder="123 Main St"
                    value={companyForm.address}
                    onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-city">City</Label>
                    <Input
                      id="company-city"
                      placeholder="New York"
                      value={companyForm.city}
                      onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-state">State</Label>
                    <Input
                      id="company-state"
                      placeholder="NY"
                      value={companyForm.state}
                      onChange={(e) => setCompanyForm({ ...companyForm, state: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-zip">ZIP</Label>
                    <Input
                      id="company-zip"
                      placeholder="10001"
                      value={companyForm.zip}
                      onChange={(e) => setCompanyForm({ ...companyForm, zip: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company-country">Country</Label>
                    <Input
                      id="company-country"
                      placeholder="USA"
                      value={companyForm.country}
                      onChange={(e) => setCompanyForm({ ...companyForm, country: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-notes">Notes</Label>
                  <textarea
                    id="company-notes"
                    className="w-full min-h-[80px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                    placeholder="Additional notes about this company..."
                    value={companyForm.notes}
                    onChange={(e) => setCompanyForm({ ...companyForm, notes: e.target.value })}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="border-t p-4 flex-shrink-0 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          {activeTab === 'search' && (
            <p className="text-sm text-gray-500 mr-auto">
              Search for companies to promote to clients
            </p>
          )}
          {activeTab === 'client' && (
            <Button
              onClick={handleCreateClient}
              disabled={isSubmitting || !clientForm.name.trim()}
            >
              {isSubmitting ? 'Creating...' : 'Create Client'}
            </Button>
          )}
          {activeTab === 'company' && (
            <Button
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

