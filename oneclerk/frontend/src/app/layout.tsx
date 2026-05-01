import './globals.css'
import Providers from './providers';
import ClientOnly from './client-only';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'OneClerk.ai — Voice AI Receptionist',
  description: 'AI Voice Receptionist Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <ClientOnly>
          <Providers>
            {children}
          </Providers>
        </ClientOnly>
      </body>
    </html>
  )
}
