import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PokeMart - Pokemon Catalog',
  description: 'Browse and search the Pokemon catalog, powered by Coveo.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
