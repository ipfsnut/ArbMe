'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface BackButtonProps {
  href?: string
  label?: string
}

export function BackButton({ href, label = 'Back' }: BackButtonProps) {
  const router = useRouter()

  if (href) {
    return (
      <Link href={href} className="back-button">
        ← {label}
      </Link>
    )
  }

  return (
    <button onClick={() => router.back()} className="back-button">
      ← {label}
    </button>
  )
}
