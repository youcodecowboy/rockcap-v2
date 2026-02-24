import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexProvider } from "@/components/ConvexProvider";
import { UserSync } from "@/components/UserSync";
import NavigationBar from "@/components/NavigationBar";
import Sidebar from "@/components/Sidebar";
import ChatAssistantButton from "@/components/ChatAssistantButton";
import { ChatDrawerProvider } from "@/contexts/ChatDrawerContext";
import { GlobalSearchProvider } from "@/contexts/GlobalSearchContext";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "File Organization Agent",
  description: "AI-powered file organization and categorization system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ConvexProvider>
          <ChatDrawerProvider>
            <GlobalSearchProvider>
              <UserSync />
              <Sidebar />
              <NavigationBar />
              <main className="ml-20 pt-16 min-h-screen">
                {children}
              </main>
              <ChatAssistantButton />
              <Toaster position="top-right" richColors />
            </GlobalSearchProvider>
          </ChatDrawerProvider>
        </ConvexProvider>
      </body>
    </html>
  );
}
