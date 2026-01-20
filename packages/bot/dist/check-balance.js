/**
 * Check wallet balances for the bot
 */
import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
const PRIVATE_KEY = `0x${process.env.PRIVATE_KEY}`;
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
// Token addresses on Base
const TOKENS = {
    WETH: '0x4200000000000000000000000000000000000006',
    ARBME: '0xC647421C5Dc78D1c3960faA7A33f9aEFDF4B7B07',
    CLANKER: '0x25bc1A101bf9D58F6036213c0e096Dfc9b5DB6EA',
    PAGE: '0x60e683c6514edd5f758a55b6f393bebbafaa8d5e',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};
// Standard ERC20 ABI for balanceOf
const ERC20_ABI = [
    {
        constant: true,
        inputs: [{ name: '_owner', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: 'balance', type: 'uint256' }],
        type: 'function',
    },
    {
        constant: true,
        inputs: [],
        name: 'decimals',
        outputs: [{ name: '', type: 'uint8' }],
        type: 'function',
    },
];
async function checkBalances() {
    // Create account from private key
    const account = privateKeyToAccount(PRIVATE_KEY);
    console.log('🔍 Checking balances for bot wallet...\n');
    console.log(`📬 Address: ${account.address}\n`);
    // Create public client for reading
    const publicClient = createPublicClient({
        chain: base,
        transport: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
    });
    // Check ETH balance
    const ethBalance = await publicClient.getBalance({ address: account.address });
    console.log(`💎 ETH: ${formatEther(ethBalance)} ETH`);
    // Check token balances
    for (const [symbol, address] of Object.entries(TOKENS)) {
        try {
            const balance = await publicClient.readContract({
                address: address,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [account.address],
            });
            const decimals = await publicClient.readContract({
                address: address,
                abi: ERC20_ABI,
                functionName: 'decimals',
            });
            const formattedBalance = Number(balance) / Math.pow(10, Number(decimals));
            if (formattedBalance > 0) {
                console.log(`🪙 ${symbol}: ${formattedBalance.toLocaleString(undefined, { maximumFractionDigits: 8 })}`);
            }
            else {
                console.log(`🪙 ${symbol}: 0`);
            }
        }
        catch (error) {
            console.log(`❌ ${symbol}: Error reading balance`);
        }
    }
    console.log('\n✅ Balance check complete');
}
checkBalances().catch(console.error);
