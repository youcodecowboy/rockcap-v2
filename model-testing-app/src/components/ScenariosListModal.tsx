'use client';

import { useState, useMemo } from 'react';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Search, 
  FileSpreadsheet, 
  Calendar, 
  ChevronRight,
  LayoutGrid 
} from 'lucide-react';

interface Scenario {
  _id: Id<'scenarios'>;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface ModelRun {
  scenarioId: Id<'scenarios'>;
  version: number;
}

interface ScenariosListModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenarios: Scenario[];
  modelRuns?: ModelRun[];
  selectedScenarioId: Id<'scenarios'> | null;
  onScenarioSelect: (scenarioId: Id<'scenarios'>) => void;
  projectName?: string;
}

export default function ScenariosListModal({
  isOpen,
  onClose,
  scenarios,
  modelRuns = [],
  selectedScenarioId,
  onScenarioSelect,
  projectName,
}: ScenariosListModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter scenarios based on search
  const filteredScenarios = useMemo(() => {
    if (!searchQuery.trim()) return scenarios;
    const query = searchQuery.toLowerCase();
    return scenarios.filter(
      s => s.name.toLowerCase().includes(query) || 
           s.description?.toLowerCase().includes(query)
    );
  }, [scenarios, searchQuery]);

  // Sort by most recently updated
  const sortedScenarios = useMemo(() => {
    return [...filteredScenarios].sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [filteredScenarios]);

  // Get latest version for a scenario
  const getLatestVersion = (scenarioId: Id<'scenarios'>) => {
    const runs = modelRuns.filter(r => r.scenarioId === scenarioId);
    if (runs.length === 0) return null;
    return Math.max(...runs.map(r => r.version));
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleSelect = (scenarioId: Id<'scenarios'>) => {
    onScenarioSelect(scenarioId);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-blue-600" />
            <span>Scenarios</span>
            {projectName && (
              <span className="text-sm font-normal text-gray-500">
                for {projectName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search scenarios..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Scenarios count */}
        <div className="text-sm text-gray-500">
          {filteredScenarios.length} scenario{filteredScenarios.length !== 1 ? 's' : ''}
          {searchQuery && ` matching "${searchQuery}"`}
        </div>

        {/* Scenarios list */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6 min-h-0">
          {sortedScenarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <FileSpreadsheet className="w-12 h-12 mb-3 text-gray-300" />
              {searchQuery ? (
                <p>No scenarios match your search</p>
              ) : (
                <p>No scenarios yet</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {sortedScenarios.map((scenario) => {
                const isSelected = scenario._id === selectedScenarioId;
                const version = getLatestVersion(scenario._id);
                
                return (
                  <button
                    key={scenario._id}
                    onClick={() => handleSelect(scenario._id)}
                    className={`w-full text-left p-4 rounded-lg border transition-all hover:shadow-sm ${
                      isSelected 
                        ? 'bg-blue-50 border-blue-200 shadow-sm' 
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-medium truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                            {scenario.name}
                          </span>
                          {version && (
                            <Badge variant="secondary" className="text-xs flex-shrink-0">
                              v{version}
                            </Badge>
                          )}
                        </div>
                        {scenario.description && (
                          <p className="text-sm text-gray-500 line-clamp-2 mb-2">
                            {scenario.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Created {formatDate(scenario.createdAt)}
                          </span>
                          {scenario.updatedAt !== scenario.createdAt && (
                            <span>
                              Updated {formatDate(scenario.updatedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className={`w-5 h-5 flex-shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t -mx-6 px-6">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


