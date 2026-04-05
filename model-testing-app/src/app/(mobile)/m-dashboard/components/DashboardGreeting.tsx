interface DashboardGreetingProps {
  firstName: string;
  overdueCount: number | undefined;
  unreadCount: number | undefined;
}

export default function DashboardGreeting({ firstName, overdueCount, unreadCount }: DashboardGreetingProps) {
  const parts: string[] = [];
  if (overdueCount && overdueCount > 0) {
    parts.push(`${overdueCount} overdue task${overdueCount !== 1 ? 's' : ''}`);
  }
  if (unreadCount && unreadCount > 0) {
    parts.push(`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`);
  }

  const subtitle = parts.length > 0 ? parts.join(' · ') : 'All caught up';

  return (
    <div className="px-[var(--m-page-px)] pt-5 pb-1.5">
      <h1 className="text-[22px] font-semibold text-[var(--m-text-primary)] tracking-[-0.02em]">
        Hello, {firstName}
      </h1>
      <p className="text-[13px] text-[var(--m-text-tertiary)] mt-0.5">
        {subtitle}
      </p>
    </div>
  );
}
