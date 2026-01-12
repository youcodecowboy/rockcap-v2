'use client';

import { Id } from '../../../../../convex/_generated/dataModel';
import {
  Database,
  FileSpreadsheet,
} from 'lucide-react';

interface ClientDataTabProps {
  clientId: Id<"clients">;
  clientName: string;
}

export default function ClientDataTab({
  clientId,
  clientName,
}: ClientDataTabProps) {
  // For now, show a placeholder - data library integration can be added later
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
      <Database className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">Data Library</h3>
      <p className="text-gray-500 max-w-md mx-auto">
        Financial data extracted from documents will appear here. Upload spreadsheets, 
        financial statements, and appraisals to see extracted data points.
      </p>
      <div className="mt-6 p-4 bg-gray-50 rounded-lg inline-block">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          <span>Upload documents in the Documents tab to extract data</span>
        </div>
      </div>
    </div>
  );
}
