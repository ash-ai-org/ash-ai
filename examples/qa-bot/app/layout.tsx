import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'QA Bot — Ash',
  description: 'Chat with an AI agent powered by Ash',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
