import './globals.css';
import { Metadata } from 'next';
import localFont from 'next/font/local';

import Footer from '../components/Footer';
import Header from '../components/Header';
import Providers from '../components/Providers';
import { RefreshProvider } from '../lib/contexts/RefreshContext';
import { SITE_NAME } from '../lib/site';

// Self-hosted Lato: the production build has no build-time dependency on fonts.googleapis.com.
const lato = localFont({
  src: [
    { path: './fonts/Lato-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Lato-Bold.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
});

const siteTitle = SITE_NAME;

export const metadata: Metadata = {
  title: siteTitle,
  description:
    'Real-time and historical statistics for the CKPool Bitcoin mining pool using data from their API.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const defaultTheme = ${JSON.stringify(process.env.NEXT_PUBLIC_DEFAULT_THEME || 'dark')};
                const theme = localStorage.getItem('theme') || defaultTheme;
                document.documentElement.setAttribute('data-theme', theme);
              } catch (e) {
                document.documentElement.setAttribute('data-theme', ${JSON.stringify(process.env.NEXT_PUBLIC_DEFAULT_THEME || 'dark')});
              }
            `,
          }}
        />
      </head>
      <body className={lato.className}>
        <Providers>
          <RefreshProvider>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-grow">{children}</main>
              <Footer />
            </div>
          </RefreshProvider>
        </Providers>
      </body>
    </html>
  );
}
