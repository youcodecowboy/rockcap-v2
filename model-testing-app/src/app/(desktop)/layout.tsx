import NavigationBar from "@/components/NavigationBar";
import Sidebar from "@/components/Sidebar";
import ChatAssistantButton from "@/components/ChatAssistantButton";
import GmailReconnectBanner from "@/components/GmailReconnectBanner";
import DriveReconnectBanner from "@/components/DriveReconnectBanner";
import { MessengerProvider } from "@/contexts/MessengerContext";
import { ThemeProvider } from "@/components/ThemeProvider";

export default function DesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <MessengerProvider>
        <Sidebar />
        <NavigationBar />
        <main className="ml-20 pt-16 min-h-screen">
          <GmailReconnectBanner />
          <DriveReconnectBanner />
          {children}
        </main>
        <ChatAssistantButton />
      </MessengerProvider>
    </ThemeProvider>
  );
}
