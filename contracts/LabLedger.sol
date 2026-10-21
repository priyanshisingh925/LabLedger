// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LabLedger - Accountable Lab Equipment Access
 * @notice Tracks university lab equipment, authorized borrowers, ETH deposits and loan history.
 *
 * Roles
 *  - Administrator: holder of OpenZeppelin AccessControl's DEFAULT_ADMIN_ROLE (the deployer at start).
 *    Manages equipment, authorizes/revokes borrowers, confirms physical returns, escalates overdue
 *    loans and withdraws treasury funds (late fees only).
 *  - Authorized student: may borrow equipment and request/complete the return of items assigned to them.
 *    Revocation only blocks NEW loans; it never blocks returning or claiming refunds.
 *  - Anyone else: read-only.
 *
 * Money model (all native ETH)
 *  - totalActiveDeposits : deposits held for loans not yet completed (owed back to borrowers, minus late fees)
 *  - totalPendingRefunds : refunds credited to borrowers but not yet claimed (pull payment)
 *  - treasuryBalance     : accrued late fees; the ONLY funds the admin may withdraw
 *  Invariant: address(this).balance >= totalActiveDeposits + totalPendingRefunds + treasuryBalance
 *
 * Physical-world caveat: a smart contract cannot see a physical handover. The student only REQUESTS a
 * return; the administrator CONFIRMS physical receipt, and only then are refund and penalty finalized.
 * The lateness of a loan is judged at the moment of the student's request (so admin delay never
 * penalizes the student). If the admin completes a return without a prior request (desk handover),
 * the confirmation time is used.
 *
 * Time caveat: block.timestamp is set by block producers and can drift by seconds (on real networks
 * validators can skew it slightly). It is suitable for deadlines measured in minutes/days, not seconds.
 * Smart contracts cannot wake themselves up, so overdue status is computed on demand (isOverdue) and
 * the admin records escalations by sending a transaction.
 */
