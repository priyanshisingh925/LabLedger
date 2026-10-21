// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LabLedger} from "../LabLedger.sol";

/// @dev TEST-ONLY helper. A contract "borrower" that can refuse ETH (to simulate a failed refund
/// transfer) and that tries to re-enter claimRefund (to prove the reentrancy guard works).
contract TestBorrower {
    LabLedger public immutable ledger;
    bool public acceptEth;
    bool public reenter;
    bool public reentryBlocked;

    constructor(LabLedger _ledger) {
        ledger = _ledger;
    }

    receive() external payable {
        if (!acceptEth) revert("TestBorrower: rejecting ETH");
        if (reenter) {
            try ledger.claimRefund() {} catch {
                reentryBlocked = true;
            }
        }
    }

    function setAcceptEth(bool v) external {
        acceptEth = v;
    }

    function setReenter(bool v) external {
        reenter = v;
    }

    function borrow(uint256 equipmentId) external payable returns (uint256) {
        return ledger.borrowEquipment{value: msg.value}(equipmentId);
    }

    function requestReturn(uint256 loanId) external {
        ledger.requestReturn(loanId);
    }

    function claim() external {
        ledger.claimRefund();
    }

    function claimTo(address payable to) external {
        ledger.claimRefundTo(to);
    }
}
