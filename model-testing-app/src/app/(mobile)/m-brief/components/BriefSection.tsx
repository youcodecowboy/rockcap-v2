interface BriefItem {
  type?: string;
  title: string;
  context?: string;
  urgency?: string;
  count?: number;
  summary?: string;
  time?: string;
}

interface BriefSectionProps {
  title: string;
  color: string;
  badgeColor: string;
  items: BriefItem[];
  insight?: string;
}

export default function BriefSection({ title, color, badgeColor, items, insight }: BriefSectionProps) {
  return (
    <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] overflow-hidden mb-3">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--m-border-subtle)]">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <h3 className="text-[14px] font-semibold text-[var(--m-text-primary)]">{title}</h3>
        {items.length > 0 && (
          <span className={`text-[11px] font-semibold text-white px-1.5 py-px rounded-full ${badgeColor}`}>
            {items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-4 text-center text-[13px] text-[var(--m-text-tertiary)]">
          All clear — nothing here
        </div>
      ) : (
        items.map((item, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-2.5 border-b border-[var(--m-border-subtle)] last:border-b-0">
            <div className={`text-[13px] mt-0.5 flex-shrink-0 w-4 text-center ${
              item.urgency === 'high' ? 'text-[var(--m-error)]' :
              item.type === 'flag' ? 'text-[var(--m-warning)]' :
              'text-[var(--m-text-tertiary)]'
            }`}>
              {item.type === 'flag' ? 'F' : item.urgency === 'high' ? '!' : '→'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-[var(--m-text-primary)] leading-snug">
                {item.title}
              </div>
              {(item.context || item.summary) && (
                <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5">
                  {item.context || item.summary}
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {insight && (
        <div className="px-4 py-3 bg-[var(--m-bg-subtle)] border-t border-[var(--m-border-subtle)]">
          <p className="text-[13px] text-[var(--m-text-secondary)] italic leading-relaxed">{insight}</p>
        </div>
      )}
    </div>
  );
}
