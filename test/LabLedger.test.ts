import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const eth = (v: string) => ethers.parseEther(v);

// Test policy: 1 hour loans, 10 minute late-fee periods, 10% of deposit per started period.
const LOAN_DURATION = 3600n;
const PENALTY_PERIOD = 600n;
const LATE_FEE_BPS = 1000n;

const SCOPE = 1n; // 0.05 ETH
const PI = 2n; // 0.02 ETH
const FPGA = 3n; // 0.08 ETH
const SENSOR = 4n; // 0.01 ETH

const Status = { Available: 0n, Borrowed: 1n, Unavailable: 2n, Retired: 3n };
const LoanStatus = { Active: 0n, ReturnRequested: 1n, Completed: 2n };

async function deployFixture() {
  const [admin, alice, bob, carol, outsider] = await ethers.getSigners();
  const ledger = await ethers.deployContract("LabLedger", [LOAN_DURATION, PENALTY_PERIOD, LATE_FEE_BPS]);
  await ledger.waitForDeployment();

  await ledger.registerEquipment(SCOPE, "Oscilloscope", "Instruments", "100 MHz 4-channel", eth("0.05"));
  await ledger.registerEquipment(PI, "Raspberry Pi 4", "Computing", "4 GB board", eth("0.02"));
  await ledger.registerEquipment(FPGA, "FPGA board", "Computing", "Artix-7 dev board", eth("0.08"));
  await ledger.registerEquipment(SENSOR, "Sensor kit", "Electronics", "37 sensor kit", eth("0.01"));

  await ledger.authorizeBorrower(alice.address);
  await ledger.authorizeBorrower(bob.address);

  return { ledger, admin, alice, bob, carol, outsider };
}

/** alice has borrowed the oscilloscope (loan #1) */
async function borrowedFixture() {
  const base = await deployFixture();
  await base.ledger.connect(base.alice).borrowEquipment(SCOPE, { value: eth("0.05") });
  const loan = await base.ledger.getLoan(1);
  return { ...base, loan };
}

/** accounting invariant: the contract always holds at least everything it owes */
async function expectSolvent(ledger: Awaited<ReturnType<typeof deployFixture>>["ledger"]) {
  const bal = await ethers.provider.getBalance(await ledger.getAddress());
  const owed =
    (await ledger.totalActiveDeposits()) + (await ledger.totalPendingRefunds()) + (await ledger.treasuryBalance());
  expect(bal).to.be.gte(owed);
  expect(bal).to.equal(owed); // no forced ETH in these tests, so it must match exactly
}

