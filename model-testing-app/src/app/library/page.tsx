'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { searchLibrary, getUniqueFileTypes, getUniqueCategories, deleteDocument, SavedDocument } from '@/lib/documentStorage';
import { FILE_CATEGORIES } from '@/lib/categories';

export default function Library() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileType, setSelectedFileType] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [fileTypes, setFileTypes] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<SavedDocument | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // Only load on client side to avoid hydration mismatch
    setIsClient(true);
    loadDocuments();
  }, []);

  const loadDocuments = () => {
    if (typeof window === 'undefined') return;
    const allDocs = searchLibrary('', '', '');
    setDocuments(allDocs);
    setFileTypes(getUniqueFileTypes());
    setCategories(getUniqueCategories());
  };

  const filteredDocuments = useMemo(() => {
    if (!isClient) return [];
    return searchLibrary(searchQuery, selectedFileType || undefined, selectedCategory || undefined);
  }, [searchQuery, selectedFileType, selectedCategory, isClient]);

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this document from the library?')) {
      deleteDocument(id);
      loadDocuments();
      if (selectedDoc?.id === id) {
        setSelectedDoc(null);
      }
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Document Library</h1>
            <p className="mt-2 text-gray-600">
              Browse and search your analyzed documents
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Back to Upload
          </Link>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search summaries, filenames, clients..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
              />
            </div>

            {/* File Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File Type
              </label>
              <select
                value={selectedFileType}
                onChange={(e) => setSelectedFileType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              >
                <option value="">All Types</option>
                {fileTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              >
                <option value="">All Categories</option>
                {FILE_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            {isClient ? (
              <>Showing {filteredDocuments.length} of {documents.length} documents</>
            ) : (
              <>Loading...</>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Document List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
              </div>
              <div className="divide-y divide-gray-200 max-h-[calc(100vh-300px)] overflow-y-auto">
                {!isClient ? (
                  <div className="p-8 text-center text-gray-500">
                    <p>Loading documents...</p>
                  </div>
                ) : filteredDocuments.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <p>No documents found.</p>
                    <p className="mt-2 text-sm">Try adjusting your search or filters.</p>
                  </div>
                ) : (
                  filteredDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedDoc?.id === doc.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-gray-900 truncate">
                            {doc.file.name}
                          </h3>
                          <p className="mt-1 text-xs text-gray-500">
                            {formatFileSize(doc.file.size)} • {doc.analysisResult.fileType}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              {doc.analysisResult.category}
                            </span>
                            {doc.analysisResult.clientName && (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                                {doc.analysisResult.clientName}
                              </span>
                            )}
                            {doc.analysisResult.projectName && (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                {doc.analysisResult.projectName}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-gray-600 line-clamp-2">
                            {doc.analysisResult.summary}
                          </p>
                          <p className="mt-1 text-xs text-gray-400">
                            Saved {formatDate(doc.savedAt)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(doc.id);
                          }}
                          className="ml-2 p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                          title="Delete document"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Document Details */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 sticky top-4">
              {selectedDoc ? (
                <div className="p-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">Document Details</h2>
                    <button
                      onClick={() => setSelectedDoc(null)}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Close
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">File Name</h3>
                      <p className="text-sm text-gray-900">{selectedDoc.file.name}</p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Summary</h3>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{selectedDoc.analysisResult.summary}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-1">File Type</h3>
                        <p className="text-sm text-gray-900">{selectedDoc.analysisResult.fileType}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-1">Category</h3>
                        <p className="text-sm text-gray-900">{selectedDoc.analysisResult.category}</p>
                      </div>
                    </div>

                    {selectedDoc.analysisResult.clientName && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-1">Client</h3>
                        <p className="text-sm text-gray-900">{selectedDoc.analysisResult.clientName}</p>
                      </div>
                    )}

                    {selectedDoc.analysisResult.suggestedClientName && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-1">Suggested Client</h3>
                        <p className="text-sm text-blue-600">{selectedDoc.analysisResult.suggestedClientName}</p>
                      </div>
                    )}

                    {selectedDoc.analysisResult.projectName && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-1">Project</h3>
                        <p className="text-sm text-gray-900">{selectedDoc.analysisResult.projectName}</p>
                      </div>
                    )}

                    {selectedDoc.analysisResult.suggestedProjectName && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-1">Suggested Project</h3>
                        <p className="text-sm text-blue-600">{selectedDoc.analysisResult.suggestedProjectName}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-1">Confidence</h3>
                        <p className="text-sm text-gray-900">
                          {(selectedDoc.analysisResult.confidence * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-1">Tokens Used</h3>
                        <p className="text-sm text-gray-900">
                          {selectedDoc.analysisResult.tokensUsed.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Reasoning</h3>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{selectedDoc.analysisResult.reasoning}</p>
                    </div>

                    {/* Extracted Data */}
                    {selectedDoc.analysisResult.extractedData && (
                      <div className="pt-4 border-t border-gray-200">
                        <h3 className="text-sm font-medium text-gray-700 mb-2">
                          Extracted Data
                          {selectedDoc.analysisResult.extractedData.detectedCurrency && (
                            <span className="text-gray-500 ml-2 text-xs font-normal">
                              ({selectedDoc.analysisResult.extractedData.detectedCurrency})
                            </span>
                          )}
                        </h3>
                        <div className="space-y-4">
                          {/* Plots/Developments */}
                          {selectedDoc.analysisResult.extractedData.plots && selectedDoc.analysisResult.extractedData.plots.length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-600 mb-1">Plots/Developments:</h4>
                              <div className="ml-2 space-y-1">
                                {selectedDoc.analysisResult.extractedData.plots.map((plot, idx) => {
                                  if (!plot || plot.cost === undefined || plot.cost === null) {
                                    return null;
                                  }
                                  const currencySymbol = plot.currency === 'GBP' ? '£' : plot.currency === 'USD' ? '$' : plot.currency === 'EUR' ? '€' : plot.currency || '';
                                  return (
                                    <p key={idx} className="text-xs text-gray-700">
                                      • {plot.name}: {currencySymbol}{plot.cost.toLocaleString()} {plot.currency || ''}
                                      {plot.squareFeet && (
                                        <> | {plot.squareFeet.toLocaleString()} sq ft</>
                                      )}
                                      {plot.pricePerSquareFoot && (
                                        <> | {currencySymbol}{plot.pricePerSquareFoot.toFixed(2)}/sq ft</>
                                      )}
                                    </p>
                                  );
                                })}
                                {selectedDoc.analysisResult.extractedData.plotsTotal && selectedDoc.analysisResult.extractedData.plotsTotal.amount !== undefined && selectedDoc.analysisResult.extractedData.plotsTotal.amount !== null && (
                                  <p className="text-xs text-green-700 font-semibold mt-1 pt-1 border-t border-gray-200">
                                    Total: {selectedDoc.analysisResult.extractedData.plotsTotal.currency === 'GBP' ? '£' : selectedDoc.analysisResult.extractedData.plotsTotal.currency === 'USD' ? '$' : selectedDoc.analysisResult.extractedData.plotsTotal.currency === 'EUR' ? '€' : ''}{selectedDoc.analysisResult.extractedData.plotsTotal.amount.toLocaleString()} {selectedDoc.analysisResult.extractedData.plotsTotal.currency || ''}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Costs */}
                          {selectedDoc.analysisResult.extractedData.costs && selectedDoc.analysisResult.extractedData.costs.length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-600 mb-1">Costs:</h4>
                              <div className="ml-2 space-y-1">
                                {selectedDoc.analysisResult.extractedData.costs.map((cost, idx) => {
                                  if (!cost || cost.amount === undefined || cost.amount === null) {
                                    return null;
                                  }
                                  const currencySymbol = cost.currency === 'GBP' ? '£' : cost.currency === 'USD' ? '$' : cost.currency === 'EUR' ? '€' : cost.currency || '';
                                  return (
                                    <p key={idx} className="text-xs text-gray-700">
                                      • {cost.type}: {currencySymbol}{cost.amount.toLocaleString()} {cost.currency || ''}
                                    </p>
                                  );
                                })}
                                {selectedDoc.analysisResult.extractedData.costsTotal && selectedDoc.analysisResult.extractedData.costsTotal.amount !== undefined && selectedDoc.analysisResult.extractedData.costsTotal.amount !== null && (
                                  <p className="text-xs text-green-700 font-semibold mt-1 pt-1 border-t border-gray-200">
                                    Total: {selectedDoc.analysisResult.extractedData.costsTotal.currency === 'GBP' ? '£' : selectedDoc.analysisResult.extractedData.costsTotal.currency === 'USD' ? '$' : selectedDoc.analysisResult.extractedData.costsTotal.currency === 'EUR' ? '€' : ''}{selectedDoc.analysisResult.extractedData.costsTotal.amount.toLocaleString()} {selectedDoc.analysisResult.extractedData.costsTotal.currency || ''}
                                  </p>
                                )}

                                {/* Cost Category Breakdown */}
                                {selectedDoc.analysisResult.extractedData.costCategories && (
                                  <div className="mt-2 pt-2 border-t border-gray-200">
                                    <p className="text-xs text-cyan-600 font-semibold italic mb-1">Category Breakdown:</p>
                                    <div className="ml-2 space-y-1">
                                      {selectedDoc.analysisResult.extractedData.costCategories.siteCosts && (
                                        <p className="text-xs text-gray-600">
                                          Site Costs: {selectedDoc.analysisResult.extractedData.costCategories.siteCosts.currency === 'GBP' ? '£' : selectedDoc.analysisResult.extractedData.costCategories.siteCosts.currency === 'USD' ? '$' : selectedDoc.analysisResult.extractedData.costCategories.siteCosts.currency === 'EUR' ? '€' : ''}{selectedDoc.analysisResult.extractedData.costCategories.siteCosts.subtotal.toLocaleString()}
                                        </p>
                                      )}
                                      {selectedDoc.analysisResult.extractedData.costCategories.netConstructionCosts && (
                                        <p className="text-xs text-gray-600">
                                          Net Construction Costs: {selectedDoc.analysisResult.extractedData.costCategories.netConstructionCosts.currency === 'GBP' ? '£' : selectedDoc.analysisResult.extractedData.costCategories.netConstructionCosts.currency === 'USD' ? '$' : selectedDoc.analysisResult.extractedData.costCategories.netConstructionCosts.currency === 'EUR' ? '€' : ''}{selectedDoc.analysisResult.extractedData.costCategories.netConstructionCosts.subtotal.toLocaleString()}
                                        </p>
                                      )}
                                      {selectedDoc.analysisResult.extractedData.costCategories.professionalFees && (
                                        <p className="text-xs text-gray-600">
                                          Professional Fees: {selectedDoc.analysisResult.extractedData.costCategories.professionalFees.currency === 'GBP' ? '£' : selectedDoc.analysisResult.extractedData.costCategories.professionalFees.currency === 'USD' ? '$' : selectedDoc.analysisResult.extractedData.costCategories.professionalFees.currency === 'EUR' ? '€' : ''}{selectedDoc.analysisResult.extractedData.costCategories.professionalFees.subtotal.toLocaleString()}
                                        </p>
                                      )}
                                      {selectedDoc.analysisResult.extractedData.costCategories.financingLegalFees && (
                                        <p className="text-xs text-gray-600">
                                          Financing/Legal Fees: {selectedDoc.analysisResult.extractedData.costCategories.financingLegalFees.currency === 'GBP' ? '£' : selectedDoc.analysisResult.extractedData.costCategories.financingLegalFees.currency === 'USD' ? '$' : selectedDoc.analysisResult.extractedData.costCategories.financingLegalFees.currency === 'EUR' ? '€' : ''}{selectedDoc.analysisResult.extractedData.costCategories.financingLegalFees.subtotal.toLocaleString()}
                                        </p>
                                      )}
                                      {selectedDoc.analysisResult.extractedData.costCategories.disposalFees && (
                                        <p className="text-xs text-gray-600">
                                          Disposal Fees: {selectedDoc.analysisResult.extractedData.costCategories.disposalFees.currency === 'GBP' ? '£' : selectedDoc.analysisResult.extractedData.costCategories.disposalFees.currency === 'USD' ? '$' : selectedDoc.analysisResult.extractedData.costCategories.disposalFees.currency === 'EUR' ? '€' : ''}{selectedDoc.analysisResult.extractedData.costCategories.disposalFees.subtotal.toLocaleString()}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Financing */}
                          {selectedDoc.analysisResult.extractedData.financing && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-600 mb-1">Financing:</h4>
                              <div className="ml-2 space-y-1">
                                {selectedDoc.analysisResult.extractedData.financing.loanAmount !== undefined && selectedDoc.analysisResult.extractedData.financing.loanAmount !== null && (
                                  <p className="text-xs text-gray-700">
                                    Loan Amount: {selectedDoc.analysisResult.extractedData.financing.currency === 'GBP' ? '£' : selectedDoc.analysisResult.extractedData.financing.currency === 'USD' ? '$' : selectedDoc.analysisResult.extractedData.financing.currency === 'EUR' ? '€' : ''}{selectedDoc.analysisResult.extractedData.financing.loanAmount.toLocaleString()} {selectedDoc.analysisResult.extractedData.financing.currency || ''}
                                  </p>
                                )}
                                {selectedDoc.analysisResult.extractedData.financing.interestPercentage !== undefined && (
                                  <p className="text-xs text-gray-700">
                                    Interest Rate: {selectedDoc.analysisResult.extractedData.financing.interestPercentage}%
                                  </p>
                                )}
                                {selectedDoc.analysisResult.extractedData.financing.interestRate !== undefined && (
                                  <p className="text-xs text-gray-700">
                                    Interest Rate: {(selectedDoc.analysisResult.extractedData.financing.interestRate * 100).toFixed(2)}%
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Revenue/Sales */}
                          {selectedDoc.analysisResult.extractedData.revenue && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-600 mb-1">Revenue/Sales:</h4>
                              <div className="ml-2 space-y-1">
                                {selectedDoc.analysisResult.extractedData.revenue.totalSales !== undefined && selectedDoc.analysisResult.extractedData.revenue.totalSales !== null && (
                                  <p className="text-xs text-gray-700">
                                    Total Sales: {selectedDoc.analysisResult.extractedData.revenue.currency === 'GBP' ? '£' : selectedDoc.analysisResult.extractedData.revenue.currency === 'USD' ? '$' : selectedDoc.analysisResult.extractedData.revenue.currency === 'EUR' ? '€' : ''}{selectedDoc.analysisResult.extractedData.revenue.totalSales.toLocaleString()} {selectedDoc.analysisResult.extractedData.revenue.currency || ''}
                                  </p>
                                )}
                                {selectedDoc.analysisResult.extractedData.revenue.salesPerUnit !== undefined && selectedDoc.analysisResult.extractedData.revenue.salesPerUnit !== null && (
                                  <p className="text-xs text-gray-700">
                                    Sales per Unit: {selectedDoc.analysisResult.extractedData.revenue.currency === 'GBP' ? '£' : selectedDoc.analysisResult.extractedData.revenue.currency === 'USD' ? '$' : selectedDoc.analysisResult.extractedData.revenue.currency === 'EUR' ? '€' : ''}{selectedDoc.analysisResult.extractedData.revenue.salesPerUnit.toLocaleString()} {selectedDoc.analysisResult.extractedData.revenue.currency || ''}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Profit */}
                          {selectedDoc.analysisResult.extractedData.profit && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-600 mb-1">Profit:</h4>
                              <p className="text-xs text-gray-700 ml-2">
                                {selectedDoc.analysisResult.extractedData.profit.total !== undefined && selectedDoc.analysisResult.extractedData.profit.total !== null && (
                                  <>Total: {selectedDoc.analysisResult.extractedData.profit.currency === 'GBP' ? '£' : selectedDoc.analysisResult.extractedData.profit.currency === 'USD' ? '$' : selectedDoc.analysisResult.extractedData.profit.currency === 'EUR' ? '€' : ''}{selectedDoc.analysisResult.extractedData.profit.total.toLocaleString()} {selectedDoc.analysisResult.extractedData.profit.currency || ''}</>
                                )}
                                {selectedDoc.analysisResult.extractedData.profit.percentage !== undefined && (
                                  <> | Percentage: {selectedDoc.analysisResult.extractedData.profit.percentage}%</>
                                )}
                              </p>
                            </div>
                          )}

                          {/* Average Interest (if not in financing) */}
                          {selectedDoc.analysisResult.extractedData.averageInterest && !selectedDoc.analysisResult.extractedData.financing && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-600 mb-1">Average Interest:</h4>
                              <p className="text-xs text-gray-700 ml-2">
                                {selectedDoc.analysisResult.extractedData.averageInterest.percentage !== undefined ? (
                                  <>{selectedDoc.analysisResult.extractedData.averageInterest.percentage}%</>
                                ) : selectedDoc.analysisResult.extractedData.averageInterest.rate !== undefined ? (
                                  <>{(selectedDoc.analysisResult.extractedData.averageInterest.rate * 100).toFixed(2)}%</>
                                ) : null}
                              </p>
                            </div>
                          )}

                          {/* Units */}
                          {selectedDoc.analysisResult.extractedData.units && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-600 mb-1">Units:</h4>
                              <p className="text-xs text-gray-700 ml-2">
                                {selectedDoc.analysisResult.extractedData.units.count} {selectedDoc.analysisResult.extractedData.units.type}
                                {selectedDoc.analysisResult.extractedData.units.costPerUnit !== undefined && selectedDoc.analysisResult.extractedData.units.costPerUnit !== null && (
                                  <> | Cost per {selectedDoc.analysisResult.extractedData.units.type.slice(0, -1)}: {selectedDoc.analysisResult.extractedData.units.currency === 'GBP' ? '£' : selectedDoc.analysisResult.extractedData.units.currency === 'USD' ? '$' : selectedDoc.analysisResult.extractedData.units.currency === 'EUR' ? '€' : ''}{selectedDoc.analysisResult.extractedData.units.costPerUnit.toLocaleString()} {selectedDoc.analysisResult.extractedData.units.currency || ''}</>
                                )}
                              </p>
                            </div>
                          )}

                          {/* Miscellaneous */}
                          {selectedDoc.analysisResult.extractedData.miscellaneous && selectedDoc.analysisResult.extractedData.miscellaneous.length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-600 mb-1">Miscellaneous:</h4>
                              <div className="ml-2 space-y-1">
                                {selectedDoc.analysisResult.extractedData.miscellaneous.map((item, idx) => {
                                  if (!item || item.amount === undefined || item.amount === null) {
                                    return null;
                                  }
                                  const currencySymbol = item.currency === 'GBP' ? '£' : item.currency === 'USD' ? '$' : item.currency === 'EUR' ? '€' : item.currency || '';
                                  return (
                                    <p key={idx} className="text-xs text-gray-700">
                                      • {item.type}: {currencySymbol}{item.amount.toLocaleString()} {item.currency || ''}
                                    </p>
                                  );
                                })}
                                {selectedDoc.analysisResult.extractedData.miscellaneousTotal && selectedDoc.analysisResult.extractedData.miscellaneousTotal.amount !== undefined && selectedDoc.analysisResult.extractedData.miscellaneousTotal.amount !== null && (
                                  <p className="text-xs text-green-700 font-semibold mt-1 pt-1 border-t border-gray-200">
                                    Total: {selectedDoc.analysisResult.extractedData.miscellaneousTotal.currency === 'GBP' ? '£' : selectedDoc.analysisResult.extractedData.miscellaneousTotal.currency === 'USD' ? '$' : selectedDoc.analysisResult.extractedData.miscellaneousTotal.currency === 'EUR' ? '€' : ''}{selectedDoc.analysisResult.extractedData.miscellaneousTotal.amount.toLocaleString()} {selectedDoc.analysisResult.extractedData.miscellaneousTotal.currency || ''}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Extraction Notes */}
                          {selectedDoc.analysisResult.extractedData.extractionNotes && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-600 mb-1">Notes:</h4>
                              <p className="text-xs text-gray-600 italic ml-2">
                                {selectedDoc.analysisResult.extractedData.extractionNotes}
                              </p>
                            </div>
                          )}

                          {/* Extraction Metadata */}
                          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200">
                            {selectedDoc.analysisResult.extractedData.confidence !== undefined && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-600 mb-1">Extraction Confidence</h4>
                                <p className="text-xs text-gray-700">
                                  {(selectedDoc.analysisResult.extractedData.confidence * 100).toFixed(1)}%
                                </p>
                              </div>
                            )}
                            {selectedDoc.analysisResult.extractedData.tokensUsed !== undefined && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-600 mb-1">Extraction Tokens</h4>
                                <p className="text-xs text-gray-700">
                                  {selectedDoc.analysisResult.extractedData.tokensUsed.toLocaleString()}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Verification Info */}
                          {selectedDoc.analysisResult.extractedData.verificationNotes && (
                            <div className="pt-2 border-t border-gray-200">
                              <h4 className="text-xs font-medium text-cyan-600 mb-1">Verification</h4>
                              <p className="text-xs text-gray-700 mb-2">
                                {selectedDoc.analysisResult.extractedData.verificationNotes}
                              </p>
                              {selectedDoc.analysisResult.extractedData.verificationDiscrepancies && selectedDoc.analysisResult.extractedData.verificationDiscrepancies.length > 0 && (
                                <div className="ml-2 space-y-1 mb-2">
                                  {selectedDoc.analysisResult.extractedData.verificationDiscrepancies.map((disc, idx) => (
                                    <p key={idx} className="text-xs text-yellow-700">
                                      • {disc.type}: {disc.description}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {selectedDoc.analysisResult.extractedData.verificationConfidence !== undefined && (
                                <p className="text-xs text-gray-700">
                                  <span className="font-medium">Verification Confidence:</span>{' '}
                                  {(selectedDoc.analysisResult.extractedData.verificationConfidence * 100).toFixed(1)}%
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="pt-4 border-t border-gray-200">
                      <p className="text-xs text-gray-500">
                        Saved: {formatDate(selectedDoc.savedAt)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        File size: {formatFileSize(selectedDoc.file.size)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-gray-500">
                  <p>Select a document to view details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

