'use client'

import { FEE_TIERS } from '@/utils/constants'

interface FeeTierSelectorProps {
  value: number
  onChange: (fee: number) => void
  disabled?: boolean
  maxTiers?: number
}

export function FeeTierSelector({
  value,
  onChange,
  disabled = false,
  maxTiers = 4,
}: FeeTierSelectorProps) {
  const displayedTiers = FEE_TIERS.slice(0, maxTiers)

  return (
    <div className="fee-tier-selector">
      {displayedTiers.map((tier) => (
        <button
          key={tier.value}
          type="button"
          className={`fee-tier-btn ${value === tier.value ? 'selected' : ''}`}
          onClick={() => onChange(tier.value)}
          disabled={disabled}
        >
          <span className="fee-label">{tier.label}</span>
          <span className="fee-desc">{tier.description}</span>
        </button>
      ))}
    </div>
  )
}
