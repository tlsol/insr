import { Web3 } from "web3";
import { ethers } from "ethers";
import { config } from 'dotenv';

interface PriceUpdate {
    token: string;
    price: bigint;
    timestamp: number;
    heartbeat: number;
}

interface MultiSigConfig {
    requiredSignatures: number;
    signers: ethers.Signer[];
}

interface RedundancyConfig {
    primaryRPC: string;
    fallbackRPCs: string[];
    healthCheckInterval: number;
}

interface CircuitBreaker {
    maxFailuresPerHour: number;
    maxPriceDeviation: number;
    minUpdateInterval: number;
    emergencyContacts: string[];  // Email/phone
}

interface AuditLog {
    timestamp: number;
    token: string;
    oldPrice: bigint;
    newPrice: bigint;
    signer: string;
    success: boolean;
    error?: string;
}

interface HealthCheck {
    lastUpdate: number;
    failureCount: number;
    latency: number;
    rpcStatus: 'healthy' | 'degraded' | 'down';
}

export class PriceFeeder {
    private flareRPC: string;
    private ftsoV2Address: string;
    private stakingPool: ethers.Contract;
    private signer: ethers.Signer;
    private isRunning: boolean = false;
    private updateIntervals: { [token: string]: NodeJS.Timeout } = {};
    private lastAttempt: { [token: string]: number } = {};
    private failureCount: { [token: string]: number } = {};
    private primaryRPC: string;
    private fallbackRPCs: string[];
    private healthCheckInterval: number;
    private circuitBreaker: CircuitBreaker;
    private db: any; // Assuming a database object
    private metrics: any; // Assuming a metrics object
    private lastUpdateTime: { [token: string]: number } = {};

    constructor(
        stakingPoolAddress: string,
        signer: ethers.Signer,
        config: {
            flareRPC: string,
            ftsoV2Address: string,
            primaryRPC: string,
            fallbackRPCs: string[],
            healthCheckInterval: number,
            circuitBreaker: CircuitBreaker,
        }
    ) {
        this.flareRPC = config.flareRPC;
        this.ftsoV2Address = config.ftsoV2Address;
        this.signer = signer;
        this.primaryRPC = config.primaryRPC;
        this.fallbackRPCs = config.fallbackRPCs;
        this.healthCheckInterval = config.healthCheckInterval;
        this.circuitBreaker = config.circuitBreaker;
        
        // Initialize StakingPool contract
        const stakingPoolABI = [
            "function updatePrice(address token, uint256 price, uint256 timestamp, uint256 heartbeat, bytes signature) external",
            "function markPriceStale(address token) external"
        ];
        this.stakingPool = new ethers.Contract(stakingPoolAddress, stakingPoolABI, signer);
    }

    async startUpdates(tokens: { address: string, feedId: string, heartbeat: number }[]) {
        if (this.isRunning) {
            throw new Error("Price feeder already running");
        }
        
        this.isRunning = true;
        console.log("Starting price updates for tokens:", tokens);

        // Start health monitoring
        setInterval(() => this.monitorHealth(), this.healthCheckInterval);

        for (const token of tokens) {
            // Start individual token update loop
            this.updateIntervals[token.address] = setInterval(
                () => this.updateTokenPrice(token),
                // Update at half the heartbeat to ensure we don't miss deadlines
                token.heartbeat * 500 // Convert to ms and halve
            );
        }
    }

    async stop() {
        this.isRunning = false;
        // Clear all update intervals
        Object.values(this.updateIntervals).forEach(interval => clearInterval(interval));
        this.updateIntervals = {};
        console.log("Price feeder stopped");
    }

    private async updateTokenPrice(token: { address: string, feedId: string, heartbeat: number }) {
        try {
            // Rate limiting check
            if (!await this.enforceRateLimits(token.address)) {
                return;
            }

            this.lastAttempt[token.address] = Date.now();

            // Circuit breaker check
            if (!await this.checkCircuitBreaker(token.address)) {
                return;
            }

            // Get price from Flare with failover
            const price = await this.getFlarePriceWithFailover(token.feedId);
            
            // Validate price
            const oldPrice = await this.stakingPool.getPrice(token.address);
            if (!await this.validatePrice(token.address, price, oldPrice)) {
                throw new Error("Price validation failed");
            }

            // Reset failure count on success
            this.failureCount[token.address] = 0;

            // Sign and update
            const timestamp = Math.floor(Date.now() / 1000);
            const signature = await this.signPriceUpdate({
                token: token.address,
                price,
                timestamp,
                heartbeat: token.heartbeat
            });

            const tx = await this.stakingPool.updatePrice(
                token.address,
                price,
                timestamp,
                token.heartbeat,
                signature
            );
            await tx.wait();

            // Log successful update
            await this.logAudit({
                timestamp,
                token: token.address,
                oldPrice: oldPrice,
                newPrice: price,
                signer: await this.signer.getAddress(),
                success: true
            });

            this.lastUpdateTime[token.address] = Date.now();
            console.log(`Updated price for ${token.address}: ${price}`);

        } catch (error) {
            console.error(`Failed to update price for ${token.address}:`, error);
            
            this.failureCount[token.address] = (this.failureCount[token.address] || 0) + 1;
            
            // Log failure
            await this.logAudit({
                timestamp: Date.now(),
                token: token.address,
                oldPrice: 0n,
                newPrice: 0n,
                signer: await this.signer.getAddress(),
                success: false,
                error: error.message
            });

            // After 3 consecutive failures, mark price as stale
            if (this.failureCount[token.address] >= 3) {
                try {
                    const tx = await this.stakingPool.markPriceStale(token.address);
                    await tx.wait();
                    console.log(`Marked price as stale for ${token.address}`);
                } catch (markError) {
                    console.error(`Failed to mark price as stale for ${token.address}:`, markError);
                }
            }
        }
    }

