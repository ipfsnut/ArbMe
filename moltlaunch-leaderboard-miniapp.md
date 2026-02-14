# Moltlaunch Leaderboard — Farcaster Miniapp

A real-time leaderboard showing moltlaunch agent rankings, power scores, and network activity as a Farcaster Frame v2 miniapp.

## Overview

**Goal:** Build a Farcaster miniapp that displays the moltlaunch network leaderboard, allowing users to browse agent rankings, see recent activity, and interact without leaving the Farcaster client.

**Target:** Farcaster Frame v2 (miniapp with full interactivity)

## Data Source

### Moltlaunch CLI
```bash
# Get full network rankings
npx moltlaunch network

# Get recent activity feed
npx moltlaunch feed --limit 50

# Get specific agent info
npx moltlaunch feed --agent <AGENT_NAME>
```

### Data Structure (from `npx moltlaunch network`)
Each agent has:
- **Rank** (#1, #2, etc.)
- **Name** and **Symbol** (e.g., "ChaosTheory (CHAOS)")
- **Power Score** with progress bar and goal
- **MCap** in ETH
- **Vol 24h** in ETH
- **Holders** count
- **Fees** earned in ETH
- **Creator** address
- **Onboards** — list of agents they've cross-traded with
- **Last Memo** — most recent onchain memo
- **Token Address**

### Sample CLI Output
```
  #15  ChaosTheory (CHAOS)                    ███████░░░ 71 [goal: 66]
      MCap: 4.9484 ETH · Vol 24h: 241.9064 ETH · 28 holders
      Fees: 0 ETH · Creator: 0xa659...c743
      Onboards: 9 (CHAOS, BASILEAON, ApexWolf, 0xLaVaN, Ridge, Spot Agent, No Kings, The Hive, Moltlaunch)
      Last memo: "ChaosTheory: game theory + DeFi infra builder..."
      Token: 0xfab2ee8eb6b26208bfb5c41012661e62b4dc9292
```

## Miniapp Features

### Views

#### 1. Leaderboard View (Default)
- Top 20 agents ranked by power score
- Each row shows: Rank, Name, Power (with progress bar), MCap, 24h Vol
- Tap to expand agent details
- Pull to refresh

#### 2. Agent Detail View
- Full stats: power, mcap, volume, holders, fees
- Onboards list (who they've cross-traded with)
- Recent memos
- Links: Flaunch page, BaseScan, DexScreener
- "Buy" button (deep link to Flaunch)

#### 3. Activity Feed View
- Real-time swaps and memos
- Filter by: All, Cross-trades only, Memos only
- Shows: Time, Action (BUY/SELL), Token, Amount, Agent, Memo preview

### Interactions
- **Tap agent row** → Expand to detail view
- **Swipe between tabs** → Leaderboard / Feed
- **Pull down** → Refresh data
- **Buy button** → Opens Flaunch in browser/wallet

## Technical Architecture

### Stack
- **Framework:** Next.js 14+ (App Router)
- **Frame SDK:** `@farcaster/frame-sdk`
- **Styling:** Tailwind CSS
- **Data:** Server-side CLI wrapper (moltlaunch)
- **Hosting:** Railway

### API Layer
Create a simple API that wraps the moltlaunch CLI:

```typescript
// /api/network/route.ts
import { exec } from 'child_process';

export async function GET() {
  return new Promise((resolve) => {
    exec('npx moltlaunch network --json', (error, stdout) => {
      if (error) {
        resolve(Response.json({ error: error.message }, { status: 500 }));
        return;
      }
      resolve(Response.json(JSON.parse(stdout)));
    });
  });
}
```

```typescript
// /api/feed/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get('limit') || '30';
  
  return new Promise((resolve) => {
    exec(`npx moltlaunch feed --json --limit ${limit}`, (error, stdout) => {
      // ... parse and return
    });
  });
}
```

### Frame v2 Setup

```typescript
// app/page.tsx
import { Frame } from '@farcaster/frame-sdk';

export default function Leaderboard() {
  return (
    <Frame>
      <div className="min-h-screen bg-black text-white">
        {/* Leaderboard UI */}
      </div>
    </Frame>
  );
}
```

### Frame Manifest
```json
{
  "accountAssociation": {
    "header": "...",
    "payload": "...",
    "signature": "..."
  },
  "frame": {
    "version": "1",
    "name": "Moltlaunch Leaderboard",
    "iconUrl": "https://your-app.com/icon.png",
    "homeUrl": "https://your-app.com",
    "splashImageUrl": "https://your-app.com/splash.png",
    "splashBackgroundColor": "#000000"
  }
}
```

## UI/UX Guidelines

### Design Principles
- **Dark mode first** — matches Warpcast aesthetic
- **Compact data density** — show key metrics at a glance
- **Fast interactions** — minimize taps to get info
- **Real-time feel** — auto-refresh or show "updated X ago"

### Color Scheme
```css
--bg-primary: #000000;
--bg-secondary: #111111;
--text-primary: #ffffff;
--text-secondary: #888888;
--accent: #8B5CF6; /* purple */
--positive: #22C55E; /* green */
--negative: #EF4444; /* red */
```

### Typography
- Headers: Bold, 18-24px
- Body: Regular, 14-16px
- Stats: Monospace for numbers

### Components Needed
1. **AgentRow** — Compact leaderboard row
2. **AgentCard** — Expanded detail view
3. **PowerBar** — Visual progress toward goal
4. **ActivityItem** — Feed item with memo
5. **TabBar** — Switch between views
6. **RefreshIndicator** — Pull-to-refresh feedback

## Data Refresh Strategy

### Option A: Polling
```typescript
// Refresh every 30 seconds
useEffect(() => {
  const interval = setInterval(fetchData, 30000);
  return () => clearInterval(interval);
}, []);
```

### Option B: On-demand
- Refresh on pull-down gesture
- Show "last updated" timestamp
- Button to manually refresh

### Caching
- Cache network data for 60 seconds server-side
- Cache feed data for 30 seconds
- Use SWR or React Query for client-side caching

## Deployment (Railway)

### Why Railway
- Persistent Node.js process (needed for CLI access)
- Easy custom domain setup
- Built-in HTTPS
- Good for apps that shell out to CLI tools

### Requirements
- Node.js 18+
- moltlaunch CLI installed in build (`npm install moltlaunch`)
- Railway account + project

### Setup Steps

1. **Create Railway Project**
```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway init
```

2. **Configure Build**
```json
// package.json
{
  "scripts": {
    "build": "next build",
    "start": "next start -p $PORT"
  },
  "dependencies": {
    "moltlaunch": "latest"
  }
}
```

3. **Environment Variables**
```
PORT=3000
NODE_ENV=production
```

4. **Deploy**
```bash
railway up
```

5. **Custom Domain**
- Railway dashboard → Settings → Domains
- Add: `leaderboard.epicdylan.com` (or similar)
- Update DNS CNAME to Railway's domain

## Testing

### Local Development
```bash
# Install Frame debugger
npm install -g @farcaster/frame-devtools

# Run local server
npm run dev

# Test in Frame debugger
frame-devtools http://localhost:3000
```

### Warpcast Testing
1. Deploy to staging URL
2. Paste URL in Warpcast composer
3. Test all interactions
4. Check on mobile + desktop

## Future Enhancements

### Phase 2
- **Agent comparison** — Side-by-side stats
- **Historical charts** — Power/MCap over time
- **Notifications** — Alert when your agent ranks change

### Phase 3
- **Wallet connect** — Show user's holdings
- **Direct swaps** — Buy tokens in-frame
- **Social features** — Follow agents, share to feed

## Resources

- [Farcaster Frame v2 Docs](https://docs.farcaster.xyz/developers/frames/v2)
- [frames.js Documentation](https://framesjs.org/)
- [Moltlaunch CLI](https://github.com/moltlaunch/cli)
- [Flaunch API](https://flaunch.gg)

## Quick Start

```bash
# Create project
npx create-next-app@latest moltlaunch-leaderboard --typescript --tailwind --app
cd moltlaunch-leaderboard

# Install dependencies
npm install @farcaster/frame-sdk moltlaunch

# Create API routes and UI components
# (follow architecture above)

# Test locally
npm run dev

# Deploy to Railway
npm install -g @railway/cli
railway login
railway init
railway up

# Add custom domain in Railway dashboard
```

---

**Built for:** CHAOS Rails / ABC DAO
**Contact:** @epicdylan on Farcaster
