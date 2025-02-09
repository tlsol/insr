import { ethers } from 'ethers';
import { PriceFeeder } from '../services/PriceFeeder';
import dotenv from 'dotenv';

dotenv.config();

const TOKENS = {
    USDC: {
        address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",  // BSC USDC
        feedId: "0x015553444300000000000000000000000000000000",  // USDC/USD
        heartbeat: 60  // 60 seconds
    },
    USDT: {
        address: "0x55d398326f99059fF775485246999027B3197955",  // BSC USDT
        feedId: "0x015553534400000000000000000000000000000000",  // USDT/USD
        heartbeat: 60
    },
    DAI: {
        address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",  // BSC DAI
        feedId: "0x014441492f55534400000000000000000000000000",  // DAI/USD
        heartbeat: 60
    }
};

const FALLBACK_RPCS = [
    "https://bsc-dataseed1.binance.org",
    "https://bsc-dataseed2.binance.org",
    "https://bsc-dataseed3.binance.org",
    "https://bsc-dataseed4.binance.org"
];

async function main() {
    // Load environment variables
    const {
        BSC_RPC_URL,
        PRIVATE_KEY,
        STAKING_POOL_ADDRESS,
        FLARE_RPC,
        FTSO_V2_ADDRESS,
        ADMIN_EMAIL
    } = process.env;

    if (!BSC_RPC_URL || !PRIVATE_KEY || !STAKING_POOL_ADDRESS || !FLARE_RPC || !FTSO_V2_ADDRESS) {
        throw new Error("Missing required environment variables");
    }

    console.log("🚀 Starting price feeder service...");

    // Setup provider and signer
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    console.log(`Connected to BSC with address: ${wallet.address}`);

    try {
        // Initialize price feeder
        const feeder = new PriceFeeder(
            STAKING_POOL_ADDRESS,
            wallet,
            {
                flareRPC: FLARE_RPC,
                ftsoV2Address: FTSO_V2_ADDRESS,
                primaryRPC: BSC_RPC_URL,
                fallbackRPCs: FALLBACK_RPCS,
                healthCheckInterval: 30000, // 30 seconds
                circuitBreaker: {
                    maxFailuresPerHour: 5,
                    maxPriceDeviation: 1000, // 10%
                    minUpdateInterval: 5000,  // 5 seconds
                    emergencyContacts: ADMIN_EMAIL ? [ADMIN_EMAIL] : []
                }
            }
        );

        console.log("✅ Price feeder initialized");
        console.log("📊 Starting price updates for tokens:", Object.keys(TOKENS));

        // Start price updates for all tokens
        await feeder.startUpdates(Object.values(TOKENS));
        console.log("✅ Price updates started");

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n🛑 Received SIGINT signal');
            console.log('Stopping price feeder...');
            await feeder.stop();
            console.log('Price feeder stopped');
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('\n🛑 Received SIGTERM signal');
            console.log('Stopping price feeder...');
            await feeder.stop();
            console.log('Price feeder stopped');
            process.exit(0);
        });

        process.on('uncaughtException', async (error) => {
            console.error('❌ Uncaught exception:', error);
            try {
                console.log('Attempting to stop price feeder...');
                await feeder.stop();
                console.log('Price feeder stopped');
            } catch (stopError) {
                console.error('Failed to stop price feeder:', stopError);
            }
            process.exit(1);
        });

    } catch (error) {
        console.error('❌ Failed to start price feeder:', error);
        process.exit(1);
    }
}

// Run the service
main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
}); 