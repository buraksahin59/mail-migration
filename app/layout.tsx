import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mail Migration Tool",
  description: "IMAP mailbox migration tool",
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
