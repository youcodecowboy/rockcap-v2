'use client';

import { EnrichmentSuggestion } from '@/types';
import { Panel, Button, StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';
import { CheckCircle2, XCircle, Mail, Phone, MapPin, Building2, User, Calendar, Info } from 'lucide-react';

interface EnrichmentSuggestionCardProps {
  suggestion: EnrichmentSuggestion;
  onAccept: () => void;
  onReject: () => void;
  documentName?: string;
}

const typeIcons = {
  email: Mail,
  phone: Phone,
  address: MapPin,
  company: Building2,
  contact: User,
  date: Calendar,
  other: Info,
};

function typeTone(type: string, colors: ColorPalette): string {
  switch (type) {
    case 'email': return colors.accent.blue;
    case 'phone': return colors.accent.green;
    case 'address': return colors.accent.purple;
    case 'company': return colors.accent.orange;
    case 'contact': return colors.accent.purple;
    case 'date': return colors.accent.yellow;
    default: return colors.text.muted;
  }
}

export default function EnrichmentSuggestionCard({
  suggestion,
  onAccept,
  onReject,
  documentName,
}: EnrichmentSuggestionCardProps) {
  const colors = useColors();
  const Icon = typeIcons[suggestion.type] || Info;
  const tone = typeTone(suggestion.type, colors);

  const formatValue = (value: string | number | object): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value.toLocaleString();
    return JSON.stringify(value);
  };

  const getFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      email: 'Email Address',
      phone: 'Phone Number',
      address: 'Address',
      companyName: 'Company Name',
      website: 'Website',
      city: 'City',
      state: 'State',
      zip: 'ZIP Code',
      country: 'Country',
      description: 'Description',
      loanNumber: 'Loan Number',
      loanAmount: 'Loan Amount',
      interestRate: 'Interest Rate',
      startDate: 'Start Date',
      endDate: 'End Date',
      expectedCompletionDate: 'Expected Completion Date',
    };
    return labels[field] || field.charAt(0).toUpperCase() + field.slice(1);
  };

  const confidencePercentage = Math.round(suggestion.confidence * 100);

  return (
    <Panel accent={tone}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center"
            style={{ width: 32, height: 32, borderRadius: 4, background: `${tone}15`, color: tone, flexShrink: 0 }}
          >
            <Icon size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                {getFieldLabel(suggestion.field)}
              </span>
              <StatusPill label={`${confidencePercentage}% confidence`} tone={tone} />
            </div>
            <p className="mt-0.5" style={{ fontSize: 13, color: colors.text.secondary }}>
              Found in {documentName || suggestion.source}
            </p>
          </div>
        </div>
      </div>

      <div className="p-3 mb-3" style={{ background: colors.bg.light, borderRadius: 4 }}>
        <p className="mb-1" style={{ fontSize: 13, fontWeight: 500, color: colors.text.secondary }}>Suggested Value:</p>
        <p className="break-words" style={{ fontSize: 13, color: colors.text.primary }}>{formatValue(suggestion.value)}</p>
      </div>

      {suggestion.source && suggestion.source !== documentName && (
        <p className="mb-3" style={{ fontSize: 11, fontStyle: 'italic', color: colors.text.muted }}>{suggestion.source}</p>
      )}

      <div className="flex gap-2">
        <Button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Accept button clicked for suggestion:', suggestion);
            onAccept();
          }}
          variant="primary"
          accent={colors.accent.green}
          size="sm"
          style={{ flex: 1, justifyContent: 'center' }}
          disabled={suggestion.status !== 'pending'}
        >
          <CheckCircle2 size={16} />
          {suggestion.status === 'pending' ? 'Accept' : suggestion.status === 'accepted' ? 'Accepted' : 'Processed'}
        </Button>
        <Button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Reject button clicked for suggestion:', suggestion);
            onReject();
          }}
          variant="secondary"
          size="sm"
          style={{ flex: 1, justifyContent: 'center' }}
          disabled={suggestion.status !== 'pending'}
        >
          <XCircle size={16} />
          {suggestion.status === 'pending' ? 'Reject' : suggestion.status === 'rejected' ? 'Rejected' : 'Processed'}
        </Button>
      </div>
    </Panel>
  );
}
