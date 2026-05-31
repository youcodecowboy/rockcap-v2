'use client';

import Link from 'next/link';
import BulkUpload from '@/components/BulkUpload';
import { useColors } from '@/lib/useColors';
import { Panel, Button } from '@/components/layouts';
import { FileText, CheckCircle2, Sparkles } from 'lucide-react';

export default function FilingAgent() {
  const colors = useColors();

  return (
    <div style={{ background: colors.bg.light, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.text.primary, margin: 0 }}>Document Filing</h1>
            <p style={{ marginTop: 4, color: colors.text.muted, fontSize: 13 }}>
              Upload documents to organize, classify, and link to your knowledge checklist
            </p>
          </div>
          <Link href="/docs">
            <Button variant="primary" accent={colors.text.primary}>
              <FileText size={16} />
              View Library
            </Button>
          </Link>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Bulk Upload (spans 2 columns) */}
          <div className="lg:col-span-2">
            <BulkUpload />
          </div>

          {/* Right Column: Info Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel title="AI-Powered Filing" accent={colors.accent.orange}>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: colors.text.secondary, margin: 0, padding: 0, listStyle: 'none' }}>
                {[
                  'Automatic document classification',
                  'Smart folder suggestions',
                  'Checklist matching & linking',
                  'Duplicate detection & versioning',
                ].map((item) => (
                  <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <CheckCircle2 size={14} style={{ color: colors.accent.green, marginTop: 2, flexShrink: 0 }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Checklist Integration" accent={colors.accent.blue}>
              <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
                Documents are matched to your client&apos;s knowledge checklist. Look for the
                <Sparkles size={12} style={{ color: colors.accent.orange, display: 'inline', margin: '0 4px', verticalAlign: 'middle' }} />
                icon to see AI suggestions.
              </p>
              <p style={{ fontSize: 11, color: colors.text.muted, margin: 0 }}>
                Linked documents automatically mark checklist items as fulfilled.
              </p>
            </Panel>

            <Panel title="Document Naming" accent={colors.accent.purple}>
              <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 8 }}>
                Documents are automatically named:
              </p>
              <code
                style={{
                  fontSize: 10,
                  background: colors.bg.cardAlt,
                  padding: 8,
                  borderRadius: 4,
                  display: 'block',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: colors.text.primary,
                }}
              >
                PROJECT-TYPE-INT/EXT-INITIALS-VER-DATE
              </code>
              <p style={{ fontSize: 10, color: colors.text.muted, marginTop: 8 }}>
                e.g. WIMBPARK-APPRAISAL-EXT-JS-V1.0-2026-01-12
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
