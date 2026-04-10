import { TabProvider } from '@/contexts/TabContext';
import { MessengerProvider } from '@/contexts/MessengerContext';
import { MobileLayoutProvider } from '@/contexts/MobileLayoutContext';
import { UploadProvider } from '@/contexts/UploadContext';
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
    <MessengerProvider>
      <UploadProvider>
        <MobileLayoutProvider>
          <TabProvider>
            <MobileShell>{children}</MobileShell>
          </TabProvider>
        </MobileLayoutProvider>
      </UploadProvider>
    </MessengerProvider>
  );
}
