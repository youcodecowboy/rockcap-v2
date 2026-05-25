import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexProvider } from "@/components/ConvexProvider";
import { UserSync } from "@/components/UserSync";
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
        // Grammarly + similar browser extensions inject attributes on <body>
        // after React hydrates, causing a hydration mismatch warning. The
        // suppression is scoped to this single element — React still
        // warns about real mismatches elsewhere in the tree.
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ConvexProvider>
          <ChatDrawerProvider>
            <GlobalSearchProvider>
              <UserSync />
              {children}
              <Toaster position="top-right" richColors />
            </GlobalSearchProvider>
          </ChatDrawerProvider>
        </ConvexProvider>
      </body>
    </html>
  );
}
