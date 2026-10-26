import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hair Beauty Store — Hair, beautifully yours",
  description: "UK hair store with wigs, bundles, hair services, and worldwide delivery. Stripe test checkout.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
