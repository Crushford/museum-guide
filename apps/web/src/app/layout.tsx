import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { Geist, Geist_Mono } from 'next/font/google';
import { DevHeader } from '../components/shared/DevHeader';
import { HamburgerMenu } from '../components/shared/HamburgerMenu';
import { NavLink } from '../components/ui/nav-link';
import { AuthProvider } from '../components/providers/AuthProvider';
import { ApiErrorDialogs } from '../components/providers/ApiErrorDialogs';
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
    <html lang="en" className="bg-canvas">
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
        >{`try{var p=localStorage.getItem('theme-preference');if(p==='light'||p==='dark')document.documentElement.setAttribute('data-theme',p)}catch(e){}`}</Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col bg-canvas antialiased`}
      >
        <AuthProvider>
          <ApiErrorDialogs />
          {process.env.NODE_ENV === 'development' && <DevHeader />}
          <header className="mx-auto flex w-full max-w-6xl items-center gap-2.5 px-6 py-3">
            <Link
              href="/"
              className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            >
              <Image
                src="/favicon.png"
                alt=""
                width={24}
                height={24}
                style={{ width: 'auto', height: 'auto' }}
              />
              <span className="font-semibold">Museum Guide</span>
            </Link>
            <div className="ml-auto">
              <HamburgerMenu />
            </div>
          </header>
          <div className="flex-1">{children}</div>
          <footer className="border-t border-line-subtle bg-canvas">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-fg-subtle">Museum Guide</p>
              <nav className="flex items-center gap-6 text-sm">
                <NavLink href="/about">About Us</NavLink>
                <NavLink href="/admin">Admin</NavLink>
              </nav>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
