import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { DevHeader } from '../components/shared/DevHeader';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    template: '%s | Museum Guide',
    default: 'Museum Guide',
  },
  description: 'Explore museums, rooms, and artifacts',
  icons: {
    icon: [{ url: '/favicon.png', type: 'image/png' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col bg-background text-foreground antialiased`}
      >
        {process.env.NODE_ENV === 'development' && <DevHeader />}
        <header className="border-b border-border/70 bg-background">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2.5 px-6 py-3">
            <Link
              href="/"
              className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            >
              <Image src="/favicon.png" alt="" width={24} height={24} />
              <span className="text-base font-semibold">Museum Guide</span>
            </Link>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-border/70 bg-background">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Museum Guide</p>
            <nav className="flex items-center gap-6 text-sm">
              <Link
                href="/about"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                About Us
              </Link>
              <Link
                href="/admin"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Admin
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
