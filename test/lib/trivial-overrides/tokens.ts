import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, Signer } from "ethers";
import {
  ERC1155ApproveControlled,
  ERC1155Pausable,
  ERC20ApproveControlled,
  ERC20Pausable,
  ERC721ApproveControlled,
  ERC721Pausable,
} from "../../../typechain-types";
import nxErrors from "../nx-errors";

export function trivialOverridesERC20Pausable(
  fixture: () => Promise<{
    paused: ERC20Pausable;
    notPaused: ERC20Pausable;
    holder: Signer;
  }>
) {
  describe("trivial overrides - ERC20Pausable", function () {
    // does not test the base function, but checks if it calls the correct base function

    it("transfer", async function () {
      const { paused, notPaused, holder } = await loadFixture(fixture);

      const recipientAddress = ethers.utils.getCreate2Address(
        await holder.getAddress(),
        ethers.utils.solidityKeccak256(["string"], ["recipient"]),
        "0x" + "00".repeat(32)
      );

      await expect(paused.connect(holder).transfer(recipientAddress, 1n), "transfer when paused").to.be.revertedWith(
        nxErrors.ERC20.paused
      );

      await expect(notPaused.connect(holder).transfer(recipientAddress, 1n), "transfer when not paused").not.to.be
        .reverted;
    });
  });
}

export function trivialOverridesERC721Pausable(
  fixture: () => Promise<{
    paused: ERC721Pausable;
    notPaused: ERC721Pausable;
    holder: Signer;
  }>
) {
  describe("trivial overrides - ERC721Pausable", function () {
    // does not test the base function, but checks if it calls the correct base function

    it("transferFrom", async function () {
      const { paused, notPaused, holder } = await loadFixture(fixture);

      const recipientAddress = ethers.utils.getCreate2Address(
        await holder.getAddress(),
        ethers.utils.solidityKeccak256(["string"], ["recipient"]),
        "0x" + "00".repeat(32)
      );

      await expect(
        paused.connect(holder).transferFrom(await holder.getAddress(), recipientAddress, 1),
        "transfer when paused"
      ).to.be.revertedWith(nxErrors.ERC721.paused);

      await expect(
        notPaused.connect(holder).transferFrom(await holder.getAddress(), recipientAddress, 1),
        "transfer when not paused"
      ).not.to.be.reverted;
    });
  });
}

export function trivialOverridesERC1155Pausable(
  fixture: () => Promise<{
    paused: ERC1155Pausable;
    notPaused: ERC1155Pausable;
    holder: Signer;
  }>
) {
  describe("trivial overrides - ERC1155Pausable", function () {
    // does not test the base function, but checks if it calls the correct base function

    it("safeTransferFrom", async function () {
      const { paused, notPaused, holder } = await loadFixture(fixture);

      const recipientAddress = ethers.utils.getCreate2Address(
        await holder.getAddress(),
        ethers.utils.solidityKeccak256(["string"], ["recipient"]),
        "0x" + "00".repeat(32)
      );

      await expect(
        paused.connect(holder).safeTransferFrom(await holder.getAddress(), recipientAddress, 1, 1n, "0x"),
        "transfer when paused"
      ).to.be.revertedWith(nxErrors.ERC1155.paused);

      await expect(
        notPaused.connect(holder).safeTransferFrom(await holder.getAddress(), recipientAddress, 1, 1n, "0x"),
        "transfer when not paused"
      ).not.to.be.reverted;
    });
  });
}

export function trivialOverridesERC20ApproveControlled(
  fixture: () => Promise<{
    contract: ERC20ApproveControlled;
    approver: Signer;
    owner: Signer;
  }>
) {
  describe("trivial overrides - ERC20ApproveControlled", function () {
    // does not test the base function, but checks if it calls the correct base function

    it("allowance", async function () {
      const { contract, approver, owner } = await loadFixture(fixture);

      const operatorAddress = ethers.utils.getCreate2Address(
        await owner.getAddress(),
        ethers.utils.solidityKeccak256(["string"], ["operator"]),
        "0x" + "00".repeat(32)
      );

      await expect(
        await contract.connect(approver).allowance(await approver.getAddress(), operatorAddress),
        "allowance before approve"
      ).to.eq(0n);

      await contract.connect(owner).approveOperator(operatorAddress);

      await expect(
        await contract.connect(approver).allowance(await approver.getAddress(), operatorAddress),
        "allowance after approve"
      ).to.eq((1n << 256n) - 1n);
    });
  });
}

export function trivialOverridesERC721ApproveControlled(
  fixture: () => Promise<{
    contract: ERC721ApproveControlled;
    approver: Signer;
    owner: Signer;
  }>
) {
  describe("trivial overrides - ERC721ApproveControlled", function () {
    // does not test the base function, but checks if it calls the correct base function

    it("isApprovedForAll", async function () {
      const { contract, approver, owner } = await loadFixture(fixture);

      const operatorAddress = ethers.utils.getCreate2Address(
        await owner.getAddress(),
        ethers.utils.solidityKeccak256(["string"], ["operator"]),
        "0x" + "00".repeat(32)
      );

      await expect(
        await contract.connect(approver).isApprovedForAll(await approver.getAddress(), operatorAddress),
        "isApprovedForAll before approve"
      ).to.be.false;

      await contract.connect(owner).approveOperator(operatorAddress);

      await expect(
        await contract.isApprovedForAll(await approver.getAddress(), operatorAddress),
        "isApprovedForAll after approve"
      ).to.be.true;
    });
  });
}

export function trivialOverridesERC1155ApproveControlled(
  fixture: () => Promise<{
    contract: ERC1155ApproveControlled;
    approver: Signer;
    owner: Signer;
    ad1: Signer;
  }>
) {
  describe("trivial overrides - ERC1155ApproveControlled", function () {
    // does not test the base function, but checks if it calls the correct base function

    it("isApprovedForAll", async function () {
      const { contract, approver, owner, ad1 } = await loadFixture(fixture);

      const operatorAddress = ethers.utils.getCreate2Address(
        await owner.getAddress(),
        ethers.utils.solidityKeccak256(["string"], ["operator"]),
        "0x" + "00".repeat(32)
      );

      await expect(
        await contract.connect(ad1).isApprovedForAll(await approver.getAddress(), operatorAddress),
        "isApprovedForAll before approve"
      ).to.be.false;

      await contract.connect(owner).approveOperator(operatorAddress);

      await expect(
        await contract.connect(ad1).isApprovedForAll(await approver.getAddress(), operatorAddress),
        "isApprovedForAll after approve"
      ).to.be.true;
    });
  });
}
