'use client';

import { useState, useMemo } from 'react';
import MetricCard from '@/components/MetricCard';
import { FileText, Calendar, DollarSign, TrendingUp, ArrowLeft, ArrowRight, Building2, Users, PieChart } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExtractedData {
  financing?: {
    loanAmount?: number;
    interestRate?: number;
    interestPercentage?: number;
    currency?: string;
  };
  costsTotal?: {
    amount: number;
    currency?: string;
  };
  profit?: {
    total?: number;
    percentage?: number;
    currency?: string;
  };
  units?: {
    count: number;
    type?: string;
    costPerUnit?: number;
    currency?: string;
  };
  plots?: Array<{
    name: string;
    cost: number;
    squareFeet?: number;
    pricePerSquareFoot?: number;
    currency?: string;
  }>;
  revenue?: {
    totalSales?: number;
    salesPerUnit?: number;
    currency?: string;
  };
  averageInterest?: {
    rate?: number;
    percentage?: number;
  };
}

interface MetricCardsSlideshowProps {
  documents: any[];
  projectLoanAmount?: number;
  communicationsCount: number;
  extractedData?: ExtractedData;
  showControls?: boolean;
  onControlsChange?: (index: number) => void;
  currentIndex?: number;
}

export default function MetricCardsSlideshow({
  documents,
  projectLoanAmount,
  communicationsCount,
  extractedData,
  showControls = true,
  onControlsChange,
  currentIndex: externalIndex,
}: MetricCardsSlideshowProps) {
  const [internalIndex, setInternalIndex] = useState(0);
  const currentIndex = externalIndex !== undefined ? externalIndex : internalIndex;
  
  const handleIndexChange = (newIndex: number) => {
    if (onControlsChange) {
      onControlsChange(newIndex);
    } else {
      setInternalIndex(newIndex);
    }
  };

  // Aggregate extracted data from all documents
  const aggregatedData = useMemo(() => {
    if (extractedData) return extractedData;

    const docsWithData = documents.filter((doc: any) => doc.extractedData);
    if (docsWithData.length === 0) return null;

    // Get the most recent document's extracted data (most up-to-date)
    const latestDoc = docsWithData.sort((a: any, b: any) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];

    return latestDoc.extractedData;
  }, [documents, extractedData]);

  // Build metric cards based on available data
  const metricCards = useMemo(() => {
    const cards: Array<{
      label: string;
      value: string | number;
      icon: typeof FileText;
      iconColor: 'blue' | 'green' | 'purple' | 'orange' | 'yellow' | 'gray';
    }> = [];

    // Always show document count
    cards.push({
      label: 'Total Documents',
      value: documents.length,
      icon: FileText,
      iconColor: 'blue',
    });

    // Loan Amount - prioritize project.loanAmount, then extracted data
    const loanAmount = projectLoanAmount || aggregatedData?.financing?.loanAmount;
    if (loanAmount) {
      const currency = aggregatedData?.financing?.currency || 'USD';
      cards.push({
        label: 'Loan Amount',
        value: new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency === 'GBP' ? 'GBP' : currency === 'EUR' ? 'EUR' : 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(loanAmount),
        icon: DollarSign,
        iconColor: 'green',
      });
    }

    // Total Costs
    if (aggregatedData?.costsTotal?.amount) {
      const currency = aggregatedData.costsTotal.currency || 'USD';
      cards.push({
        label: 'Total Costs',
        value: new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency === 'GBP' ? 'GBP' : currency === 'EUR' ? 'EUR' : 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(aggregatedData.costsTotal.amount),
        icon: TrendingUp,
        iconColor: 'orange',
      });
    }

    // Interest Rate
    const interestRate = aggregatedData?.financing?.interestPercentage || 
                        aggregatedData?.averageInterest?.percentage ||
                        (aggregatedData?.financing?.interestRate ? aggregatedData.financing.interestRate * 100 : null);
    if (interestRate) {
      cards.push({
        label: 'Interest Rate',
        value: `${interestRate.toFixed(2)}%`,
        icon: PieChart,
        iconColor: 'purple',
      });
    }

    // Profit
    if (aggregatedData?.profit?.total) {
      const currency = aggregatedData.profit.currency || 'USD';
      cards.push({
        label: 'Profit',
        value: new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency === 'GBP' ? 'GBP' : currency === 'EUR' ? 'EUR' : 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(aggregatedData.profit.total),
        icon: TrendingUp,
        iconColor: 'green',
      });
    }

    // Units/Plots Count
    if (aggregatedData?.units?.count) {
      cards.push({
        label: `${aggregatedData.units.count} ${aggregatedData.units.type || 'Units'}`,
        value: aggregatedData.units.count,
        icon: Building2,
        iconColor: 'blue',
      });
    } else if (aggregatedData?.plots && aggregatedData.plots.length > 0) {
      cards.push({
        label: `${aggregatedData.plots.length} ${aggregatedData.plots.length === 1 ? 'Plot' : 'Plots'}`,
        value: aggregatedData.plots.length,
        icon: Building2,
        iconColor: 'blue',
      });
    }

    // Revenue
    if (aggregatedData?.revenue?.totalSales) {
      const currency = aggregatedData.revenue.currency || 'USD';
      cards.push({
        label: 'Total Revenue',
        value: new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency === 'GBP' ? 'GBP' : currency === 'EUR' ? 'EUR' : 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(aggregatedData.revenue.totalSales),
        icon: DollarSign,
        iconColor: 'green',
      });
    }

    // Communications (always show)
    cards.push({
      label: 'Communications',
      value: communicationsCount,
      icon: FileText,
      iconColor: 'orange',
    });

    // Last Activity
    if (documents.length > 0) {
      const lastDoc = documents.sort((a: any, b: any) => 
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      )[0];
      cards.push({
        label: 'Last Activity',
        value: new Date(lastDoc.uploadedAt).toLocaleDateString(),
        icon: Calendar,
        iconColor: 'purple',
      });
    }

    return cards;
  }, [documents, projectLoanAmount, communicationsCount, aggregatedData]);

  const visibleCards = metricCards.slice(currentIndex, currentIndex + 4);
  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex + 4 < metricCards.length;

  const handlePrevious = () => {
    handleIndexChange(Math.max(0, currentIndex - 4));
  };

  const handleNext = () => {
    handleIndexChange(Math.min(metricCards.length - 4, currentIndex + 4));
  };

  if (metricCards.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {visibleCards.map((card, index) => (
          <div
            key={`${card.label}-${currentIndex + index}`}
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <MetricCard
              label={card.label}
              value={card.value}
              icon={card.icon}
              iconColor={card.iconColor}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Separate component for controls
export function MetricCardsControls({
  currentIndex,
  totalCards,
  onPrevious,
  onNext,
  canGoBack,
  canGoForward,
}: {
  currentIndex: number;
  totalCards: number;
  onPrevious: () => void;
  onNext: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={!canGoBack}
        className="h-8 w-8 p-0"
      >
        <ArrowLeft className="w-4 h-4" />
      </Button>
      <span className="text-sm text-gray-600">
        {Math.floor(currentIndex / 4) + 1} of {Math.ceil(totalCards / 4)}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={!canGoForward}
        className="h-8 w-8 p-0"
      >
        <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

