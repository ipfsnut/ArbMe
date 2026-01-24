'use client'

interface TokenInputProps {
  label: string
  symbol?: string
  balance?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

export function TokenInput({
  label,
  symbol,
  balance,
  value,
  onChange,
  disabled = false,
  placeholder = '0.0',
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
    </div>
  )
}
