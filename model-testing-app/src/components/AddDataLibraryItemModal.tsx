'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Search, Plus, Check, Sparkles } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

interface AddDataLibraryItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  extractionId: Id<'codifiedExtractions'>;
  documentId: Id<'documents'>;
  onItemAdded: () => void;
  defaultCategory?: string;
}

type DataType = 'currency' | 'number' | 'percentage' | 'string';

interface ItemCode {
  _id: Id<'extractedItemCodes'>;
  code: string;
  displayName: string;
  category: string;
  dataType: string;
}

interface LLMSuggestion {
  suggestedCode: string;
  suggestedDisplayName: string;
  suggestedCategory: string;
  suggestedDataType: string;
  confidence: number;
  isNewCode: boolean;
  reasoning: string;
  existingCodeId?: string;
}

export function AddDataLibraryItemModal({
  isOpen,
  onClose,
  extractionId,
  documentId,
  onItemAdded,
  defaultCategory,
}: AddDataLibraryItemModalProps) {
  // Form state
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [category, setCategory] = useState(defaultCategory || '');
  const [dataType, setDataType] = useState<DataType>('currency');
  
  // Update category when defaultCategory changes
  useEffect(() => {
    if (defaultCategory && !category) {
      setCategory(defaultCategory);
    }
  }, [defaultCategory]);
  
  // Suggestion state
  const [isGettingSuggestion, setIsGettingSuggestion] = useState(false);
  const [suggestion, setSuggestion] = useState<LLMSuggestion | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  
  // Code search state
  const [showCodeSearch, setShowCodeSearch] = useState(false);
  const [codeSearchQuery, setCodeSearchQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState<ItemCode | null>(null);
  
  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Query existing codes
  const existingCodes = useQuery(api.extractedItemCodes.list, {}) as ItemCode[] | undefined;
  
  // Filter codes based on search
  const filteredCodes = existingCodes?.filter(code => 
    !codeSearchQuery || 
    code.code.toLowerCase().includes(codeSearchQuery.toLowerCase()) ||
    code.displayName.toLowerCase().includes(codeSearchQuery.toLowerCase()) ||
    code.category.toLowerCase().includes(codeSearchQuery.toLowerCase())
  );

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setValue('');
      setCategory('');
      setDataType('currency');
      setSuggestion(null);
      setSuggestionError(null);
      setShowCodeSearch(false);
      setCodeSearchQuery('');
      setSelectedCode(null);
    }
  }, [isOpen]);

  // Get LLM suggestion
  const getSuggestion = async () => {
    if (!name.trim()) {
      setSuggestionError('Please enter an item name first');
      return;
    }
    
    setIsGettingSuggestion(true);
    setSuggestionError(null);
    setSuggestion(null);
    
    try {
      const response = await fetch('/api/codify-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suggest-single',
          itemName: name.trim(),
          itemValue: parseFloat(value) || 0,
          itemCategory: category.trim() || undefined,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to get suggestion');
      }
      
      const data = await response.json();
      setSuggestion(data.suggestion);
      
      // Auto-fill category and data type from suggestion
      if (data.suggestion.suggestedCategory && !category) {
        setCategory(data.suggestion.suggestedCategory);
      }
      if (data.suggestion.suggestedDataType) {
        setDataType(data.suggestion.suggestedDataType as DataType);
      }
    } catch (error) {
      console.error('Suggestion error:', error);
      setSuggestionError('Failed to get AI suggestion. You can still add the item manually.');
    } finally {
      setIsGettingSuggestion(false);
    }
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!name.trim() || !value.trim()) {
      return;
    }
    
    const parsedValue = parseFloat(value);
    if (isNaN(parsedValue)) {
      setSuggestionError('Please enter a valid numeric value');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Determine the code to use
      let itemCode: string | undefined;
      let codeId: string | undefined;
      let isNewCode = false;
      
      if (selectedCode) {
        // User selected an existing code
        itemCode = selectedCode.code;
        codeId = selectedCode._id;
      } else if (suggestion) {
        // Use LLM suggestion
        itemCode = suggestion.suggestedCode;
        codeId = suggestion.existingCodeId;
        isNewCode = suggestion.isNewCode;
      }
      
      // Call API to add item
      const response = await fetch('/api/codify-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-item',
          extractionId,
          documentId,
          item: {
            originalName: name.trim(),
            value: parsedValue,
            category: category.trim() || 'Manual Entry',
            dataType,
            itemCode,
            codeId,
            isNewCode,
          },
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add item');
      }
      
      onItemAdded();
      onClose();
    } catch (error) {
      console.error('Submit error:', error);
      setSuggestionError('Failed to add item. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Item to Data Library</DialogTitle>
          <DialogDescription>
            Manually add a new item. AI will suggest a code based on the name.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          {/* Item Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Item Name *</Label>
            <div className="flex gap-2">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Stamp Duty, Build Cost, Plot 3"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={getSuggestion}
                disabled={!name.trim() || isGettingSuggestion}
                title="Get AI suggestion"
              >
                {isGettingSuggestion ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          
          {/* Value */}
          <div className="space-y-2">
            <Label htmlFor="value">Value *</Label>
            <Input
              id="value"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g., 250000"
            />
          </div>
          
          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., Construction Costs"
            />
          </div>
          
          {/* Data Type */}
          <div className="space-y-2">
            <Label>Data Type</Label>
            <Select value={dataType} onValueChange={(v) => setDataType(v as DataType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="currency">Currency</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="string">String</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* AI Suggestion */}
          {suggestion && (
            <div className="p-4 bg-violet-50 border border-violet-200 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-violet-700 font-medium">
                <Sparkles className="w-4 h-4" />
                AI Suggestion
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Suggested Code:</span>
                  <code className="px-2 py-0.5 bg-violet-100 text-violet-800 rounded font-mono">
                    {suggestion.suggestedCode}
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Confidence:</span>
                  <span className="font-medium">{Math.round(suggestion.confidence * 100)}%</span>
                </div>
                {suggestion.isNewCode && (
                  <div className="text-amber-600 text-xs">
                    This will create a new code in your library.
                  </div>
                )}
                {suggestion.reasoning && (
                  <p className="text-gray-500 text-xs italic">{suggestion.reasoning}</p>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-violet-600 hover:bg-violet-700"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Accept Suggestion
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCodeSearch(true)}
                >
                  <Search className="w-4 h-4 mr-2" />
                  Choose Different
                </Button>
              </div>
            </div>
          )}
          
          {/* Error */}
          {suggestionError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {suggestionError}
            </div>
          )}
          
          {/* Code Search */}
          {showCodeSearch && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-gray-700 font-medium">
                <Search className="w-4 h-4" />
                Search Existing Codes
              </div>
              
              <Input
                value={codeSearchQuery}
                onChange={(e) => setCodeSearchQuery(e.target.value)}
                placeholder="Search codes..."
              />
              
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filteredCodes?.slice(0, 10).map((code) => (
                  <button
                    key={code._id}
                    className={`w-full text-left p-2 rounded text-sm hover:bg-gray-100 ${
                      selectedCode?._id === code._id ? 'bg-blue-100 border border-blue-300' : ''
                    }`}
                    onClick={() => {
                      setSelectedCode(code);
                      setSuggestion(null);
                    }}
                  >
                    <div className="font-mono text-blue-700">{code.code}</div>
                    <div className="text-gray-500 text-xs">{code.displayName} • {code.category}</div>
                  </button>
                ))}
                {filteredCodes?.length === 0 && (
                  <div className="text-gray-500 text-sm text-center py-2">No codes found</div>
                )}
              </div>
              
              {selectedCode && (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Use {selectedCode.code}
                </Button>
              )}
            </div>
          )}
          
          {/* Actions (when no suggestion yet) */}
          {!suggestion && !showCodeSearch && (
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={getSuggestion}
                disabled={!name.trim() || isGettingSuggestion}
                className="flex-1"
              >
                {isGettingSuggestion ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Getting Suggestion...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Get AI Suggestion
                  </>
                )}
              </Button>
            </div>
          )}
          
          {/* Show manual add without AI */}
          {!suggestion && !showCodeSearch && (
            <div className="text-center">
              <button
                className="text-sm text-gray-500 hover:text-gray-700 underline"
                onClick={() => setShowCodeSearch(true)}
              >
                Or search for a code manually
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

