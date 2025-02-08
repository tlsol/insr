require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0000000000000000000000000000000000000000000000000000000000000000";
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "paris" // Specific for BSC compatibility
    }
  },
  networks: {
    bsc: {
      url: "https://bsc-dataseed1.binance.org",
      chainId: 56,
      accounts: [PRIVATE_KEY],
      gasPrice: 3000000000, // 3 gwei
      timeout: 20000, // 20 seconds
      verify: {
        etherscan: {
          apiKey: BSCSCAN_API_KEY
        }
      }
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: [PRIVATE_KEY],
      gasPrice: 10000000000, // 10 gwei
      timeout: 20000,
      verify: {
        etherscan: {
          apiKey: BSCSCAN_API_KEY
        }
      }
    }
  },
  etherscan: {
    apiKey: {
      bsc: BSCSCAN_API_KEY,
      bscTestnet: BSCSCAN_API_KEY
    },
    customChains: [
      {
        network: "bsc",
        chainId: 56,
        urls: {
          apiURL: "https://api.bscscan.com/api",
          browserURL: "https://bscscan.com"
        }
      },
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com"
        }
      }
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 40000 // 40 seconds
  }
}; 