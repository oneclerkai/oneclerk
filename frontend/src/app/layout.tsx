/**
 * Root layout — sets viewport meta, global fonts, and wraps all pages.
 */
import type { Metadata, Viewport } from 'next'
import React from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'OneClerk — AI Voice Receptionist',
  description: 'Your phone rings. OneClerk handles it.',
  icons: { icon: '/favicon.ico' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  )
}
