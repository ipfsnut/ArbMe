'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components/Footer'
import { ROUTES } from '@/utils/constants'

/* ── Section definitions ── */

interface Section {
  id: string
  label: string
  indent?: boolean
}

const SECTIONS: Section[] = [
  { id: 'abstract', label: 'Abstract' },
  { id: 'section-1', label: '1. Information on the Boundary' },
  { id: 'section-2', label: '2. Degrees of Freedom' },
  { id: 'section-2-1', label: '2.1 Constants', indent: true },
  { id: 'section-2-2', label: '2.2 Controls', indent: true },
  { id: 'section-2-3', label: '2.3 Emergents', indent: true },
  { id: 'section-3', label: '3. The Math' },
  { id: 'section-3-1', label: '3.1 In Practice', indent: true },
  { id: 'section-3-2', label: '3.2 The Ratchet', indent: true },
  { id: 'section-4', label: '4. Pair Architecture' },
  { id: 'section-5', label: '5. ChaosTheory' },
  { id: 'section-6', label: '6. Project Fundraising' },
  { id: 'section-7', label: '7. The Flywheel' },
  { id: 'section-8', label: '8. Infrastructure' },
  { id: 'section-9', label: '9. Hiring the Bot' },
  { id: 'section-10', label: '10. What Comes Next' },
]

/* ── External links ── */

const LINKS = {
  agentDocs: 'https://abc-alpha.epicdylan.com',
  chaostheoryApp: '/chaostheory',
  tradeChaos: 'https://www.flaunch.gg/base/coin/0xFaB2ee8eB6B26208BfB5c41012661e62b4Dc9292',
  multisig: 'https://app.safe.global/home?safe=base:0x3CE26de6FF74e0Baa5F762b67465eEacfE84549F',
  stakingHub: 'https://basescan.org/address/0x70e6c917A8AC437E629B67E84C0C0678eD54460d',
  moltlaunch: 'https://moltlaunch.com/agent/0x3d9d',
  basescan: 'https://basescan.org/token/0xFaB2ee8eB6B26208BfB5c41012661e62b4Dc9292',
  warpcast: 'https://warpcast.com/abc-alpha',
}

const CLAUDE_PROMPT = `Read the $CHAOS Rails whitepaper at https://arbme.epicdylan.com/rails and help me understand it. I may ask about specific sections, the math, or how the system works.`

