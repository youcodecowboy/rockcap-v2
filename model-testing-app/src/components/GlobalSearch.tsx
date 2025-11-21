'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useRouter } from 'next/navigation';
import { Search, X, Users, Building2, Briefcase, FileText, Loader2, User, BookOpen } from 'lucide-react';
import { Input } from './ui/input';
import { useGlobalSearch } from '@/contexts/GlobalSearchContext';

interface SearchResult {
  clients: Array<{
    id: Id<"clients">;
    name: string;
    companyName?: string;
    email?: string;
    phone?: string;
    status?: string;
    type?: string;
  }>;
  companies: Array<{
    id: Id<"companies">;
    name: string;
    domain?: string;
    industry?: string;
    city?: string;
    state?: string;
    hubspotLifecycleStageName?: string;
  }>;
  deals: Array<{
    id: Id<"deals">;
    name: string;
    amount?: number;
    dealType?: string;
    stageName?: string;
    pipelineName?: string;
    closeDate?: string;
  }>;
  documents: Array<{
    id: Id<"documents">;
    fileName: string;
    fileType: string;
    fileTypeDetected: string;
    summary: string;
    clientName?: string;
    projectName?: string;
    category: string;
  }>;
  contacts: Array<{
    id: Id<"contacts">;
    name: string;
    email?: string;
    phone?: string;
    role?: string;
    company?: string;
  }>;
  knowledgeBankEntries: Array<{
    id: Id<"knowledgeBankEntries">;
    title: string;
    content: string;
    entryType: string;
    keyPoints: string[];
    tags: string[];
    clientId?: Id<"clients">;
    clientName?: string;
    projectId?: Id<"projects">;
  }>;
}

