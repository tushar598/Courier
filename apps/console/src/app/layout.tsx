import type { Metadata } from 'next';
import Link from 'next/link';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});
const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Courier',
  description: 'Approve what your AI assistant buys. Codes and links reach you, never the model.',
};

function Wordmark() {
  return (
    <Link href="/" className="group flex items-center gap-2.5 rounded-md">
      {/* A sealed envelope: the product in one glyph. */}
      <svg width="26" height="20" viewBox="0 0 26 20" aria-hidden className="text-ink">
        <rect
          x="1"
          y="1"
          width="24"
          height="18"
          rx="2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path d="M1.8 2.2 13 11l11.2-8.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="13" cy="11.2" r="3.4" className="fill-seal" />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight">Courier</span>
    </Link>
  );
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-paper font-sans text-[15px] leading-relaxed text-ink">
        <header className="border-b border-rule bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3.5">
            <Wordmark />
            <p className="hidden text-sm text-muted sm:block">
              Your assistant holds sealed handles. Only you open them.
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
