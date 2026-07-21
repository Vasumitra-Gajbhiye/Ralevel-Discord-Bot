import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "r/alevel Bot Control",
  description: "Dashboard for configuring and operating the r/alevel Discord bot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${plexMono.variable} antialiased`}>
        <ThemeProvider>
          <div className="dashboard-shell">
            <Sidebar />
            <main className="main">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
