interface ScheduleItem {
  type: string;
  time: string;
  title: string;
  context?: string;
}

interface BriefScheduleTimelineProps {
  items: ScheduleItem[];
  insight?: string;
}

export default function BriefScheduleTimeline({ items, insight }: BriefScheduleTimelineProps) {
  return (
    <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] overflow-hidden mb-3">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--m-border-subtle)]">
        <div className="w-2 h-2 rounded-full bg-indigo-500" />
        <h3 className="text-[14px] font-semibold text-[var(--m-text-primary)]">Today&apos;s Schedule</h3>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-4 text-center text-[13px] text-[var(--m-text-tertiary)]">
          No events or tasks scheduled for today
        </div>
      ) : (
        items.map((item, i) => (
          <div key={i} className="flex gap-3 px-4 py-2.5 border-b border-[var(--m-border-subtle)] last:border-b-0">
            <span className="text-[12px] text-[var(--m-text-tertiary)] w-[44px] flex-shrink-0 pt-0.5 font-medium">
              {item.time}
            </span>
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
              item.type === 'event' ? 'bg-indigo-500' : 'bg-[var(--m-text-primary)]'
            }`} />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-[var(--m-text-primary)] font-medium">{item.title}</div>
              {item.context && (
                <div className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5">{item.context}</div>
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
