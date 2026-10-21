import { network } from "hardhat";

/**
 * Moves the local Hardhat blockchain clock forward so overdue behaviour can be shown without waiting.
 *   npm run advance-time                 -> +180 seconds
 *   SECONDS=600 npm run advance-time     -> +600 seconds
 * Works only on a local development node.
 */
async function main() {
  if (network.name !== "localhost" && network.name !== "hardhat") {
    throw new Error("advance-time only works on a local Hardhat node.");
  }
  const seconds = Number(process.env.SECONDS ?? "180");
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("SECONDS must be a positive number");

  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
  const block = await network.provider.send("eth_getBlockByNumber", ["latest", false]);
  const ts = parseInt(block.timestamp, 16);
  console.log(`Advanced chain time by ${seconds}s. Latest block ${parseInt(block.number, 16)} timestamp: ${new Date(ts * 1000).toISOString()}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
