import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const target = process.env.TARGET_STUDENT || "0xbcD33d41017D19228dF21f057edaB21a0D5397D6";
  if (!target || !ethers.isAddress(target)) {
    console.error(`Invalid address: ${target}`);
    process.exit(1);
  }

  const cfgPath = path.join(__dirname, "..", "frontend", "src", "config", "contract.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

  const [admin] = await ethers.getSigners();
  const ledger = await ethers.getContractAt("LabLedger", cfg.address, admin);

  console.log(`Using admin: ${admin.address}`);
  console.log(`Checking authorization for ${target}...`);

  const already = await ledger.isAuthorizedBorrower(target);
  if (!already) {
    console.log(`Authorizing student ${target}...`);
    const tx1 = await ledger.authorizeBorrower(target);
    await tx1.wait();
    console.log(`✓ ${target} is now authorized to borrow equipment!`);
  } else {
    console.log(`✓ ${target} is already authorized.`);
  }

  console.log(`Sending 100 test ETH to ${target}...`);
  const tx2 = await admin.sendTransaction({
    to: target,
    value: ethers.parseEther("100"),
  });
  await tx2.wait();
  console.log(`✓ 100 test ETH sent to ${target}!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
