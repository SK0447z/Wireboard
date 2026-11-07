import type { Metadata } from "next";
import "./globals.css";
import "@xyflow/react/dist/style.css";

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
    <html lang="en" className="h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-100 antialiased">
      <body className="h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
