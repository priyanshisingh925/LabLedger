import { ethers, network, artifacts } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Deploys LabLedger and writes the address + ABI to ONE place the frontend reads:
 *   frontend/src/config/contract.json
 * (a copy is also written to deployments/<network>.json)
 *
 * Loan policy comes from .env (defaults are SHORT, for a quick local demo):
 *   LOAN_DURATION_SECONDS=120  PENALTY_PERIOD_SECONDS=60  LATE_FEE_BPS=1000
 * For a real lab use something like 604800 (7 days), 86400 (1 day) and 1000 (10% per started day).
 */
async function main() {
  if (network.name !== "localhost" && network.name !== "hardhat") {
    throw new Error(`Refusing to deploy to "${network.name}". LabLedger is configured for local test networks only.`);
  }

  const loanDuration = BigInt(process.env.LOAN_DURATION_SECONDS ?? "120");
  const penaltyPeriod = BigInt(process.env.PENALTY_PERIOD_SECONDS ?? "60");
  const lateFeeBps = BigInt(process.env.LATE_FEE_BPS ?? "1000");

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer (administrator): ${deployer.address}`);
  console.log(`Policy: duration=${loanDuration}s  penaltyPeriod=${penaltyPeriod}s  lateFee=${lateFeeBps} bps per period`);

  const ledger = await ethers.deployContract("LabLedger", [loanDuration, penaltyPeriod, lateFeeBps]);
  await ledger.waitForDeployment();
  const address = await ledger.getAddress();
  const deployTx = ledger.deploymentTransaction();
  const receipt = deployTx ? await deployTx.wait() : null;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const artifact = await artifacts.readArtifact("LabLedger");
  const out = {
    address,
    chainId,
    network: network.name,
    deployBlock: receipt?.blockNumber ?? 0,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    policy: {
      loanDuration: loanDuration.toString(),
      penaltyPeriod: penaltyPeriod.toString(),
      lateFeeBps: lateFeeBps.toString(),
    },
    abi: artifact.abi,
  };

  const frontendCfg = path.join(__dirname, "..", "frontend", "src", "config", "contract.json");
  fs.mkdirSync(path.dirname(frontendCfg), { recursive: true });
  fs.writeFileSync(frontendCfg, JSON.stringify(out, null, 2));

  const depDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(depDir, { recursive: true });
  fs.writeFileSync(path.join(depDir, `${network.name}.json`), JSON.stringify(out, null, 2));

  console.log(`\nLabLedger deployed to ${address} (chain ${chainId}, block ${out.deployBlock})`);
  console.log(`Frontend config written to frontend/src/config/contract.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
