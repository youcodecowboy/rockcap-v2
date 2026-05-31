'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Button, Modal, Field, Input, Textarea, TabStrip } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { X, Search } from 'lucide-react';
import { useQuery } from 'convex/react';
import { Id } from '../../convex/_generated/dataModel';

interface CreateRolodexModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const TABS = [
  { id: 'company', label: 'Company' },
  { id: 'contact', label: 'Contact' },
];

export default function CreateRolodexModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateRolodexModalProps) {
  const colors = useColors();
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

  const searchIconStyle = { position: 'absolute' as const, left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.text.dim, pointerEvents: 'none' as const };
  const clearBtnStyle = { position: 'absolute' as const, right: 10, top: '50%', transform: 'translateY(-50%)', color: colors.text.dim, background: 'transparent', border: 'none', cursor: 'pointer' };
  const dropdownStyle = { position: 'absolute' as const, zIndex: 50, width: '100%', marginTop: 4, background: colors.bg.card, border: `1px solid ${colors.border.default}`, borderRadius: 4, maxHeight: 240, overflowY: 'auto' as const };
  const resultBtnStyle = { width: '100%', textAlign: 'left' as const, padding: '8px 12px', fontSize: 13, background: 'transparent', border: 'none', borderBottom: `1px solid ${colors.border.light}`, cursor: 'pointer', color: colors.text.primary };
  const noResultsStyle = { position: 'absolute' as const, zIndex: 50, width: '100%', marginTop: 4, background: colors.bg.card, border: `1px solid ${colors.border.default}`, borderRadius: 4, padding: 16, fontSize: 13, color: colors.text.muted, textAlign: 'center' as const };
  const chipStyle = { display: 'flex', alignItems: 'center', gap: 4, background: colors.bg.cardAlt, border: `1px solid ${colors.border.default}`, padding: '4px 8px', borderRadius: 2, fontSize: 12, color: colors.text.primary };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Create New Record"
      width={680}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            accent={activeTab === 'company' ? colors.entityTypes.client : colors.entityTypes.contact}
            onClick={activeTab === 'company' ? handleCreateCompany : handleCreateContact}
            disabled={isSubmitting || (activeTab === 'company' ? !companyForm.name.trim() : !contactForm.name.trim())}
          >
            {isSubmitting ? 'Creating...' : `Create ${activeTab === 'company' ? 'Company' : 'Contact'}`}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 16 }}>
        Add a new company or contact to your rolodex
      </p>

      <div style={{ marginBottom: 16, marginLeft: -16, marginRight: -16 }}>
        <TabStrip
          tabs={TABS}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as 'company' | 'contact')}
          entityType="contact"
        />
      </div>

      {/* Company Tab */}
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

          <Field label="Link Existing Contacts">
            <div style={{ position: 'relative' }} ref={contactSearchRef}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={searchIconStyle} />
                <Input
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
                  style={{ paddingLeft: 32 }}
                />
                {contactSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setContactSearchQuery('');
                      setShowContactResults(false);
                    }}
                    style={clearBtnStyle}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              {showContactResults && filteredContacts.length > 0 && (
                <div style={dropdownStyle}>
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
                      style={resultBtnStyle}
                    >
                      <div style={{ fontWeight: 500 }}>{contact.name}</div>
                      {contact.email && <div style={{ fontSize: 11, color: colors.text.muted }}>{contact.email}</div>}
                      {contact.phone && <div style={{ fontSize: 11, color: colors.text.muted }}>{contact.phone}</div>}
                    </button>
                  ))}
                </div>
              )}
              {showContactResults && contactSearchQuery.length > 0 && filteredContacts.length === 0 && (
                <div style={noResultsStyle}>No contacts found matching &quot;{contactSearchQuery}&quot;</div>
              )}
            </div>
            {companyForm.linkedContactIds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {companyForm.linkedContactIds.map((contactId) => {
                  const contact = contacts.find((c) => c._id === contactId);
                  return contact ? (
                    <div key={contactId} style={chipStyle}>
                      <span>{contact.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCompanyForm({
                            ...companyForm,
                            linkedContactIds: companyForm.linkedContactIds.filter((id) => id !== contactId),
                          });
                        }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.text.muted, display: 'flex' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
            )}
          </Field>

          <Field label="Notes">
            <Textarea
              placeholder="Additional notes about this company..."
              value={companyForm.notes}
              onChange={(e) => setCompanyForm({ ...companyForm, notes: e.target.value })}
            />
          </Field>
        </div>
      )}

      {/* Contact Tab */}
      {activeTab === 'contact' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name *">
              <Input
                placeholder="John Doe"
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              />
            </Field>
            <Field label="Role">
              <Input
                placeholder="CEO, Manager, etc."
                value={contactForm.role}
                onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Email">
              <Input
                type="email"
                placeholder="john@example.com"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <Input
                placeholder="+1 (555) 123-4567"
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Company (Text)">
            <Input
              placeholder="Company name (if not linking below)"
              value={contactForm.company}
              onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
            />
          </Field>

          <Field label="Link to Existing Companies">
            <div style={{ position: 'relative' }} ref={companySearchRef}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={searchIconStyle} />
                <Input
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
                  style={{ paddingLeft: 32 }}
                />
                {companySearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setCompanySearchQuery('');
                      setShowCompanyResults(false);
                    }}
                    style={clearBtnStyle}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              {showCompanyResults && filteredCompanies.length > 0 && (
                <div style={dropdownStyle}>
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
                      style={resultBtnStyle}
                    >
                      <div style={{ fontWeight: 500 }}>{company.name}</div>
                      {company.domain && <div style={{ fontSize: 11, color: colors.text.muted }}>{company.domain}</div>}
                      {company.industry && <div style={{ fontSize: 11, color: colors.text.muted }}>{company.industry}</div>}
                    </button>
                  ))}
                </div>
              )}
              {showCompanyResults && companySearchQuery.length > 0 && filteredCompanies.length === 0 && (
                <div style={noResultsStyle}>No companies found matching &quot;{companySearchQuery}&quot;</div>
              )}
            </div>
            {contactForm.linkedCompanyIds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {contactForm.linkedCompanyIds.map((companyId) => {
                  const company = companies.find((c) => c._id === companyId);
                  return company ? (
                    <div key={companyId} style={chipStyle}>
                      <span>{company.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setContactForm({
                            ...contactForm,
                            linkedCompanyIds: contactForm.linkedCompanyIds.filter((id) => id !== companyId),
                          });
                        }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.text.muted, display: 'flex' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
            )}
          </Field>

          <Field label="Notes">
            <Textarea
              placeholder="Additional notes about this contact..."
              value={contactForm.notes}
              onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}
