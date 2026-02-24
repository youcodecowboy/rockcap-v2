'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Copy,
  Mail,
  Check,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmailRequestModalProps {
  clientId: Id<"clients">;
  clientName: string;
  projectId?: Id<"projects">;
  projectName?: string;
  onClose: () => void;
}

export default function EmailRequestModal({
  clientId,
  clientName,
  projectId,
  projectName,
  onClose,
}: EmailRequestModalProps) {
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Get current user
  const user = useQuery(api.users.getCurrent);

  // Get missing items
  const missingItems = useQuery(
    api.knowledgeLibrary.getMissingItems,
    projectId ? { clientId, projectId } : { clientId }
  );

  // Get last email generation
  const lastEmail = useQuery(
    api.knowledgeLibrary.getLastEmailGeneration,
    { clientId, projectId }
  );

  // Log mutation
  const logEmailGeneration = useMutation(api.knowledgeLibrary.logEmailGeneration);

  // Group missing items by category
  const groupedItems = useMemo(() => {
    if (!missingItems) return {};
    
    return missingItems.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, typeof missingItems>);
  }, [missingItems]);

  // Generate email content
  const emailContent = useMemo(() => {
    if (!missingItems || missingItems.length === 0) {
      return 'No missing documents to request.';
    }

    let content = `Hello ${clientName},\n\n`;
    content += `This is an automatic file request from the RockCap Intelligence Platform.\n\n`;
    content += `The following documents are still missing according to our records:\n\n`;

    for (const [category, items] of Object.entries(groupedItems)) {
      content += `**${category}:**\n`;
      for (const item of items) {
        const priorityIndicator = item.priority === 'required' ? ' (Required)' : '';
        content += `- ${item.name}${priorityIndicator}\n`;
      }
      content += '\n';
    }

    if (projectName) {
      content += `These documents are required for: ${projectName}\n\n`;
    }

    content += `Thank you very much. Please send us these documents whenever convenient.\n\n`;
    content += `Best regards,\nRockCap Team`;

    return content;
  }, [missingItems, clientName, projectName, groupedItems]);

  // Handle copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(emailContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      alert('Failed to copy to clipboard. Please try again.');
    }
  };

  // Handle save/log
  const handleSaveAndClose = async () => {
    if (!user?._id || !missingItems || missingItems.length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      await logEmailGeneration({
        clientId,
        projectId,
        userId: user._id,
        missingItemIds: missingItems.map(item => item._id),
        emailContent,
      });
      onClose();
    } catch (error) {
      console.error('Failed to log email generation:', error);
      alert('Failed to log email generation. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Loading state
  if (missingItems === undefined) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Loading...</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:!max-w-[900px] !w-[90vw] max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            Request Missing Documents
          </DialogTitle>
          <DialogDescription>
            Generate an email requesting missing documents from {clientName}
            {projectName && ` for ${projectName}`}
          </DialogDescription>
        </DialogHeader>

        {/* Two Column Layout */}
        <div className="flex-1 grid grid-cols-2 gap-6 min-h-0 overflow-hidden">
          {/* Left Column - Missing Documents */}
          <div className="flex flex-col min-h-0">
            {/* Last Generation Info */}
            {lastEmail && (
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-md mb-4 shrink-0">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  Last request generated: {new Date(lastEmail).toLocaleString()}
                </span>
              </div>
            )}

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-3 mb-4 shrink-0">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  Missing Documents
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {missingItems.length}
                </p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-xs text-red-600 uppercase tracking-wide mb-1">
                  Required
                </p>
                <p className="text-2xl font-semibold text-red-700">
                  {missingItems.filter(i => i.priority === 'required').length}
                </p>
              </div>
            </div>

            {/* Missing Items by Category */}
            <div className="flex-1 border rounded-lg divide-y overflow-y-auto min-h-0">
              {Object.entries(groupedItems).map(([category, items]) => (
                <div key={category} className="p-3">
                  <h4 className="text-xs font-medium text-gray-700 mb-2 uppercase tracking-wide">{category}</h4>
                  <div className="space-y-1.5">
                    {items.map(item => (
                      <div key={item._id} className="flex items-center gap-2 text-sm">
                        <AlertCircle className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          item.priority === 'required' ? "text-red-500" : "text-amber-500"
                        )} />
                        <span className="text-gray-600 flex-1">{item.name}</span>
                        {item.priority === 'required' && (
                          <Badge variant="destructive" className="text-[10px] h-4 shrink-0">
                            Required
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column - Email Preview */}
          <div className="flex flex-col min-h-0">
            <Label className="text-sm font-medium mb-2 block shrink-0">
              Email Content Preview
            </Label>
            <Textarea
              value={emailContent}
              readOnly
              className="flex-1 font-mono text-sm bg-gray-50 resize-none min-h-0"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 shrink-0 pt-4 border-t mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleCopy}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy to Clipboard
              </>
            )}
          </Button>
          <Button
            onClick={handleSaveAndClose}
            disabled={isSaving || missingItems.length === 0}
            className="gap-2"
          >
            {isSaving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Mail className="w-4 h-4" />
            )}
            Log & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
