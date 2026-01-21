'use client'

interface QuickSelectButtonsProps {
  balance: string
  decimals: number
  onAmountSelect: (amount: string) => void
  disabled?: boolean
}

export function QuickSelectButtons({
  balance,
  decimals,
  onAmountSelect,
  disabled = false,
}: QuickSelectButtonsProps) {
  const percentages = [
    { label: '25%', value: 0.25 },
    { label: '50%', value: 0.5 },
    { label: '75%', value: 0.75 },
    { label: '100%', value: 1.0 },
  ]

  function handleClick(percentage: number) {
    if (disabled || !balance) return

    const amount = parseFloat(balance) * percentage
    const formatted = amount.toFixed(Math.min(decimals, 6))
    onAmountSelect(formatted)
  }

  if (!balance || parseFloat(balance) === 0) {
    return null
  }

  return (
    <div className="quick-select-buttons">
      {percentages.map(({ label, value }) => (
        <button
          key={label}
          className="quick-select-btn"
          onClick={() => handleClick(value)}
          disabled={disabled}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
