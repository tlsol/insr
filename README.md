# insr.finance
## built by [@tlsol](https://github.com/tlsol) during the [2025 ethoxford](https://ethoxford.io/) hackathon!!  
thanku homedao && josh for the invite & opportunity to build something with the community!  
solo submission, no team, because why not?  

this is a defi insurance protocol that's here to protect your bags when stablecoins decide to go unstable 😱
built on BSC, it lets you protect against depeg events. plus, you can earn some sweet yield through Venus Protocol while you're at it!

## what's cool about it? 🚀

- 🛡️ cheap, cheap depeg insurance
  - almost any amount (100-50k USDC)
  - pick how long you want coverage
  - premiums calculated automagically
  - real-time price tracking via Flare FTSO

- 💰 become an insurer LP & stack that bread
  - earn premiums from policies
  - auto premium distribution
  - risk-adjusted returns (fancy way of saying smart yields)
  - extra yield through Venus Protocol? yes please!

- 🤖 claims? we got you covered
  - real-time price watching via Flare FTSO
  - instant payouts when stuff goes south
  - transparent af verification
  - blacklist to keep the bad guys out

## tech stack for the nerds 🤓

- **smart contracts**
  - Solidity (the good stuff)
  - Hardhat (testing? we got 100+ of em!)
  - Venus Protocol integration (for that sweet yield)
  - Flare FTSO integration (keeping it real with price feeds)

- **frontend**
  - Next.js 14 with App Router (bleeding edge, baby!)
  - TypeScript (because we're responsible adults)
  - TailwindCSS (looking fresh)
  - RainbowKit + wagmi (wallet connect made easy)
  - Ethers.js v6 (the latest and greatest)

## where to find us on BSC 📍 we are 100% live and running!

- Insurance Pool: `0x9F1F6C30bF3060f23D9768e9325DCa3D70daA769`
- Staking Pool: `0x3681B912bF0861c52aEeC26a8b8d03938734f8b5`
- Claims Manager: `0xb6bD350d390303f14CE8b429bE3Eb59162a0dc79`
- Premium Calculator: `0xb7919719381647b3bBC724F13b46873f25102422`
- USDC: `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`

## wanna run it locally? 🏃‍♂️

### you'll need
- Node.js 18+ (we're not cavemen)
- npm/yarn (dealer's choice)
- BSC RPC URL
- Venus Protocol knowledge
- Flare FTSO understanding

### testing
i included a comprehensive test suite covering all aspects of the protocol:

## local development

1. clone the repo:
```
bash

git clone https://github.com/tlsol/insr

cd insr

npm install
``` 

2. set up your environment variables:
```
cp .env.example .env
```

REQUIRED environment variables:
- `BSC_RPC_URL`
- `VENUS_ORACLE_URL`
- `FLARE_RPC_URL`
- `FLARE_FTSO_ADDRESS`

3. run some tests:
```
npx hardhat test
```

4. deploy contracts:  
```
npx hardhat run scripts/deploy-bsc.ts --network bsc
```

5. start the frontend:
```
cd insurance-frontend 
npm run dev
```

## architecture details

- **smart contracts**: 
  - modular design with separate pools
  - venus protocol integration for yield
  - flare fts integration for price feeds
  - automated claims verification
  - emergency controls and circuit breakers

- **claims processing**: 
  - real-time price monitoring via flare fts
  - automated verification
  - instant payouts
  - anti-exploit protections

- **premium calcs**: 
  - risk-based dynamic pricing
  - coverage amount scaling
  - market conditions adjustment
  - historical fts data integration

## security

- comprehensive test coverage
- emergency pause functionality
- blacklist system for suspicious addresses
- rate limiting on claims
- venus protocol integration safety checks
- flare FTSO price feed validation

## License

[MIT](https://choosealicense.com/licenses/mit/)