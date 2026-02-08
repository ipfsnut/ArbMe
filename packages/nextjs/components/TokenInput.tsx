'use client'

interface TokenInputProps {
  label: string
  symbol?: string
  balance?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  usdValue?: number | null
}

function formatUsdValue(usd: number): string {
  if (usd < 0.01) return '<$0.01'
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(2)}K`
  return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function TokenInput({
  label,
  symbol,
  balance,
  value,
  onChange,
  disabled = false,
  placeholder = '0.0',
  usdValue,
}: TokenInputProps) {
  const handleMaxClick = () => {
    if (balance) {
      onChange(balance)
    }
  }

  return (
    <div className="input-group">
      <label className="input-label">
        <span>{label}</span>
        {balance && (
          <span
            className="input-balance"
            onClick={handleMaxClick}
            style={{ cursor: 'pointer' }}
          >
            Max: {parseFloat(balance).toFixed(4)}
          </span>
        )}
      </label>
      <div className="input-wrapper">
        <input
          type="number"
          className="amount-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        {symbol && <span className="input-token-label">{symbol}</span>}
      </div>
      {usdValue != null && usdValue > 0 && (
        <div className="input-usd-value" style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)', marginTop: '0.25rem', textAlign: 'right' }}>
          ~{formatUsdValue(usdValue)}
        </div>
      )}
    </div>
  )
}
