'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { useColors } from '@/lib/useColors';
import { Modal, Button, Field, Textarea, StatTile, FlagChip, SkeletonText } from '@/components/layouts';
import {
  Copy,
  Mail,
  Check,
  Clock,
  AlertCircle,
} from 'lucide-react';

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
  const colors = useColors();
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
      <Modal open onClose={onClose} title="Request Missing Documents" width={520}>
        <SkeletonText lines={6} />
      </Modal>
    );
  }

  const requiredCount = missingItems.filter(i => i.priority === 'required').length;

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button variant="secondary" onClick={handleCopy}>
        {copied ? (
          <>
            <Check className="w-4 h-4" style={{ color: colors.accent.green }} />
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
        variant="primary"
        accent={colors.entityTypes.client}
        onClick={handleSaveAndClose}
        disabled={isSaving || missingItems.length === 0}
      >
        <Mail className="w-4 h-4" />
        Log & Close
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Request Missing Documents"
      width={900}
      footer={footer}
    >
      <div style={{ fontSize: 12, color: colors.text.muted, marginBottom: 16 }}>
        Generate an email requesting missing documents from {clientName}
        {projectName && ` for ${projectName}`}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left Column - Missing Documents */}
        <div className="flex flex-col">
          {/* Last Generation Info */}
          {lastEmail && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded mb-4"
              style={{ fontSize: 11, color: colors.text.muted, background: colors.bg.cardAlt }}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Last request generated: {new Date(lastEmail).toLocaleString()}</span>
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatTile label="Missing Documents" value={missingItems.length} accent={colors.accent.blue} />
            <StatTile label="Required" value={requiredCount} accent={colors.accent.red} />
          </div>

          {/* Missing Items by Category */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, maxHeight: '40vh' }}
          >
            {Object.entries(groupedItems).map(([category, items]) => (
              <div key={category} className="p-3" style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                <h4
                  className="mb-2"
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 9,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: colors.text.muted,
                    fontWeight: 500,
                  }}
                >
                  {category}
                </h4>
                <div className="space-y-1.5">
                  {items.map(item => (
                    <div key={item._id} className="flex items-center gap-2" style={{ fontSize: 13 }}>
                      <AlertCircle
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: item.priority === 'required' ? colors.accent.red : colors.accent.yellow }}
                      />
                      <span style={{ color: colors.text.secondary, flex: 1 }}>{item.name}</span>
                      {item.priority === 'required' && <FlagChip label="Required" severity="warn" />}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column - Email Preview */}
        <div className="flex flex-col">
          <Field label="Email Content Preview">
            <Textarea
              value={emailContent}
              readOnly
              style={{ minHeight: '40vh', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 } as any}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