contract LabLedger is AccessControl, ReentrancyGuard {
    // ───────────────────────────── Types ─────────────────────────────

    enum EquipmentStatus {
        Available,
        Borrowed,
        Unavailable, // temporarily withdrawn by admin (maintenance etc.); can go back to Available
        Retired // terminal
    }

    enum LoanStatus {
        Active,
        ReturnRequested,
        Completed
    }

    struct Equipment {
        uint256 id;
        string name;
        string category;
        string description;
        uint256 deposit; // wei
        EquipmentStatus status;
        bool exists;
    }

    struct Loan {
        uint256 id;
        uint256 equipmentId;
        address borrower;
        uint64 checkedOutAt;
        uint64 dueAt;
        uint64 returnRequestedAt; // 0 if no request
        uint64 returnedAt; // 0 until the admin confirms physical receipt
        uint256 deposit;
        uint256 refund; // set on completion
        uint256 penalty; // set on completion
        uint32 penaltyPeriod; // policy snapshot taken at checkout
        uint16 lateFeeBps; // policy snapshot taken at checkout
        LoanStatus status;
        uint8 escalationLevel; // 0 = none
        bool escalationResolved;
        bool late; // set on completion
    }

    struct Stats {
        uint256 totalEquipment;
        uint256 available;
        uint256 borrowed;
        uint256 unavailable;
        uint256 retired;
        uint256 overdueLoans;
        uint256 pendingReturns;
        uint256 totalLoans;
        uint256 totalActiveDeposits;
        uint256 totalPendingRefunds;
        uint256 treasuryBalance;
    }

    // ───────────────────────────── Constants ─────────────────────────────

    uint8 public constant MAX_ESCALATION_LEVEL = 3;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint64 public constant MAX_LOAN_DURATION = 365 days;

    // ───────────────────────────── Storage ─────────────────────────────

    // Loan policy (configurable by admin; each loan snapshots the late-fee terms at checkout)
    uint64 public loanDuration; // seconds a borrower may keep an item
    uint32 public penaltyPeriod; // seconds; every started period late adds one lateFeeBps charge
    uint16 public lateFeeBps; // % of the deposit (in basis points) charged per started late period

    mapping(uint256 => Equipment) private _equipment;
    uint256[] private _equipmentIds;
    mapping(uint256 => uint256) public activeLoanOf; // equipmentId => loanId (0 = none)

    mapping(address => bool) public isAuthorizedBorrower;
    address[] private _borrowerList;
    mapping(address => bool) private _borrowerListed;

    mapping(uint256 => Loan) private _loans;
    uint256 public loanCount; // loan ids are 1..loanCount
    mapping(address => uint256[]) private _loansOf;

    mapping(address => uint256) public pendingRefunds;
    uint256 public totalActiveDeposits;
    uint256 public totalPendingRefunds;
    uint256 public treasuryBalance;

    // ───────────────────────────── Events (audit trail) ─────────────────────────────

    event EquipmentRegistered(uint256 indexed equipmentId, string name, string category, uint256 deposit, address indexed by);
    event EquipmentStatusChanged(uint256 indexed equipmentId, EquipmentStatus oldStatus, EquipmentStatus newStatus, address indexed by);
    event BorrowerAuthorized(address indexed borrower, address indexed by);
    event BorrowerRevoked(address indexed borrower, address indexed by);
    event EquipmentBorrowed(
        uint256 indexed loanId,
        uint256 indexed equipmentId,
        address indexed borrower,
        uint64 checkedOutAt,
        uint64 dueAt,
        uint256 deposit
    );
    event ReturnRequested(uint256 indexed loanId, uint256 indexed equipmentId, address indexed borrower, uint64 requestedAt);
    event ReturnRejected(uint256 indexed loanId, uint256 indexed equipmentId, address indexed by);
    event EquipmentReturned(
        uint256 indexed loanId,
        uint256 indexed equipmentId,
        address indexed borrower,
        uint64 returnedAt,
        bool late,
        uint256 refund,
        uint256 penalty
    );
    event OverdueEscalated(uint256 indexed loanId, uint256 indexed equipmentId, address indexed borrower, uint8 level, uint64 at);
    event EscalationResolved(uint256 indexed loanId, uint256 indexed equipmentId, address indexed borrower, uint8 finalLevel);
    event RefundCredited(address indexed borrower, uint256 indexed loanId, uint256 amount);
    event RefundClaimed(address indexed borrower, address indexed to, uint256 amount);
    event PolicyUpdated(uint64 loanDuration, uint32 penaltyPeriod, uint16 lateFeeBps, address indexed by);
    event TreasuryWithdrawn(address indexed to, uint256 amount, address indexed by);

    // ───────────────────────────── Errors ─────────────────────────────

    error InvalidPolicy();
    error EmptyName();
    error ZeroDeposit();
    error ZeroAddress();
    error EquipmentAlreadyExists(uint256 equipmentId);
    error EquipmentNotFound(uint256 equipmentId);
    error EquipmentNotAvailable(uint256 equipmentId, EquipmentStatus status);
    error EquipmentCurrentlyBorrowed(uint256 equipmentId);
    error InvalidStatusChange(EquipmentStatus from, EquipmentStatus to);
    error NotAuthorizedBorrower(address account);
    error AlreadyAuthorized(address account);
    error NotCurrentlyAuthorized(address account);
    error IncorrectDeposit(uint256 expected, uint256 sent);
    error LoanNotFound(uint256 loanId);
    error NotLoanBorrower(uint256 loanId, address caller);
    error InvalidLoanState(uint256 loanId, LoanStatus status);
    error NotOverdue(uint256 loanId);
    error InvalidEscalationLevel(uint8 requested, uint8 current);
    error EscalationTooEarly(uint256 loanId, uint8 level);
    error NothingToClaim();
    error InsufficientTreasury(uint256 requested, uint256 available);
    error TransferFailed();

    // ───────────────────────────── Setup ─────────────────────────────

    /**
     * @param _loanDuration  seconds a loan lasts (e.g. 7 days in production, 120 for a quick demo)
     * @param _penaltyPeriod seconds per late-fee period (e.g. 1 day in production, 60 for a demo)
     * @param _lateFeeBps    late fee per started period, in basis points of the deposit (1000 = 10%)
     */
    constructor(uint64 _loanDuration, uint32 _penaltyPeriod, uint16 _lateFeeBps) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setPolicy(_loanDuration, _penaltyPeriod, _lateFeeBps);
    }

    /// @dev Direct ETH transfers are rejected: only checkout deposits may enter the contract.
    receive() external payable {
        revert TransferFailed();
    }

    // ───────────────────────────── Policy ─────────────────────────────

    /// @notice Change the loan policy. Existing loans keep the late-fee terms they were created with.
    function setPolicy(uint64 _loanDuration, uint32 _penaltyPeriod, uint16 _lateFeeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setPolicy(_loanDuration, _penaltyPeriod, _lateFeeBps);
    }

    function _setPolicy(uint64 _loanDuration, uint32 _penaltyPeriod, uint16 _lateFeeBps) internal {
        if (_loanDuration == 0 || _loanDuration > MAX_LOAN_DURATION) revert InvalidPolicy();
        if (_penaltyPeriod == 0) revert InvalidPolicy();
        if (_lateFeeBps > BPS_DENOMINATOR) revert InvalidPolicy();
        loanDuration = _loanDuration;
        penaltyPeriod = _penaltyPeriod;
        lateFeeBps = _lateFeeBps;
        emit PolicyUpdated(_loanDuration, _penaltyPeriod, _lateFeeBps, msg.sender);
    }

    // ───────────────────────────── Equipment registry ─────────────────────────────

    function registerEquipment(
        uint256 id,
        string calldata name,
        string calldata category,
        string calldata description,
        uint256 deposit
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_equipment[id].exists) revert EquipmentAlreadyExists(id);
        if (bytes(name).length == 0) revert EmptyName();
        if (deposit == 0) revert ZeroDeposit();

        Equipment storage e = _equipment[id];
        e.id = id;
        e.name = name;
        e.category = category;
        e.description = description;
        e.deposit = deposit;
        e.status = EquipmentStatus.Available;
        e.exists = true;
        _equipmentIds.push(id);

        emit EquipmentRegistered(id, name, category, deposit, msg.sender);
    }

    /**
     * @notice Mark equipment Available, Unavailable or Retired.
     * Borrowed can only be reached through checkout, and an item that is currently borrowed can not be
     * changed (it must be returned first). Retired is terminal. Records are never deleted, so history
     * always stays traceable.
     */
    function setEquipmentStatus(uint256 id, EquipmentStatus newStatus) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Equipment storage e = _requireEquipment(id);
        EquipmentStatus old = e.status;

        if (old == EquipmentStatus.Borrowed || activeLoanOf[id] != 0) revert EquipmentCurrentlyBorrowed(id);
        if (newStatus == EquipmentStatus.Borrowed || old == EquipmentStatus.Retired || newStatus == old) {
            revert InvalidStatusChange(old, newStatus);
        }

        e.status = newStatus;
        emit EquipmentStatusChanged(id, old, newStatus, msg.sender);
    }

    // ───────────────────────────── Borrower authorization ─────────────────────────────

    function authorizeBorrower(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        if (isAuthorizedBorrower[account]) revert AlreadyAuthorized(account);
        isAuthorizedBorrower[account] = true;
        if (!_borrowerListed[account]) {
            _borrowerListed[account] = true;
            _borrowerList.push(account);
        }
        emit BorrowerAuthorized(account, msg.sender);
    }

    /// @notice Blocks NEW checkouts only. The account can still return items and claim refunds.
    function revokeBorrower(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!isAuthorizedBorrower[account]) revert NotCurrentlyAuthorized(account);
        isAuthorizedBorrower[account] = false;
        emit BorrowerRevoked(account, msg.sender);
    }

    // ───────────────────────────── Checkout ─────────────────────────────

    /// @notice Borrow an item. Must send exactly the item's deposit.
    function borrowEquipment(uint256 equipmentId) external payable nonReentrant returns (uint256 loanId) {
        if (!isAuthorizedBorrower[msg.sender]) revert NotAuthorizedBorrower(msg.sender);
        Equipment storage e = _requireEquipment(equipmentId);
        if (e.status != EquipmentStatus.Available) revert EquipmentNotAvailable(equipmentId, e.status);
        if (msg.value != e.deposit) revert IncorrectDeposit(e.deposit, msg.value);

        // effects
        loanId = ++loanCount;
        Loan storage l = _loans[loanId];
        l.id = loanId;
        l.equipmentId = equipmentId;
        l.borrower = msg.sender;
        l.checkedOutAt = uint64(block.timestamp);
        l.dueAt = uint64(block.timestamp) + loanDuration;
        l.deposit = msg.value;
        l.penaltyPeriod = penaltyPeriod;
        l.lateFeeBps = lateFeeBps;
        l.status = LoanStatus.Active;

        e.status = EquipmentStatus.Borrowed;
        activeLoanOf[equipmentId] = loanId;
        _loansOf[msg.sender].push(loanId);
        totalActiveDeposits += msg.value;

        emit EquipmentBorrowed(loanId, equipmentId, msg.sender, l.checkedOutAt, l.dueAt, msg.value);
    }

    // ───────────────────────────── Return workflow ─────────────────────────────

    /// @notice Step 1 (student): announce that the item is being handed back. Nothing is refunded yet.
    function requestReturn(uint256 loanId) external {
        Loan storage l = _requireLoan(loanId);
        if (l.borrower != msg.sender) revert NotLoanBorrower(loanId, msg.sender);
        if (l.status != LoanStatus.Active) revert InvalidLoanState(loanId, l.status);

        l.status = LoanStatus.ReturnRequested;
        l.returnRequestedAt = uint64(block.timestamp);
        emit ReturnRequested(loanId, l.equipmentId, msg.sender, l.returnRequestedAt);
    }

    /// @notice Admin declines a return request (item not actually received). The loan goes back to Active
    /// and the lateness clock runs again from the original deadline.
    function rejectReturn(uint256 loanId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Loan storage l = _requireLoan(loanId);
        if (l.status != LoanStatus.ReturnRequested) revert InvalidLoanState(loanId, l.status);
        l.status = LoanStatus.Active;
        l.returnRequestedAt = 0;
        emit ReturnRejected(loanId, l.equipmentId, msg.sender);
    }

    /**
     * @notice Step 2 (admin): confirm that the item was physically received. Finalizes the loan, computes
     * penalty and refund, credits the refund to the borrower (pull payment) and the penalty to the treasury.
     * No ETH is sent here, so a borrower that can not receive ETH can never block this step.
     * The admin may also complete a loan the student never requested (desk handover); then the current
     * time is used as the return time.
     */
    function confirmReturn(uint256 loanId) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        Loan storage l = _requireLoan(loanId);
        if (l.status == LoanStatus.Completed) revert InvalidLoanState(loanId, l.status);

        (bool late, , , uint256 penalty) = _settlement(l, _effectiveReturnTime(l));
        uint256 refund = l.deposit - penalty; // penalty is capped at the deposit

        // effects
        l.status = LoanStatus.Completed;
        l.returnedAt = uint64(block.timestamp);
        l.late = late;
        l.penalty = penalty;
        l.refund = refund;

        if (l.escalationLevel > 0 && !l.escalationResolved) {
            l.escalationResolved = true;
            emit EscalationResolved(loanId, l.equipmentId, l.borrower, l.escalationLevel);
        }

        totalActiveDeposits -= l.deposit;
        pendingRefunds[l.borrower] += refund;
        totalPendingRefunds += refund;
        treasuryBalance += penalty;

        _equipment[l.equipmentId].status = EquipmentStatus.Available;
        delete activeLoanOf[l.equipmentId];

        emit EquipmentReturned(loanId, l.equipmentId, l.borrower, l.returnedAt, late, refund, penalty);
        emit RefundCredited(l.borrower, loanId, refund);
    }

    // ───────────────────────────── Refund claims (pull payment) ─────────────────────────────

    /// @notice Withdraw your credited refund to your own address.
    function claimRefund() external nonReentrant {
        _claim(msg.sender, payable(msg.sender));
    }

    /// @notice Withdraw your credited refund to another address (useful if your account can not receive ETH).
    function claimRefundTo(address payable to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        _claim(msg.sender, to);
    }

    function _claim(address account, address payable to) private {
        uint256 amount = pendingRefunds[account];
        if (amount == 0) revert NothingToClaim();

        // effects before interaction; a failed transfer reverts everything, leaving the refund claimable
        pendingRefunds[account] = 0;
        totalPendingRefunds -= amount;

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit RefundClaimed(account, to, amount);
    }

    // ───────────────────────────── Overdue escalation ─────────────────────────────

    /**
     * @notice Admin records an escalation for an overdue loan. Levels go 1 -> 2 -> 3 and can only increase,
     * so the same level can never be emitted twice. Level n needs the loan to be at least (n-1) late-fee
     * periods past due (level 1: overdue at all; level 2: >= 1 period; level 3: >= 2 periods).
     */
    function escalateOverdue(uint256 loanId, uint8 level) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Loan storage l = _requireLoan(loanId);
        if (l.status == LoanStatus.Completed) revert InvalidLoanState(loanId, l.status);
        if (!_isOverdue(l)) revert NotOverdue(loanId);
        if (level == 0 || level > MAX_ESCALATION_LEVEL || level <= l.escalationLevel) {
            revert InvalidEscalationLevel(level, l.escalationLevel);
        }
        uint256 lateSeconds = _effectiveReturnTime(l) - l.dueAt;
        if (lateSeconds < uint256(level - 1) * l.penaltyPeriod) revert EscalationTooEarly(loanId, level);

        l.escalationLevel = level;
        emit OverdueEscalated(loanId, l.equipmentId, l.borrower, level, uint64(block.timestamp));
    }

    // ───────────────────────────── Treasury ─────────────────────────────

    /// @notice Withdraw accrued late fees. Borrower deposits and unclaimed refunds can never be withdrawn here.
    function withdrawTreasury(address payable to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0 || amount > treasuryBalance) revert InsufficientTreasury(amount, treasuryBalance);

        treasuryBalance -= amount;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit TreasuryWithdrawn(to, amount, msg.sender);
    }

    // ───────────────────────────── Views ─────────────────────────────

    function isAdmin(address account) external view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, account);
    }

    function isOverdue(uint256 loanId) external view returns (bool) {
        return _isOverdue(_requireLoan(loanId));
    }

    function getEquipment(uint256 id) external view returns (Equipment memory) {
        return _requireEquipment(id);
    }

    function equipmentCount() external view returns (uint256) {
        return _equipmentIds.length;
    }

    function getAllEquipment() external view returns (Equipment[] memory list) {
        uint256 n = _equipmentIds.length;
        list = new Equipment[](n);
        for (uint256 i = 0; i < n; i++) {
            list[i] = _equipment[_equipmentIds[i]];
        }
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return _requireLoan(loanId);
    }

    function getAllLoans() external view returns (Loan[] memory list) {
        list = new Loan[](loanCount);
        for (uint256 i = 0; i < loanCount; i++) {
            list[i] = _loans[i + 1];
        }
    }

    function getLoanIdsOf(address borrower) external view returns (uint256[] memory) {
        return _loansOf[borrower];
    }

    /// @notice Loan history for one borrower (active and completed).
    function getLoansOf(address borrower) external view returns (Loan[] memory list) {
        uint256[] storage ids = _loansOf[borrower];
        list = new Loan[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            list[i] = _loans[ids[i]];
        }
    }

    function getAuthorizedBorrowers() external view returns (address[] memory list) {
        uint256 n = _borrowerList.length;
        uint256 count;
        for (uint256 i = 0; i < n; i++) {
            if (isAuthorizedBorrower[_borrowerList[i]]) count++;
        }
        list = new address[](count);
        uint256 j;
        for (uint256 i = 0; i < n; i++) {
            if (isAuthorizedBorrower[_borrowerList[i]]) list[j++] = _borrowerList[i];
        }
    }

    /**
     * @notice Shows what would happen if the return were settled right now (for the admin UI).
     * For completed loans the stored result is returned.
     */
    function previewSettlement(uint256 loanId)
        external
        view
        returns (bool late, uint256 lateSeconds, uint256 penalty, uint256 refund)
    {
        Loan storage l = _requireLoan(loanId);
        if (l.status == LoanStatus.Completed) {
            lateSeconds = l.late ? _lateSecondsOf(l, l.returnRequestedAt != 0 ? l.returnRequestedAt : l.returnedAt) : 0;
            return (l.late, lateSeconds, l.penalty, l.refund);
        }
        (late, lateSeconds, , penalty) = _settlement(l, _effectiveReturnTime(l));
        refund = l.deposit - penalty;
    }

    function getStats() external view returns (Stats memory s) {
        uint256 n = _equipmentIds.length;
        s.totalEquipment = n;
        for (uint256 i = 0; i < n; i++) {
            uint256 id = _equipmentIds[i];
            EquipmentStatus st = _equipment[id].status;
            if (st == EquipmentStatus.Available) s.available++;
            else if (st == EquipmentStatus.Borrowed) {
                s.borrowed++;
                Loan storage l = _loans[activeLoanOf[id]];
                if (l.status == LoanStatus.ReturnRequested) s.pendingReturns++;
                if (_isOverdue(l)) s.overdueLoans++;
            } else if (st == EquipmentStatus.Unavailable) s.unavailable++;
            else s.retired++;
        }
        s.totalLoans = loanCount;
        s.totalActiveDeposits = totalActiveDeposits;
        s.totalPendingRefunds = totalPendingRefunds;
        s.treasuryBalance = treasuryBalance;
    }

    // ───────────────────────────── Internals ─────────────────────────────

    function _requireEquipment(uint256 id) private view returns (Equipment storage e) {
        e = _equipment[id];
        if (!e.exists) revert EquipmentNotFound(id);
    }

    function _requireLoan(uint256 loanId) private view returns (Loan storage) {
        if (loanId == 0 || loanId > loanCount) revert LoanNotFound(loanId);
        return _loans[loanId];
    }

    /// Time used to judge lateness: the student's request time if there is one, otherwise now.
    function _effectiveReturnTime(Loan storage l) private view returns (uint64) {
        return l.returnRequestedAt != 0 ? l.returnRequestedAt : uint64(block.timestamp);
    }

    function _isOverdue(Loan storage l) private view returns (bool) {
        if (l.status == LoanStatus.Completed) return false;
        return _effectiveReturnTime(l) > l.dueAt;
    }

    function _lateSecondsOf(Loan storage l, uint64 effective) private view returns (uint256) {
        return effective > l.dueAt ? uint256(effective - l.dueAt) : 0;
    }

    /**
     * Penalty policy: every STARTED late period costs lateFeeBps of the deposit, capped at the deposit.
     *   periods = ceil(lateSeconds / penaltyPeriod)
     *   penalty = min(deposit, deposit * lateFeeBps * periods / 10000)
     * Example (deposit 0.05 ETH, 10% per 60 s): 61 s late -> 2 periods -> 20% -> 0.01 ETH penalty.
     */
    function _settlement(Loan storage l, uint64 effective)
        private
        view
        returns (bool late, uint256 lateSeconds, uint256 periods, uint256 penalty)
    {
        lateSeconds = _lateSecondsOf(l, effective);
        if (lateSeconds == 0) return (false, 0, 0, 0);
        late = true;
        if (l.lateFeeBps == 0) return (true, lateSeconds, 0, 0);

        periods = (lateSeconds + l.penaltyPeriod - 1) / l.penaltyPeriod;
        // clamp so the multiplication can never overflow or exceed the deposit
        uint256 maxPeriods = (BPS_DENOMINATOR + l.lateFeeBps - 1) / l.lateFeeBps;
        if (periods > maxPeriods) periods = maxPeriods;
        penalty = (l.deposit * l.lateFeeBps * periods) / BPS_DENOMINATOR;
        if (penalty > l.deposit) penalty = l.deposit;
    }
}
