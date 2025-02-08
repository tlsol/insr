import Web3 from 'web3';
import { ethers } from 'ethers';

export class PriceFeedService {
    private flareRPC: string;
    private bandContract: string;
    private ftsoV2Address: string;
    private ftsoABI: any; // We'll import the ABI

    constructor() {
        this.flareRPC = "https://flare-api.flare.network/ext/C/rpc";
        this.bandContract = "0xDA7a001b254CD22e46d3eAB04d937489c93174C3"; // BSC Band
        this.ftsoV2Address = "0x1000000000000000000000000000000000000001"; // Flare mainnet
    }

    async getUSDCPrice(): Promise<{price: number, timestamp: number}> {
        try {
            // Try Flare first
            const flarePrice = await this.getFlarePrice(
                "0x015553444300000000000000000000000000000000" // USDC feed ID
            );
            return flarePrice;
        } catch (error) {
            console.log("Flare feed failed, using Band Protocol fallback");
            // Fallback to Band Protocol
            return this.getBandPrice();
        }
    }

    private async getFlarePrice(feedId: string) {
        const web3 = new Web3(this.flareRPC);
        const ftso = new web3.eth.Contract(this.ftsoABI, this.ftsoV2Address);
        
        const result = await ftso.methods.getFeedById(feedId).call();
        return {
            price: Number(result[0]) / (10 ** Number(result[1])),
            timestamp: Number(result[2])
        };
    }

    private async getBandPrice() {
        // Band Protocol fallback implementation
        // ... implementation here
    }
} 