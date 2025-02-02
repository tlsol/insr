# insr.finance

A decentralized insurance protocol for stablecoin depeg protection, built on Base network. Protect your USDC holdings against depegging events with our automated claims system.

Fully decentralized, zero trust, P2P.
Fully functional - buy insurance, stake, make claims on depegs, etc.


Provide stake and earn premiums from insurance policies, all while farming yield on your own assets.

## Features

- 🛡️ Purchase stablecoin depeg insurance
  - Flexible coverage amounts
  - Multiple duration options (1 month, 3 months, 1 year)
  - Automated premium calculation
  - Real-time price feeds via Pyth Network

- 💰 Stake assets to become an insurer
  - Earn premiums from insurance policies
  - Automated premium distribution
  - Risk-adjusted returns

- 📊 Advanced Dashboard
  - Track active policies
  - Monitor TVL and protocol stats
  - View recent transactions
  - Real-time policy status updates

## Tech Stack

- **Frontend**
  - Next.js 14 with App Router
  - TypeScript
  - TailwindCSS
  - RainbowKit + wagmi for wallet connection
  - Ethers.js v6

- **Blockchain**
  - Deployed on Base Network
  - Pyth Network price feeds
  - USDC integration

## Contract Addresses (Base Mainnet)

- Insurance Pool: `0xE33870D156eB4fFcF97f12d1480fb690eb8f80Bb`
- Staking Pool: `0xDd7E92ED2eF713A489bd1DDeEB18EbE7875f6d97`
- Claims Manager: `0x1b2eaf8CF9debA81b91A55FE004792175494Cdf6`
- Premium Calculator: `0x78864Cd0B032948817F41C45c162Bc4C7c13B768`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## Local Development

1. Clone the repository:
```bash
git clone https://github.com/yourusername/insr.finance.git
cd insr.finance
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Run development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Architecture

- **Smart Contracts**: Modular design with separate pools for insurance and staking
- **Price Feeds**: Real-time USDC/USD price data from Pyth Network
- **Claims Processing**: Automated verification and processing
- **Premium Calculation**: Risk-based dynamic pricing model

## Security

- Contracts audited by [Auditor Name]
- Timelock on admin functions
- Emergency pause functionality
- Multi-sig admin controls

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Contact

- Website: [insr.finance](https://insr.finance)

## Acknowledgments

- Base Network team
- Pyth Network team
- OpenZeppelin for smart contract libraries