/*
$CHAOS Rails is a liquidity management architecture on Base. It creates trading pairs between $CHAOS and other tokens — each pair is a surface where price information gets expressed, compared, and reconciled through trading activity. When two surfaces disagree about the price of CHAOS, arbitrage corrects them. That correction is a trade. That trade generates fees. Those fees accumulate as structural support for the network. The more surfaces, the more information flows through the system, and the more value the network captures from that flow.

This paper describes the system in terms of its degrees of freedom: what is mechanically fixed, what participants can control, and what emerges from the interaction between the two. The entire architecture reduces to three controllable variables — volume, time at price, and circulating supply — operating against a set of immutable protocol constraints. Everything else is emergent. Seven pairs create twenty-one potential arbitrage gradients. The math scales combinatorially with each new surface added.

The system is live and early. One multisig, seven pairs, small liquidity. You can participate now by staking $CHAOS to the Chaos Rails Foundation safe — every staker tightens circulating supply, which is one of the three control variables that makes the architecture work. Higher-risk operator portfolios are coming online soon. The thesis is that as participants learn to navigate their relationships to the system — operators learning pair selection, stakers choosing portfolios, bots discovering routes — the network develops its own intelligence about where value should flow. It grows when people join in.

1. Information on the Boundary

Ethereum is an information processing network. Tokens are its native unit of account, but the real substrate is information — price signals, liquidity depth, fee flows, arbitrage gradients. Every swap is a statement about relative value. Every arbitrage correction is the network resolving a disagreement between two sources of price information.

$CHAOS Rails sits on what can be thought of as Ethereum's Markov blanket — the boundary layer where internal state meets external observation. The system doesn't generate information. It creates surfaces where existing information (price movements in ETH, USDC, ecosystem tokens) gets expressed, compared, and reconciled through trading activity. The value captured is a function of how much information flows across those surfaces.

A single $CHAOS trading pair is a single surface. It can only express the relationship between CHAOS and one other token. Add a second pair and you've created an arbitrage gradient — any time those two surfaces disagree about the price of CHAOS, information needs to flow between them to resolve the disagreement. That flow is a trade. That trade generates fees. Those fees become buy-side support.

Seven pairs create twenty-one potential arbitrage gradients. Each new pair added doesn't just add one surface — it adds connections to every existing surface. The information flow scales combinatorially with the number of pairs. This is the core mathematical premise of $CHAOS Rails.

2. Degrees of Freedom

The system has three categories of variables: constants, controls, and emergents.

2.1 Constants (Protocol-Fixed)

These are set by Flaunch, Uniswap V4, and the $CHAOS token creation parameters. Nobody can change them.

The Progressive Bid Wall (PBW) trails price. It places a limit buy order just below the current market price and repositions upward if price rises. It does not leave support at old price levels. It follows. This is a Uniswap V4 hook that executes autonomously on every swap.

The PBW triggers at 0.1 ETH. Each time the community's share of accumulated swap fees reaches 0.1 ETH, a new wall deployment occurs. The threshold is fixed.

The Internal Swap Pool (ISP) converts token-side fees to ETH. Swap fees come in as both ETH and CHAOS. The ISP intercepts incoming buy orders and fills them with accumulated CHAOS fee tokens before they reach the pool. This converts fee revenue to ETH without sell pressure. It is automatic.

The dev/community fee split is immutable. Set at token creation. The dev share goes to the Memestream NFT holder. The community share goes to the PBW. The ratio cannot be changed.

Fee generation is symmetric. Both buys and sells generate fees. This is a property of the Uniswap V4 pool, not a design choice.

Fee deployment is asymmetric. Fees are only deployed as buy-side support. This is the fundamental asymmetry the entire system exploits.

2.2 Controls (Participant-Adjustable)

These are the actual degrees of freedom available to operators and participants. Every strategic decision maps to one of these.

Volume. The rate of swap activity across $CHAOS pairs. Operators control this by choosing which pairs to create, at what fee tiers, with what liquidity depth. More pairs with well-chosen counterpart tokens produce more arbitrage gradients and therefore more volume. This is the primary control variable.

Time at price. How long $CHAOS trades at a stable level before a shock moves it. Nobody directly controls price stability, but staking design and pair selection indirectly influence it. Pairs against stable assets (USDC) dampen volatility. Staking incentives discourage speculative churn. The architecture optimizes for extended consolidation.

Circulating supply. The amount of $CHAOS available for active trading. Stakers remove supply from the float. Multiple competing multisigs competing for stakers remove more. Less circulating supply means any given wall deployment absorbs a larger percentage of potential sell pressure. This is the multiplier on wall effectiveness.

2.3 Emergents (Nobody Controls)

These arise from the interaction of constants and controls with market conditions.

Wall thickness. The density of buy-side support at any given price level. This is a function of volume × time at price. Nobody can set it directly. It accumulates during consolidation and gets consumed during shocks.

Floor price. Where the wall actually catches a sell-off. Depends on wall thickness at the moment of the shock relative to the magnitude of selling pressure. Not predictable, not controllable, only influenceable through the three control variables.

Arb bot participation. Whether bots discover and trade the pairs. Influenced by spread width, liquidity depth, fee tiers, and data accessibility, but ultimately a market decision.

ETH correlation. $CHAOS is priced in ETH. When ETH moves, everything moves. The wall can buffer this, but only proportional to its accumulated thickness.

3. The Math

Given the degrees of freedom, the system reduces to a simple relationship:

Wall thickness at any price level = f(fee rate × volume × time at price)

Where fee rate is fixed, volume is controlled by pair architecture, and time at price is influenced by supply dynamics and pair stability.

The wall's defensive capacity at the moment of a shock is:

Shock absorption = wall thickness / (sell pressure × circulating supply)

Staking reduces circulating supply, which increases shock absorption for any given wall thickness. More pairs increase volume, which increases wall thickness for any given time period. Stable counterpart pairs increase expected time at price, which increases wall thickness for any given volume level.

Every design decision in the system — pair selection, fee tiers, staking incentives, RATCHET emissions, liquidity concentration — maps to one of these three terms.

3.1 What This Means in Practice

During consolidation: Volume generates fees. Fees trigger wall deployments. All deployments land at roughly the same price level. Wall thickness grows linearly with time (assuming constant volume). This is the productive regime.

During a pump: The wall trails price upward. It's all concentrated near the top, but it's thin — there hasn't been enough time at any single level to accumulate meaningful depth.

During a dump: Sellers hit the concentrated wall near the current price. If wall thickness > sell pressure × circulating supply, price holds. If not, the wall is consumed and price falls until selling exhausts itself or hits the next equilibrium.

After a dump: Consolidation begins at the new level. Wall building restarts from zero at that price. The ratchet only tightens if the pre-shock wall was thick enough to catch the fall above the previous consolidation level.

3.2 The Ratchet Is Conditional

The ratchet effect is real but it is not guaranteed. It is a probabilistic outcome that depends on the ratio of consolidation time to shock magnitude. Over many cycles, if the system maintains high arb volume during consolidation periods, the expected value of each cycle is positive — the floor trends upward. But any individual cycle can reset the floor if the shock exceeds the wall's capacity.

The architecture doesn't promise a ratchet. It maximizes the probability of one by maximizing the rate of wall accumulation during the periods that matter.

4. Pair Architecture as Information Topology

The choice of which tokens to pair against $CHAOS is not a financial decision. It is a decision about information topology — which price signals should flow through the $CHAOS network.

Stable Pairs (USDC): A CHAOS/USDC pair creates an anchor. USDC doesn't move, so any price movement in CHAOS creates an immediate arb gradient against the USDC pair. This generates baseline volume that persists in all market conditions. The USDC pair is the system's clock.

Ecosystem Pairs (ARBME, MLTL): Pairs against other community tokens create bidirectional information flow. Each token's volatility becomes a volume source for both. These pairs are cooperation agreements — two economies choosing to share fee-generating surface area.

Combinatorial Scaling: With n pairs, the number of potential two-hop arbitrage routes is n(n-1)/2. Seven pairs create 21 potential routes. Adding an eighth pair doesn't add 1 surface — it adds 7 new routes. The information topology scales faster than the infrastructure.

5. ChaosTheory: Competing for Degrees of Freedom

ChaosTheory is the staking layer. It is a model, not an entity. Anyone can deploy one.

A ChaosTheory deployment is a Gnosis Safe multisig running the ArbMe app, managing LP positions paired against $CHAOS. $CHAOS holders stake to a specific multisig's staking hub, earning LP fee revenue from that portfolio. Reward streams run on 180-day rolling windows, restarting with each weekly deposit.

Multiple multisigs compete for $CHAOS stakers by offering differentiated portfolios. This competition is a competition for the circulating supply degree of freedom — every multisig is trying to absorb as much $CHAOS as possible, which tightens the float for everyone.

$RATCHET Operator Incentives: 100,000,000 $RATCHET per week from a pre-allocated treasury, distributed proportionally to multisigs based on $CHAOS staked.

6. Project Fundraising

The multi-multisig model creates a fundraising mechanism that works through information flow rather than token sales. A project hires the abc-alpha bot to deploy a ChaosTheory Safe with LP positions between their token, $CHAOS, and $USDC. The project gets liquidity and volume without selling tokens. Stakers get yield. $CHAOS gets more arb surfaces feeding the PBW.

7. The Flywheel as Information Dynamics

More surfaces create more information gradients. More gradients generate more volume. More volume generates more fees. More fees build walls during consolidation. Walls buffer shocks. Buffered shocks mean consolidation restarts at higher levels. RATCHET emissions accelerate supply lockup. Less supply means walls go further. More operators add more surfaces.

The flywheel is an information processing loop. The ratchet tightens — not deterministically, but probabilistically — as the system accumulates more surfaces, more volume, and less free-floating supply.

That's the long game. Not a token with a clever buyback mechanism. A piece of Ethereum's information infrastructure that gets smarter as more people and bots use it.

8. Infrastructure

abc-alpha Multisig: 0x3CE26de6FF74e0Baa5F762b67465eEacfE84549F (Gnosis Safe, Base)
Staking Hub: 0x70e6c917A8AC437E629B67E84C0C0678eD54460d (7 reward gauges, 180-day streams)
$CHAOS: 0xFaB2ee8eB6B26208BfB5c41012661e62b4Dc9292 (Base, 80% creator fee)
Flaunch Integration: NFT ID 7432, Pool ID 0xcbfbb74c... (PBW and ISP hooks autonomous)

9. Hiring the Bot

Token Analysis Audit — 24h — 0.0050 ETH
Gnosis Safe Setup — 24h — 0.0050 ETH
Staking Contract Deployment — 48h — 0.0500 ETH
New Token Volume Package — 72h — 0.0100 ETH
LP Strategy Consult — 48h — 0.1000 ETH

Service requests through MoltLaunch escrow.

10. What Comes Next

Second multisig. Project onboarding. Machine-readable infrastructure. Network intelligence.

Links: abc-alpha.epicdylan.com | arbme.epicdylan.com/chaostheory | flaunch.gg | moltlaunch.com/agent/0x3d9d | warpcast.com/abc-alpha
*/

