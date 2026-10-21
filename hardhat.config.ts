import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// OPTIONAL: compile with the bundled solc-js (npm package "solc") instead of downloading the native
// compiler. Only needed on machines that can not reach binaries.soliditylang.org (offline / firewalled).
// Usage:  USE_SOLCJS=1 npx hardhat compile   (normal setups do NOT need this)
if (process.env.USE_SOLCJS === "1") {
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
    if (args.solcVersion === "0.8.28") {
      return {
        compilerPath: require.resolve("solc/soljson.js"),
        isSolcJs: true,
        version: args.solcVersion,
        longVersion: "0.8.28+commit.7893614a.Emscripten.clang",
      };
    }
    return runSuper();
  });
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    // In-process network used by `npm test`
    hardhat: { chainId: 31337 },
    // Long-running node started with `npm run node`
    localhost: { url: process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545", chainId: 31337 },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: { outDir: "typechain-types", target: "ethers-v6" },
};

export default config;
