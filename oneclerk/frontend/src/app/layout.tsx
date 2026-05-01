import './globals.css'
import Providers from './providers';

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
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
