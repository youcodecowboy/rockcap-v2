'use client';

import { useParams, useRouter } from 'next/navigation';
import { useDocument, useGetFileUrl } from '@/lib/documentStorage';
import { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import RefileModal from '@/components/RefileModal';
import { RefreshCw } from 'lucide-react';

export default function DocumentViewerPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.documentId as string;
  const docId = documentId as Id<"documents">;

  const [isRefileModalOpen, setIsRefileModalOpen] = useState(false);

  // Convex hooks
  const document = useDocument(docId);
  const fileUrl = useGetFileUrl(document?.fileStorageId);

  if (!document) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Document not found.</p>
            <Button
              variant="outline"
              onClick={() => router.push('/docs')}
              className="mt-4"
            >
              Back to Document Library
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isPDF = document.fileType === 'application/pdf' || document.fileName.toLowerCase().endsWith('.pdf');
  const isImage = document.fileType.startsWith('image/') || 
    /\.(jpg|jpeg|png|gif|webp)$/i.test(document.fileName);
  const isText = document.fileType.startsWith('text/') || 
    /\.(txt|md|csv)$/i.test(document.fileName);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4"
          >
            ← Back
          </Button>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  {document.fileName}
                </h1>
                <div className="flex gap-2 mb-2">
                  <Badge variant="secondary">
                    {document.fileTypeDetected}
                  </Badge>
                  <Badge variant="outline">
                    {document.category}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {document.summary}
                </p>
                {document.clientName && (
                  <p className="text-sm text-gray-600 mt-1">
                    Client: {document.clientName}
                  </p>
                )}
                {document.projectName && (
                  <p className="text-sm text-gray-600 mt-1">
                    Project: {document.projectName}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  Uploaded: {new Date(document.uploadedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setIsRefileModalOpen(true)}
                  variant="outline"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refile
                </Button>
                {fileUrl && (
                  <Button
                    onClick={() => {
                      const link = window.document.createElement('a');
                      link.href = fileUrl;
                      link.download = document.fileName;
                      link.click();
                    }}
                    variant="outline"
                  >
                    Download
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Extracted Financial Data */}
        {document.extractedData && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Extracted Financial Data</h2>
            {document.extractedData.detectedCurrency && (
              <div className="mb-4">
                <Badge variant="secondary" className="mb-2">
                  Currency: {document.extractedData.detectedCurrency}
                </Badge>
              </div>
            )}
            
            {/* Costs */}
            {document.extractedData.costs && document.extractedData.costs.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Costs</h3>
                <div className="space-y-2">
                  {document.extractedData.costs.map((cost: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <span className="text-sm text-gray-700">{cost.type}</span>
                      <span className="text-sm font-medium text-gray-900">
                        {cost.currency === 'GBP' ? '£' : cost.currency === 'USD' ? '$' : cost.currency === 'EUR' ? '€' : ''}
                        {cost.amount?.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
                {document.extractedData.costsTotal && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-900">Total Costs</span>
                      <span className="font-bold text-gray-900">
                        {document.extractedData.costsTotal.currency === 'GBP' ? '£' : document.extractedData.costsTotal.currency === 'USD' ? '$' : document.extractedData.costsTotal.currency === 'EUR' ? '€' : ''}
                        {document.extractedData.costsTotal.amount?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Plots */}
            {document.extractedData.plots && document.extractedData.plots.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Plots/Developments</h3>
                <div className="space-y-2">
                  {document.extractedData.plots.map((plot: any, idx: number) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-gray-900">{plot.name}</span>
                        <span className="text-sm font-medium text-gray-900">
                          {plot.currency === 'GBP' ? '£' : plot.currency === 'USD' ? '$' : plot.currency === 'EUR' ? '€' : ''}
                          {plot.cost?.toLocaleString()}
                        </span>
                      </div>
                      {plot.squareFeet && (
                        <div className="text-xs text-gray-600">
                          {plot.squareFeet.toLocaleString()} sq ft
                          {plot.pricePerSquareFoot && ` • £${plot.pricePerSquareFoot.toFixed(2)}/sq ft`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Financing */}
            {document.extractedData.financing && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Financing</h3>
                <div className="space-y-2 p-3 bg-gray-50 rounded">
                  {document.extractedData.financing.loanAmount && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-700">Loan Amount</span>
                      <span className="text-sm font-medium text-gray-900">
                        {document.extractedData.financing.currency === 'GBP' ? '£' : document.extractedData.financing.currency === 'USD' ? '$' : document.extractedData.financing.currency === 'EUR' ? '€' : ''}
                        {document.extractedData.financing.loanAmount.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {document.extractedData.financing.interestPercentage && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-700">Interest Rate</span>
                      <span className="text-sm font-medium text-gray-900">
                        {document.extractedData.financing.interestPercentage}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Profit */}
            {document.extractedData.profit && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Profit</h3>
                <div className="p-3 bg-gray-50 rounded">
                  {document.extractedData.profit.total && (
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-700">Total Profit</span>
                      <span className="text-sm font-medium text-gray-900">
                        {document.extractedData.profit.currency === 'GBP' ? '£' : document.extractedData.profit.currency === 'USD' ? '$' : document.extractedData.profit.currency === 'EUR' ? '€' : ''}
                        {document.extractedData.profit.total.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {document.extractedData.profit.percentage && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-700">Profit Percentage</span>
                      <span className="text-sm font-medium text-gray-900">
                        {document.extractedData.profit.percentage}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Revenue */}
            {document.extractedData.revenue && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Revenue</h3>
                <div className="p-3 bg-gray-50 rounded">
                  {document.extractedData.revenue.totalSales && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-700">Total Sales</span>
                      <span className="text-sm font-medium text-gray-900">
                        {document.extractedData.revenue.currency === 'GBP' ? '£' : document.extractedData.revenue.currency === 'USD' ? '$' : document.extractedData.revenue.currency === 'EUR' ? '€' : ''}
                        {document.extractedData.revenue.totalSales.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Extraction Notes */}
            {document.extractedData.extractionNotes && (
              <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
                <p className="text-xs text-blue-800">
                  <span className="font-medium">Notes:</span> {document.extractedData.extractionNotes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* File Viewer */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {!fileUrl ? (
            <div className="text-center py-12 text-gray-500">
              <p>File content not available.</p>
              <p className="text-sm mt-2">This document may have been uploaded before file content storage was implemented.</p>
            </div>
          ) : isPDF ? (
            <div className="w-full">
              <iframe
                src={fileUrl}
                className="w-full h-[800px] border border-gray-200 rounded"
                title={document.fileName}
              />
            </div>
          ) : isImage ? (
            <div className="flex justify-center">
              <img
                src={fileUrl || ''}
                alt={document.fileName}
                className="max-w-full h-auto rounded border border-gray-200"
              />
            </div>
          ) : isText ? (
            <div className="w-full">
              <iframe
                src={fileUrl}
                className="w-full h-[600px] border border-gray-200 rounded font-mono text-sm"
                title={document.fileName}
              />
            </div>
          ) : (
            <div className="w-full">
              <div className="border border-gray-200 rounded p-4 mb-4 bg-gray-50">
                <p className="text-sm text-gray-600 mb-2">
                  File type: {document.fileType || 'Unknown'}
                </p>
                <p className="text-sm text-gray-600">
                  This file type may not be viewable in the browser. Please download to view.
                </p>
              </div>
              {fileUrl && (
                <Button
                  onClick={() => {
                    const link = window.document.createElement('a');
                    link.href = fileUrl;
                    link.download = document.fileName;
                    link.click();
                  }}
                  className="w-full"
                >
                  Download File
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Refile Modal */}
        {document && (
          <RefileModal
            documentId={docId}
            currentClientId={document.clientId || undefined}
            currentProjectId={document.projectId || undefined}
            currentFileType={document.fileTypeDetected}
            currentCategory={document.category}
            isOpen={isRefileModalOpen}
            onClose={() => setIsRefileModalOpen(false)}
            onRefiled={() => {
              // Document will automatically refresh via useDocument hook
              setIsRefileModalOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

