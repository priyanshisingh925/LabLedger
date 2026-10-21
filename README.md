# LabLedger — Accountable Lab Equipment Access

A blockchain-based system for lending university lab equipment (oscilloscopes, Raspberry Pi boards, FPGA boards, sensor kits). Every handover, deposit, return, refund and overdue escalation is enforced by a Solidity contract and recorded as an auditable on-chain event.

Everything runs **locally** on a Hardhat test network with fake ETH. No paid APIs, no cloud, no real funds.

- **Contract:** `contracts/LabLedger.sol` (Solidity 0.8.28, OpenZeppelin `AccessControl` + `ReentrancyGuard`)
- **Tests:** `test/LabLedger.test.ts` (Mocha + Chai, 36 tests)
- **Frontend:** React 18 + TypeScript + Vite + Tailwind + ethers.js v6 + MetaMask

> ⚠️ **Hardhat private keys are public and for testing only.** Never send real assets to those addresses and never reuse those keys anywhere else (especially mainnet).

---

## Folder structure

```
labledger/
├── contracts/
│   ├── LabLedger.sol            main contract
│   └── mocks/                   test helpers (ETH-rejecting / reentrant borrower contracts)
├── scripts/
│   ├── deploy.ts                deploys + writes address & ABI to frontend/src/config/contract.json
│   ├── seed.ts                  registers 4 sample items, authorizes 2 students
│   ├── advance-time.ts          moves the local chain clock forward (overdue demo)
│   └── demo-flow.ts             optional scripted demo that fills the activity log
├── test/LabLedger.test.ts
├── frontend/
│   └── src/
│       ├── components/          Layout, StatusBadge, TxStatus, EquipmentForm, ui
│       ├── pages/               Dashboard, Inventory, Borrow, MyLoans, Returns, Admin, Activity
│       ├── hooks/               useWallet, useLedger, useActions, useTx
│       ├── services/            labledger.ts (single contract service layer), errors.ts
│       ├── config/              index.ts + contract.json (generated; the ONLY place the address lives)
│       └── types/, utils/
├── hardhat.config.ts
├── package.json / package-lock.json   (versions pinned)
└── .env.example
```

---

## Setup (exact commands)

### 1. Install Node.js and npm
Install **Node.js 20 or 22 LTS** from <https://nodejs.org> (npm is included). Check:
```bash
node -v    # v20.x or v22.x
npm -v
```

### 2. Install dependencies
```bash
cd labledger
npm install
npm run frontend:install
```

### 3. Compile
```bash
npm run compile
```
(Compiling downloads solc 0.8.28 once. If your network blocks that, use `USE_SOLCJS=1 npm run compile` — it uses the bundled `solc` npm package.)

### 4. Run the automated tests
```bash
npm test
```
Expected: `36 passing`.

### 5. Start the local blockchain (keep this terminal open)
```bash
npm run node
```
It prints 20 test accounts with their private keys. Account #0 is the **administrator**.

### 6. Deploy (new terminal)
```bash
cp .env.example .env     # optional, only to change the loan policy
npm run deploy
```
This also writes the contract address + ABI to `frontend/src/config/contract.json`. **Re-run deploy (and seed) every time you restart the Hardhat node** — a restarted node starts from an empty chain.

