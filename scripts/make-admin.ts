import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const target = process.env.TARGET_ADMIN || "0xbcD33d41017D19228dF21f057edaB21a0D5397D6";
  const cfgPath = path.join(__dirname, "..", "frontend", "src", "config", "contract.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

  const [deployer] = await ethers.getSigners();
  const ledger = await ethers.getContractAt("LabLedger", cfg.address, deployer);

  const DEFAULT_ADMIN_ROLE = await ledger.DEFAULT_ADMIN_ROLE();
  console.log(`Granting DEFAULT_ADMIN_ROLE to ${target}...`);
  const tx = await ledger.grantRole(DEFAULT_ADMIN_ROLE, target);
  await tx.wait();

  const isNowAdmin = await ledger.isAdmin(target);
  console.log(`✓ Is ${target} administrator? ${isNowAdmin}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
