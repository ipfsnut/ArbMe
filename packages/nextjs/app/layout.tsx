import { WalletProvider } from '@/components/WalletProvider'
import { AppProvider } from '@/store/AppContext'
import { AddMiniappPrompt } from '@/components/AddMiniappPrompt'
import '@/styles/globals.css'

export const metadata = {
  title: 'ArbMe - Liquidity Pools',
  description: 'ArbMe LP management interface',
  other: {
    'fc:frame': JSON.stringify({
      version: '1',
      imageUrl: 'https://arbme.epicdylan.com/share-image.png',
      button: {
        title: 'View Pools',
        action: {
          type: 'launch_miniapp',
          name: 'ArbMe',
          url: 'https://arbme.epicdylan.com/',
          splashImageUrl: 'https://arbme.epicdylan.com/arbie.png',
          splashBackgroundColor: '#0a0a0f',
        },
      },
    }),
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <AppProvider>
            <div id="app">
              {children}
            </div>
            <AddMiniappPrompt />
          </AppProvider>
        </WalletProvider>
      </body>
    </html>
  )
}
