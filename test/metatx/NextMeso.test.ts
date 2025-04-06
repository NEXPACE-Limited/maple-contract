import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { PopulatedTransaction } from "ethers";
import { NextMeso } from "../../typechain-types";
import { sendMetaTransaction } from "../lib/metatx";
import nxErrors from "../lib/nx-errors";

const receiverAddress = "0x" + "11".repeat(20);

describe("meta-transaction NextMeso", function () {
  async function fixture() {
    const [owner, executor, operator, ad1, ad2, holder1, forwarder] = await ethers.getSigners();

    const [ApproveController, NextMeso] = await Promise.all([
      ethers.getContractFactory("ApproveController"),
      ethers.getContractFactory("NextMeso"),
    ]);

    const approveController = await ApproveController.deploy(await forwarder.getAddress());
    const nextMeso = await NextMeso.deploy(await forwarder.getAddress(), approveController.address, 100_000);

    await Promise.all([
      ...[owner, executor, operator, ad1, ad2, holder1, forwarder].map(async (x) =>
        approveController.setAllowlist(await x.getAddress(), true)
      ),
      approveController.setAllowlist(receiverAddress, true),
      nextMeso.grantExecutor(await executor.getAddress()),
      nextMeso.approveOperator(await operator.getAddress()),
    ]);
    await Promise.all([nextMeso.connect(holder1).deposit({ value: 1000n })]);

    return {
      forwarder,
      owner,
      executor,
      operator,
      ad1,
      ad2,
      holder1,
      approveController,
      nextMeso,
    };
  }

  before(async () => {
    await loadFixture(fixture);
  });

  function whenExecutable(
    cb: (nextMeso: NextMeso, f: Awaited<ReturnType<typeof fixture>>) => Promise<PopulatedTransaction>
  ) {
    it("should not be reverted when forwarded sender is an owner", async function () {
      const f = await loadFixture(fixture);
      const { forwarder, nextMeso, owner } = f;

      await expect(sendMetaTransaction(forwarder, await owner.getAddress(), await cb(nextMeso, f))).not.to.be.reverted;
    });
  }

  describe("deposit", function () {
    whenExecutable(async (nextMeso, { ad1 }) => nextMeso.connect(ad1).populateTransaction.deposit({ value: 1n }));
  });

  describe("transfer", function () {
    it("should transfer forwarded sender's value", async function () {
      const { forwarder, nextMeso, holder1 } = await loadFixture(fixture);

      await expect(
        sendMetaTransaction(
          forwarder,
          await holder1.getAddress(),
          await nextMeso.populateTransaction.transfer(receiverAddress, 16n)
        )
      ).to.changeTokenBalances(nextMeso, [await holder1.getAddress(), receiverAddress], [-16n, 16n]);
    });

    it("should transfer forwarder's value when forwarder forwards his own transaction", async function () {
      const { forwarder, nextMeso, owner } = await loadFixture(fixture);
      await nextMeso.connect(owner).deposit({ value: 123n });
      await nextMeso.connect(owner).transfer(await forwarder.getAddress(), 123n);

      await expect(
        sendMetaTransaction(
          forwarder,
          await forwarder.getAddress(),
          await nextMeso.populateTransaction.transfer(receiverAddress, 16n)
        )
      ).to.changeTokenBalances(nextMeso, [await forwarder.getAddress(), receiverAddress], [-16n, 16n]);
    });
  });

  describe("transferFrom", function () {
    it("should be reverted when forwarded sender has no allowance", async function () {
      const { forwarder, nextMeso, executor, holder1 } = await loadFixture(fixture);

      await expect(
        sendMetaTransaction(
          forwarder,
          await executor.getAddress(),
          await nextMeso.populateTransaction.transferFrom(await holder1.getAddress(), receiverAddress, 1n)
        )
      ).to.be.revertedWith(nxErrors.ERC20.transferForbidden);
    });

    it("should be reverted even when forwarder has allowance", async function () {
      const { forwarder, nextMeso, executor, holder1 } = await loadFixture(fixture);
      await nextMeso.connect(holder1).approve(await forwarder.getAddress(), 1000n);

      await expect(
        sendMetaTransaction(
          forwarder,
          await executor.getAddress(),
          await nextMeso.populateTransaction.transferFrom(await holder1.getAddress(), receiverAddress, 1n)
        )
      ).to.be.revertedWith(nxErrors.ERC20.transferForbidden);
    });

    it("should be reverted even when forwarder is an operator", async function () {
      const { forwarder, owner, approveController, nextMeso, executor, holder1 } = await loadFixture(fixture);
      await Promise.all([
        approveController.connect(holder1).setApprove(true),
        nextMeso.connect(owner).approveOperator(await forwarder.getAddress()),
      ]);

      expect(
        (await nextMeso.allowance(await holder1.getAddress(), await forwarder.getAddress())).toBigInt(),
        "allowance (approved by approve controller)"
      ).to.eq(ethers.constants.MaxUint256.toBigInt());

      await expect(
        sendMetaTransaction(
          forwarder,
          await executor.getAddress(),
          await nextMeso.populateTransaction.transferFrom(await holder1.getAddress(), receiverAddress, 1n)
        ),
        "transferFrom transaction"
      ).to.be.revertedWith(nxErrors.ERC20.transferForbidden);
    });

    it("should decrease forwarded sender's allowance", async function () {
      const { forwarder, nextMeso, ad1, holder1 } = await loadFixture(fixture);
      await nextMeso.connect(holder1).approve(await ad1.getAddress(), 1000n);

      await expect(
        sendMetaTransaction(
          forwarder,
          await ad1.getAddress(),
          await nextMeso.populateTransaction.transferFrom(await holder1.getAddress(), receiverAddress, 1n)
        ),
        "transferFrom transaction"
      ).to.changeTokenBalances(nextMeso, [await holder1.getAddress(), receiverAddress], [-1n, 1n]);

      expect(
        (await nextMeso.connect(ad1).allowance(await holder1.getAddress(), await ad1.getAddress())).toBigInt(),
        "allowance left"
      ).to.eq(999n);
    });

    it("should let any allowances intact when approved by approve controller", async function () {
      const { forwarder, nextMeso, approveController, operator, ad1, holder1 } = await loadFixture(fixture);
      await Promise.all([
        approveController.connect(holder1).setApprove(true),
        nextMeso.connect(holder1).approve(await forwarder.getAddress(), 1000n),
        nextMeso.connect(holder1).approve(await operator.getAddress(), 1000n),
        nextMeso.connect(holder1).approve(await holder1.getAddress(), 1000n),
        nextMeso.connect(holder1).approve(receiverAddress, 1000n),
      ]);

      await expect(
        sendMetaTransaction(
          forwarder,
          await operator.getAddress(),
          await nextMeso.populateTransaction.transferFrom(await holder1.getAddress(), receiverAddress, 1n)
        ),
        "transferFrom transaction"
      ).to.changeTokenBalances(nextMeso, [await holder1.getAddress(), receiverAddress], [-1n, 1n]);

      await approveController.connect(holder1).setApprove(false); // to reveal inner allowance

      expect(
        (
          await Promise.all([
            nextMeso.connect(ad1).allowance(await holder1.getAddress(), await forwarder.getAddress()),
            nextMeso.connect(ad1).allowance(await holder1.getAddress(), await operator.getAddress()),
            nextMeso.connect(ad1).allowance(await holder1.getAddress(), await holder1.getAddress()),
            nextMeso.connect(ad1).allowance(await holder1.getAddress(), receiverAddress),
          ])
        ).map((x) => x.toBigInt()),
        "allowances left (expected to be intact)"
      ).to.deep.eq([1000n, 1000n, 1000n, 1000n]);
    });
  });
});