describe("LabLedger", () => {
  describe("deployment & policy", () => {
    it("makes the deployer the administrator and stores the policy", async () => {
      const { ledger, admin, alice } = await loadFixture(deployFixture);
      expect(await ledger.isAdmin(admin.address)).to.equal(true);
      expect(await ledger.isAdmin(alice.address)).to.equal(false);
      expect(await ledger.loanDuration()).to.equal(LOAN_DURATION);
      expect(await ledger.penaltyPeriod()).to.equal(PENALTY_PERIOD);
      expect(await ledger.lateFeeBps()).to.equal(LATE_FEE_BPS);
    });

    it("rejects invalid policies and non-admin policy changes", async () => {
      const { ledger, alice } = await loadFixture(deployFixture);
      await expect(ledger.setPolicy(0, 60, 1000)).to.be.revertedWithCustomError(ledger, "InvalidPolicy");
      await expect(ledger.setPolicy(60, 0, 1000)).to.be.revertedWithCustomError(ledger, "InvalidPolicy");
      await expect(ledger.setPolicy(60, 60, 10001)).to.be.revertedWithCustomError(ledger, "InvalidPolicy");
      await expect(ledger.connect(alice).setPolicy(60, 60, 1000)).to.be.revertedWithCustomError(
        ledger,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("rejects plain ETH transfers", async () => {
      const { ledger, alice } = await loadFixture(deployFixture);
      await expect(alice.sendTransaction({ to: await ledger.getAddress(), value: 1n })).to.be.reverted;
    });
  });

  describe("1-2. equipment registry", () => {
    it("1. administrator can register equipment", async () => {
      const { ledger, admin } = await loadFixture(deployFixture);
      await expect(ledger.registerEquipment(10, "Camera", "Imaging", "DSLR", eth("0.03")))
        .to.emit(ledger, "EquipmentRegistered")
        .withArgs(10, "Camera", "Imaging", eth("0.03"), admin.address);
      const e = await ledger.getEquipment(10);
      expect(e.name).to.equal("Camera");
      expect(e.deposit).to.equal(eth("0.03"));
      expect(e.status).to.equal(Status.Available);
      expect(await ledger.equipmentCount()).to.equal(5);
      expect((await ledger.getAllEquipment()).length).to.equal(5);
    });

    it("2. non-administrator cannot register equipment", async () => {
      const { ledger, alice } = await loadFixture(deployFixture);
      await expect(
        ledger.connect(alice).registerEquipment(10, "Camera", "Imaging", "DSLR", eth("0.03"))
      ).to.be.revertedWithCustomError(ledger, "AccessControlUnauthorizedAccount");
    });

    it("prevents duplicate IDs, empty names and zero deposits", async () => {
      const { ledger } = await loadFixture(deployFixture);
      await expect(ledger.registerEquipment(SCOPE, "Dup", "x", "x", eth("0.01")))
        .to.be.revertedWithCustomError(ledger, "EquipmentAlreadyExists")
        .withArgs(SCOPE);
      await expect(ledger.registerEquipment(20, "", "x", "x", eth("0.01"))).to.be.revertedWithCustomError(ledger, "EmptyName");
      await expect(ledger.registerEquipment(20, "n", "x", "x", 0)).to.be.revertedWithCustomError(ledger, "ZeroDeposit");
    });
  });

  describe("3. authorization", () => {
    it("3. administrator can authorize (and revoke) a student", async () => {
      const { ledger, admin, carol } = await loadFixture(deployFixture);
      await expect(ledger.authorizeBorrower(carol.address))
        .to.emit(ledger, "BorrowerAuthorized")
        .withArgs(carol.address, admin.address);
      expect(await ledger.isAuthorizedBorrower(carol.address)).to.equal(true);
      await expect(ledger.authorizeBorrower(carol.address)).to.be.revertedWithCustomError(ledger, "AlreadyAuthorized");

      await expect(ledger.revokeBorrower(carol.address))
        .to.emit(ledger, "BorrowerRevoked")
        .withArgs(carol.address, admin.address);
      expect(await ledger.isAuthorizedBorrower(carol.address)).to.equal(false);
      await expect(ledger.revokeBorrower(carol.address)).to.be.revertedWithCustomError(ledger, "NotCurrentlyAuthorized");
    });

    it("only the administrator can authorize or revoke", async () => {
      const { ledger, alice, carol } = await loadFixture(deployFixture);
      await expect(ledger.connect(alice).authorizeBorrower(carol.address)).to.be.revertedWithCustomError(
        ledger,
        "AccessControlUnauthorizedAccount"
      );
      await expect(ledger.connect(alice).revokeBorrower(alice.address)).to.be.revertedWithCustomError(
        ledger,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("lists only currently authorized borrowers", async () => {
      const { ledger, alice, bob } = await loadFixture(deployFixture);
      await ledger.revokeBorrower(alice.address);
      expect(await ledger.getAuthorizedBorrowers()).to.deep.equal([bob.address]);
    });
  });

  describe("4-8. checkout", () => {
    it("4. unauthorized wallet cannot borrow", async () => {
      const { ledger, outsider } = await loadFixture(deployFixture);
      await expect(ledger.connect(outsider).borrowEquipment(SCOPE, { value: eth("0.05") }))
        .to.be.revertedWithCustomError(ledger, "NotAuthorizedBorrower")
        .withArgs(outsider.address);
    });

    it("5. authorized student can borrow with the exact deposit", async () => {
      const { ledger, alice } = await loadFixture(deployFixture);
      const tx = await ledger.connect(alice).borrowEquipment(SCOPE, { value: eth("0.05") });
      await expect(tx).to.emit(ledger, "EquipmentBorrowed");
      await expect(tx).to.changeEtherBalance(alice, -eth("0.05"));

      const loan = await ledger.getLoan(1);
      expect(loan.borrower).to.equal(alice.address);
      expect(loan.equipmentId).to.equal(SCOPE);
      expect(loan.deposit).to.equal(eth("0.05"));
      expect(loan.dueAt - loan.checkedOutAt).to.equal(LOAN_DURATION);
      expect(loan.status).to.equal(LoanStatus.Active);
      expect((await ledger.getEquipment(SCOPE)).status).to.equal(Status.Borrowed);
      expect(await ledger.activeLoanOf(SCOPE)).to.equal(1);
      expect(await ledger.totalActiveDeposits()).to.equal(eth("0.05"));
      await expectSolvent(ledger);
    });

    it("6. incorrect deposit is rejected (too low and too high)", async () => {
      const { ledger, alice } = await loadFixture(deployFixture);
      await expect(ledger.connect(alice).borrowEquipment(SCOPE, { value: eth("0.04") }))
        .to.be.revertedWithCustomError(ledger, "IncorrectDeposit")
        .withArgs(eth("0.05"), eth("0.04"));
      await expect(ledger.connect(alice).borrowEquipment(SCOPE, { value: eth("0.06") })).to.be.revertedWithCustomError(
        ledger,
        "IncorrectDeposit"
      );
      await expect(ledger.connect(alice).borrowEquipment(SCOPE)).to.be.revertedWithCustomError(ledger, "IncorrectDeposit");
    });

    it("7. unavailable equipment cannot be borrowed", async () => {
      const { ledger, alice } = await loadFixture(deployFixture);
      await ledger.setEquipmentStatus(PI, Status.Unavailable);
      await expect(ledger.connect(alice).borrowEquipment(PI, { value: eth("0.02") }))
        .to.be.revertedWithCustomError(ledger, "EquipmentNotAvailable")
        .withArgs(PI, Status.Unavailable);
      await expect(ledger.connect(alice).borrowEquipment(999, { value: 1 })).to.be.revertedWithCustomError(
        ledger,
        "EquipmentNotFound"
      );
    });

    it("8. two students cannot borrow the same item simultaneously", async () => {
      const { ledger, bob } = await loadFixture(borrowedFixture);
      await expect(ledger.connect(bob).borrowEquipment(SCOPE, { value: eth("0.05") }))
        .to.be.revertedWithCustomError(ledger, "EquipmentNotAvailable")
        .withArgs(SCOPE, Status.Borrowed);
      expect(await ledger.loanCount()).to.equal(1);
    });
  });

  describe("9-12. return workflow, refunds and penalties", () => {
    it("9. borrower can request a return; others cannot", async () => {
      const { ledger, alice, bob } = await loadFixture(borrowedFixture);
      await expect(ledger.connect(bob).requestReturn(1))
        .to.be.revertedWithCustomError(ledger, "NotLoanBorrower")
        .withArgs(1, bob.address);
      await expect(ledger.connect(alice).requestReturn(1)).to.emit(ledger, "ReturnRequested");
      const loan = await ledger.getLoan(1);
      expect(loan.status).to.equal(LoanStatus.ReturnRequested);
      expect(loan.returnRequestedAt).to.be.gt(0);
      // a request alone moves no money
      expect(await ledger.pendingRefunds(alice.address)).to.equal(0);
      expect(await ledger.totalActiveDeposits()).to.equal(eth("0.05"));
      // can not request twice
      await expect(ledger.connect(alice).requestReturn(1)).to.be.revertedWithCustomError(ledger, "InvalidLoanState");
      await expect(ledger.connect(alice).requestReturn(77)).to.be.revertedWithCustomError(ledger, "LoanNotFound");
    });

    it("10. only the administrator can confirm physical receipt", async () => {
      const { ledger, alice, bob } = await loadFixture(borrowedFixture);
      await ledger.connect(alice).requestReturn(1);
      await expect(ledger.connect(alice).confirmReturn(1)).to.be.revertedWithCustomError(
        ledger,
        "AccessControlUnauthorizedAccount"
      );
      await expect(ledger.connect(bob).confirmReturn(1)).to.be.revertedWithCustomError(
        ledger,
        "AccessControlUnauthorizedAccount"
      );
      await expect(ledger.confirmReturn(1)).to.emit(ledger, "EquipmentReturned");
      await expect(ledger.confirmReturn(1)).to.be.revertedWithCustomError(ledger, "InvalidLoanState");
    });

    it("admin can reject a return request when nothing was handed over", async () => {
      const { ledger, alice } = await loadFixture(borrowedFixture);
      await ledger.connect(alice).requestReturn(1);
      await expect(ledger.rejectReturn(1)).to.emit(ledger, "ReturnRejected");
      const loan = await ledger.getLoan(1);
      expect(loan.status).to.equal(LoanStatus.Active);
      expect(loan.returnRequestedAt).to.equal(0);
      await expect(ledger.rejectReturn(1)).to.be.revertedWithCustomError(ledger, "InvalidLoanState");
      // the student may request again
      await ledger.connect(alice).requestReturn(1);
    });

    it("11. on-time return refunds the full deposit", async () => {
      const { ledger, alice } = await loadFixture(borrowedFixture);
      await ledger.connect(alice).requestReturn(1);
      await expect(ledger.confirmReturn(1))
        .to.emit(ledger, "EquipmentReturned")
        .withArgs(1, SCOPE, alice.address, anyUint, false, eth("0.05"), 0);

      expect(await ledger.pendingRefunds(alice.address)).to.equal(eth("0.05"));
      expect(await ledger.treasuryBalance()).to.equal(0);
      expect(await ledger.totalActiveDeposits()).to.equal(0);
      expect((await ledger.getEquipment(SCOPE)).status).to.equal(Status.Available);
      expect(await ledger.activeLoanOf(SCOPE)).to.equal(0);
      await expectSolvent(ledger);

      await expect(ledger.connect(alice).claimRefund()).to.changeEtherBalances(
        [alice, ledger],
        [eth("0.05"), -eth("0.05")]
      );
      expect(await ledger.pendingRefunds(alice.address)).to.equal(0);
      await expectSolvent(ledger);
    });

    it("12. late return calculates the correct penalty (and the item can be borrowed again)", async () => {
      const { ledger, alice, bob, loan } = await loadFixture(borrowedFixture);
      // 100 seconds late -> 1 started period -> 10% of 0.05 ETH = 0.005 ETH
      await time.setNextBlockTimestamp(loan.dueAt + 100n);
      await ledger.connect(alice).requestReturn(1);
      expect(await ledger.isOverdue(1)).to.equal(true);

      const [late, lateSeconds, penaltyPreview, refundPreview] = await ledger.previewSettlement(1);
      expect(late).to.equal(true);
      expect(lateSeconds).to.equal(100);
      expect(penaltyPreview).to.equal(eth("0.005"));
      expect(refundPreview).to.equal(eth("0.045"));

      await expect(ledger.confirmReturn(1))
        .to.emit(ledger, "EquipmentReturned")
        .withArgs(1, SCOPE, alice.address, anyUint, true, eth("0.045"), eth("0.005"));
      expect(await ledger.pendingRefunds(alice.address)).to.equal(eth("0.045"));
      expect(await ledger.treasuryBalance()).to.equal(eth("0.005"));
      await expectSolvent(ledger);

      // someone else can now borrow it
      await ledger.connect(bob).borrowEquipment(SCOPE, { value: eth("0.05") });
    });

    it("charges per started period, uses the request time (not the admin's delay) and caps at the deposit", async () => {
      const { ledger, alice, loan } = await loadFixture(borrowedFixture);
      // 601 s late -> 2 started periods -> 20% = 0.01 ETH
      await time.setNextBlockTimestamp(loan.dueAt + 601n);
      await ledger.connect(alice).requestReturn(1);
      // admin takes a whole week to confirm: must not change the penalty
      await time.increase(7 * 24 * 3600);
      await ledger.confirmReturn(1);
      expect((await ledger.getLoan(1)).penalty).to.equal(eth("0.01"));

      // a second loan that is extremely late -> penalty capped at the deposit, refund 0
      await ledger.connect(alice).borrowEquipment(PI, { value: eth("0.02") });
      const loan2 = await ledger.getLoan(2);
      await time.increaseTo(loan2.dueAt + 30n * 24n * 3600n);
      await ledger.confirmReturn(2);
      const done = await ledger.getLoan(2);
      expect(done.penalty).to.equal(eth("0.02"));
      expect(done.refund).to.equal(0);
      expect(await ledger.treasuryBalance()).to.equal(eth("0.03"));
      await expectSolvent(ledger);
    });

    it("keeps each loan's own late-fee terms when the policy changes", async () => {
      const { ledger, alice, loan } = await loadFixture(borrowedFixture);
      await ledger.setPolicy(LOAN_DURATION, PENALTY_PERIOD, 5000); // 50% per period for NEW loans
      await time.setNextBlockTimestamp(loan.dueAt + 10n);
      await ledger.connect(alice).requestReturn(1);
      await ledger.confirmReturn(1);
      expect((await ledger.getLoan(1)).penalty).to.equal(eth("0.005")); // still 10%
    });
  });

  describe("13. revoked borrowers", () => {
    it("13. cannot start new loans but can finish existing loans and claim the refund", async () => {
      const { ledger, alice } = await loadFixture(borrowedFixture);
      await ledger.revokeBorrower(alice.address);

      await expect(ledger.connect(alice).borrowEquipment(PI, { value: eth("0.02") }))
        .to.be.revertedWithCustomError(ledger, "NotAuthorizedBorrower")
        .withArgs(alice.address);

      await expect(ledger.connect(alice).requestReturn(1)).to.emit(ledger, "ReturnRequested");
      await ledger.confirmReturn(1);
      await expect(ledger.connect(alice).claimRefund()).to.changeEtherBalance(alice, eth("0.05"));
    });
  });

  describe("14-15. overdue escalation", () => {
    it("14. overdue loans can be flagged and escalated (levels 1-3, with timing rules)", async () => {
      const { ledger, bob, loan } = await loadFixture(borrowedFixture);
      expect(await ledger.isOverdue(1)).to.equal(false);
      await expect(ledger.escalateOverdue(1, 1)).to.be.revertedWithCustomError(ledger, "NotOverdue");

      await time.increaseTo(loan.dueAt + 5n);
      expect(await ledger.isOverdue(1)).to.equal(true);
      expect((await ledger.getStats()).overdueLoans).to.equal(1);

      await expect(ledger.escalateOverdue(1, 1)).to.emit(ledger, "OverdueEscalated").withArgs(1, SCOPE, (await ledger.getLoan(1)).borrower, 1, anyUint);
      expect((await ledger.getLoan(1)).escalationLevel).to.equal(1);

      // level 2 needs one full late period, level 3 needs two
      await expect(ledger.escalateOverdue(1, 2)).to.be.revertedWithCustomError(ledger, "EscalationTooEarly");
      await time.increaseTo(loan.dueAt + PENALTY_PERIOD + 5n);
      await expect(ledger.escalateOverdue(1, 2)).to.emit(ledger, "OverdueEscalated");
      await expect(ledger.escalateOverdue(1, 3)).to.be.revertedWithCustomError(ledger, "EscalationTooEarly");
      await time.increaseTo(loan.dueAt + 2n * PENALTY_PERIOD + 5n);
      await expect(ledger.escalateOverdue(1, 3)).to.emit(ledger, "OverdueEscalated");

      // bounds and permissions
      await expect(ledger.escalateOverdue(1, 4)).to.be.revertedWithCustomError(ledger, "InvalidEscalationLevel");
      await expect(ledger.escalateOverdue(1, 0)).to.be.revertedWithCustomError(ledger, "InvalidEscalationLevel");
      await expect(ledger.connect(bob).escalateOverdue(1, 3)).to.be.revertedWithCustomError(
        ledger,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("15. repeated escalation of the same level is prevented (one event per level)", async () => {
      const { ledger, loan } = await loadFixture(borrowedFixture);
      await time.increaseTo(loan.dueAt + 5n);
      await ledger.escalateOverdue(1, 1);
      await expect(ledger.escalateOverdue(1, 1))
        .to.be.revertedWithCustomError(ledger, "InvalidEscalationLevel")
        .withArgs(1, 1);
      const events = await ledger.queryFilter(ledger.filters.OverdueEscalated());
      expect(events.length).to.equal(1);
    });

    it("an on-time return request is not overdue even if the admin confirms late", async () => {
      const { ledger, alice, loan } = await loadFixture(borrowedFixture);
      await time.setNextBlockTimestamp(loan.dueAt - 10n);
      await ledger.connect(alice).requestReturn(1);
      await time.increaseTo(loan.dueAt + 1000n);
      expect(await ledger.isOverdue(1)).to.equal(false);
      await expect(ledger.escalateOverdue(1, 1)).to.be.revertedWithCustomError(ledger, "NotOverdue");
      await ledger.confirmReturn(1);
      expect((await ledger.getLoan(1)).penalty).to.equal(0);
    });

    it("escalation is resolved when the item is returned, and completed loans can not be escalated", async () => {
      const { ledger, loan, alice } = await loadFixture(borrowedFixture);
      await time.increaseTo(loan.dueAt + 5n);
      await ledger.escalateOverdue(1, 1);
      await ledger.connect(alice).requestReturn(1);
      await expect(ledger.confirmReturn(1)).to.emit(ledger, "EscalationResolved").withArgs(1, SCOPE, alice.address, 1);
      const done = await ledger.getLoan(1);
      expect(done.escalationResolved).to.equal(true);
      expect(await ledger.isOverdue(1)).to.equal(false);
      await expect(ledger.escalateOverdue(1, 2)).to.be.revertedWithCustomError(ledger, "InvalidLoanState");
    });
  });

  describe("16-18. refunds, treasury and failed transfers", () => {
    it("16. refunds cannot be claimed twice", async () => {
      const { ledger, alice } = await loadFixture(borrowedFixture);
      await ledger.connect(alice).requestReturn(1);
      await ledger.confirmReturn(1);
      await ledger.connect(alice).claimRefund();
      await expect(ledger.connect(alice).claimRefund()).to.be.revertedWithCustomError(ledger, "NothingToClaim");
      await expect(ledger.connect(alice).claimRefundTo(alice.address)).to.be.revertedWithCustomError(
        ledger,
        "NothingToClaim"
      );
      expect(await ledger.totalPendingRefunds()).to.equal(0);
    });

    it("17. treasury can not withdraw outstanding borrower deposits or unclaimed refunds", async () => {
      const { ledger, admin, alice, bob, outsider, loan } = await loadFixture(borrowedFixture);
      const ledgerAddr = await ledger.getAddress();

      // an active deposit is held, but the treasury is empty -> nothing withdrawable
      expect(await ethers.provider.getBalance(ledgerAddr)).to.equal(eth("0.05"));
      await expect(ledger.withdrawTreasury(admin.address, 1)).to.be.revertedWithCustomError(ledger, "InsufficientTreasury");

      // finish a late loan: 0.005 ETH becomes treasury, 0.045 ETH is owed to alice
      await time.setNextBlockTimestamp(loan.dueAt + 100n);
      await ledger.connect(alice).requestReturn(1);
      await ledger.confirmReturn(1);
      // plus a second active deposit from bob
      await ledger.connect(bob).borrowEquipment(PI, { value: eth("0.02") });

      expect(await ethers.provider.getBalance(ledgerAddr)).to.equal(eth("0.005") + eth("0.045") + eth("0.02"));
      await expect(ledger.withdrawTreasury(admin.address, eth("0.0051")))
        .to.be.revertedWithCustomError(ledger, "InsufficientTreasury")
        .withArgs(eth("0.0051"), eth("0.005"));
      await expect(ledger.connect(outsider).withdrawTreasury(outsider.address, 1)).to.be.revertedWithCustomError(
        ledger,
        "AccessControlUnauthorizedAccount"
      );
      await expect(ledger.withdrawTreasury(admin.address, 0)).to.be.revertedWithCustomError(ledger, "InsufficientTreasury");

      // the exact accrued penalty can be withdrawn, and only once
      await expect(ledger.withdrawTreasury(outsider.address, eth("0.005")))
        .to.emit(ledger, "TreasuryWithdrawn")
        .withArgs(outsider.address, eth("0.005"), admin.address);
      await expect(ledger.withdrawTreasury(outsider.address, 1)).to.be.revertedWithCustomError(ledger, "InsufficientTreasury");

      // everything still owed is intact and claimable
      expect(await ledger.treasuryBalance()).to.equal(0);
      await expectSolvent(ledger);
      await expect(ledger.connect(alice).claimRefund()).to.changeEtherBalance(alice, eth("0.045"));
    });

    it("18. a failed refund transfer does not corrupt accounting or block return finalization", async () => {
      const { ledger, admin, alice, bob } = await loadFixture(deployFixture);
      const borrower = await ethers.deployContract("TestBorrower", [await ledger.getAddress()]);
      await borrower.waitForDeployment();
      const borrowerAddr = await borrower.getAddress();
      await ledger.authorizeBorrower(borrowerAddr);

      // contract borrower takes the scope but refuses to receive ETH
      await borrower.borrow(SCOPE, { value: eth("0.05") });
      await borrower.requestReturn(1);

      // finalization still works: no ETH is pushed to the borrower
      await expect(ledger.confirmReturn(1)).to.emit(ledger, "EquipmentReturned");
      expect((await ledger.getLoan(1)).status).to.equal(LoanStatus.Completed);
      expect((await ledger.getEquipment(SCOPE)).status).to.equal(Status.Available);
      expect(await ledger.pendingRefunds(borrowerAddr)).to.equal(eth("0.05"));

      // the claim fails and rolls back completely
      await expect(borrower.claim()).to.be.reverted;
      expect(await ledger.pendingRefunds(borrowerAddr)).to.equal(eth("0.05"));
      expect(await ledger.totalPendingRefunds()).to.equal(eth("0.05"));
      await expectSolvent(ledger);

      // the equipment is not stuck: another student can borrow it right away
      await ledger.connect(bob).borrowEquipment(SCOPE, { value: eth("0.05") });

      // the stuck borrower can redirect the refund to a wallet that accepts ETH
      await expect(borrower.claimTo(alice.address)).to.changeEtherBalance(alice, eth("0.05"));
      expect(await ledger.pendingRefunds(borrowerAddr)).to.equal(0);
      await expectSolvent(ledger);
      void admin;
    });

    it("a borrower contract that starts accepting ETH can claim normally", async () => {
      const { ledger } = await loadFixture(deployFixture);
      const borrower = await ethers.deployContract("TestBorrower", [await ledger.getAddress()]);
      await ledger.authorizeBorrower(await borrower.getAddress());
      await borrower.borrow(PI, { value: eth("0.02") });
      await borrower.requestReturn(1);
      await ledger.confirmReturn(1);
      await borrower.setAcceptEth(true);
      await expect(borrower.claim()).to.changeEtherBalance(borrower, eth("0.02"));
    });

    it("reentrancy during a claim is blocked and the borrower is paid exactly once", async () => {
      const { ledger } = await loadFixture(deployFixture);
      const attacker = await ethers.deployContract("TestBorrower", [await ledger.getAddress()]);
      await ledger.authorizeBorrower(await attacker.getAddress());
      await attacker.setAcceptEth(true);
      await attacker.setReenter(true);

      await attacker.borrow(SCOPE, { value: eth("0.05") });
      await attacker.requestReturn(1);
      await ledger.confirmReturn(1);

      // another honest deposit sits in the contract: it must stay untouched
      const [, , bob] = await ethers.getSigners();
      await ledger.connect(bob).borrowEquipment(PI, { value: eth("0.02") });

      await expect(attacker.claim()).to.changeEtherBalance(attacker, eth("0.05"));
      expect(await attacker.reentryBlocked()).to.equal(true);
      expect(await ethers.provider.getBalance(await ledger.getAddress())).to.equal(eth("0.02"));
      expect(await ledger.totalActiveDeposits()).to.equal(eth("0.02"));
    });
  });

  describe("19. retired equipment & status rules", () => {
    it("19. retired equipment cannot be borrowed and can not be reactivated", async () => {
      const { ledger, admin, alice } = await loadFixture(deployFixture);
      await expect(ledger.setEquipmentStatus(FPGA, Status.Retired))
        .to.emit(ledger, "EquipmentStatusChanged")
        .withArgs(FPGA, Status.Available, Status.Retired, admin.address);
      await expect(ledger.connect(alice).borrowEquipment(FPGA, { value: eth("0.08") }))
        .to.be.revertedWithCustomError(ledger, "EquipmentNotAvailable")
        .withArgs(FPGA, Status.Retired);
      await expect(ledger.setEquipmentStatus(FPGA, Status.Available)).to.be.revertedWithCustomError(
        ledger,
        "InvalidStatusChange"
      );
    });

    it("equipment that is checked out can not be retired or made unavailable", async () => {
      const { ledger } = await loadFixture(borrowedFixture);
      await expect(ledger.setEquipmentStatus(SCOPE, Status.Retired))
        .to.be.revertedWithCustomError(ledger, "EquipmentCurrentlyBorrowed")
        .withArgs(SCOPE);
      await expect(ledger.setEquipmentStatus(SCOPE, Status.Unavailable)).to.be.revertedWithCustomError(
        ledger,
        "EquipmentCurrentlyBorrowed"
      );
    });

    it("status rules: Borrowed can not be set manually, no-op changes rejected, admin only", async () => {
      const { ledger, alice } = await loadFixture(deployFixture);
      await expect(ledger.setEquipmentStatus(PI, Status.Borrowed)).to.be.revertedWithCustomError(ledger, "InvalidStatusChange");
      await expect(ledger.setEquipmentStatus(PI, Status.Available)).to.be.revertedWithCustomError(ledger, "InvalidStatusChange");
      await expect(ledger.connect(alice).setEquipmentStatus(PI, Status.Retired)).to.be.revertedWithCustomError(
        ledger,
        "AccessControlUnauthorizedAccount"
      );
      await ledger.setEquipmentStatus(PI, Status.Unavailable);
      await ledger.setEquipmentStatus(PI, Status.Available); // maintenance finished
      await expect(ledger.setEquipmentStatus(999, Status.Retired)).to.be.revertedWithCustomError(ledger, "EquipmentNotFound");
    });
  });

  describe("20. loan history & stats", () => {
    it("20. loan history remains available after completion", async () => {
      const { ledger, alice, loan } = await loadFixture(borrowedFixture);
      await time.setNextBlockTimestamp(loan.dueAt + 100n);
      await ledger.connect(alice).requestReturn(1);
      await ledger.confirmReturn(1);
      await ledger.connect(alice).claimRefund();

      const rec = await ledger.getLoan(1);
      expect(rec.status).to.equal(LoanStatus.Completed);
      expect(rec.borrower).to.equal(alice.address);
      expect(rec.equipmentId).to.equal(SCOPE);
      expect(rec.deposit).to.equal(eth("0.05"));
      expect(rec.penalty).to.equal(eth("0.005"));
      expect(rec.refund).to.equal(eth("0.045"));
      expect(rec.late).to.equal(true);
      expect(rec.returnedAt).to.be.gt(0);

      expect(await ledger.getLoanIdsOf(alice.address)).to.deep.equal([1n]);
      const mine = await ledger.getLoansOf(alice.address);
      expect(mine.length).to.equal(1);
      expect(mine[0].id).to.equal(1);
      expect((await ledger.getAllLoans()).length).to.equal(1);

      // history survives a second loan of the same item
      await ledger.connect(alice).borrowEquipment(SCOPE, { value: eth("0.05") });
      expect((await ledger.getLoansOf(alice.address)).length).to.equal(2);
      expect((await ledger.getLoan(1)).status).to.equal(LoanStatus.Completed);
      await expect(ledger.getLoan(0)).to.be.revertedWithCustomError(ledger, "LoanNotFound");
      await expect(ledger.getLoan(3)).to.be.revertedWithCustomError(ledger, "LoanNotFound");
    });

    it("dashboard stats add up", async () => {
      const { ledger, alice, bob, loan } = await loadFixture(borrowedFixture);
      await time.increase(1000); // bob borrows later, so his loan is still on time when alice's is not
      await ledger.connect(bob).borrowEquipment(PI, { value: eth("0.02") });
      await ledger.setEquipmentStatus(SENSOR, Status.Unavailable);
      await time.increaseTo(loan.dueAt + 5n);
      await ledger.connect(alice).requestReturn(1);

      const s = await ledger.getStats();
      expect(s.totalEquipment).to.equal(4);
      expect(s.available).to.equal(1); // FPGA
      expect(s.borrowed).to.equal(2);
      expect(s.unavailable).to.equal(1);
      expect(s.retired).to.equal(0);
      expect(s.pendingReturns).to.equal(1);
      expect(s.overdueLoans).to.equal(1); // alice requested after the deadline
      expect(s.totalActiveDeposits).to.equal(eth("0.07"));
      expect(s.totalLoans).to.equal(2);
    });
  });
});

// matcher for "any uint" in withArgs
const anyUint = () => true;
