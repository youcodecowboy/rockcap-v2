'use client';

import { useEffect, useRef } from 'react';
import { AnalysisResult, FileMetadata } from '@/types';

interface OutputWindowProps {
  analysisLog: Array<{
    file: FileMetadata;
    result: AnalysisResult;
    timestamp: string;
  }>;
}

export default function OutputWindow({ analysisLog }: OutputWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new entries are added
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [analysisLog]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Analysis Output</h2>
        <span className="text-sm text-gray-500">
          {analysisLog.length} file{analysisLog.length !== 1 ? 's' : ''} analyzed
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-lg border border-gray-700"
      >
        {analysisLog.length === 0 ? (
          <div className="text-gray-500">
            <p>No files analyzed yet.</p>
            <p className="mt-2">Drop a file to see the model&apos;s analysis here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {analysisLog.map((entry, index) => (
              <div key={entry.file.id} className="border-b border-gray-700 pb-4 last:border-b-0">
                <div className="mb-3">
                  <span className="text-gray-500">[{entry.timestamp}]</span>
                  <span className="text-blue-400 ml-2">File:</span>
                  <span className="text-white ml-1">{entry.file.name}</span>
                </div>

                <div className="ml-4 space-y-2">
                  {/* Summary */}
                  <div>
                    <span className="text-cyan-400">Summary:</span>
                    <div className="text-gray-200 ml-2 mt-1 whitespace-pre-wrap">
                      {entry.result.summary}
                    </div>
                  </div>

                  {/* Unified Output Fields */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
                    <div>
                      <span className="text-yellow-400">File Type:</span>
                      <span className="text-white ml-2">{entry.result.fileType}</span>
                    </div>

                    <div>
                      <span className="text-yellow-400">Category:</span>
                      <span className="text-white ml-2">{entry.result.category}</span>
                    </div>

                    {entry.result.clientName ? (
                      <div>
                        <span className="text-yellow-400">Client:</span>
                        <span className="text-white ml-2">{entry.result.clientName}</span>
                      </div>
                    ) : entry.result.suggestedClientName ? (
                      <div>
                        <span className="text-yellow-400">Suggested Client:</span>
                        <span className="text-blue-300 ml-2">{entry.result.suggestedClientName}</span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-yellow-400">Client:</span>
                        <span className="text-gray-500 ml-2">General</span>
                      </div>
                    )}

                    <div>
                      <span className="text-yellow-400">Project:</span>
                      {entry.result.projectName ? (
                        <span className="text-white ml-2">{entry.result.projectName}</span>
                      ) : entry.result.suggestedProjectName ? (
                        <>
                          <span className="text-blue-300 ml-2">{entry.result.suggestedProjectName}</span>
                          <span className="text-gray-500 ml-1 text-xs">(suggested)</span>
                        </>
                      ) : (
                        <span className="text-gray-500 ml-2">None</span>
                      )}
                    </div>

                    <div>
                      <span className="text-yellow-400">Confidence:</span>
                      <span className="text-white ml-2">
                        {(entry.result.confidence * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div>
                      <span className="text-yellow-400">Tokens Used:</span>
                      <span className="text-white ml-2">{entry.result.tokensUsed.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Reasoning */}
                  <div className="mt-3">
                    <div className="text-purple-400 mb-1">Reasoning:</div>
                    <div className="text-gray-300 whitespace-pre-wrap ml-2">
                      {entry.result.reasoning}
                    </div>
                  </div>

                  {/* Extracted Data */}
                  {entry.result.extractedData && (
                    <div className="mt-4 pt-3 border-t border-gray-600">
                      <div className="text-orange-400 mb-2 font-semibold">
                        Extracted Data
                        {entry.result.extractedData.detectedCurrency && (
                          <span className="text-gray-400 ml-2 text-xs font-normal">
                            (Currency: {entry.result.extractedData.detectedCurrency})
                          </span>
                        )}
                      </div>
                      <div className="ml-2 space-y-4">
                        {/* Currency Helper */}
                        {entry.result.extractedData.detectedCurrency && (
                          <div className="text-xs text-gray-400 italic mb-2">
                            Currency symbol: {entry.result.extractedData.detectedCurrency === 'GBP' ? '£' : entry.result.extractedData.detectedCurrency === 'USD' ? '$' : entry.result.extractedData.detectedCurrency === 'EUR' ? '€' : entry.result.extractedData.detectedCurrency}
                          </div>
                        )}

                        {/* Plots/Developments */}
                        {entry.result.extractedData.plots && entry.result.extractedData.plots.length > 0 && (
                          <div>
                            <div className="text-yellow-400 text-xs mb-1 font-semibold">Plots/Developments:</div>
                            <div className="ml-2 space-y-1">
                              {entry.result.extractedData.plots.map((plot, idx) => {
                                if (!plot || plot.cost === undefined || plot.cost === null) {
                                  return null;
                                }
                                const currencySymbol = plot.currency === 'GBP' ? '£' : plot.currency === 'USD' ? '$' : plot.currency === 'EUR' ? '€' : plot.currency || '';
                                return (
                                  <div key={idx} className="text-gray-200 text-xs">
                                    • {plot.name}: {currencySymbol}{plot.cost.toLocaleString()} {plot.currency || ''}
                                    {plot.squareFeet && (
                                      <> | {plot.squareFeet.toLocaleString()} sq ft</>
                                    )}
                                    {plot.pricePerSquareFoot && (
                                      <> | {currencySymbol}{plot.pricePerSquareFoot.toFixed(2)}/sq ft</>
                                    )}
                                  </div>
                                );
                              })}
                              {entry.result.extractedData.plotsTotal && entry.result.extractedData.plotsTotal.amount !== undefined && entry.result.extractedData.plotsTotal.amount !== null && (
                                <div className="text-green-400 text-xs font-semibold mt-1 pt-1 border-t border-gray-700">
                                  Total: {entry.result.extractedData.plotsTotal.currency === 'GBP' ? '£' : entry.result.extractedData.plotsTotal.currency === 'USD' ? '$' : entry.result.extractedData.plotsTotal.currency === 'EUR' ? '€' : ''}{entry.result.extractedData.plotsTotal.amount.toLocaleString()} {entry.result.extractedData.plotsTotal.currency || ''}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Costs */}
                        {entry.result.extractedData.costs && entry.result.extractedData.costs.length > 0 && (
                          <div>
                            <div className="text-yellow-400 text-xs mb-1 font-semibold">Costs:</div>
                            <div className="ml-2 space-y-1">
                              {entry.result.extractedData.costs.map((cost, idx) => {
                                if (!cost || cost.amount === undefined || cost.amount === null) {
                                  return null;
                                }
                                const currencySymbol = cost.currency === 'GBP' ? '£' : cost.currency === 'USD' ? '$' : cost.currency === 'EUR' ? '€' : cost.currency || '';
                                return (
                                  <div key={idx} className="text-gray-200 text-xs">
                                    • {cost.type}: {currencySymbol}{cost.amount.toLocaleString()} {cost.currency || ''}
                                  </div>
                                );
                              })}
                              {entry.result.extractedData.costsTotal && entry.result.extractedData.costsTotal.amount !== undefined && entry.result.extractedData.costsTotal.amount !== null && (
                                <div className="text-green-400 text-xs font-semibold mt-1 pt-1 border-t border-gray-700">
                                  Total: {entry.result.extractedData.costsTotal.currency === 'GBP' ? '£' : entry.result.extractedData.costsTotal.currency === 'USD' ? '$' : entry.result.extractedData.costsTotal.currency === 'EUR' ? '€' : ''}{entry.result.extractedData.costsTotal.amount.toLocaleString()} {entry.result.extractedData.costsTotal.currency || ''}
                                </div>
                              )}

                              {/* Cost Category Breakdown */}
                              {entry.result.extractedData.costCategories && (
                                <div className="mt-2 pt-2 border-t border-gray-700">
                                  <div className="text-cyan-400 text-xs mb-1 font-semibold italic">Category Breakdown:</div>
                                  <div className="ml-2 space-y-1">
                                    {entry.result.extractedData.costCategories.siteCosts && (
                                      <div className="text-gray-300 text-xs">
                                        Site Costs: {entry.result.extractedData.costCategories.siteCosts.currency === 'GBP' ? '£' : entry.result.extractedData.costCategories.siteCosts.currency === 'USD' ? '$' : entry.result.extractedData.costCategories.siteCosts.currency === 'EUR' ? '€' : ''}{entry.result.extractedData.costCategories.siteCosts.subtotal.toLocaleString()}
                                      </div>
                                    )}
                                    {entry.result.extractedData.costCategories.netConstructionCosts && (
                                      <div className="text-gray-300 text-xs">
                                        Net Construction Costs: {entry.result.extractedData.costCategories.netConstructionCosts.currency === 'GBP' ? '£' : entry.result.extractedData.costCategories.netConstructionCosts.currency === 'USD' ? '$' : entry.result.extractedData.costCategories.netConstructionCosts.currency === 'EUR' ? '€' : ''}{entry.result.extractedData.costCategories.netConstructionCosts.subtotal.toLocaleString()}
                                      </div>
                                    )}
                                    {entry.result.extractedData.costCategories.professionalFees && (
                                      <div className="text-gray-300 text-xs">
                                        Professional Fees: {entry.result.extractedData.costCategories.professionalFees.currency === 'GBP' ? '£' : entry.result.extractedData.costCategories.professionalFees.currency === 'USD' ? '$' : entry.result.extractedData.costCategories.professionalFees.currency === 'EUR' ? '€' : ''}{entry.result.extractedData.costCategories.professionalFees.subtotal.toLocaleString()}
                                      </div>
                                    )}
                                    {entry.result.extractedData.costCategories.financingLegalFees && (
                                      <div className="text-gray-300 text-xs">
                                        Financing/Legal Fees: {entry.result.extractedData.costCategories.financingLegalFees.currency === 'GBP' ? '£' : entry.result.extractedData.costCategories.financingLegalFees.currency === 'USD' ? '$' : entry.result.extractedData.costCategories.financingLegalFees.currency === 'EUR' ? '€' : ''}{entry.result.extractedData.costCategories.financingLegalFees.subtotal.toLocaleString()}
                                      </div>
                                    )}
                                    {entry.result.extractedData.costCategories.disposalFees && (
                                      <div className="text-gray-300 text-xs">
                                        Disposal Fees: {entry.result.extractedData.costCategories.disposalFees.currency === 'GBP' ? '£' : entry.result.extractedData.costCategories.disposalFees.currency === 'USD' ? '$' : entry.result.extractedData.costCategories.disposalFees.currency === 'EUR' ? '€' : ''}{entry.result.extractedData.costCategories.disposalFees.subtotal.toLocaleString()}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Financing */}
                        {entry.result.extractedData.financing && (
                          <div>
                            <div className="text-yellow-400 text-xs mb-1 font-semibold">Financing:</div>
                            <div className="ml-2 text-gray-200 text-xs space-y-1">
                              {entry.result.extractedData.financing.loanAmount !== undefined && entry.result.extractedData.financing.loanAmount !== null && (
                                <div>
                                  Loan Amount: {entry.result.extractedData.financing.currency === 'GBP' ? '£' : entry.result.extractedData.financing.currency === 'USD' ? '$' : entry.result.extractedData.financing.currency === 'EUR' ? '€' : ''}{entry.result.extractedData.financing.loanAmount.toLocaleString()} {entry.result.extractedData.financing.currency || ''}
                                </div>
                              )}
                              {entry.result.extractedData.financing.interestPercentage !== undefined && (
                                <div>
                                  Interest Rate: {entry.result.extractedData.financing.interestPercentage}%
                                </div>
                              )}
                              {entry.result.extractedData.financing.interestRate !== undefined && (
                                <div>
                                  Interest Rate: {(entry.result.extractedData.financing.interestRate * 100).toFixed(2)}%
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Revenue/Sales */}
                        {entry.result.extractedData.revenue && (
                          <div>
                            <div className="text-yellow-400 text-xs mb-1 font-semibold">Revenue/Sales:</div>
                            <div className="ml-2 text-gray-200 text-xs space-y-1">
                              {entry.result.extractedData.revenue.totalSales !== undefined && entry.result.extractedData.revenue.totalSales !== null && (
                                <div>
                                  Total Sales: {entry.result.extractedData.revenue.currency === 'GBP' ? '£' : entry.result.extractedData.revenue.currency === 'USD' ? '$' : entry.result.extractedData.revenue.currency === 'EUR' ? '€' : ''}{entry.result.extractedData.revenue.totalSales.toLocaleString()} {entry.result.extractedData.revenue.currency || ''}
                                </div>
                              )}
                              {entry.result.extractedData.revenue.salesPerUnit !== undefined && entry.result.extractedData.revenue.salesPerUnit !== null && (
                                <div>
                                  Sales per Unit: {entry.result.extractedData.revenue.currency === 'GBP' ? '£' : entry.result.extractedData.revenue.currency === 'USD' ? '$' : entry.result.extractedData.revenue.currency === 'EUR' ? '€' : ''}{entry.result.extractedData.revenue.salesPerUnit.toLocaleString()} {entry.result.extractedData.revenue.currency || ''}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Profit */}
                        {entry.result.extractedData.profit && (
                          <div>
                            <div className="text-yellow-400 text-xs mb-1 font-semibold">Profit:</div>
                            <div className="ml-2 text-gray-200 text-xs">
                              {entry.result.extractedData.profit.total !== undefined && entry.result.extractedData.profit.total !== null && (
                                <>Total: {entry.result.extractedData.profit.currency === 'GBP' ? '£' : entry.result.extractedData.profit.currency === 'USD' ? '$' : entry.result.extractedData.profit.currency === 'EUR' ? '€' : ''}{entry.result.extractedData.profit.total.toLocaleString()} {entry.result.extractedData.profit.currency || ''}</>
                              )}
                              {entry.result.extractedData.profit.percentage !== undefined && (
                                <> | Percentage: {entry.result.extractedData.profit.percentage}%</>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Average Interest (if not in financing) */}
                        {entry.result.extractedData.averageInterest && !entry.result.extractedData.financing && (
                          <div>
                            <div className="text-yellow-400 text-xs mb-1 font-semibold">Average Interest:</div>
                            <div className="ml-2 text-gray-200 text-xs">
                              {entry.result.extractedData.averageInterest.percentage !== undefined ? (
                                <>{entry.result.extractedData.averageInterest.percentage}%</>
                              ) : entry.result.extractedData.averageInterest.rate !== undefined ? (
                                <>{(entry.result.extractedData.averageInterest.rate * 100).toFixed(2)}%</>
                              ) : null}
                            </div>
                          </div>
                        )}

                        {/* Units */}
                        {entry.result.extractedData.units && (
                          <div>
                            <div className="text-yellow-400 text-xs mb-1 font-semibold">Units:</div>
                            <div className="ml-2 text-gray-200 text-xs">
                              {entry.result.extractedData.units.count} {entry.result.extractedData.units.type}
                              {entry.result.extractedData.units.costPerUnit !== undefined && entry.result.extractedData.units.costPerUnit !== null && (
                                <> | Cost per {entry.result.extractedData.units.type.slice(0, -1)}: {entry.result.extractedData.units.currency === 'GBP' ? '£' : entry.result.extractedData.units.currency === 'USD' ? '$' : entry.result.extractedData.units.currency === 'EUR' ? '€' : ''}{entry.result.extractedData.units.costPerUnit.toLocaleString()} {entry.result.extractedData.units.currency || ''}</>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Miscellaneous */}
                        {entry.result.extractedData.miscellaneous && entry.result.extractedData.miscellaneous.length > 0 && (
                          <div>
                            <div className="text-yellow-400 text-xs mb-1 font-semibold">Miscellaneous:</div>
                            <div className="ml-2 space-y-1">
                              {entry.result.extractedData.miscellaneous.map((item, idx) => {
                                if (!item || item.amount === undefined || item.amount === null) {
                                  return null;
                                }
                                const currencySymbol = item.currency === 'GBP' ? '£' : item.currency === 'USD' ? '$' : item.currency === 'EUR' ? '€' : item.currency || '';
                                return (
                                  <div key={idx} className="text-gray-200 text-xs">
                                    • {item.type}: {currencySymbol}{item.amount.toLocaleString()} {item.currency || ''}
                                  </div>
                                );
                              })}
                              {entry.result.extractedData.miscellaneousTotal && entry.result.extractedData.miscellaneousTotal.amount !== undefined && entry.result.extractedData.miscellaneousTotal.amount !== null && (
                                <div className="text-green-400 text-xs font-semibold mt-1 pt-1 border-t border-gray-700">
                                  Total: {entry.result.extractedData.miscellaneousTotal.currency === 'GBP' ? '£' : entry.result.extractedData.miscellaneousTotal.currency === 'USD' ? '$' : entry.result.extractedData.miscellaneousTotal.currency === 'EUR' ? '€' : ''}{entry.result.extractedData.miscellaneousTotal.amount.toLocaleString()} {entry.result.extractedData.miscellaneousTotal.currency || ''}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Extraction Notes */}
                        {entry.result.extractedData.extractionNotes && (
                          <div>
                            <div className="text-yellow-400 text-xs mb-1">Notes:</div>
                            <div className="ml-2 text-gray-300 text-xs italic">
                              {entry.result.extractedData.extractionNotes}
                            </div>
                          </div>
                        )}

                        {/* Extraction Metadata */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 pt-2 border-t border-gray-700">
                          {entry.result.extractedData.confidence !== undefined && (
                            <div>
                              <span className="text-yellow-400 text-xs">Extraction Confidence:</span>
                              <span className="text-white ml-2 text-xs">
                                {(entry.result.extractedData.confidence * 100).toFixed(1)}%
                              </span>
                            </div>
                          )}
                          {entry.result.extractedData.tokensUsed !== undefined && (
                            <div>
                              <span className="text-yellow-400 text-xs">Extraction Tokens:</span>
                              <span className="text-white ml-2 text-xs">
                                {entry.result.extractedData.tokensUsed.toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Verification Info */}
                        {entry.result.extractedData.verificationNotes && (
                          <div className="mt-2 pt-2 border-t border-gray-700">
                            <div className="text-cyan-400 text-xs mb-1 font-semibold">Verification:</div>
                            <div className="ml-2 text-gray-300 text-xs">
                              {entry.result.extractedData.verificationNotes}
                            </div>
                            {entry.result.extractedData.verificationDiscrepancies && entry.result.extractedData.verificationDiscrepancies.length > 0 && (
                              <div className="ml-2 mt-1 space-y-1">
                                {entry.result.extractedData.verificationDiscrepancies.map((disc, idx) => (
                                  <div key={idx} className="text-yellow-400 text-xs">
                                    • {disc.type}: {disc.description}
                                  </div>
                                ))}
                              </div>
                            )}
                            {entry.result.extractedData.verificationConfidence !== undefined && (
                              <div className="ml-2 mt-1 text-xs">
                                <span className="text-cyan-400">Verification Confidence:</span>
                                <span className="text-white ml-2">
                                  {(entry.result.extractedData.verificationConfidence * 100).toFixed(1)}%
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

