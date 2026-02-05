import { fetchPools } from '@arbme/core-lib'
import LandingPageClient from './LandingPageClient'
import type { PoolsResponse } from '@/utils/types'

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY

export default async function LandingPage() {
  try {
    const data = await fetchPools(ALCHEMY_KEY)
    return <LandingPageClient initialData={data as unknown as PoolsResponse} />
  } catch (err) {
    console.error('[Landing SSR] Failed to fetch pools:', err)
    return <LandingPageClient />
  }
}
