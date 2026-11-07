import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "@xyflow/react/dist/style.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wireboard",
  description: "Automated integration-contract inspector and visual architecture debugger",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-100 antialiased`}
    >
      <body className="h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-100 font-sans tracking-[-0.015em] antialiased">
        {children}
      </body>
    </html>
  );
}
