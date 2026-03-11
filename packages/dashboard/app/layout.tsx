import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { DashboardNav } from '@/components/nav'
import { AshProvider } from '@/components/providers'

export const metadata: Metadata = {
  title: 'Ash Dashboard',
  description: 'Manage agents, sessions, and monitor your Ash server',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Injects window.__ASH_CONFIG__ with API key + server version.
            beforeInteractive ensures it loads before React hydration. */}
        <Script src="/dashboard/config.js" strategy="beforeInteractive" />
      </head>
      <body className="bg-[#0d1117] text-zinc-100 antialiased">
        <AshProvider>
          <div className="flex min-h-screen">
            <DashboardNav />
            <main className="min-w-0 flex-1 pl-64 overflow-y-auto overflow-x-hidden">
              <div className="mx-auto max-w-[1600px] px-6 pb-6 pt-8 sm:px-8 sm:pb-8 sm:pt-10">
                {children}
              </div>
            </main>
          </div>
        </AshProvider>
      </body>
    </html>
  )
}
