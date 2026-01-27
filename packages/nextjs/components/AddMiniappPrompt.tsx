'use client'

import { useEffect, useState } from 'react'
import { useIsFarcaster } from '@/hooks/useWallet'

export function AddMiniappPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [isAdded, setIsAdded] = useState(false)
  const isFarcaster = useIsFarcaster()

  useEffect(() => {
    // Only check if in Farcaster environment
    if (isFarcaster) {
      checkIfAdded()
    }
  }, [isFarcaster])

  async function checkIfAdded() {
    try {
      const sdk = (await import('@farcaster/miniapp-sdk')).default
      // Check if miniapp is already added
      const context = await sdk.context
      const added = context?.client?.added || false

      setIsAdded(added)

      // Show prompt after 2 seconds if not added
      if (!added) {
        setTimeout(() => setShowPrompt(true), 2000)
      }
    } catch (err) {
      console.error('[AddMiniappPrompt] Error checking if added:', err)
    }
  }

  async function handleAddMiniapp() {
    try {
      const sdk = (await import('@farcaster/miniapp-sdk')).default
      await sdk.actions.addFrame()
      setIsAdded(true)
      setShowPrompt(false)
    } catch (err) {
      console.error('[AddMiniappPrompt] Error adding miniapp:', err)
    }
  }

  function handleDismiss() {
    setShowPrompt(false)
    // Don't show again this session
  }

  if (!showPrompt || isAdded) {
    return null
  }

  return (
    <div className="miniapp-prompt-overlay">
      <div className="miniapp-prompt-card">
        <button className="miniapp-prompt-close" onClick={handleDismiss}>
          ✕
        </button>

        <div className="miniapp-prompt-icon">
          <img src="/arbie.png" alt="ArbMe" />
        </div>

        <h3 className="miniapp-prompt-title">Add ArbMe to Warpcast</h3>
        <p className="miniapp-prompt-description">
          Get quick access to your liquidity pools and manage positions directly from your Warpcast sidebar.
        </p>

        <button className="miniapp-prompt-button" onClick={handleAddMiniapp}>
          Add to Warpcast
        </button>

        <button className="miniapp-prompt-dismiss" onClick={handleDismiss}>
          Maybe later
        </button>
      </div>
    </div>
  )
}
