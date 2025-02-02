# insr.finance

A decentralized insurance protocol frontend for stablecoin depeg protection, built on Base.

## Features

- 🛡️ Purchase stablecoin depeg insurance
- 💰 Stake assets to become an insurer
- 📊 Track active policies and claims
- 🔄 Real-time price feeds via Pyth Network
- 🏦 USDC integration

## Tech Stack

- Next.js 14 with App Router
- TypeScript
- TailwindCSS
- RainbowKit + wagmi for wallet connection
- Ethers.js v6 for blockchain interaction
- Deployed on Base Network

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
```

3. Run development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Contract Addresses (Base Mainnet)

- Insurance Pool: `TBD`
- Staking Pool: `TBD`
- Claims Manager: `TBD`
- Premium Calculator: `TBD`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)
