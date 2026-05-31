'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Id } from '../../convex/_generated/dataModel';
import { useDocumentsByProject } from '@/lib/documentStorage';
import StatusBadge from '@/components/StatusBadge';
import { FlagChip } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
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
  const colors = useColors();
  const [hover, setHover] = useState(false);
  const projectId = project._id as Id<"projects">;
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

  const labelStyle = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: colors.text.muted,
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => router.push(`/projects/${projectId}`)}
      style={{
        background: colors.bg.card,
        border: `1px solid ${colors.border.default}`,
        borderTop: `2px solid ${colors.entityTypes.project}`,
        borderRadius: 4,
        padding: 20,
        cursor: 'pointer',
        opacity: isPast ? 0.7 : 1,
        transition: 'background 100ms linear',
        ...(hover ? { background: colors.bg.cardAlt } : null),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: colors.text.primary }}>
              {project.name}
            </h3>
            {project.status && <StatusBadge status={project.status} />}
          </div>
          {project.description && (
            <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }} className="line-clamp-2">
              {project.description}
            </p>
          )}
        </div>
        <ChevronRight
          size={18}
          style={{ color: hover ? colors.entityTypes.project : colors.text.dim, flexShrink: 0, marginLeft: 16 }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4" style={{ gap: 16, marginBottom: 16 }}>
        {/* Document Count */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <FileText size={14} style={{ color: colors.text.dim, marginTop: 2, flexShrink: 0 }} />
          <div>
            <div style={labelStyle}>Documents</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary, marginTop: 2 }}>
              {documentCount} {documentCount === 1 ? 'document' : 'documents'}
            </div>
          </div>
        </div>

        {/* Last Document Date */}
        {lastDocumentDate && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Calendar size={14} style={{ color: colors.text.dim, marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={labelStyle}>Last Document</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary, marginTop: 2 }}>{lastDocumentDate}</div>
            </div>
          </div>
        )}

        {/* Loan Amount */}
        {loanAmount && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <DollarSign size={14} style={{ color: colors.text.dim, marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={labelStyle}>Loan Amount</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary, marginTop: 2 }}>{loanAmount}</div>
            </div>
          </div>
        )}

        {/* Address */}
        {address && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <MapPin size={14} style={{ color: colors.text.dim, marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={labelStyle}>Location</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary, marginTop: 2 }} className="line-clamp-1">{address}</div>
            </div>
          </div>
        )}
      </div>

      {/* Extracted Data Summary */}
      {extractedSummary && extractedSummary.length > 0 && (
        <div style={{ paddingTop: 16, borderTop: `1px solid ${colors.border.light}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <TrendingUp size={14} style={{ color: colors.text.dim }} />
            <span style={labelStyle}>Extracted Data</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {extractedSummary.map((item, index) => (
              <FlagChip key={index} label={item} severity="info" />
            ))}
          </div>
        </div>
      )}

      {/* Loan Number */}
      {project.loanNumber && (
        <div style={{ paddingTop: 12, borderTop: `1px solid ${colors.border.light}`, marginTop: 12 }}>
          <div style={labelStyle}>Loan Number</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary, marginTop: 2 }}>{project.loanNumber}</div>
        </div>
      )}
    </div>
  );
}

