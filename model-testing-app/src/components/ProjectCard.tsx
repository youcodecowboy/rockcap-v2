'use client';

import { useRouter } from 'next/navigation';
import { Id } from '../../convex/_generated/dataModel';
import { useDocumentsByProject } from '@/lib/documentStorage';
import StatusBadge from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Calendar,
  DollarSign,
  MapPin,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';

interface ProjectCardProps {
  project: {
    _id?: Id<"projects">;
    id?: string;
    name: string;
    status?: 'active' | 'inactive' | 'completed' | 'on-hold' | 'cancelled';
    description?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    loanAmount?: number;
    loanNumber?: string;
    extractedData?: any;
    createdAt?: string;
  };
  isPast?: boolean;
}

export default function ProjectCard({ project, isPast = false }: ProjectCardProps) {
  const router = useRouter();
  const projectId = (project._id || project.id) as Id<"projects">;
  const documents = useDocumentsByProject(projectId) || [];
  
  // Calculate metrics
  const documentCount = documents.length;
  const lastDocument = documents.length > 0
    ? documents.sort((a: any, b: any) => 
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      )[0]
    : null;
  const lastDocumentDate = lastDocument 
    ? new Date(lastDocument.uploadedAt).toLocaleDateString()
    : null;

  // Format address
  const formatAddress = () => {
    const parts = [];
    if (project.address) parts.push(project.address);
    if (project.city) parts.push(project.city);
    if (project.state) parts.push(project.state);
    if (project.zip) parts.push(project.zip);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  // Format loan amount - prioritize project.loanAmount, then try extracted data
  const formatLoanAmount = () => {
    if (project.loanAmount) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(project.loanAmount);
    }
    
    // Try to get from documents' extracted data
    const documentsWithData = documents.filter((doc: any) => doc.extractedData);
    if (documentsWithData.length > 0) {
      const latestDoc = documentsWithData.sort((a: any, b: any) => 
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      )[0];
      
      const loanAmount = latestDoc.extractedData?.financing?.loanAmount;
      if (loanAmount) {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(loanAmount);
      }
    }
    
    return null;
  };

  // Extract key data from documents' extractedData
  const getExtractedDataSummary = () => {
    const documentsWithData = documents.filter((doc: any) => doc.extractedData);
    if (documentsWithData.length === 0) return null;
    
    const summary: string[] = [];
    
    // Get the most recent document's extracted data, or aggregate from all
    const latestDoc = documentsWithData.sort((a: any, b: any) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];
    
    const extractedData = latestDoc.extractedData;
    if (!extractedData || typeof extractedData !== 'object') return null;
    
    // Extract financing information
    if (extractedData.financing?.loanAmount) {
      const loanAmt = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(extractedData.financing.loanAmount);
      summary.push(`Loan: ${loanAmt}`);
    }
    
    if (extractedData.financing?.interestRate || extractedData.financing?.interestPercentage) {
      const rate = extractedData.financing.interestPercentage || 
                   (extractedData.financing.interestRate ? extractedData.financing.interestRate * 100 : null);
      if (rate) {
        summary.push(`Rate: ${rate.toFixed(2)}%`);
      }
    }
    
    if (extractedData.averageInterest?.percentage) {
      summary.push(`Avg Rate: ${extractedData.averageInterest.percentage.toFixed(2)}%`);
    }
    
    // Extract costs
    if (extractedData.costsTotal?.amount) {
      const totalCosts = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(extractedData.costsTotal.amount);
      summary.push(`Total Costs: ${totalCosts}`);
    }
    
    // Extract units/plots
    if (extractedData.units?.count) {
      summary.push(`${extractedData.units.count} ${extractedData.units.type || 'units'}`);
    }
    
    if (extractedData.plots && Array.isArray(extractedData.plots) && extractedData.plots.length > 0) {
      summary.push(`${extractedData.plots.length} ${extractedData.plots.length === 1 ? 'plot' : 'plots'}`);
    }
    
    return summary.length > 0 ? summary.slice(0, 3) : null;
  };

  const extractedSummary = getExtractedDataSummary();
  const address = formatAddress();
  const loanAmount = formatLoanAmount();

  return (
    <div
      className={`bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-all cursor-pointer group ${
        isPast ? 'opacity-75' : ''
      }`}
      onClick={() => router.push(`/projects/${projectId}`)}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
              {project.name}
            </h3>
            {project.status && (
              <StatusBadge status={project.status} />
            )}
          </div>
          {project.description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{project.description}</p>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0 ml-4" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* Document Count */}
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-xs text-gray-500">Documents</div>
            <div className="text-sm font-medium text-gray-900">
              {documentCount} {documentCount === 1 ? 'document' : 'documents'}
            </div>
          </div>
        </div>

        {/* Last Document Date */}
        {lastDocumentDate && (
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-xs text-gray-500">Last Document</div>
              <div className="text-sm font-medium text-gray-900">{lastDocumentDate}</div>
            </div>
          </div>
        )}

        {/* Loan Amount */}
        {loanAmount && (
          <div className="flex items-start gap-2">
            <DollarSign className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-xs text-gray-500">Loan Amount</div>
              <div className="text-sm font-medium text-gray-900">{loanAmount}</div>
            </div>
          </div>
        )}

        {/* Address */}
        {address && (
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-xs text-gray-500">Location</div>
              <div className="text-sm font-medium text-gray-900 line-clamp-1">{address}</div>
            </div>
          </div>
        )}
      </div>

      {/* Extracted Data Summary */}
      {extractedSummary && extractedSummary.length > 0 && (
        <div className="pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500">Extracted Data</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {extractedSummary.map((item, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="text-xs bg-blue-50 text-blue-700 border-blue-200"
              >
                {item}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Loan Number */}
      {project.loanNumber && (
        <div className="pt-3 border-t border-gray-100 mt-3">
          <div className="text-xs text-gray-500">Loan Number</div>
          <div className="text-sm font-medium text-gray-900">{project.loanNumber}</div>
        </div>
      )}
    </div>
  );
}

