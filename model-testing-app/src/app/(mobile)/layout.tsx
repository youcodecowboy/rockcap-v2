import { TabProvider } from '@/contexts/TabContext';
import MobileShell from '@/components/mobile/MobileShell';
import type { Viewport } from 'next';

export const metadata = {
  title: 'RockCap Mobile',
  description: 'RockCap mobile companion',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TabProvider>
      <MobileShell>{children}</MobileShell>
    </TabProvider>
  );
}
