import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ForkedBrain | Mark Gerhart",
  description: "Mark Gerhart's private personal AI ecosystem.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
