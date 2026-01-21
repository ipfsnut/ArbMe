import { FarcasterProvider } from '@/components/FarcasterProvider'
import { AppProvider } from '@/store/AppContext'
import { AddMiniappPrompt } from '@/components/AddMiniappPrompt'
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
            <AddMiniappPrompt />
          </AppProvider>
        </FarcasterProvider>
      </body>
    </html>
  )
}
