import NavigationBar from "@/components/NavigationBar";
import Sidebar from "@/components/Sidebar";
import ChatAssistantButton from "@/components/ChatAssistantButton";

export default function DesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      <NavigationBar />
      <main className="ml-20 pt-16 min-h-screen">
        {children}
      </main>
      <ChatAssistantButton />
    </>
  );
}
