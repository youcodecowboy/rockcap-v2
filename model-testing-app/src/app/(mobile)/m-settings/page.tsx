'use client';

import GoogleCalendarCard from './components/GoogleCalendarCard';

export default function MobileSettingsPage() {
  return (
    <div className="pb-4">
      <div className="px-[var(--m-page-px)] pt-5 pb-3">
        <h1 className="text-[20px] font-semibold text-[var(--m-text-primary)] tracking-[-0.02em]">
          Settings
        </h1>
        <p className="text-[12px] text-[var(--m-text-tertiary)] mt-0.5">
          Manage integrations and preferences
        </p>
      </div>

      <div className="px-[var(--m-page-px)] mb-3">
        <div className="text-[11px] font-semibold text-[var(--m-text-tertiary)] uppercase tracking-[0.05em] mb-2">
          Integrations
        </div>
        <GoogleCalendarCard />
      </div>
    </div>
  );
}
