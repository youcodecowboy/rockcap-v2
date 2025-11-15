'use client';

import { EnrichmentSuggestion } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

const typeColors = {
  email: 'bg-blue-100 text-blue-800',
  phone: 'bg-green-100 text-green-800',
  address: 'bg-purple-100 text-purple-800',
  company: 'bg-orange-100 text-orange-800',
  contact: 'bg-pink-100 text-pink-800',
  date: 'bg-yellow-100 text-yellow-800',
  other: 'bg-gray-100 text-gray-800',
};

export default function EnrichmentSuggestionCard({
  suggestion,
  onAccept,
  onReject,
  documentName,
}: EnrichmentSuggestionCardProps) {
  const Icon = typeIcons[suggestion.type] || Info;
  const colorClass = typeColors[suggestion.type] || typeColors.other;
  
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
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${colorClass}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">
                {getFieldLabel(suggestion.field)}
              </span>
              <Badge variant="outline" className="text-xs">
                {confidencePercentage}% confidence
              </Badge>
            </div>
            <p className="text-sm text-gray-600 mt-0.5">
              Found in {documentName || suggestion.source}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-md p-3 mb-3">
        <p className="text-sm text-gray-700 font-medium mb-1">Suggested Value:</p>
        <p className="text-sm text-gray-900 break-words">{formatValue(suggestion.value)}</p>
      </div>

      {suggestion.source && suggestion.source !== documentName && (
        <p className="text-xs text-gray-500 mb-3 italic">{suggestion.source}</p>
      )}

      <div className="flex gap-2">
        <Button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Accept button clicked for suggestion:', suggestion);
            onAccept();
          }}
          size="sm"
          className="flex-1 bg-green-600 hover:bg-green-700"
          disabled={suggestion.status !== 'pending'}
        >
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {suggestion.status === 'pending' ? 'Accept' : suggestion.status === 'accepted' ? 'Accepted' : 'Processed'}
        </Button>
        <Button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Reject button clicked for suggestion:', suggestion);
            onReject();
          }}
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={suggestion.status !== 'pending'}
        >
          <XCircle className="w-4 h-4 mr-2" />
          {suggestion.status === 'pending' ? 'Reject' : suggestion.status === 'rejected' ? 'Rejected' : 'Processed'}
        </Button>
      </div>
    </div>
  );
}

