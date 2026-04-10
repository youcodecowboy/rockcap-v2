'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { ChevronDown, ChevronUp, FolderOpen, Mail } from 'lucide-react';
import DocumentAnalysisSection from './DocumentAnalysisSection';
import IntelligenceFieldsList from './IntelligenceFieldsList';
import ChecklistMatchesList from './ChecklistMatchesList';
import CategorySheet from './CategorySheet';
import FolderSheet from './FolderSheet';

interface DocReviewCardProps {
  item: any;
  batchId: string;
}

export default function DocReviewCard({ item, batchId }: DocReviewCardProps) {
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showFolderSheet, setShowFolderSheet] = useState(false);
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

  const batch = useQuery(api.bulkUpload.getBatch, { batchId: batchId as Id<'bulkUploadBatches'> });
  const updateItemDetails = useMutation(api.bulkUpload.updateItemDetails);

  const confidenceValue = item.classificationConfidence ?? item.confidence ?? 0;
  const confidencePct = Math.round(confidenceValue * 100);

  function confidenceDotClass(val: number) {
    if (val >= 0.9) return 'bg-[var(--m-success)]';
    if (val >= 0.7) return 'bg-[var(--m-warning)]';
    return 'bg-[var(--m-error)]';
  }

  async function handleCategorySelect(category: string, type: string) {
    setShowCategorySheet(false);
    await updateItemDetails({
      itemId: item._id as Id<'bulkUploadItems'>,
      category,
      fileTypeDetected: type,
    });
  }

  async function handleFolderSelect(folderKey: string | null) {
    setShowFolderSheet(false);
    if (folderKey) {
      await updateItemDetails({
        itemId: item._id as Id<'bulkUploadItems'>,
        targetFolder: folderKey,
      });
    }
  }

  return (
    <div className="space-y-3">
      {/* DOCUMENT header */}
      <div>
        <div className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-1">
          Document
        </div>
        <div className="text-[16px] font-bold text-[var(--m-text-primary)]">
          {item.generatedDocumentCode || 'Unclassified'}
        </div>
        <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5 truncate">
          {item.fileName}
        </div>
      </div>

      {/* CLASSIFICATION */}
      <div>
        <div className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-1">
          Classification
        </div>
        <button
          onClick={() => setShowCategorySheet(true)}
          className="w-full bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] p-3 text-left active:bg-[var(--m-bg-inset)]"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                  {item.category || 'Unknown'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--m-text-tertiary)] flex-shrink-0" />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[12px] text-[var(--m-text-secondary)] truncate">
                  {item.fileTypeDetected || 'Unknown type'}
                </span>
                <ChevronDown className="w-3 h-3 text-[var(--m-text-tertiary)] flex-shrink-0" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className={`w-2 h-2 rounded-full ${confidenceDotClass(confidenceValue)}`} />
              <span className="text-[11px] text-[var(--m-text-secondary)]">{confidencePct}%</span>
            </div>
          </div>
          {item.targetFolder && (
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-[var(--m-border-subtle)]">
              <FolderOpen className="w-3.5 h-3.5 text-[var(--m-text-tertiary)]" />
              <span className="text-[11px] text-[var(--m-text-tertiary)]">{item.targetFolder}</span>
            </div>
          )}
        </button>
      </div>

      {/* FILED TO */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase">
            Filed To
          </span>
          <button
            onClick={() => setShowFolderSheet(true)}
            className="text-[11px] font-medium text-[var(--m-accent-indicator)]"
          >
            Edit
          </button>
        </div>
        <div className="bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] p-3">
          {batch && (
            <div className="space-y-1">
              {batch.clientName && (
                <div className="text-[12px] text-[var(--m-text-primary)]">
                  <span className="text-[var(--m-text-tertiary)]">Client:</span> {batch.clientName}
                </div>
              )}
              {batch.projectName && (
                <div className="text-[12px] text-[var(--m-text-primary)]">
                  <span className="text-[var(--m-text-tertiary)]">Project:</span> {batch.projectName}
                </div>
              )}
              {item.targetFolder && (
                <div className="text-[12px] text-[var(--m-text-primary)]">
                  <span className="text-[var(--m-text-tertiary)]">Folder:</span> {item.targetFolder}
                </div>
              )}
              <div className="text-[12px] text-[var(--m-text-primary)]">
                <span className="text-[var(--m-text-tertiary)]">Scope:</span>{' '}
                {item.isInternal ? 'Internal' : 'External'}
              </div>
            </div>
          )}
          {!batch && (
            <div className="text-[12px] text-[var(--m-text-tertiary)]">Loading batch info...</div>
          )}
        </div>
      </div>

      {/* EXECUTIVE SUMMARY */}
      {item.summary && (
        <div>
          <div className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-1">
            Executive Summary
          </div>
          <div className="bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] p-3">
            <p className="text-[12px] text-[var(--m-text-primary)] leading-relaxed">{item.summary}</p>
          </div>
        </div>
      )}

      {/* DOCUMENT ANALYSIS */}
      <DocumentAnalysisSection analysis={item.documentAnalysis} />

      {/* INTELLIGENCE FIELDS */}
      <IntelligenceFieldsList fields={item.extractedIntelligence?.fields} />

      {/* CHECKLIST MATCHES */}
      <ChecklistMatchesList matches={item.suggestedChecklistItems} />

      {/* CLASSIFICATION REASONING */}
      {item.classificationReasoning && (
        <div className="bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] p-3">
          <button
            onClick={() => setReasoningExpanded(!reasoningExpanded)}
            className="flex items-center justify-between w-full"
          >
            <span className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase">
              Classification Reasoning
            </span>
            {reasoningExpanded ? (
              <ChevronUp className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            )}
          </button>
          {reasoningExpanded && (
            <p className="mt-2 text-[12px] text-[var(--m-text-secondary)] leading-relaxed">
              {item.classificationReasoning}
            </p>
          )}
        </div>
      )}

      {/* EMAIL METADATA */}
      {item.emailMetadata && (
        <div>
          <div className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-1">
            Email Metadata
          </div>
          <div className="bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] p-3 space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              <span className="text-[12px] font-medium text-[var(--m-text-primary)]">Email Details</span>
            </div>
            {item.emailMetadata.from && (
              <div className="text-[12px] text-[var(--m-text-primary)]">
                <span className="text-[var(--m-text-tertiary)]">From:</span> {item.emailMetadata.from}
              </div>
            )}
            {item.emailMetadata.to && (
              <div className="text-[12px] text-[var(--m-text-primary)]">
                <span className="text-[var(--m-text-tertiary)]">To:</span> {item.emailMetadata.to}
              </div>
            )}
            {item.emailMetadata.subject && (
              <div className="text-[12px] text-[var(--m-text-primary)]">
                <span className="text-[var(--m-text-tertiary)]">Subject:</span> {item.emailMetadata.subject}
              </div>
            )}
            {item.emailMetadata.date && (
              <div className="text-[12px] text-[var(--m-text-primary)]">
                <span className="text-[var(--m-text-tertiary)]">Date:</span> {item.emailMetadata.date}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sheets */}
      {showCategorySheet && (
        <CategorySheet
          currentCategory={item.category || ''}
          currentType={item.fileTypeDetected || ''}
          onSelect={handleCategorySelect}
          onClose={() => setShowCategorySheet(false)}
        />
      )}

      {showFolderSheet && (
        <FolderSheet
          scope={batch?.scope || 'client'}
          clientId={batch?.clientId}
          projectId={batch?.projectId}
          selectedFolderKey={item.targetFolder || null}
          onSelect={(folderKey, _folderName, _folderLevel) => handleFolderSelect(folderKey)}
          onClose={() => setShowFolderSheet(false)}
        />
      )}
    </div>
  );
}
