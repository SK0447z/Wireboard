import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
