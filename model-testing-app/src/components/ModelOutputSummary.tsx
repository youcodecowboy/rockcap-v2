'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, DollarSign, Percent, Building2 } from 'lucide-react';

interface ModelOutputSummaryProps {
  scenarioName?: string;
  modelType?: string;
  version?: number;
  versionName?: string;
}

export default function ModelOutputSummary({ 
  scenarioName, 
  modelType = 'appraisal',
  version,
  versionName 
}: ModelOutputSummaryProps) {
  // Mocked data - will be replaced with real model outputs later
  const mockData = {
    totalProjectValue: 12500000,
    totalCosts: 8500000,
    netProfit: 4000000,
    profitMargin: 32.0,
    roi: 47.1,
    paybackPeriod: 2.1,
    units: 45,
    averageUnitPrice: 277778,
    loanAmount: 6000000,
    interestRate: 4.5,
    monthlyPayment: 27000,
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {scenarioName || 'Model Output Summary'}
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">{modelType}</Badge>
              {version && (
                <Badge variant="outline">
                  Version {version}{versionName && ` - ${versionName}`}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Project Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(mockData.totalProjectValue / 1000000).toFixed(2)}M
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Projected total sales revenue
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                ${(mockData.netProfit / 1000000).toFixed(2)}M
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                After all costs and expenses
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {mockData.profitMargin.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Net profit as percentage of revenue
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">ROI</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {mockData.roi.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Return on investment
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
              <CardDescription>Key financial metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Revenue</span>
                <span className="font-semibold">
                  ${mockData.totalProjectValue.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Costs</span>
                <span className="font-semibold">
                  ${mockData.totalCosts.toLocaleString()}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="text-sm font-medium">Net Profit</span>
                <span className="font-bold text-green-600">
                  ${mockData.netProfit.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Payback Period</span>
                <span className="font-semibold">
                  {mockData.paybackPeriod.toFixed(1)} years
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
              <CardDescription>Unit and financing information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Units</span>
                <span className="font-semibold flex items-center gap-1">
                  <Building2 className="w-4 h-4" />
                  {mockData.units}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Average Unit Price</span>
                <span className="font-semibold">
                  ${mockData.averageUnitPrice.toLocaleString()}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="text-sm text-gray-600">Loan Amount</span>
                <span className="font-semibold">
                  ${(mockData.loanAmount / 1000000).toFixed(2)}M
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Interest Rate</span>
                <span className="font-semibold">
                  {mockData.interestRate}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Monthly Payment</span>
                <span className="font-semibold">
                  ${mockData.monthlyPayment.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Placeholder for Charts */}
        <Card>
          <CardHeader>
            <CardTitle>Visualizations</CardTitle>
            <CardDescription>Charts and graphs will appear here</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center">
              <p className="text-gray-400 text-sm">Chart visualization placeholder</p>
            </div>
          </CardContent>
        </Card>

        {/* Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> This is a mocked summary display. Real model outputs will be populated when models are implemented.
          </p>
        </div>
      </div>
    </div>
  );
}

