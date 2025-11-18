'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { HyperFormula } from 'hyperformula';
import { SheetData } from '@/lib/templateLoader';
import { extractFormulaResults, serializeFormulaResults } from '@/lib/formulaResultsExtractor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SaveVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  scenarioId: Id<"scenarios"> | null;
  currentData?: any[][];
  hyperFormulaEngine?: HyperFormula | null;
  sheets?: SheetData[];
}

export default function SaveVersionModal({
  isOpen,
  onClose,
  onSuccess,
  scenarioId,
  currentData,
  hyperFormulaEngine,
  sheets,
}: SaveVersionModalProps) {
  const [modelType, setModelType] = useState<'appraisal' | 'operating' | 'other'>('appraisal');
  const [version, setVersion] = useState('');
  const [versionName, setVersionName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existingVersions = useQuery(
    api.modelRuns.getVersions,
    scenarioId ? { scenarioId } : "skip"
  );
  const saveVersion = useMutation(api.modelRuns.saveVersion);
  const saveResults = useMutation(api.scenarioResults.saveResults);

  // Calculate next version number
  const nextVersion = existingVersions && existingVersions.length > 0
    ? Math.max(...existingVersions.map(v => v.version)) + 1
    : 1;

  const handleClose = () => {
    setModelType('appraisal');
    setVersion('');
    setVersionName('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!scenarioId) {
      alert('No scenario selected');
      return;
    }
    
    const versionNum = version ? parseInt(version, 10) : nextVersion;
    
    if (isNaN(versionNum) || versionNum < 1) {
      alert('Please enter a valid version number');
      return;
    }

    setIsSubmitting(true);
    try {
      // Save model run version
      await saveVersion({
        scenarioId,
        modelType,
        version: versionNum,
        versionName: versionName.trim() || undefined,
        inputs: currentData || [],
        outputs: undefined, // Will be populated when models are implemented
      });
      
      // Extract and save formula results if HyperFormula engine is available
      if (hyperFormulaEngine && sheets && sheets.length > 0) {
        try {
          const formulaResults = extractFormulaResults(hyperFormulaEngine, sheets);
          const serializedResults = serializeFormulaResults(formulaResults);
          
          await saveResults({
            scenarioId,
            version: versionNum,
            inputs: serializedResults.inputs,
            outputs: serializedResults.outputs,
            allValues: serializedResults.allValues,
          });
        } catch (error) {
          console.error('Error saving formula results:', error);
          // Don't fail the entire save if results extraction fails
        }
      }
      
      handleClose();
      onSuccess?.();
    } catch (error) {
      console.error('Error saving version:', error);
      alert('Failed to save version. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Don't render if no scenarioId
  if (!scenarioId) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save Version</DialogTitle>
          <DialogDescription>
            Save a new version of this scenario with the current data
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="model-type">Model Type *</Label>
            <Select value={modelType} onValueChange={(value: 'appraisal' | 'operating' | 'other') => setModelType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="appraisal">Appraisal Model</SelectItem>
                <SelectItem value="operating">Operating Model</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="version-number">Version Number *</Label>
            <Input
              id="version-number"
              type="number"
              placeholder={`${nextVersion} (suggested)`}
              value={version || nextVersion}
              onChange={(e) => setVersion(e.target.value)}
              min={1}
              required
            />
            <p className="text-xs text-gray-500">
              Suggested: {nextVersion}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="version-name">Version Name (Optional)</Label>
            <Input
              id="version-name"
              placeholder="e.g., Q1 2024 Baseline, Updated Rates"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Version'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

