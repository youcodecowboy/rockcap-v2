interface SummaryDoc {
  summary?: string;
  documentAnalysis?: {
    executiveSummary?: string;
    detailedSummary?: string;
    keyDates?: string[];
    keyAmounts?: string[];
    keyTerms?: string[];
  };
}

interface SummaryTabProps {
  doc: SummaryDoc;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-medium text-[var(--m-text-secondary)] mb-1.5">{children}</p>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span
          key={i}
          className="px-2.5 py-1 text-[12px] text-[var(--m-text-primary)] bg-[var(--m-bg-inset)] rounded-full"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export default function SummaryTab({ doc }: SummaryTabProps) {
  const analysis = doc.documentAnalysis;
  const executiveSummary = analysis?.executiveSummary || doc.summary;
  const hasAnyData =
    executiveSummary ||
    analysis?.detailedSummary ||
    (analysis?.keyDates && analysis.keyDates.length > 0) ||
    (analysis?.keyAmounts && analysis.keyAmounts.length > 0) ||
    (analysis?.keyTerms && analysis.keyTerms.length > 0);

  if (!hasAnyData) {
    return (
      <div className="px-[var(--m-page-px)] py-10 text-center text-[13px] text-[var(--m-text-tertiary)]">
        Document not yet analyzed
      </div>
    );
  }

  return (
    <div className="px-[var(--m-page-px)] py-4 flex flex-col gap-5">
      {executiveSummary && (
        <div>
          <SectionLabel>Summary</SectionLabel>
          <p className="text-[13px] text-[var(--m-text-primary)] leading-relaxed">
            {executiveSummary}
          </p>
        </div>
      )}

      {analysis?.detailedSummary && (
        <div>
          <SectionLabel>Detailed Summary</SectionLabel>
          <p className="text-[13px] text-[var(--m-text-primary)] leading-relaxed">
            {analysis.detailedSummary}
          </p>
        </div>
      )}

      {analysis?.keyDates && analysis.keyDates.length > 0 && (
        <div>
          <SectionLabel>Key Dates</SectionLabel>
          <ChipList items={analysis.keyDates} />
        </div>
      )}

      {analysis?.keyAmounts && analysis.keyAmounts.length > 0 && (
        <div>
          <SectionLabel>Key Amounts</SectionLabel>
          <ChipList items={analysis.keyAmounts} />
        </div>
      )}

      {analysis?.keyTerms && analysis.keyTerms.length > 0 && (
        <div>
          <SectionLabel>Key Terms</SectionLabel>
          <ChipList items={analysis.keyTerms} />
        </div>
      )}
    </div>
  );
}
