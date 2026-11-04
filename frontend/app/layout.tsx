import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SENSA — Cameras That Understand",
  description:
    "Evidence-led visual intelligence. Search recordings, connect observations, and investigate with clarity.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