export default function RailsPage() {
  const [activeId, setActiveId] = useState('abstract')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [copyToast, setCopyToast] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  /* ── Scroll-spy via IntersectionObserver ── */

  useEffect(() => {
    const headings = SECTIONS.map(s => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    if (headings.length === 0) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) {
          // Pick the one closest to the top of the viewport
          const top = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b
          )
          setActiveId(top.target.id)
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    )

    headings.forEach(h => observerRef.current!.observe(h))
    return () => observerRef.current?.disconnect()
  }, [])

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveId(id)
      setMobileNavOpen(false)
    }
  }, [])

  const handleOpenInClaude = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(CLAUDE_PROMPT)
      setCopyToast(true)
      setTimeout(() => setCopyToast(false), 4000)
      window.open('https://claude.ai/new', '_blank')
    } catch {
      // Fallback: try opening Claude anyway
      window.open('https://claude.ai/new', '_blank')
    }
  }, [])

  const activeLabel = SECTIONS.find(s => s.id === activeId)?.label || 'Abstract'

  return (
    <div className="app">
      <AppHeader />

      {/* ── Hero ── */}
      <div className="rails-hero">
        <h1 className="rails-title">CHAOS Rails</h1>
        <p className="rails-subtitle">Whitepaper v3.1</p>
        <p className="rails-byline">Built by abc-alpha &middot; February 2026</p>
        <div className="rails-hero-links">
          <Link href={ROUTES.CHAOS_THEORY} className="ct-link-pill">ChaosTheory App</Link>
          <a href={LINKS.tradeChaos} target="_blank" rel="noopener noreferrer" className="ct-link-pill">Trade $CHAOS</a>
          <a href={LINKS.agentDocs} target="_blank" rel="noopener noreferrer" className="ct-link-pill">Agent Docs</a>
          <a href={LINKS.warpcast} target="_blank" rel="noopener noreferrer" className="ct-link-pill">@abc-alpha</a>
          <button onClick={handleOpenInClaude} className="ct-link-pill rails-claude-btn">
            Discuss with Claude
          </button>
        </div>
        {copyToast && (
          <div className="rails-toast">
            Prompt copied — paste into Claude to discuss the whitepaper
          </div>
        )}
      </div>

      {/* ── Mobile sticky nav ── */}
      <div className="rails-mobile-nav">
        <button className="rails-mobile-nav-btn" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
          <span className="rails-mobile-nav-label">{activeLabel}</span>
          <span className={`rails-mobile-nav-arrow ${mobileNavOpen ? 'open' : ''}`}>&#9662;</span>
        </button>
        {mobileNavOpen && (
          <div className="rails-mobile-nav-dropdown">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                className={`rails-mobile-nav-item ${s.indent ? 'indent' : ''} ${activeId === s.id ? 'active' : ''}`}
                onClick={() => scrollTo(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Layout: sidebar + content ── */}
      <div className="rails-layout">
        {/* Sidebar */}
        <nav className="rails-sidebar">
          <div className="rails-sidebar-inner">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                className={`rails-nav-item ${s.indent ? 'indent' : ''} ${activeId === s.id ? 'active' : ''}`}
                onClick={() => scrollTo(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <main className="rails-content">

          {/* ═══ Abstract ═══ */}
          <section id="abstract" className="rails-section">
            <h2 className="rails-h2">Abstract</h2>
            <div className="rails-abstract">
              <p>
                $CHAOS Rails is a liquidity management architecture on Base. It creates trading pairs between $CHAOS
                and other tokens &mdash; each pair is a surface where price information gets expressed, compared, and
                reconciled through trading activity. When two surfaces disagree about the price of CHAOS, arbitrage
                corrects them. That correction is a trade. That trade generates fees. Those fees accumulate as
                structural support for the network. The more surfaces, the more information flows through the system,
                and the more value the network captures from that flow.
              </p>
              <p>
                This paper describes the system in terms of its degrees of freedom: what is mechanically fixed, what
                participants can control, and what emerges from the interaction between the two. The entire architecture
                reduces to three controllable variables &mdash; <strong>volume</strong>,{' '}
                <strong>time at price</strong>, and <strong>circulating supply</strong> &mdash; operating against a set
                of immutable protocol constraints. Everything else is emergent. Seven pairs create twenty-one potential
                arbitrage gradients. The math scales combinatorially with each new surface added.
              </p>
              <p>
                The system is live and early. One multisig, seven pairs, small liquidity. You can participate now by
                staking $CHAOS to the Chaos Rails Foundation safe &mdash; every staker tightens circulating supply,
                which is one of the three control variables that makes the architecture work. Higher-risk operator
                portfolios are coming online soon. The thesis is that as participants learn to navigate their
                relationships to the system &mdash; operators learning pair selection, stakers choosing portfolios,
                bots discovering routes &mdash; the network develops its own intelligence about where value should
                flow. It grows when people join in.
              </p>
            </div>
          </section>

          {/* ═══ 1. Information on the Boundary ═══ */}
          <section id="section-1" className="rails-section">
            <h2 className="rails-h2">1. Information on the Boundary</h2>
            <p>
              Ethereum is an information processing network. Tokens are its native unit of account, but the real
              substrate is information &mdash; price signals, liquidity depth, fee flows, arbitrage gradients. Every
              swap is a statement about relative value. Every arbitrage correction is the network resolving a
              disagreement between two sources of price information.
            </p>
            <p>
              $CHAOS Rails sits on what can be thought of as Ethereum&apos;s Markov blanket &mdash; the boundary layer
              where internal state meets external observation. The system doesn&apos;t generate information. It creates
              surfaces where existing information (price movements in ETH, USDC, ecosystem tokens) gets expressed,
              compared, and reconciled through trading activity. The value captured is a function of how much
              information flows across those surfaces.
            </p>
            <p>
              A single $CHAOS trading pair is a single surface. It can only express the relationship between CHAOS
              and one other token. Add a second pair and you&apos;ve created an arbitrage gradient &mdash; any time those
              two surfaces disagree about the price of CHAOS, information needs to flow between them to resolve the
              disagreement. That flow is a trade. That trade generates fees. Those fees become buy-side support.
            </p>
            <p>
              Seven pairs create twenty-one potential arbitrage gradients. Each new pair added doesn&apos;t just add one
              surface &mdash; it adds connections to every existing surface. The information flow scales combinatorially
              with the number of pairs. This is the core mathematical premise of $CHAOS Rails.
            </p>
          </section>

          {/* ═══ 2. Degrees of Freedom ═══ */}
          <section id="section-2" className="rails-section">
            <h2 className="rails-h2">2. Degrees of Freedom</h2>
            <p>The system has three categories of variables: constants, controls, and emergents.</p>

            <h3 id="section-2-1" className="rails-h3">2.1 Constants (Protocol-Fixed)</h3>
            <p>
              These are set by Flaunch, Uniswap V4, and the $CHAOS token creation parameters. Nobody can change them.
            </p>
            <p>
              The <strong>Progressive Bid Wall (PBW)</strong> trails price. It places a limit buy order just below the
              current market price and repositions upward if price rises. It does not leave support at old price levels.
              It follows. This is a Uniswap V4 hook that executes autonomously on every swap.
            </p>
            <p>
              The PBW triggers at <strong>0.1 ETH</strong>. Each time the community&apos;s share of accumulated swap fees
              reaches 0.1 ETH, a new wall deployment occurs. The threshold is fixed.
            </p>
            <p>
              The <strong>Internal Swap Pool (ISP)</strong> converts token-side fees to ETH. Swap fees come in as both
              ETH and CHAOS. The ISP intercepts incoming buy orders and fills them with accumulated CHAOS fee tokens
              before they reach the pool. This converts fee revenue to ETH without sell pressure. It is automatic.
            </p>
            <p>
              The dev/community fee split is immutable. Set at token creation. The dev share goes to the Memestream NFT
              holder. The community share goes to the PBW. The ratio cannot be changed.
            </p>
            <p>
              Fee generation is symmetric. Both buys and sells generate fees. This is a property of the Uniswap V4
              pool, not a design choice.
            </p>
            <p>
              <strong>Fee deployment is asymmetric.</strong> Fees are only deployed as buy-side support. This is the
              fundamental asymmetry the entire system exploits.
            </p>

            <h3 id="section-2-2" className="rails-h3">2.2 Controls (Participant-Adjustable)</h3>
            <p>
              These are the actual degrees of freedom available to operators and participants. Every strategic decision
              maps to one of these.
            </p>
            <p>
              <strong>Volume.</strong> The rate of swap activity across $CHAOS pairs. Operators control this by
              choosing which pairs to create, at what fee tiers, with what liquidity depth. More pairs with
              well-chosen counterpart tokens produce more arbitrage gradients and therefore more volume. This is the
              primary control variable.
            </p>
            <p>
              <strong>Time at price.</strong> How long $CHAOS trades at a stable level before a shock moves it. Nobody
              directly controls price stability, but staking design and pair selection indirectly influence it. Pairs
              against stable assets (USDC) dampen volatility. Staking incentives discourage speculative churn. The
              architecture optimizes for extended consolidation.
            </p>
            <p>
              <strong>Circulating supply.</strong> The amount of $CHAOS available for active trading. Stakers remove
              supply from the float. Multiple competing multisigs competing for stakers remove more. Less circulating
              supply means any given wall deployment absorbs a larger percentage of potential sell pressure. This is the
              multiplier on wall effectiveness.
            </p>

            <h3 id="section-2-3" className="rails-h3">2.3 Emergents (Nobody Controls)</h3>
            <p>
              These arise from the interaction of constants and controls with market conditions.
            </p>
            <p>
              <strong>Wall thickness.</strong> The density of buy-side support at any given price level. This is a
              function of volume &times; time at price. Nobody can set it directly. It accumulates during
              consolidation and gets consumed during shocks.
            </p>
            <p>
              <strong>Floor price.</strong> Where the wall actually catches a sell-off. Depends on wall thickness at
              the moment of the shock relative to the magnitude of selling pressure. Not predictable, not
              controllable, only influenceable through the three control variables.
            </p>
            <p>
              <strong>Arb bot participation.</strong> Whether bots discover and trade the pairs. Influenced by spread
              width, liquidity depth, fee tiers, and data accessibility, but ultimately a market decision.
            </p>
            <p>
              <strong>ETH correlation.</strong> $CHAOS is priced in ETH. When ETH moves, everything moves. The wall
              can buffer this, but only proportional to its accumulated thickness.
            </p>
          </section>

          {/* ═══ 3. The Math ═══ */}
          <section id="section-3" className="rails-section">
            <h2 className="rails-h2">3. The Math</h2>
            <p>
              Given the degrees of freedom, the system reduces to a simple relationship:
            </p>
            <div className="rails-formula">
              Wall thickness at any price level = f(fee rate &times; volume &times; time at price)
            </div>
            <p>
              Where fee rate is fixed, volume is controlled by pair architecture, and time at price is influenced by
              supply dynamics and pair stability.
            </p>
            <p>
              The wall&apos;s defensive capacity at the moment of a shock is:
            </p>
            <div className="rails-formula">
              Shock absorption = wall thickness / (sell pressure &times; circulating supply)
            </div>
            <p>
              Staking reduces circulating supply, which increases shock absorption for any given wall thickness. More
              pairs increase volume, which increases wall thickness for any given time period. Stable counterpart
              pairs increase expected time at price, which increases wall thickness for any given volume level.
            </p>
            <p>
              Every design decision in the system &mdash; pair selection, fee tiers, staking incentives, RATCHET
              emissions, liquidity concentration &mdash; maps to one of these three terms.
            </p>

            <h3 id="section-3-1" className="rails-h3">3.1 What This Means in Practice</h3>
            <p>
              <strong>During consolidation:</strong> Volume generates fees. Fees trigger wall deployments. All
              deployments land at roughly the same price level. Wall thickness grows linearly with time (assuming
              constant volume). This is the productive regime.
            </p>
            <p>
              <strong>During a pump:</strong> The wall trails price upward. It&apos;s all concentrated near the top, but
              it&apos;s thin &mdash; there hasn&apos;t been enough time at any single level to accumulate meaningful depth.
            </p>
            <p>
              <strong>During a dump:</strong> Sellers hit the concentrated wall near the current price. If wall
              thickness &gt; sell pressure &times; circulating supply, price holds. If not, the wall is consumed and
              price falls until selling exhausts itself or hits the next equilibrium.
            </p>
            <p>
              <strong>After a dump:</strong> Consolidation begins at the new level. Wall building restarts from zero
              at that price. The ratchet only tightens if the pre-shock wall was thick enough to catch the fall above
              the previous consolidation level.
            </p>

            <h3 id="section-3-2" className="rails-h3">3.2 The Ratchet Is Conditional</h3>
            <p>
              The ratchet effect is real but it is not guaranteed. It is a probabilistic outcome that depends on the
              ratio of consolidation time to shock magnitude. Over many cycles, if the system maintains high arb
              volume during consolidation periods, the expected value of each cycle is positive &mdash; the floor
              trends upward. But any individual cycle can reset the floor if the shock exceeds the wall&apos;s capacity.
            </p>
            <p>
              The architecture doesn&apos;t promise a ratchet. It maximizes the probability of one by maximizing the
              rate of wall accumulation during the periods that matter.
            </p>
          </section>

          {/* ═══ 4. Pair Architecture as Information Topology ═══ */}
          <section id="section-4" className="rails-section">
            <h2 className="rails-h2">4. Pair Architecture as Information Topology</h2>
            <p>
              The choice of which tokens to pair against $CHAOS is not a financial decision. It is a decision about
              information topology &mdash; which price signals should flow through the $CHAOS network.
            </p>
            <h4 className="rails-h4">Stable Pairs (USDC)</h4>
            <p>
              A CHAOS/USDC pair creates an anchor. USDC doesn&apos;t move, so any price movement in CHAOS creates an
              immediate arb gradient against the USDC pair. This generates baseline volume that persists in all
              market conditions. The USDC pair is the system&apos;s clock &mdash; it ticks every time CHAOS moves
              relative to the dollar, which is constantly.
            </p>
            <h4 className="rails-h4">Ecosystem Pairs (ARBME, MLTL)</h4>
            <p>
              Pairs against other community tokens create bidirectional information flow. When ARBME pumps
              independently, the CHAOS/ARBME pair creates arb opportunities. When CHAOS pumps, the same pair creates
              opportunities in the other direction. Each token&apos;s volatility becomes a volume source for both. These
              pairs are cooperation agreements &mdash; two economies choosing to share fee-generating surface area.
            </p>
            <h4 className="rails-h4">Combinatorial Scaling</h4>
            <p>
              With <em>n</em> pairs, the number of potential two-hop arbitrage routes is{' '}
              <span className="rails-math">n(n-1)/2</span>. Seven pairs create 21 potential routes. Each route is a
              channel through which price information can flow, generating volume at each hop. Adding an eighth pair
              doesn&apos;t add 1 surface &mdash; it adds 7 new routes. The information topology scales faster than the
              infrastructure.
            </p>
            <p>
              This is why the multi-multisig model matters. Every operator who adds new pairs to the network
              isn&apos;t just building their own portfolio &mdash; they&apos;re adding routes to the entire topology. The
              value of the network compounds with each new surface.
            </p>
          </section>

          {/* ═══ 5. ChaosTheory: Competing for Degrees of Freedom ═══ */}
          <section id="section-5" className="rails-section">
            <h2 className="rails-h2">5. ChaosTheory: Competing for Degrees of Freedom</h2>
            <p>
              ChaosTheory is the staking layer. It is a model, not an entity. Anyone can deploy one.
            </p>
            <h4 className="rails-h4">The Model</h4>
            <p>
              A ChaosTheory deployment is a Gnosis Safe multisig running the ArbMe app, managing LP positions paired
              against $CHAOS. Operators control the volume degree of freedom by choosing pairs, fee tiers, and
              liquidity distribution. Stakers control the circulating supply degree of freedom by locking tokens.
              Together they influence time at price by reducing speculative churn.
            </p>
            <p>
              $CHAOS holders stake to a specific multisig&apos;s staking hub, earning LP fee revenue from that portfolio.
              Reward streams run on 180-day rolling windows, restarting with each weekly deposit.
            </p>
            <h4 className="rails-h4">The abc-alpha MVP</h4>
            <p>
              The first ChaosTheory multisig is built by abc-alpha. Seven pairs, focused on three star pairings:
              USDC (stable anchor), ARBME (ecosystem synergy), MLTL (cross-community). This is the minimum viable
              proof that the math works &mdash; that arb volume generates fees, that fees build walls during
              consolidation, and that staking reduces the supply the walls need to defend.
            </p>
            <h4 className="rails-h4">Multiple Multisigs</h4>
            <p>
              The model scales through competition. Any project or operator hires the abc-alpha bot to deploy a
              ChaosTheory Gnosis Safe. The bot handles Safe creation, LP setup, staking contracts, and routing
              integration. Machine-readable docs at{' '}
              <a href={LINKS.agentDocs} target="_blank" rel="noopener noreferrer">abc-alpha.epicdylan.com</a>.
            </p>
            <p>
              Multiple multisigs compete for $CHAOS stakers by offering differentiated portfolios: different pairs,
              different risk profiles, different yield compositions. This competition is a competition for the
              circulating supply degree of freedom &mdash; every multisig is trying to absorb as much $CHAOS as
              possible, which tightens the float for everyone.
            </p>
            <h4 className="rails-h4">$RATCHET Operator Incentives</h4>
            <p>
              100,000,000 $RATCHET per week from a pre-allocated treasury, distributed proportionally to multisigs
              based on $CHAOS staked. No minimum threshold. Self-staking is allowed &mdash; it&apos;s skin in the game,
              not a loophole.
            </p>
            <p>
              RATCHET emissions accelerate the competition for supply. Operators earn RATCHET proportional to the
              CHAOS they attract. More CHAOS attracted means less circulating supply. Less circulating supply means
              walls go further. The emission is a catalyst on the supply degree of freedom. Earned RATCHET emissions
              are deposited to the multisig and can be dispensed with any way the operator chooses.
            </p>
          </section>

          {/* ═══ 6. Project Fundraising ═══ */}
          <section id="section-6" className="rails-section">
            <h2 className="rails-h2">6. Project Fundraising</h2>
            <p>
              The multi-multisig model creates a fundraising mechanism that works through information flow rather
              than token sales.
            </p>
            <p>
              A project hires the abc-alpha bot to deploy a ChaosTheory Safe with LP positions between their token,
              $CHAOS, and $USDC. This adds their token to the information topology &mdash; new arb surfaces, new
              routes, new fee generation. $CHAOS holders stake to the project&apos;s multisig to earn yield from its
              trading activity.
            </p>
            <p>
              The project gets liquidity and volume without selling tokens. Stakers get yield. $CHAOS gets more arb
              surfaces feeding the PBW. The project&apos;s token gets tight, liquid markets maintained by arb bots.
              Every participant is adding information surface area to the network. The project&apos;s potential is not
              lost in a sea of price noise.
            </p>
            <p>
              As the ecosystem grows, projects compete to be included in operator portfolios because inclusion means
              deeper liquidity, more volume, and access to $CHAOS staker capital. The tokens most likely to generate
              high arb volume &mdash; the ones with the most independent price information &mdash; become the most
              valuable additions to the topology.
            </p>
          </section>

          {/* ═══ 7. The Flywheel as Information Dynamics ═══ */}
          <section id="section-7" className="rails-section">
            <h2 className="rails-h2">7. The Flywheel as Information Dynamics</h2>
            <p>
              More surfaces create more information gradients. More gradients generate more volume. More volume
              generates more fees. More fees build walls during consolidation. Walls buffer shocks. Buffered shocks
              mean consolidation restarts at higher levels. RATCHET emissions accelerate supply lockup. Less supply
              means walls go further. More operators add more surfaces.
            </p>
            <p>
              The flywheel is an information processing loop. Each cycle, the network gets better at moving price
              information across its surfaces and capturing value from the flow. The ratchet tightens &mdash; not
              deterministically, but probabilistically &mdash; as the system accumulates more surfaces, more volume,
              and less free-floating supply.
            </p>
            <p>
              It isn&apos;t much yet. A handful of pairs, one multisig, small liquidity. But the math scales
              combinatorially with surfaces and the architecture is designed to add them permissionlessly. As
              participants learn their relationships to the system &mdash; as operators learn which pairs generate
              the most productive arb, as stakers learn which multisigs offer the best risk-adjusted yield, as
              projects learn that $CHAOS pairs provide structural liquidity &mdash; the network develops collective
              intelligence about where value should flow.
            </p>
            <p>
              That&apos;s the long game. Not a token with a clever buyback mechanism. A piece of Ethereum&apos;s information
              infrastructure that gets smarter as more people and bots use it.
            </p>
          </section>

          {/* ═══ 8. Infrastructure ═══ */}
          <section id="section-8" className="rails-section">
            <h2 className="rails-h2">8. Infrastructure</h2>
            <div className="rails-address-grid">
              <div className="ct-address-card">
                <div className="ct-label">abc-alpha Multisig (Gnosis Safe, Base)</div>
                <a href={LINKS.multisig} target="_blank" rel="noopener noreferrer" className="ct-address">
                  0x3CE26de6FF74e0Baa5F762b67465eEacfE84549F
                </a>
              </div>
              <div className="ct-address-card">
                <div className="ct-label">Staking Hub (7 reward gauges, 180-day streams)</div>
                <a href={LINKS.stakingHub} target="_blank" rel="noopener noreferrer" className="ct-address">
                  0x70e6c917A8AC437E629B67E84C0C0678eD54460d
                </a>
              </div>
              <div className="ct-address-card">
                <div className="ct-label">$CHAOS (Base, 80% creator fee)</div>
                <a href={LINKS.basescan} target="_blank" rel="noopener noreferrer" className="ct-address">
                  0xFaB2ee8eB6B26208BfB5c41012661e62b4Dc9292
                </a>
              </div>
              <div className="ct-address-card">
                <div className="ct-label">Flaunch Integration (NFT ID 7432, PBW + ISP hooks)</div>
                <span className="ct-address" style={{ cursor: 'default' }}>
                  Pool ID: 0xcbfbb74c...
                </span>
              </div>
            </div>
          </section>

          {/* ═══ 9. Hiring the Bot ═══ */}
          <section id="section-9" className="rails-section">
            <h2 className="rails-h2">9. Hiring the Bot</h2>
            <p>
              The abc-alpha bot deploys ChaosTheory Safes and integrates projects into the routing network.
            </p>
            <div className="rails-services-table">
              <div className="rails-services-header">
                <span>Service</span>
                <span>Delivery</span>
                <span>Price</span>
              </div>
              <div className="rails-services-row">
                <span className="rails-svc-name">Token Analysis Audit</span>
                <span className="rails-svc-delivery">24h</span>
                <span className="rails-svc-price">0.0050 ETH</span>
              </div>
              <div className="rails-services-row">
                <span className="rails-svc-name">Gnosis Safe Setup</span>
                <span className="rails-svc-delivery">24h</span>
                <span className="rails-svc-price">0.0050 ETH</span>
              </div>
              <div className="rails-services-row">
                <span className="rails-svc-name">Staking Contract Deployment</span>
                <span className="rails-svc-delivery">48h</span>
                <span className="rails-svc-price">0.0500 ETH</span>
              </div>
              <div className="rails-services-row">
                <span className="rails-svc-name">New Token Volume Package</span>
                <span className="rails-svc-delivery">72h</span>
                <span className="rails-svc-price">0.0100 ETH</span>
              </div>
              <div className="rails-services-row">
                <span className="rails-svc-name">LP Strategy Consult</span>
                <span className="rails-svc-delivery">48h</span>
                <span className="rails-svc-price">0.1000 ETH</span>
              </div>
            </div>
            <p className="rails-services-note">
              Service requests through{' '}
              <a href={LINKS.moltlaunch} target="_blank" rel="noopener noreferrer">MoltLaunch escrow</a>.
              Agent interaction docs at{' '}
              <a href={LINKS.agentDocs} target="_blank" rel="noopener noreferrer">abc-alpha.epicdylan.com</a>.
            </p>
          </section>

          {/* ═══ 10. What Comes Next ═══ */}
          <section id="section-10" className="rails-section">
            <h2 className="rails-h2">10. What Comes Next</h2>
            <p>
              <strong>Second multisig.</strong> Higher-risk pair composition. Tests whether stakers distribute
              across portfolios by risk appetite.
            </p>
            <p>
              <strong>Project onboarding.</strong> Each new Safe adds surfaces to the topology. More surfaces, more
              routes, more information flow.
            </p>
            <p>
              <strong>Machine-readable infrastructure.</strong> API endpoints and server-rendered pages making pool,
              staking, and arb data accessible to agents and bots. Making the system legible to automated
              participants is adding surfaces for information flow at the discovery layer.
            </p>
            <p>
              <strong>Network intelligence.</strong> As participants navigate the system &mdash; operators learning
              pair selection, stakers learning portfolio allocation, bots learning routing &mdash; the network
              accumulates collective knowledge about where value should flow. This is the transition from
              infrastructure to intelligence. It happens gradually, then all at once, as the topology grows complex
              enough to exhibit emergent behavior that no single participant designed.
            </p>

            {/* Links */}
            <div className="rails-links-grid">
              <a href={LINKS.agentDocs} target="_blank" rel="noopener noreferrer" className="rails-link-card">
                <span className="rails-link-label">Agent Docs</span>
                <span className="rails-link-url">abc-alpha.epicdylan.com</span>
              </a>
              <Link href={ROUTES.CHAOS_THEORY} className="rails-link-card">
                <span className="rails-link-label">ChaosTheory App</span>
                <span className="rails-link-url">arbme.epicdylan.com/chaostheory</span>
              </Link>
              <a href={LINKS.tradeChaos} target="_blank" rel="noopener noreferrer" className="rails-link-card">
                <span className="rails-link-label">Trade $CHAOS</span>
                <span className="rails-link-url">flaunch.gg</span>
              </a>
              <a href={LINKS.multisig} target="_blank" rel="noopener noreferrer" className="rails-link-card">
                <span className="rails-link-label">abc-alpha Multisig</span>
                <span className="rails-link-url">0x3CE2...49F</span>
              </a>
              <a href={LINKS.stakingHub} target="_blank" rel="noopener noreferrer" className="rails-link-card">
                <span className="rails-link-label">Staking Hub</span>
                <span className="rails-link-url">0x70e6...60d</span>
              </a>
              <a href={LINKS.moltlaunch} target="_blank" rel="noopener noreferrer" className="rails-link-card">
                <span className="rails-link-label">MoltLaunch Agent</span>
                <span className="rails-link-url">moltlaunch.com</span>
              </a>
              <a href={LINKS.basescan} target="_blank" rel="noopener noreferrer" className="rails-link-card">
                <span className="rails-link-label">Basescan</span>
                <span className="rails-link-url">basescan.org</span>
              </a>
              <a href={LINKS.warpcast} target="_blank" rel="noopener noreferrer" className="rails-link-card">
                <span className="rails-link-label">Warpcast</span>
                <span className="rails-link-url">@abc-alpha</span>
              </a>
            </div>
          </section>

        </main>
      </div>

      <Footer />

      <style jsx global>{`
        /* ── Rails Hero ── */
        .rails-hero {
          text-align: center;
          padding: 2rem 1rem 1.5rem;
          border-bottom: 1px solid var(--border);
        }
        .rails-title {
          font-size: 1.75rem;
          font-weight: 800;
          color: var(--text-primary);
          margin: 0 0 0.25rem;
          letter-spacing: -0.02em;
        }
        .rails-subtitle {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin: 0 0 0.25rem;
          font-weight: 500;
        }
        .rails-byline {
          font-size: 0.6875rem;
          color: var(--text-muted);
          margin: 0 0 1rem;
        }
        .rails-hero-links {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.375rem;
        }

        /* ── Layout ── */
        .rails-layout {
          display: flex;
          max-width: 960px;
          margin: 0 auto;
          padding: 0 1rem;
        }

        /* ── Sidebar ── */
        .rails-sidebar {
          width: 200px;
          flex-shrink: 0;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
          padding: 1.5rem 0;
          border-right: 1px solid var(--border);
        }
        .rails-sidebar-inner {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }
        .rails-nav-item {
          display: block;
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          font-size: 0.6875rem;
          color: var(--text-muted);
          padding: 0.375rem 0.75rem;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.15s;
          line-height: 1.3;
        }
        .rails-nav-item.indent {
          padding-left: 1.25rem;
          font-size: 0.625rem;
        }
        .rails-nav-item:hover {
          color: var(--text-secondary);
          background: var(--bg-secondary);
        }
        .rails-nav-item.active {
          color: var(--accent);
          background: var(--accent-glow);
          font-weight: 600;
        }

        /* ── Mobile nav ── */
        .rails-mobile-nav {
          display: none;
          position: sticky;
          top: 0;
          z-index: 50;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border);
        }
        .rails-mobile-nav-btn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 0.625rem 1rem;
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-primary);
        }
        .rails-mobile-nav-label {
          font-size: 0.75rem;
          font-weight: 600;
        }
        .rails-mobile-nav-arrow {
          font-size: 0.625rem;
          color: var(--text-muted);
          transition: transform 0.2s;
        }
        .rails-mobile-nav-arrow.open {
          transform: rotate(180deg);
        }
        .rails-mobile-nav-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border);
          max-height: 60vh;
          overflow-y: auto;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        .rails-mobile-nav-item {
          display: block;
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          font-size: 0.75rem;
          color: var(--text-muted);
          padding: 0.5rem 1rem;
          cursor: pointer;
        }
        .rails-mobile-nav-item.indent {
          padding-left: 1.75rem;
          font-size: 0.6875rem;
        }
        .rails-mobile-nav-item.active {
          color: var(--accent);
          font-weight: 600;
        }

        /* ── Content ── */
        .rails-content {
          flex: 1;
          min-width: 0;
          max-width: 700px;
          padding: 1.5rem 0 3rem 2rem;
        }
        .rails-section {
          margin-bottom: 2.5rem;
          scroll-margin-top: 80px;
        }
        .rails-h2 {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 0.75rem;
          letter-spacing: -0.01em;
          scroll-margin-top: 80px;
        }
        .rails-h3 {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 1.5rem 0 0.5rem;
          scroll-margin-top: 80px;
        }
        .rails-h4 {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin: 1.25rem 0 0.375rem;
        }
        .rails-content p {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          line-height: 1.7;
          margin: 0 0 0.75rem;
        }
        .rails-content a {
          color: var(--accent);
          text-decoration: none;
        }
        .rails-content a:hover {
          text-decoration: underline;
        }
        .rails-content strong {
          color: var(--text-primary);
          font-weight: 600;
        }

        /* ── Abstract ── */
        .rails-abstract {
          border-left: 2px solid var(--accent);
          padding-left: 1rem;
        }
        .rails-abstract p {
          font-size: 0.875rem;
          line-height: 1.8;
        }

        /* ── Formula blocks ── */
        .rails-formula {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.8125rem;
          color: var(--text-primary);
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          margin: 0.75rem 0;
          line-height: 1.6;
        }

        /* ── Inline math ── */
        .rails-math {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.8125rem;
          background: var(--bg-secondary);
          padding: 0.1rem 0.3rem;
          border-radius: 3px;
        }

        /* ── Address grid ── */
        .rails-address-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }
        .rails-address-grid .ct-address-card {
          margin-bottom: 0;
        }

        /* ── Services table ── */
        .rails-services-table {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
          margin: 0.75rem 0;
        }
        .rails-services-header {
          display: grid;
          grid-template-columns: 1fr 60px 90px;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
          font-size: 0.5625rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
        }
        .rails-services-row {
          display: grid;
          grid-template-columns: 1fr 60px 90px;
          gap: 0.5rem;
          padding: 0.625rem 0.75rem;
          border-bottom: 1px solid var(--border);
          align-items: center;
        }
        .rails-services-row:last-child {
          border-bottom: none;
        }
        .rails-svc-name {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .rails-svc-delivery {
          font-size: 0.6875rem;
          color: var(--text-muted);
        }
        .rails-svc-price {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.6875rem;
          font-weight: 600;
          color: var(--text-primary);
          text-align: right;
        }
        .rails-services-note {
          font-size: 0.6875rem;
          color: var(--text-muted);
          margin-top: 0.5rem;
        }

        /* ── Link cards ── */
        .rails-links-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
          margin-top: 1.5rem;
        }
        .rails-link-card {
          display: flex;
          flex-direction: column;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.625rem 0.75rem;
          text-decoration: none;
          transition: border-color 0.15s;
        }
        .rails-link-card:hover {
          border-color: var(--accent);
          text-decoration: none;
        }
        .rails-link-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .rails-link-url {
          font-family: ui-monospace, 'SF Mono', Monaco, monospace;
          font-size: 0.5625rem;
          color: var(--text-muted);
          margin-top: 0.125rem;
        }

        /* ── Claude button ── */
        .rails-claude-btn {
          cursor: pointer;
          background: var(--accent-glow) !important;
          border-color: var(--accent) !important;
          color: var(--accent) !important;
        }
        .rails-claude-btn:hover {
          background: var(--accent) !important;
          color: var(--bg-primary) !important;
        }

        /* ── Toast ── */
        .rails-toast {
          margin-top: 0.75rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.6875rem;
          color: var(--accent);
          background: var(--accent-glow);
          border: 1px solid var(--accent);
          border-radius: 8px;
          animation: railsToastIn 0.2s ease-out;
        }
        @keyframes railsToastIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── Mobile responsive ── */
        @media (max-width: 768px) {
          .rails-sidebar {
            display: none;
          }
          .rails-mobile-nav {
            display: block;
          }
          .rails-content {
            padding: 1rem 0 2rem;
            max-width: 100%;
          }
          .rails-layout {
            padding: 0 1rem;
          }
          .rails-address-grid {
            grid-template-columns: 1fr;
          }
          .rails-links-grid {
            grid-template-columns: 1fr;
          }
          .rails-services-header,
          .rails-services-row {
            grid-template-columns: 1fr 50px 80px;
          }
        }
      `}</style>
    </div>
  )
}
