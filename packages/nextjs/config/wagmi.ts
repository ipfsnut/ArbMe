import { connectorsForWallets, getDefaultWallets } from '@rainbow-me/rainbowkit';
import { createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { safe } from 'wagmi/connectors';

const { wallets } = getDefaultWallets();

const connectors = connectorsForWallets(wallets, {
  appName: 'ArbMe',
  projectId: '2efb2aeae04a72cb733a24ae9efaaf0e',
});

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    ...connectors,
    safe({ allowedDomains: [/safe\.global$/] }),
  ],
  transports: {
    [base.id]: http(),
  },
  ssr: true,
});
