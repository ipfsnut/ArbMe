#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { poolHealth } from './commands/pool-health.js';
const program = new Command();
program
    .name('chaos')
    .description('ChaosTheory CLI — pool analytics & DeFi tooling on Base')
    .version('1.0.0');
program
    .command('pool-health')
    .description('Scan a Base token\'s pools and generate a health report')
    .argument('<token>', 'Token contract address (0x...)')
    .option('--alchemy-key <key>', 'Alchemy API key for RPC')
    .option('--min-tvl <usd>', 'Minimum TVL filter in USD', '0')
    .option('-o, --output <path>', 'Output file path (default: ./<SYMBOL>-pool-health.md)')
    .option('--json', 'Output as JSON instead of markdown')
    .option('-v, --verbose', 'Verbose logging')
    .action(poolHealth);
program.parse();
