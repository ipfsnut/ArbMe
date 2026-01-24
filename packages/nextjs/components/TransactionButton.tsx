'use client'

type TxStatus = 'idle' | 'building' | 'approving' | 'pending' | 'success' | 'error'

interface TransactionButtonProps {
  status: TxStatus
  onClick: () => void
  disabled?: boolean
  idleText: string
  buildingText?: string
  approvingText?: string
  pendingText?: string
  successText?: string
  errorText?: string
  className?: string
}

export function TransactionButton({
  status,
  onClick,
  disabled = false,
  idleText,
  buildingText = 'Building...',
  approvingText = 'Approving...',
  pendingText = 'Confirming...',
  successText = 'Success!',
  errorText = 'Failed - Try Again',
  className = 'btn btn-primary full-width',
}: TransactionButtonProps) {
  const isLoading = status === 'building' || status === 'approving' || status === 'pending'

  const getText = () => {
    switch (status) {
      case 'building':
        return buildingText
      case 'approving':
        return approvingText
      case 'pending':
        return pendingText
      case 'success':
        return successText
      case 'error':
        return errorText
      default:
        return idleText
    }
  }

  return (
    <button
      className={className}
      onClick={onClick}
      disabled={disabled || isLoading}
    >
      {isLoading && <span className="loading-spinner small" style={{ marginRight: '0.5rem' }} />}
      {getText()}
    </button>
  )
}
