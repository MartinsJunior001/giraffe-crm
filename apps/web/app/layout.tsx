import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

/** Inter é a fonte do design system (DESIGN.md). Self-hospedada pelo next/font e exposta como
 * --font-inter para o tema Tailwind (globals.css). */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Giraffe CRM',
  description: 'CRM multi-tenant — casca navegável.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
