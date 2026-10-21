import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Optional scripted version of the demo (so the Blockchain Activity page has events to show).
 * Run after deploy + seed:   npx hardhat run scripts/demo-flow.ts --network localhost
 *
 *  1. Alice borrows the Oscilloscope
 *  2. Carol (unauthorized) and Bob (item taken) are rejected
 *  3. Alice requests the return, admin confirms, refund is claimed
 *  4. Bob borrows the Raspberry Pi, does not return it, the clock is advanced, admin escalates
 */
async function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "frontend", "src", "config", "contract.json"), "utf8"));
  const [admin, alice, bob, carol] = await ethers.getSigners();
  const ledger = await ethers.getContractAt("LabLedger", cfg.address, admin);
  const scope = await ledger.getEquipment(1);
  const pi = await ledger.getEquipment(2);

  console.log("1. Alice borrows the Oscilloscope");
  await (await ledger.connect(alice).borrowEquipment(1, { value: scope.deposit })).wait();
  const loanId = await ledger.loanCount();

  console.log("2. Rejections:");
  for (const [who, name] of [[carol, "Carol (unauthorized)"], [bob, "Bob (already borrowed)"]] as const) {
    try {
      await ledger.connect(who).borrowEquipment(1, { value: scope.deposit });
    } catch (e: any) {
      console.log(`   ${name}: rejected - ${e.revert?.name ?? e.shortMessage ?? e.message}`);
    }
  }

  console.log("3. Alice requests return, admin confirms physical receipt, Alice claims refund");
  await (await ledger.connect(alice).requestReturn(loanId)).wait();
  await (await ledger.confirmReturn(loanId)).wait();
  await (await ledger.connect(alice).claimRefund()).wait();

  console.log("4. Bob borrows the Raspberry Pi and keeps it past the deadline");
  await (await ledger.connect(bob).borrowEquipment(2, { value: pi.deposit })).wait();
  const overdueLoan = await ledger.loanCount();
  const secs = Number(process.env.SECONDS ?? "200");
  await network.provider.send("evm_increaseTime", [secs]);
  await network.provider.send("evm_mine");
  console.log(`   isOverdue(${overdueLoan}) = ${await ledger.isOverdue(overdueLoan)}`);
  await (await ledger.escalateOverdue(overdueLoan, 1)).wait();
  console.log("   escalated to level 1");
  console.log("\nDone. Open the Blockchain Activity page to see the events.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
