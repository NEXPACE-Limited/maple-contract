// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { ApproveController } from "@projecta/util-contracts/contracts/approve/ApproveController.sol";
import { NextMeso } from "../../../NextMeso/NextMeso.sol";
import { MaplestoryEquip } from "../../../Items/MaplestoryEquip/MaplestoryEquip.sol";
import { MaplestoryConsume } from "../../../Items/MaplestoryConsume/MaplestoryConsume.sol";
import { MaplestoryCharacter } from "../../../Character/MaplestoryCharacter.sol";
import { MulticallWallet } from "../../../MulticallWallet/MulticallWallet.sol";
import { ItemIssuance } from "@projecta/nexpace-contracts/contracts/ItemIssuance/ItemIssuance.sol";

interface IMockFake {
    function fake() external;
}

contract MockApproveControllerMetaTransactionFakeCoverage is ApproveController(address(1)), IMockFake {
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockNextMesoMetaTransactionFakeCoverage is
    NextMeso(address(1), ApproveController(address(0)), 100_000),
    IMockFake
{
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockMaplestoryEquipMetaTransactionFakeCoverage is
    MaplestoryEquip(address(0), ApproveController(address(0)), ItemIssuance(address(0)), ""),
    IMockFake
{
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockMaplestoryConsumeMetaTransactionFakeCoverage is
    MaplestoryConsume(address(0), ApproveController(address(0)), ""),
    IMockFake
{
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockMaplestoryCharacterMetaTransactionFakeCoverage is
    MaplestoryCharacter(address(0), ApproveController(address(0)), ""),
    IMockFake
{
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockMulticallWalletMetaTransactionFakeCoverage is MulticallWallet(address(0)), IMockFake {
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}
