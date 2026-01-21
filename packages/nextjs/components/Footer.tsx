'use client'

export function Footer() {
  const links = [
    { label: 'Clanker', url: 'https://www.clanker.world/clanker/0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07' },
    { label: 'Buy on Uniswap', url: 'https://app.uniswap.org/swap?outputCurrency=0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07&chain=base' },
    { label: 'Chart', url: 'https://dexscreener.com/base/0x6afd39b7114a0892d10ffaae2eefcc16777dd376273c25d9d4f3a1a065131b83' },
    { label: 'Contract', url: 'https://basescan.org/token/0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07' },
    { label: '@arbme', url: 'https://warpcast.com/arbme' },
    { label: 'Info', url: 'https://arbme.epicdylan.com' },
  ]

  return (
    <footer className="app-footer">
      <div className="footer-links">
        {links.map((link, index) => (
          <span key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
            >
              {link.label}
            </a>
            {index < links.length - 1 && <span className="footer-separator">•</span>}
          </span>
        ))}
      </div>
    </footer>
  )
}