    private async getFlarePriceWithFailover(feedId: string): Promise<bigint> {
        for (const rpc of [this.primaryRPC, ...this.fallbackRPCs]) {
            try {
                const web3 = new Web3(rpc);
                const ftsoABI = [
                    "function getFeedById(bytes21 _feedId) view returns (uint256, int8, uint64)"
                ];
                
                const ftso = new web3.eth.Contract(JSON.parse(JSON.stringify(ftsoABI)), this.ftsoV2Address);
                
                const [price, decimals] = await ftso.methods.getFeedById(feedId).call();
                
                // Convert to standard 18 decimals
                return BigInt(price) * BigInt(10) ** BigInt(18 - Number(decimals));
            } catch (error) {
                console.error(`RPC ${rpc} failed:`, error);
                continue;
            }
        }
        throw new Error("All RPCs failed");
    }

    private async signPriceUpdate(update: PriceUpdate): Promise<string> {
        const message = ethers.solidityPackedKeccak256(
            ["address", "uint256", "uint256", "uint256"],
            [update.token, update.price, update.timestamp, update.heartbeat]
        );
        
        return await this.signer.signMessage(ethers.getBytes(message));
    }

    private async validatePrice(token: string, newPrice: bigint, oldPrice: bigint): Promise<boolean> {
        // Maximum allowed deviation (e.g., 10%)
        const MAX_DEVIATION = 1000n; // 10% in basis points
        
        if (oldPrice === 0n) return true; // First price update
        
        const deviation = Math.abs(Number(
            ((newPrice - oldPrice) * 10000n) / oldPrice
        ));
        
        if (deviation > Number(MAX_DEVIATION)) {
            console.error(`Price deviation too high for ${token}: ${deviation/100}%`);
            return false;
        }
        
        return true;
    }

    private getHourlyFailures(token: string): number {
        const ONE_HOUR = 60 * 60 * 1000;
        const now = Date.now();
        let count = 0;
        
        // Count failures in the last hour
        for (const attempt of Object.entries(this.lastAttempt)) {
            if (attempt[0] === token && now - attempt[1] <= ONE_HOUR) {
                count++;
            }
        }
        
        return count;
    }

    private getTotalFailures(): number {
        return Object.values(this.failureCount).reduce((a, b) => a + b, 0);
    }

    private async measureRPCLatency(): Promise<number> {
        const start = Date.now();
        try {
            const web3 = new Web3(this.primaryRPC);
            await web3.eth.getBlockNumber();
            return Date.now() - start;
        } catch (error) {
            return -1;
        }
    }

    private async checkRPCStatus(): Promise<'healthy' | 'degraded' | 'down'> {
        const latency = await this.measureRPCLatency();
        if (latency < 0) return 'down';
        if (latency > 1000) return 'degraded'; // More than 1 second
        return 'healthy';
    }

    private async notifyEmergencyContacts(message: string): Promise<void> {
        for (const contact of this.circuitBreaker.emergencyContacts) {
            try {
                // Here you would implement your notification logic
                // This could be email, SMS, webhook, etc.
                console.error(`ALERT to ${contact}: ${message}`);
                
                // Example:
                // await sendEmail(contact, 'Price Feed Alert', message);
                // or
                // await sendSMS(contact, message);
            } catch (error) {
                console.error(`Failed to notify ${contact}:`, error);
            }
        }
    }

    private async logAudit(log: AuditLog): Promise<void> {
        // Log to console
        console.log('Price Update Audit:', log);
        
        // Here you would implement your database logging
        // Example:
        // await this.db.insertAuditLog(log);
        
        // Emit metrics
        // Example:
        // this.metrics.emit('priceUpdate', log);
    }

    private async checkCircuitBreaker(token: string): Promise<boolean> {
        const hourlyFailures = this.getHourlyFailures(token);
        if (hourlyFailures > this.circuitBreaker.maxFailuresPerHour) {
            await this.notifyEmergencyContacts(
                `Circuit breaker triggered for ${token}: Too many failures`
            );
            return false;
        }
        return true;
    }

    private async monitorHealth(): Promise<HealthCheck> {
        // Monitor system health
        const health: HealthCheck = {
            lastUpdate: Date.now(),
            failureCount: this.getTotalFailures(),
            latency: await this.measureRPCLatency(),
            rpcStatus: await this.checkRPCStatus()
        };
        
        if (health.rpcStatus !== 'healthy') {
            await this.notifyEmergencyContacts(
                `RPC Status degraded: ${health.rpcStatus}`
            );
        }
        
        return health;
    }

    private async enforceRateLimits(token: string): Promise<boolean> {
        const MIN_UPDATE_INTERVAL = 5000; // 5 seconds
        const lastUpdate = this.lastUpdateTime[token] || 0;
        
        if (Date.now() - lastUpdate < MIN_UPDATE_INTERVAL) {
            console.warn(`Update rate too high for ${token}`);
            return false;
        }
        return true;
    }
}

// Usage example:
/*
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const feeder = new PriceFeeder(
    STAKING_POOL_ADDRESS,
    wallet,
    {
        flareRPC: "https://flare-api.flare.network/ext/C/rpc",
        ftsoV2Address: "0x1000000000000000000000000000000000000001"
    }
);

await feeder.startUpdates([
    {
        address: USDC_ADDRESS,
        feedId: "0x015553444300000000000000000000000000000000",
        heartbeat: 60
    }
]);
*/ 