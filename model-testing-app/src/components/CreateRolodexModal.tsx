'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Building2, User, X, Search } from 'lucide-react';
import { useQuery } from 'convex/react';
import { Id } from '../../convex/_generated/dataModel';

interface CreateRolodexModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CreateRolodexModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateRolodexModalProps) {
  const [activeTab, setActiveTab] = useState<'company' | 'contact'>('company');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search states for linking
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [showContactResults, setShowContactResults] = useState(false);
  const [showCompanyResults, setShowCompanyResults] = useState(false);

  // Refs for click outside detection
  const contactSearchRef = useRef<HTMLDivElement>(null);
  const companySearchRef = useRef<HTMLDivElement>(null);

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
    linkedContactIds: [] as Id<'contacts'>[],
  });

  // Contact form state
  const [contactForm, setContactForm] = useState({
    name: '',
    role: '',
    email: '',
    phone: '',
    company: '',
    notes: '',
    linkedCompanyIds: [] as Id<'companies'>[],
  });

  // Fetch existing companies and contacts for linking
  const companies = useQuery(api.companies.getAll) || [];
  const contacts = useQuery(api.contacts.getAll) || [];

  // Filter contacts based on search query
  const filteredContacts = useMemo(() => {
    if (!contactSearchQuery.trim()) return [];
    const query = contactSearchQuery.toLowerCase();
    return contacts
      .filter(
        (contact) =>
          !companyForm.linkedContactIds.includes(contact._id) &&
          (contact.name?.toLowerCase().includes(query) ||
            contact.email?.toLowerCase().includes(query) ||
            contact.phone?.toLowerCase().includes(query) ||
            contact.role?.toLowerCase().includes(query))
      )
      .slice(0, 10); // Limit to 10 results
  }, [contactSearchQuery, contacts, companyForm.linkedContactIds]);

  // Filter companies based on search query
  const filteredCompanies = useMemo(() => {
    if (!companySearchQuery.trim()) return [];
    const query = companySearchQuery.toLowerCase();
    return companies
      .filter(
        (company) =>
          !contactForm.linkedCompanyIds.includes(company._id) &&
          (company.name?.toLowerCase().includes(query) ||
            company.domain?.toLowerCase().includes(query) ||
            company.industry?.toLowerCase().includes(query) ||
            company.city?.toLowerCase().includes(query))
      )
      .slice(0, 10); // Limit to 10 results
  }, [companySearchQuery, companies, contactForm.linkedCompanyIds]);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contactSearchRef.current &&
        !contactSearchRef.current.contains(event.target as Node)
      ) {
        setShowContactResults(false);
      }
      if (
        companySearchRef.current &&
        !companySearchRef.current.contains(event.target as Node)
      ) {
        setShowCompanyResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mutations
  const createCompany = useMutation(api.companies.create);
  const createContact = useMutation(api.contacts.create);

  const resetForms = () => {
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
      linkedContactIds: [],
    });
    setContactForm({
      name: '',
      role: '',
      email: '',
      phone: '',
      company: '',
      notes: '',
      linkedCompanyIds: [],
    });
    setContactSearchQuery('');
    setCompanySearchQuery('');
    setShowContactResults(false);
    setShowCompanyResults(false);
  };

  const handleClose = () => {
    resetForms();
    onClose();
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
        linkedContactIds: companyForm.linkedContactIds.length > 0 ? companyForm.linkedContactIds : undefined,
      });
      resetForms();
      onSuccess?.();
      handleClose();
    } catch (error) {
      console.error('Error creating company:', error);
      alert('Failed to create company. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateContact = async () => {
    if (!contactForm.name.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await createContact({
        name: contactForm.name.trim(),
        role: contactForm.role.trim() || undefined,
        email: contactForm.email.trim() || undefined,
        phone: contactForm.phone.trim() || undefined,
        company: contactForm.company.trim() || undefined,
        notes: contactForm.notes.trim() || undefined,
        linkedCompanyIds: contactForm.linkedCompanyIds.length > 0 ? contactForm.linkedCompanyIds : undefined,
      });
      resetForms();
      onSuccess?.();
      handleClose();
    } catch (error) {
      console.error('Error creating contact:', error);
      alert('Failed to create contact. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Create New Record</DialogTitle>
          <DialogDescription>
            Add a new company or contact to your rolodex
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'company' | 'contact')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="company" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Company
            </TabsTrigger>
            <TabsTrigger value="contact" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Contact
            </TabsTrigger>
          </TabsList>

          {/* Company Tab */}
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
                <Label htmlFor="company-contacts">Link Existing Contacts</Label>
                <div className="relative" ref={contactSearchRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      id="company-contacts"
                      placeholder="Search contacts by name, email, or phone..."
                      value={contactSearchQuery}
                      onChange={(e) => {
                        setContactSearchQuery(e.target.value);
                        setShowContactResults(e.target.value.length > 0);
                      }}
                      onFocus={() => {
                        if (contactSearchQuery.length > 0) {
                          setShowContactResults(true);
                        }
                      }}
                      className="pl-10"
                    />
                    {contactSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setContactSearchQuery('');
                          setShowContactResults(false);
                        }}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {showContactResults && filteredContacts.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredContacts.map((contact) => (
                        <button
                          key={contact._id}
                          type="button"
                          onClick={() => {
                            if (!companyForm.linkedContactIds.includes(contact._id)) {
                              setCompanyForm({
                                ...companyForm,
                                linkedContactIds: [...companyForm.linkedContactIds, contact._id],
                              });
                            }
                            setContactSearchQuery('');
                            setShowContactResults(false);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors text-sm border-b border-gray-100 last:border-b-0"
                        >
                          <div className="font-medium">{contact.name}</div>
                          {contact.email && (
                            <div className="text-xs text-gray-500">{contact.email}</div>
                          )}
                          {contact.phone && (
                            <div className="text-xs text-gray-500">{contact.phone}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {showContactResults && contactSearchQuery.length > 0 && filteredContacts.length === 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-4 text-sm text-gray-500 text-center">
                      No contacts found matching "{contactSearchQuery}"
                    </div>
                  )}
                </div>
                {companyForm.linkedContactIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {companyForm.linkedContactIds.map((contactId) => {
                      const contact = contacts.find((c) => c._id === contactId);
                      return contact ? (
                        <div
                          key={contactId}
                          className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-md text-sm"
                        >
                          <span>{contact.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setCompanyForm({
                                ...companyForm,
                                linkedContactIds: companyForm.linkedContactIds.filter((id) => id !== contactId),
                              });
                            }}
                            className="ml-1 hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
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

          {/* Contact Tab */}
          <TabsContent value="contact" className="space-y-4 mt-0">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contact-name">Name *</Label>
                  <Input
                    id="contact-name"
                    placeholder="John Doe"
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-role">Role</Label>
                  <Input
                    id="contact-role"
                    placeholder="CEO, Manager, etc."
                    value={contactForm.role}
                    onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    placeholder="john@example.com"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-phone">Phone</Label>
                  <Input
                    id="contact-phone"
                    placeholder="+1 (555) 123-4567"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-company-text">Company (Text)</Label>
                <Input
                  id="contact-company-text"
                  placeholder="Company name (if not linking below)"
                  value={contactForm.company}
                  onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-companies">Link to Existing Companies</Label>
                <div className="relative" ref={companySearchRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      id="contact-companies"
                      placeholder="Search companies by name, domain, or industry..."
                      value={companySearchQuery}
                      onChange={(e) => {
                        setCompanySearchQuery(e.target.value);
                        setShowCompanyResults(e.target.value.length > 0);
                      }}
                      onFocus={() => {
                        if (companySearchQuery.length > 0) {
                          setShowCompanyResults(true);
                        }
                      }}
                      className="pl-10"
                    />
                    {companySearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setCompanySearchQuery('');
                          setShowCompanyResults(false);
                        }}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {showCompanyResults && filteredCompanies.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredCompanies.map((company) => (
                        <button
                          key={company._id}
                          type="button"
                          onClick={() => {
                            if (!contactForm.linkedCompanyIds.includes(company._id)) {
                              setContactForm({
                                ...contactForm,
                                linkedCompanyIds: [...contactForm.linkedCompanyIds, company._id],
                              });
                            }
                            setCompanySearchQuery('');
                            setShowCompanyResults(false);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors text-sm border-b border-gray-100 last:border-b-0"
                        >
                          <div className="font-medium">{company.name}</div>
                          {company.domain && (
                            <div className="text-xs text-gray-500">{company.domain}</div>
                          )}
                          {company.industry && (
                            <div className="text-xs text-gray-500">{company.industry}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {showCompanyResults && companySearchQuery.length > 0 && filteredCompanies.length === 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-4 text-sm text-gray-500 text-center">
                      No companies found matching "{companySearchQuery}"
                    </div>
                  )}
                </div>
                {contactForm.linkedCompanyIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {contactForm.linkedCompanyIds.map((companyId) => {
                      const company = companies.find((c) => c._id === companyId);
                      return company ? (
                        <div
                          key={companyId}
                          className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-md text-sm"
                        >
                          <span>{company.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setContactForm({
                                ...contactForm,
                                linkedCompanyIds: contactForm.linkedCompanyIds.filter((id) => id !== companyId),
                              });
                            }}
                            className="ml-1 hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-notes">Notes</Label>
                <textarea
                  id="contact-notes"
                  className="w-full min-h-[80px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                  placeholder="Additional notes about this contact..."
                  value={contactForm.notes}
                  onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={activeTab === 'company' ? handleCreateCompany : handleCreateContact}
            disabled={isSubmitting || (activeTab === 'company' ? !companyForm.name.trim() : !contactForm.name.trim())}
          >
            {isSubmitting ? 'Creating...' : `Create ${activeTab === 'company' ? 'Company' : 'Contact'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

