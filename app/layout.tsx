import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EchoMap — Drop a voice. Discover a moment.",
  description:
    "An ephemeral, geo-located audio experience. Drop voice memos at real-world locations and discover audio left by others nearby.",
  keywords: ["audio", "map", "ephemeral", "geolocation", "social", "voice"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <ClerkProvider dynamic>
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
