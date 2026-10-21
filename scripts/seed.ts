import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Registers the demo equipment and authorizes demo student wallets.
 * Run AFTER deploy.ts:  npm run seed
 *
 * Students default to Hardhat accounts #1 (Alice) and #2 (Bob). Account #3 (Carol) is deliberately NOT
 * authorized, so you can demonstrate the "unauthorized wallet" rejection.
 * Override with STUDENT_ADDRESSES=0x..,0x.. in .env if you want other wallets.
 */
const EQUIPMENT = [
  { id: 1, name: "Oscilloscope", category: "Instruments", description: "100 MHz 4-channel digital oscilloscope", deposit: "0.05" },
  { id: 2, name: "Raspberry Pi 4", category: "Computing", description: "Raspberry Pi 4 Model B, 4 GB, with PSU", deposit: "0.02" },
  { id: 3, name: "FPGA Development Board", category: "Computing", description: "Xilinx Artix-7 FPGA dev board", deposit: "0.08" },
  { id: 4, name: "Sensor Kit", category: "Electronics", description: "37-in-1 sensor and electronics kit", deposit: "0.01" },
];

async function main() {
  const cfgPath = path.join(__dirname, "..", "frontend", "src", "config", "contract.json");
  if (!fs.existsSync(cfgPath)) throw new Error("No deployment found. Run `npm run deploy` first.");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

  const signers = await ethers.getSigners();
  const admin = signers[0];
  const ledger = await ethers.getContractAt("LabLedger", cfg.address, admin);

  if (!(await ledger.isAdmin(admin.address))) throw new Error("Signer #0 is not the administrator of this deployment.");
  console.log(`Using LabLedger at ${cfg.address} on ${network.name} as admin ${admin.address}\n`);

  for (const item of EQUIPMENT) {
    const existing = await ledger.getAllEquipment();
    if (existing.some((e) => Number(e.id) === item.id)) {
      console.log(`  equipment #${item.id} ${item.name} already registered - skipped`);
      continue;
    }
    const tx = await ledger.registerEquipment(item.id, item.name, item.category, item.description, ethers.parseEther(item.deposit));
    await tx.wait();
    console.log(`  registered #${item.id} ${item.name} (deposit ${item.deposit} ETH)`);
  }

  const students = process.env.STUDENT_ADDRESSES
    ? process.env.STUDENT_ADDRESSES.split(",").map((s) => s.trim()).filter(Boolean)
    : [signers[1].address, signers[2].address, "0xbcD33d41017D19228dF21f057edaB21a0D5397D6"];

  console.log("");
  for (const addr of students) {
    if (await ledger.isAuthorizedBorrower(addr)) {
      console.log(`  ${addr} already authorized - skipped`);
    } else {
      await (await ledger.authorizeBorrower(addr)).wait();
      console.log(`  authorized student ${addr}`);
    }

    // Fund student wallet with test ETH if needed
    const bal = await ethers.provider.getBalance(addr);
    if (bal < ethers.parseEther("1")) {
      const fundTx = await admin.sendTransaction({
        to: addr,
        value: ethers.parseEther("100"),
      });
      await fundTx.wait();
      console.log(`  funded ${addr} with 100 test ETH`);
    }
  }

  console.log("\nSeed complete.");
  console.log("Demo accounts (Hardhat node, TEST ONLY):");
  console.log(`  Admin   #0 ${signers[0].address}`);
  console.log(`  Alice   #1 ${signers[1].address}  (authorized student)`);
  console.log(`  Bob     #2 ${signers[2].address}  (authorized student)`);
  console.log(`  Carol   #3 ${signers[3].address}  (NOT authorized - use to show rejection)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
