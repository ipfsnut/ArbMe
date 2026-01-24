'use client'

interface QuickSelectButtonsProps {
  options: number[]
  onSelect: (value: number) => void
  disabled?: boolean
  suffix?: string
}

export function QuickSelectButtons({
  options,
  onSelect,
  disabled = false,
  suffix = '%',
}: QuickSelectButtonsProps) {
  return (
    <div className="quick-select-buttons">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className="quick-select-btn"
          onClick={() => onSelect(option)}
          disabled={disabled}
        >
          {option}{suffix}
        </button>
      ))}
    </div>
  )
}
