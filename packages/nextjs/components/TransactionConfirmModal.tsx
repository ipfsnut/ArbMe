'use client'

import { useState } from 'react'

interface TransactionDetail {
  label: string
  value: string
  highlight?: boolean
}

interface TransactionConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  details: TransactionDetail[]
  actionLabel?: string
  isProcessing?: boolean
  processingLabel?: string
  warning?: string
}

export function TransactionConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  details,
  actionLabel = 'Confirm',
  isProcessing = false,
  processingLabel = 'Processing...',
  warning,
}: TransactionConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} disabled={isProcessing}>
            ✕
          </button>
        </div>

        <div className="modal-content">
          <div className="transaction-details">
            {details.map((detail, index) => (
              <div key={index} className={`detail-row ${detail.highlight ? 'highlight' : ''}`}>
                <span className="detail-label">{detail.label}</span>
                <span className="detail-value">{detail.value}</span>
              </div>
            ))}
          </div>

          {warning && (
            <div className="modal-warning">
              <span className="warning-icon">⚠️</span>
              <p>{warning}</p>
            </div>
          )}

          <div className="modal-info">
            <p className="text-secondary">
              You will be prompted to approve this transaction in your wallet. All transactions are scanned for security.
            </p>
          </div>
        </div>

        <div className="modal-actions">
          <button
            className="button-secondary"
            onClick={onClose}
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            className="button-primary"
            onClick={onConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? processingLabel : actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
