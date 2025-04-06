import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { PopulatedTransaction } from "ethers";
import { MaplestoryConsume } from "../../typechain-types";
import { sendMetaTransaction } from "../lib/metatx";
import nxErrors from "../lib/nx-errors";

const receiverAddress = "0x" + "11".repeat(20);

describe("meta-transaction MaplestoryConsume", function () {
  async function fixture() {
    const [owner, executor, operator, ad1, ad2, holder1, forwarder] = await ethers.getSigners();

    const [ApproveController, MaplestoryConsume] = await Promise.all([
      ethers.getContractFactory("ApproveController"),
      ethers.getContractFactory("MaplestoryConsume"),
    ]);

    const approveController = await ApproveController.deploy(await forwarder.getAddress());

    const consume = await MaplestoryConsume.deploy(await forwarder.getAddress(), approveController.address, "");

    await Promise.all([
      ...[owner, executor, operator, ad1, ad2, holder1, forwarder].map(async (x) =>
        approveController.setAllowlist(await x.getAddress(), true)
      ),
      approveController.setAllowlist(receiverAddress, true),
      consume.grantExecutor(await executor.getAddress()),
      consume.approveOperator(await operator.getAddress()),
    ]);

    await Promise.all([1n, 1001n, 1234n, 1324n].map((id) => consume.connect(executor).setLimitSupply(id, 10000000n)));
    await Promise.all([consume.connect(executor).mint(await holder1.getAddress(), 1001n, 1000n, "0x")]);

    return {
      forwarder,
      owner,
      executor,
      operator,
      ad1,
      ad2,
      holder1,
      approveController,
      consume,
    };
  }

  before(async () => {
    await loadFixture(fixture);
  });

  function whenExecutable(
    cb: (consume: MaplestoryConsume, f: Awaited<ReturnType<typeof fixture>>) => Promise<PopulatedTransaction>
  ) {
    it("should not be reverted when forwarded sender is an executor", async function () {
      const f = await loadFixture(fixture);
      const { forwarder, consume, executor } = f;

      await expect(sendMetaTransaction(forwarder, await executor.getAddress(), await cb(consume, f))).not.to.be
        .reverted;
    });

    it("should be reverted when forwarder is an executor but forwarded sender is not", async function () {
      const f = await loadFixture(fixture);
      const { forwarder, consume, ad2 } = f;
      await consume.grantExecutor(await forwarder.getAddress());

      await expect(sendMetaTransaction(forwarder, await ad2.getAddress(), await cb(consume, f))).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });
  }

  describe("mint", function () {
    whenExecutable(async (consume, { ad1 }) =>
      consume.populateTransaction.mint(await ad1.getAddress(), 1234n, 1n, "0x")
    );
  });

  describe("mintBatch", function () {
    whenExecutable(async (consume, { ad1 }) =>
      consume.populateTransaction.mintBatch(await ad1.getAddress(), [1324n], [1n], "0x")
    );
  });

  describe("setDefaultURI", function () {
    whenExecutable(async (consume) => consume.populateTransaction.setDefaultURI("asdf"));
  });

  describe("setItemURI", function () {
    whenExecutable(async (consume) => consume.populateTransaction.setTokenURI("ttuuf", 12345n));
  });

  describe("safeTransferFrom", function () {
    it("should transfer forwarded sender's token", async function () {
      const { forwarder, consume, holder1 } = await loadFixture(fixture);

      await expect(
        sendMetaTransaction(
          forwarder,
          await holder1.getAddress(),
          await consume.populateTransaction.safeTransferFrom(
            await holder1.getAddress(),
            receiverAddress,
            1001n,
            1n,
            "0x"
          )
        ),
        "safeTransferFrom transaction"
      ).not.to.be.reverted;

      expect(
        (await consume.balanceOfBatch([await holder1.getAddress(), receiverAddress], [1001n, 1001n])).map((x) =>
          x.toBigInt()
        ),
        "holder and receiver balances after transfer"
      ).to.be.deep.eq([999n, 1n]);
    });

    it("should transfer forwarder's token when forwarder forwards his own transaction", async function () {
      const { forwarder, consume, executor } = await loadFixture(fixture);
      await consume.connect(executor).mint(await forwarder.getAddress(), 1n, 1000n, "0x");

      await expect(
        sendMetaTransaction(
          forwarder,
          await forwarder.getAddress(),
          await consume.populateTransaction.safeTransferFrom(
            await forwarder.getAddress(),
            receiverAddress,
            1n,
            1n,
            "0x"
          )
        ),
        "safeTransferFrom transaction"
      ).not.to.be.reverted;

      expect(
        (await consume.balanceOfBatch([await forwarder.getAddress(), receiverAddress], [1n, 1n])).map((x) =>
          x.toBigInt()
        ),
        "forwarder and receiver balances after transfer"
      ).to.be.deep.eq([999n, 1n]);
    });

    it("should be reverted when the token owner is the forwarder but not the forwarded sender", async function () {
      const { forwarder, consume, executor } = await loadFixture(fixture);
      await consume.connect(executor).mint(await forwarder.getAddress(), 1n, 1000n, "0x");

      await expect(
        sendMetaTransaction(
          forwarder,
          await executor.getAddress(),
          await consume.populateTransaction.safeTransferFrom(
            await forwarder.getAddress(),
            receiverAddress,
            1n,
            1n,
            "0x"
          )
        ),
        "safeTransferFrom transaction"
      ).to.be.revertedWith(nxErrors.ERC1155.transferForbidden);
    });

    it("should be reverted when forwarded sender was not approved", async function () {
      const { forwarder, consume, executor, holder1 } = await loadFixture(fixture);

      await expect(
        sendMetaTransaction(
          forwarder,
          await executor.getAddress(),
          await consume.populateTransaction.safeTransferFrom(
            await holder1.getAddress(),
            receiverAddress,
            1001n,
            1n,
            "0x"
          )
        )
      ).to.be.revertedWith(nxErrors.ERC1155.transferForbidden);
    });

    it("should be reverted even when forwarder was approved", async function () {
      const { forwarder, consume, executor, holder1 } = await loadFixture(fixture);
      await consume.connect(holder1).setApprovalForAll(await forwarder.getAddress(), true);

      await expect(
        sendMetaTransaction(
          forwarder,
          await executor.getAddress(),
          await consume.populateTransaction.safeTransferFrom(
            await holder1.getAddress(),
            receiverAddress,
            1001n,
            1n,
            "0x"
          )
        )
      ).to.be.revertedWith(nxErrors.ERC1155.transferForbidden);
    });

    it("should be reverted even when forwarder is an operator", async function () {
      const { forwarder, owner, approveController, consume, executor, holder1 } = await loadFixture(fixture);
      await Promise.all([
        approveController.connect(holder1).setApprove(true),
        consume.connect(owner).approveOperator(await forwarder.getAddress()),
      ]);

      expect(
        await consume.isApprovedForAll(await holder1.getAddress(), await forwarder.getAddress()),
        "isApprovedForAll (approved by approve controller)"
      ).to.be.true;

      await expect(
        sendMetaTransaction(
          forwarder,
          await executor.getAddress(),
          await consume.populateTransaction.safeTransferFrom(
            await holder1.getAddress(),
            receiverAddress,
            1001n,
            1n,
            "0x"
          )
        ),
        "safeTransferFrom transaction"
      ).to.be.revertedWith(nxErrors.ERC1155.transferForbidden);
    });

    it("should not be reverted when the forwarded sender was approved", async function () {
      const { forwarder, consume, ad1, holder1 } = await loadFixture(fixture);
      await consume.connect(holder1).setApprovalForAll(await ad1.getAddress(), true);

      await expect(
        sendMetaTransaction(
          forwarder,
          await ad1.getAddress(),
          await consume.populateTransaction.safeTransferFrom(
            await holder1.getAddress(),
            receiverAddress,
            1001n,
            1n,
            "0x"
          )
        ),
        "safeTransferFrom transaction"
      ).not.to.be.reverted;
    });

    it("should not be reverted when approved by approve controller", async function () {
      const { forwarder, consume, approveController, operator, holder1 } = await loadFixture(fixture);
      await approveController.connect(holder1).setApprove(true);

      await expect(
        sendMetaTransaction(
          forwarder,
          await operator.getAddress(),
          await consume.populateTransaction.safeTransferFrom(
            await holder1.getAddress(),
            receiverAddress,
            1001n,
            1n,
            "0x"
          )
        ),
        "safeTransferFrom transaction"
      ).not.to.be.reverted;
    });
  });

  describe("safeBatchTransferFrom", function () {
    it("should transfer forwarded sender's token", async function () {
      const { forwarder, consume, holder1 } = await loadFixture(fixture);

      await expect(
        sendMetaTransaction(
          forwarder,
          await holder1.getAddress(),
          await consume.populateTransaction.safeBatchTransferFrom(
            await holder1.getAddress(),
            receiverAddress,
            [1001n],
            [1n],
            "0x"
          )
        ),
        "safeBatchTransferFrom transaction"
      ).not.to.be.reverted;

      expect(
        (await consume.balanceOfBatch([await holder1.getAddress(), receiverAddress], [1001n, 1001n])).map((x) =>
          x.toBigInt()
        ),
        "holder and receiver balances after transfer"
      ).to.be.deep.eq([999n, 1n]);
    });
  });

  describe("burn", function () {
    it("should burn forwarded sender's token", async function () {
      const { forwarder, consume, holder1 } = await loadFixture(fixture);

      await expect(
        sendMetaTransaction(
          forwarder,
          await holder1.getAddress(),
          await consume.populateTransaction.burn(await holder1.getAddress(), 1001n, 1n)
        )
      ).not.to.be.reverted;

      expect(
        (await consume.balanceOf(await holder1.getAddress(), 1001n)).toBigInt(),
        "holder balances after burn"
      ).to.be.eq(999n);
    });
  });

  describe("burnBatch", function () {
    it("should burn forwarded sender's token", async function () {
      const { forwarder, consume, holder1 } = await loadFixture(fixture);

      await expect(
        sendMetaTransaction(
          forwarder,
          await holder1.getAddress(),
          await consume.populateTransaction.burnBatch(await holder1.getAddress(), [1001n], [1n])
        )
      ).not.to.be.reverted;

      expect(
        (await consume.balanceOf(await holder1.getAddress(), 1001n)).toBigInt(),
        "holder balances after burn"
      ).to.be.eq(999n);
    });
  });
});