### 7. Seed sample data
```bash
npm run seed
```
Registers the demo equipment and authorizes Alice (#1) and Bob (#2). Carol (#3) is intentionally **not** authorized.

| ID | Item | Deposit |
|----|------|---------|
| 1 | Oscilloscope | 0.05 ETH |
| 2 | Raspberry Pi 4 | 0.02 ETH |
| 3 | FPGA Development Board | 0.08 ETH |
| 4 | Sensor Kit | 0.01 ETH |

### 8. Start the frontend
```bash
npm run frontend:dev
```
Open the printed URL (default <http://localhost:5173>). Production build check: `npm run frontend:build`.

### 9. Add the local network to MetaMask
MetaMask → Networks → Add network manually:

| Field | Value |
|---|---|
| Network name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |

(The app also offers to switch/add the network for you.)

### 10. Import test accounts
MetaMask → account menu → **Import account** → paste the private key shown by `npm run node` for:
- **Account #0** → Administrator
- **Account #1** → Alice (student)
- **Account #2** → Bob (student)
- **Account #3** → Carol (unauthorized)

Tip: use separate MetaMask accounts and switch between them; the UI follows account changes automatically.

If MetaMask shows stale nonce errors after restarting the node: Settings → Advanced → **Clear activity tab data**.

---

## Demo walkthrough (about 5 minutes)

The default policy is deliberately short: **loan duration 120 s, penalty period 60 s, late fee 10 % of the deposit per started period** (change in `.env` before `npm run deploy`).

1. **Admin registers equipment** — done by `npm run seed`. To do it by hand: connect as Account #0 → *Admin* → register equipment.
2. **Admin authorizes a student** — *Admin → Borrowers* (Alice and Bob are seeded).
3. **Student connects MetaMask** — switch to Account #1 (Alice) and click *Connect wallet*.
4. **Alice borrows the Oscilloscope** — *Borrow* → pick it → confirm the 0.05 ETH deposit in MetaMask.
5. **Another student is rejected** — switch to Bob (or Carol) and try the same item: the UI explains it is unavailable (or that the wallet is unauthorized) and the contract reverts if forced.
6. **Alice requests the return** — *My Loans → Request return*. This only records the request.
7. **Admin confirms physical receipt** — as Account #0, *Returns* shows the refund/penalty preview; click *Confirm receipt*.
8. **Refund recorded, then claimed** — Alice sees a claimable refund and clicks *Claim refund* (pull payment).
9. **Overdue scenario** — Alice or Bob borrows another item and does not return it. Skip the wait:
   ```bash
   npm run advance-time              # +180 s (SECONDS=600 npm run advance-time for more)
   ```
   As admin, *Admin → Active loans* shows it overdue; click **Escalate** (levels 1–3; each level can only be recorded once).
10. **Activity log** — *Blockchain Activity* lists every event with its transaction hash, block and timestamp. A block-explorer link appears only if `VITE_EXPLORER_URL` is set; otherwise local transaction details are shown.

Want a pre-filled log without clicking? After seeding run:
```bash
npx hardhat run scripts/demo-flow.ts --network localhost
```

---

## How the rules work

**Roles.** The deployer gets `DEFAULT_ADMIN_ROLE` (administrator). Students are whitelisted with `authorizeBorrower` / `revokeBorrower`. Revocation blocks only *new* checkouts; a revoked borrower can still request returns and claim refunds.

**Equipment states.** `Available → Borrowed → Available`, plus admin-set `Unavailable` (reversible) and `Retired` (terminal). Borrowed items cannot be retired or made unavailable, and IDs are unique and never deleted, so tracking cannot break.

**Checkout.** `borrowEquipment(id)` requires an authorized wallet, an `Available` item and `msg.value == deposit` exactly. It records borrower, checkout time and due time and emits `EquipmentBorrowed`. One active loan per item.

**Return (two steps).** A contract cannot see a physical handover, so:
1. Borrower calls `requestReturn(loanId)` (records the request time).
2. Administrator calls `confirmReturn(loanId)` after physically receiving the item. Lateness is judged at the borrower's **request time**, so an admin delay never penalizes the student. (`rejectReturn` reopens the loan if nothing was handed over; if the admin completes a desk return with no request, the confirmation time is used.)

**Money.** All deposits are native ETH, tracked in three buckets:
- `totalActiveDeposits` – held for loans in progress
- `totalPendingRefunds` – credited to borrowers, not yet claimed
- `treasuryBalance` – accrued late fees; the **only** funds the admin can withdraw

Late fee = `deposit × lateFeeBps / 10000` per **started** penalty period after the due time, **capped at the deposit**. The remainder is credited to the borrower; the fee goes to the treasury. Each loan stores the fee terms it was created with, so later policy changes never change running loans.

**Pull payments.** `confirmReturn` only *credits* the refund (checks-effects-interactions, no ETH sent). The borrower calls `claimRefund()` (or `claimRefundTo(address)` to a different wallet). If the borrower's wallet rejects ETH, return finalization still succeeds and the balance stays claimable. Claims zero the balance before sending and are `nonReentrant`.

**Overdue.** Contracts cannot wake themselves up, so `isOverdue(loanId)` is computed on demand and the admin records escalations with `escalateOverdue(loanId, level)` (levels 1–3, strictly increasing, with timing rules, one event per level). The escalation is resolved automatically when the loan completes.

**Audit trail.** Events: `EquipmentRegistered`, `EquipmentStatusChanged`, `BorrowerAuthorized`, `BorrowerRevoked`, `EquipmentBorrowed`, `ReturnRequested`, `EquipmentReturned`, `OverdueEscalated`, `TreasuryWithdrawn` (plus `ReturnRejected`, `EscalationResolved`, `RefundCredited`, `RefundClaimed`, `PolicyUpdated`). Full loan records (including completed ones) are also stored on-chain and readable via `getLoan`, `getLoansOf`, `getAllLoans`.

**Timestamp caveat.** `block.timestamp` is chosen by the block producer and can be skewed slightly, so use deadlines measured in minutes or more. Production-length durations (e.g. 7 days) are just deploy-time parameters: set `LOAN_DURATION_SECONDS=604800 PENALTY_PERIOD_SECONDS=86400` in `.env`.

---

## Test results

`npm test` → **36 passing**, covering the 20 required scenarios plus: policy validation, plain-ETH rejection, admin rejecting a return request, per-period fee rounding and cap, per-loan fee snapshots, escalation timing rules, escalation resolution, a borrower contract that starts accepting ETH after a failed claim, a reentrancy attack on `claimRefund`, state-transition rules and dashboard-stat consistency.

---

## Known limitations

- Local/test use only: no mainnet deployment path is provided and `deploy.ts` refuses non-local networks.
- The contract trusts the administrator's confirmation of physical receipt. It cannot detect damage; there is no dispute process or partial forfeiture for damaged items.
- One active loan per item, and no per-student loan limits.
- Overdue escalation needs an administrator transaction (no automatic triggers) and uses block timestamps.
- Authorization is a wallet whitelist: nothing links a wallet to a real student identity (do that off-chain, e.g. via a registration desk).
- The activity page reads events by polling the node; there is no indexer, so very large histories would need one.
- The Hardhat node is in-memory: restarting it wipes the chain, so redeploy and reseed.
- The frontend bundle is ~530 kB (single chunk), fine for a demo.

## How blockchain provides accountability here

Every handover is a signed transaction from a specific wallet, ordered by the chain and impossible to edit afterwards. The contract, not an administrator's spreadsheet, enforces who may borrow, that exactly the right deposit was locked, that deposits can never be withdrawn as treasury, and that refunds and late fees are computed by fixed rules. Anyone can replay the event log to see who held what, when it was due, when return was requested and confirmed, and where each wei went.
