'use client'

import { useState } from 'react'

interface SlippageControlProps {
  value: number
  onChange: (value: number) => void
  pairType?: 'stable' | 'standard' | 'volatile'
}

export function SlippageControl({
  value,
  onChange,
  pairType = 'standard',
}: SlippageControlProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [customValue, setCustomValue] = useState(value.toString())

  const presets = [0.1, 0.5, 1.0, 3.0]

  function handlePresetClick(preset: number) {
    onChange(preset)
    setCustomValue(preset.toString())
  }

  function handleCustomChange(input: string) {
    setCustomValue(input)
    const parsed = parseFloat(input)
    if (!isNaN(parsed) && parsed >= 0.1 && parsed <= 50) {
      onChange(parsed)
    }
  }

  const isHighSlippage = value > 1.0

  return (
    <div className="create-section">
      <div className="section-header">
        <h3 className="section-title">Slippage Tolerance</h3>
        <button
          className="settings-toggle"
          onClick={() => setShowSettings(!showSettings)}
        >
          {value}% {showSettings ? '▲' : '▼'}
        </button>
      </div>

      {showSettings && (
        <div className="slippage-settings">
          <div className="slippage-presets">
            {presets.map((preset) => (
              <button
                key={preset}
                className={`slippage-btn ${value === preset ? 'selected' : ''}`}
                onClick={() => handlePresetClick(preset)}
              >
                {preset}%
              </button>
            ))}
          </div>

          <div className="slippage-custom">
            <input
              type="number"
              min="0.1"
              max="50"
              step="0.1"
              value={customValue}
              onChange={(e) => handleCustomChange(e.target.value)}
              className="slippage-input"
              placeholder="Custom"
            />
            <span>%</span>
          </div>

          {isHighSlippage && (
            <div className="slippage-warning">
              ⚠️ High slippage tolerance may result in unfavorable trade
            </div>
          )}
        </div>
      )}
    </div>
  )
}
