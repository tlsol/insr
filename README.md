# insr.finance

A decentralized insurance protocol for stablecoin depeg protection, built on BSC network. Protect your USDC holdings against depegging events with our automated claims system and earn yield through Venus Protocol integration.

## Features

- 🛡️ Purchase stablecoin depeg insurance
  - Flexible coverage amounts (100-50,000 USDC)
  - Multiple duration options
  - Automated premium calculation
  - Real-time price feeds via Flare FTSO

- 💰 Stake assets to become an insurer
  - Earn premiums from insurance policies
  - Automated premium distribution
  - Risk-adjusted returns
  - Earn additional yield through Venus Protocol

- 🤖 Automated Claims Processing
  - Real-time price monitoring via Flare FTSO
  - Instant payouts on depeg events
  - Transparent verification process
  - Blacklist protection against exploits

## Tech Stack

- **Smart Contracts**
  - Solidity
  - Hardhat
  - Venus Protocol Integration
  - Flare FTSO Integration
  - Comprehensive test suite (100+ tests)

- **Frontend**
  - Next.js 14 with App Router
  - TypeScript
  - TailwindCSS
  - RainbowKit + wagmi for wallet connection
  - Ethers.js v6

- **Infrastructure**
  - Deployed on BSC Network
  - Venus Protocol for yield generation
  - Flare FTSO for price feeds
  - USDC as base currency

## Contract Addresses (BSC Mainnet)

- Insurance Pool: `0x9F1F6C30bF3060f23D9768e9325DCa3D70daA769`
- Staking Pool: `0x3681B912bF0861c52aEeC26a8b8d03938734f8b5`
- Claims Manager: `0xb6bD350d390303f14CE8b429bE3Eb59162a0dc79`
- Premium Calculator: `0xb7919719381647b3bBC724F13b46873f25102422`
- USDC: `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`

## Development

### Prerequisites
- Node.js 18+
- npm/yarn
- BSC RPC URL
- Venus Protocol knowledge
- Flare FTSO understanding

### Testing
The project includes a comprehensive test suite covering all aspects of the protocol:

## Local Development

1. Clone the repository:
```
bash

git clone https://github.com/tlsol/insr

cd insr

npm install
``` 

2. Set up your environment variables:
```
cp .env.example .env
```

Required environment variables:
- `BSC_RPC_URL`
- `VENUS_ORACLE_URL`
- `FLARE_RPC_URL`
- `FLARE_FTSO_ADDRESS`

3. Run tests:
```
npx hardhat test
```

4. Deploy contracts:  
```
npx hardhat run scripts/deploy-bsc.ts --network bsc
```

5. Start the frontend:
```
cd insurance-frontend 
npm run dev
```

## Architecture

- **Smart Contracts**: 
  - Modular design with separate pools
  - Venus Protocol integration for yield
  - Flare FTSO integration for price feeds
  - Automated claims verification
  - Emergency controls and circuit breakers

- **Claims Processing**: 
  - Real-time price monitoring via Flare FTSO
  - Automated verification
  - Instant payouts
  - Anti-exploit protections

- **Premium Calculation**: 
  - Risk-based dynamic pricing
  - Coverage amount scaling
  - Market conditions adjustment
  - Historical FTSO data integration

## Security

- Comprehensive test coverage
- Emergency pause functionality
- Blacklist system for suspicious addresses
- Rate limiting on claims
- Venus Protocol integration safety checks
- Flare FTSO price feed validation
- Multi-sig admin controls

## License

[MIT](https://choosealicense.com/licenses/mit/)