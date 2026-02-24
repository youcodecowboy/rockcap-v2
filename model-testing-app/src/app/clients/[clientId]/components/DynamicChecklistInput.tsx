'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sparkles,
  Plus,
  Check,
  X,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ParsedRequirement {
  name: string;
  category: string;
  description?: string;
  priority: 'required' | 'nice_to_have' | 'optional';
}

interface DynamicChecklistInputProps {
  clientId: Id<"clients">;
  projectId?: Id<"projects">;
  onClose: () => void;
}

export default function DynamicChecklistInput({
  clientId,
  projectId,
  onClose,
}: DynamicChecklistInputProps) {
  const [activeTab, setActiveTab] = useState<'llm' | 'manual'>('llm');
  
  // LLM parsing state
  const [llmInput, setLlmInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRequirements, setParsedRequirements] = useState<ParsedRequirement[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Manual input state
  const [manualName, setManualName] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualPriority, setManualPriority] = useState<'required' | 'nice_to_have' | 'optional'>('required');

  // Queries
  const existingChecklistItems = useQuery(
    api.knowledgeLibrary.getAllChecklistItemsForClient,
    { clientId, projectId }
  );

  // Mutations
  const addCustomRequirement = useMutation(api.knowledgeLibrary.addCustomRequirement);
  const addFromLLM = useMutation(api.knowledgeLibrary.addCustomRequirementsFromLLM);

  // Handle LLM parsing
  const handleParse = async () => {
    if (!llmInput.trim()) {
      alert('Please enter some text describing the additional requirements you need.');
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setParsedRequirements([]);

    // Prepare existing items for context
    const existingItems = existingChecklistItems?.map(item => ({
      name: item.name,
      category: item.category,
      description: item.description,
      status: item.status,
    })) || [];

    try {
      const response = await fetch('/api/knowledge-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: llmInput, existingItems }),
      });

      if (!response.ok) {
        throw new Error('Failed to parse requirements');
      }

      const data = await response.json();
      
      if (data.requirements && data.requirements.length > 0) {
        setParsedRequirements(data.requirements);
      } else {
        setParseError('No requirements could be extracted from your text. Please try being more specific.');
      }
    } catch (error) {
      setParseError('Failed to parse requirements. Please try again.');
      console.error('Parse error:', error);
    } finally {
      setIsParsing(false);
    }
  };

  // Handle adding parsed requirements
  const handleAddParsed = async () => {
    if (parsedRequirements.length === 0) return;

    try {
      await addFromLLM({
        clientId,
        projectId,
        requirements: parsedRequirements,
      });
      onClose();
    } catch (error) {
      console.error('Failed to add requirements:', error);
      alert('Failed to add requirements. Please try again.');
    }
  };

  // Handle removing a parsed requirement
  const handleRemoveParsed = (index: number) => {
    setParsedRequirements(prev => prev.filter((_, i) => i !== index));
  };

  // Handle manual add
  const handleManualAdd = async () => {
    if (!manualName.trim() || !manualCategory.trim()) {
      alert('Name and category are required.');
      return;
    }

    try {
      await addCustomRequirement({
        clientId,
        projectId,
        name: manualName,
        category: manualCategory,
        description: manualDescription || undefined,
        priority: manualPriority,
      });
      onClose();
    } catch (error) {
      console.error('Failed to add requirement:', error);
      alert('Failed to add requirement. Please try again.');
    }
  };

  // Get priority badge
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'required':
        return <Badge variant="destructive" className="text-[10px] h-4">Required</Badge>;
      case 'nice_to_have':
        return <Badge variant="secondary" className="text-[10px] h-4">Nice to have</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] h-4">Optional</Badge>;
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" />
            Add Custom Requirements
          </DialogTitle>
          <DialogDescription>
            Add new document requirements to the checklist
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'llm' | 'manual')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="llm" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Assisted
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Manual Entry
            </TabsTrigger>
          </TabsList>

          {/* LLM Tab */}
          <TabsContent value="llm" className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Describe additional requirements
              </Label>
              <Textarea
                placeholder="Example: This client is working on an additional project at another location, and we are going to do some due diligence on it. I will be asking them for some additional project plans and evaluation reports..."
                value={llmInput}
                onChange={(e) => setLlmInput(e.target.value)}
                className="h-32"
              />
              <p className="text-xs text-gray-500 mt-1">
                Describe what additional documents you need in natural language. The AI will parse your text and extract structured requirements.
              </p>
            </div>

            <Button
              onClick={handleParse}
              disabled={isParsing || !llmInput.trim()}
              className="w-full"
            >
              {isParsing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Parse Requirements
                </>
              )}
            </Button>

            {/* Parse Error */}
            {parseError && (
              <div className="p-3 bg-red-50 rounded-lg flex items-start gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            {/* Parsed Requirements Preview */}
            {parsedRequirements.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  Parsed Requirements ({parsedRequirements.length})
                </Label>
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {parsedRequirements.map((req, index) => (
                    <div key={index} className="p-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-900">{req.name}</span>
                          {getPriorityBadge(req.priority)}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Category: {req.category}
                        </p>
                        {req.description && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                            {req.description}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => handleRemoveParsed(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={handleAddParsed}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Add {parsedRequirements.length} Requirement{parsedRequirements.length > 1 ? 's' : ''}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Manual Tab */}
          <TabsContent value="manual" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-sm font-medium">
                  Requirement Name *
                </Label>
                <Input
                  id="name"
                  placeholder="e.g., Environmental Survey Report"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category" className="text-sm font-medium">
                    Category *
                  </Label>
                  <Input
                    id="category"
                    placeholder="e.g., Professional Reports"
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium">
                    Priority
                  </Label>
                  <Select value={manualPriority} onValueChange={(v: any) => setManualPriority(v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="required">Required</SelectItem>
                      <SelectItem value="nice_to_have">Nice to have</SelectItem>
                      <SelectItem value="optional">Optional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="description" className="text-sm font-medium">
                  Description
                </Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of what this document should contain..."
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  className="mt-1 h-20"
                />
              </div>
            </div>

            <Button
              onClick={handleManualAdd}
              disabled={!manualName.trim() || !manualCategory.trim()}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Requirement
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
