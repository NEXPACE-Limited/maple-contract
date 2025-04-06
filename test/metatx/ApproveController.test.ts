import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { sendMetaTransaction } from "../lib/metatx";

describe("meta-transaction ApproveController", function () {
  async function fixture() {
    const [owner, forwarder, user1, user2] = await ethers.getSigners();

    const [ApproveController] = await Promise.all([ethers.getContractFactory("ApproveController", owner)]);

    const approveController = await ApproveController.deploy(await forwarder.getAddress());

    return { approveController, forwarder, owner, user1, user2 };
  }

  before(async function () {
    await loadFixture(fixture);
  });

  describe("setApprove", function () {
    it("should set approval for forwarded sender", async function () {
      const { approveController, forwarder, user1 } = await loadFixture(fixture);
      await expect(
        sendMetaTransaction(
          forwarder,
          await user1.getAddress(),
          await approveController.populateTransaction.setApprove(true)
        )
      )
        .to.emit(approveController, "SetApprove")
        .withArgs(await user1.getAddress(), true);
    });

    it("should set approval for the real sender when illegally forwarded", async function () {
      const { approveController, user1, user2 } = await loadFixture(fixture);
      await expect(
        sendMetaTransaction(
          user2,
          await user1.getAddress(),
          await approveController.populateTransaction.setApprove(true)
        )
      )
        .to.emit(approveController, "SetApprove")
        .withArgs(await user2.getAddress(), true);
    });
  });
});
