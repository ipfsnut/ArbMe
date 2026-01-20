import { useQuery } from '@tanstack/react-query'
import { getAllPositions, type Position } from '../lib/api'

export function usePositions(wallet: string | null) {
  return useQuery({
    queryKey: ['positions', wallet],
    queryFn: () => getAllPositions(wallet!),
    enabled: !!wallet,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // 1 minute
  })
}

// Separate active and closed positions
export function useActivePositions(wallet: string | null) {
  const query = usePositions(wallet)

  const activePositions = query.data?.filter((pos) => {
    if (pos.type === 'V2') return pos.lpBalance > 0
    if (pos.type === 'V3') return !pos.isClosed
    if (pos.type === 'V4') return pos.hasLiquidity
    return false
  }) ?? []

  const closedPositions = query.data?.filter((pos) => {
    if (pos.type === 'V2') return pos.lpBalance === 0
    if (pos.type === 'V3') return pos.isClosed
    if (pos.type === 'V4') return !pos.hasLiquidity
    return false
  }) ?? []

  return {
    ...query,
    activePositions,
    closedPositions,
  }
}

// Calculate total value of positions
export function calculateTotalValue(positions: Position[], prices: Record<string, number>): number {
  let total = 0

  for (const pos of positions) {
    let token0Address: string
    let token1Address: string

    if (pos.type === 'V2') {
      token0Address = pos.token0
      token1Address = pos.token1
    } else if (pos.type === 'V3') {
      token0Address = pos.token0Address
      token1Address = pos.token1Address
    } else {
      token0Address = pos.currency0
      token1Address = pos.currency1
    }

    const price0 = prices[token0Address.toLowerCase()] || 0
    const price1 = prices[token1Address.toLowerCase()] || 0

    total += pos.token0Amount * price0
    total += pos.token1Amount * price1
  }

  return total
}