export default function GlobalSearch() {
  const { isOpen, setIsOpen } = useGlobalSearch();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch search results
  const searchResults = useQuery(
    api.search.globalSearch,
    debouncedQuery.trim() ? { query: debouncedQuery, limit: 10 } : 'skip'
  ) as SearchResult | undefined;

  // Flatten and index all results for keyboard navigation
  const flatResults = useMemo(() => {
    if (!searchResults) return [];
    
    const results: Array<{ type: 'client' | 'company' | 'deal' | 'document' | 'contact' | 'knowledgeBankEntry'; id: string; data: any }> = [];
    
    searchResults.clients.forEach((client) => {
      results.push({ type: 'client', id: client.id, data: client });
    });
    searchResults.companies.forEach((company) => {
      results.push({ type: 'company', id: company.id, data: company });
    });
    searchResults.deals.forEach((deal) => {
      results.push({ type: 'deal', id: deal.id, data: deal });
    });
    searchResults.documents.forEach((doc) => {
      results.push({ type: 'document', id: doc.id, data: doc });
    });
    searchResults.contacts.forEach((contact) => {
      results.push({ type: 'contact', id: contact.id, data: contact });
    });
    searchResults.knowledgeBankEntries.forEach((entry) => {
      results.push({ type: 'knowledgeBankEntry', id: entry.id, data: entry });
    });
    
    return results;
  }, [searchResults]);

  const handleResultClick = useCallback((result: { type: string; id: string; data?: any }) => {
    switch (result.type) {
      case 'client':
        router.push(`/clients/${result.id}`);
        break;
      case 'company':
        router.push(`/companies/${result.id}`);
        break;
      case 'deal':
        router.push(`/deals/${result.id}`);
        break;
      case 'document':
        router.push(`/docs/${result.id}`);
        break;
      case 'contact':
        router.push(`/contacts/${result.id}`);
        break;
      case 'knowledgeBankEntry':
        if (result.data?.clientId) {
          router.push(`/knowledge-bank/${result.data.clientId}`);
        } else {
          router.push(`/knowledge-bank`);
        }
        break;
    }
    setIsOpen(false);
    setSearchQuery('');
    setSelectedIndex(-1);
  }, [router]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
        setSelectedIndex(-1);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus input when opened
      setTimeout(() => inputRef.current?.focus(), 100);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery('');
        setSelectedIndex(-1);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) => 
          prev < flatResults.length - 1 ? prev + 1 : prev
        );
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      }

      if (event.key === 'Enter' && selectedIndex >= 0 && selectedIndex < flatResults.length) {
        event.preventDefault();
        handleResultClick(flatResults[selectedIndex]);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatResults, selectedIndex, handleResultClick]);

  const formatCurrency = (amount?: number) => {
    if (!amount) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const hasResults = searchResults && (
    searchResults.clients.length > 0 ||
    searchResults.companies.length > 0 ||
    searchResults.deals.length > 0 ||
    searchResults.documents.length > 0 ||
    searchResults.contacts.length > 0 ||
    searchResults.knowledgeBankEntries.length > 0
  );

  const isLoading = debouncedQuery.trim() !== '' && searchResults === undefined;

  return (
    <div className="relative" ref={searchRef}>
      {/* Search Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors border border-gray-200 bg-white"
        aria-label="Global Search"
      >
        <Search className="h-4 w-4" />
        <span className="text-sm font-normal">Global Search</span>
      </button>

      {/* Slide-out Search Bar */}
      <div
        className={`fixed inset-0 z-[60] bg-black/20 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsOpen(false)}
      >
        <div 
          className={`absolute top-0 left-0 right-0 bg-white border-b border-gray-200 shadow-lg transform transition-transform duration-300 ease-in-out z-[61] ${
            isOpen ? 'translate-y-0' : '-translate-y-full'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-w-4xl mx-auto px-6 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                ref={inputRef}
                type="text"
                placeholder="Search clients, companies, deals, files, contacts, knowledge bank..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(-1);
                }}
                className="pl-10 pr-10 py-3 text-base"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedIndex(-1);
                    inputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Results Dropdown */}
              {debouncedQuery.trim() && (
                <div className="absolute left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 max-h-[600px] overflow-y-auto">
                  {isLoading ? (
                    <div className="px-6 py-8 text-center">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Searching...</p>
                    </div>
                  ) : hasResults ? (
                    <div className="divide-y divide-gray-100">
                      {/* Clients Section */}
                      {searchResults.clients.length > 0 && (
                        <div>
                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-gray-600" />
                              <p className="text-xs font-semibold text-gray-700 uppercase">Clients</p>
                              <span className="text-xs text-gray-500">({searchResults.clients.length})</span>
                            </div>
                          </div>
                          {searchResults.clients.map((client, idx) => {
                            const flatIdx = idx;
                            const isSelected = selectedIndex === flatIdx;
                            return (
                              <button
                                key={client.id}
                                onClick={() => handleResultClick({ type: 'client', id: client.id })}
                                className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                                  isSelected ? 'bg-gray-50' : ''
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5">
                                    <Users className="w-4 h-4 text-blue-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{client.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {client.companyName && (
                                        <p className="text-xs text-gray-500">{client.companyName}</p>
                                      )}
                                      {client.email && (
                                        <span className="text-xs text-gray-400">•</span>
                                      )}
                                      {client.email && (
                                        <p className="text-xs text-gray-500">{client.email}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Companies Section */}
                      {searchResults.companies.length > 0 && (
                        <div>
                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-gray-600" />
                              <p className="text-xs font-semibold text-gray-700 uppercase">Companies</p>
                              <span className="text-xs text-gray-500">({searchResults.companies.length})</span>
                            </div>
                          </div>
                          {searchResults.companies.map((company, idx) => {
                            const flatIdx = searchResults.clients.length + idx;
                            const isSelected = selectedIndex === flatIdx;
                            return (
                              <button
                                key={company.id}
                                onClick={() => handleResultClick({ type: 'company', id: company.id })}
                                className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                                  isSelected ? 'bg-gray-50' : ''
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5">
                                    <Building2 className="w-4 h-4 text-purple-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{company.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {company.domain && (
                                        <p className="text-xs text-gray-500">{company.domain}</p>
                                      )}
                                      {company.industry && company.domain && (
                                        <span className="text-xs text-gray-400">•</span>
                                      )}
                                      {company.industry && (
                                        <p className="text-xs text-gray-500">{company.industry}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Deals Section */}
                      {searchResults.deals.length > 0 && (
                        <div>
                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                            <div className="flex items-center gap-2">
                              <Briefcase className="w-4 h-4 text-gray-600" />
                              <p className="text-xs font-semibold text-gray-700 uppercase">Deals</p>
                              <span className="text-xs text-gray-500">({searchResults.deals.length})</span>
                            </div>
                          </div>
                          {searchResults.deals.map((deal, idx) => {
                            const flatIdx = searchResults.clients.length + searchResults.companies.length + idx;
                            const isSelected = selectedIndex === flatIdx;
                            return (
                              <button
                                key={deal.id}
                                onClick={() => handleResultClick({ type: 'deal', id: deal.id })}
                                className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                                  isSelected ? 'bg-gray-50' : ''
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5">
                                    <Briefcase className="w-4 h-4 text-green-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{deal.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {deal.amount && (
                                        <p className="text-xs font-medium text-gray-700">{formatCurrency(deal.amount)}</p>
                                      )}
                                      {deal.stageName && deal.amount && (
                                        <span className="text-xs text-gray-400">•</span>
                                      )}
                                      {deal.stageName && (
                                        <p className="text-xs text-gray-500">{deal.stageName}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Documents Section */}
                      {searchResults.documents.length > 0 && (
                        <div>
                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-gray-600" />
                              <p className="text-xs font-semibold text-gray-700 uppercase">Files</p>
                              <span className="text-xs text-gray-500">({searchResults.documents.length})</span>
                            </div>
                          </div>
                          {searchResults.documents.map((doc, idx) => {
                            const flatIdx = searchResults.clients.length + searchResults.companies.length + searchResults.deals.length + idx;
                            const isSelected = selectedIndex === flatIdx;
                            return (
                              <button
                                key={doc.id}
                                onClick={() => handleResultClick({ type: 'document', id: doc.id })}
                                className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                                  isSelected ? 'bg-gray-50' : ''
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5">
                                    <FileText className="w-4 h-4 text-orange-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{doc.fileName}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {doc.fileTypeDetected && (
                                        <p className="text-xs text-gray-500">{doc.fileTypeDetected}</p>
                                      )}
                                      {doc.clientName && doc.fileTypeDetected && (
                                        <span className="text-xs text-gray-400">•</span>
                                      )}
                                      {doc.clientName && (
                                        <p className="text-xs text-gray-500">{doc.clientName}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Contacts Section */}
                      {searchResults.contacts.length > 0 && (
                        <div>
                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-600" />
                              <p className="text-xs font-semibold text-gray-700 uppercase">Contacts</p>
                              <span className="text-xs text-gray-500">({searchResults.contacts.length})</span>
                            </div>
                          </div>
                          {searchResults.contacts.map((contact, idx) => {
                            const flatIdx = searchResults.clients.length + searchResults.companies.length + searchResults.deals.length + searchResults.documents.length + idx;
                            const isSelected = selectedIndex === flatIdx;
                            return (
                              <button
                                key={contact.id}
                                onClick={() => handleResultClick({ type: 'contact', id: contact.id })}
                                className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                                  isSelected ? 'bg-gray-50' : ''
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5">
                                    <User className="w-4 h-4 text-indigo-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {contact.email && (
                                        <p className="text-xs text-gray-500">{contact.email}</p>
                                      )}
                                      {contact.company && contact.email && (
                                        <span className="text-xs text-gray-400">•</span>
                                      )}
                                      {contact.company && (
                                        <p className="text-xs text-gray-500">{contact.company}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Knowledge Bank Entries Section */}
                      {searchResults.knowledgeBankEntries.length > 0 && (
                        <div>
                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                            <div className="flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-gray-600" />
                              <p className="text-xs font-semibold text-gray-700 uppercase">Knowledge Bank</p>
                              <span className="text-xs text-gray-500">({searchResults.knowledgeBankEntries.length})</span>
                            </div>
                          </div>
                          {searchResults.knowledgeBankEntries.map((entry, idx) => {
                            const flatIdx = searchResults.clients.length + searchResults.companies.length + searchResults.deals.length + searchResults.documents.length + searchResults.contacts.length + idx;
                            const isSelected = selectedIndex === flatIdx;
                            return (
                              <button
                                key={entry.id}
                                onClick={() => handleResultClick({ type: 'knowledgeBankEntry', id: entry.id, data: entry })}
                                className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                                  isSelected ? 'bg-gray-50' : ''
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5">
                                    <BookOpen className="w-4 h-4 text-teal-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{entry.title}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {entry.clientName && (
                                        <p className="text-xs text-gray-500">{entry.clientName}</p>
                                      )}
                                      {entry.entryType && entry.clientName && (
                                        <span className="text-xs text-gray-400">•</span>
                                      )}
                                      {entry.entryType && (
                                        <p className="text-xs text-gray-500 capitalize">{entry.entryType.replace('_', ' ')}</p>
                                      )}
                                    </div>
                                    {entry.content && (
                                      <p className="text-xs text-gray-400 mt-1 line-clamp-1">{entry.content}</p>
                                    )}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-6 py-8 text-center">
                      <p className="text-sm text-gray-500">No results found</p>
                      <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

