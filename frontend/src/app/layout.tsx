import './globals.css'
import { Toaster } from 'react-hot-toast';

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
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  )
}
