interface DashboardGreetingProps {
  firstName: string;
  overdueCount: number | undefined;
  unreadCount: number | undefined;
  todayTaskCount?: number;
  inProgressCount?: number;
}

function getGreetingText(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function DashboardGreeting({
  firstName,
  overdueCount,
  todayTaskCount,
  inProgressCount,
}: DashboardGreetingProps) {
  return (
    <div className="mx-[var(--m-page-px)] mt-4 mb-3">
      <div className="bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[var(--m-card-radius)] px-5 py-5">
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--m-text-primary)]">
          {getGreetingText()}, {firstName}
        </h1>
        <p className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5">
          {formatDate()}
        </p>

        <div className="flex gap-2.5 mt-4">
          <div className="flex-1 bg-[var(--m-bg-subtle)] rounded-[10px] px-3 py-2.5">
            <div className="text-[22px] font-bold text-[var(--m-text-primary)]">
              {todayTaskCount ?? 0}
            </div>
            <div className="text-[10px] text-[var(--m-text-tertiary)] uppercase tracking-[0.05em] mt-0.5">
              Today
            </div>
          </div>
          <div className="flex-1 bg-[var(--m-bg-subtle)] rounded-[10px] px-3 py-2.5">
            <div className={`text-[22px] font-bold ${
              (overdueCount ?? 0) > 0 ? 'text-[var(--m-error)]' : 'text-[var(--m-text-primary)]'
            }`}>
              {overdueCount ?? 0}
            </div>
            <div className="text-[10px] text-[var(--m-text-tertiary)] uppercase tracking-[0.05em] mt-0.5">
              Overdue
            </div>
          </div>
          <div className="flex-1 bg-[var(--m-bg-subtle)] rounded-[10px] px-3 py-2.5">
            <div className="text-[22px] font-bold text-blue-600">
              {inProgressCount ?? 0}
            </div>
            <div className="text-[10px] text-[var(--m-text-tertiary)] uppercase tracking-[0.05em] mt-0.5">
              In Progress
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
