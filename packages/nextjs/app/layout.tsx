import { FarcasterProvider } from '@/components/FarcasterProvider'
import { AppProvider } from '@/store/AppContext'
import '@/styles/globals.css'

export const metadata = {
  title: 'ArbMe - Liquidity Pools',
  description: 'ArbMe LP management interface',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <FarcasterProvider>
          <AppProvider>
            <div id="app">
              {children}
            </div>
          </AppProvider>
        </FarcasterProvider>
      </body>
    </html>
  )
}
