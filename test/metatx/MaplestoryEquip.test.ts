import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { PopulatedTransaction } from "ethers";
import { MaplestoryEquip } from "../../typechain-types";
import { sendMetaTransaction } from "../lib/metatx";
import nxErrors from "../lib/nx-errors";

const receiverAddress = "0x" + "11".repeat(20);
const mockAddress = "0x" + "22".repeat(20);

describe("meta-transaction MaplestoryEquip", function () {
  async function fixture() {
    const [owner, executor, operator, ad1, ad2, holder1, forwarder, takebackWallet] = await ethers.getSigners();

    const [ApproveController, MaplestoryEquip, ItemIssuance] = await Promise.all([
      ethers.getContractFactory("ApproveController"),
      ethers.getContractFactory("MaplestoryEquip"),
      ethers.getContractFactory("ItemIssuance"),
    ]);

    const approveController = await ApproveController.deploy(await forwarder.getAddress());
    const itemIssuance = await ItemIssuance.deploy(await forwarder.getAddress(), mockAddress, mockAddress);
    await itemIssuance.createUniverse("MapleStory Universe");

    const equip = await MaplestoryEquip.deploy(
      await forwarder.getAddress(),
      approveController.address,
      itemIssuance.address,
      ""
    );
    await itemIssuance.registerItem721Contract(1, equip.address);

    await Promise.all([
      ...[owner, executor, operator, ad1, ad2, holder1, forwarder].map(async (x) =>
        approveController.setAllowlist(await x.getAddress(), true)
      ),
      approveController.setAllowlist(receiverAddress, true),
      equip.grantExecutor(await executor.getAddress()),
      equip.approveOperator(await operator.getAddress()),
    ]);
    await Promise.all([equip.connect(owner).setLimitSupply(1234n, 100, true)]);
    await Promise.all([equip.connect(executor).mint(await holder1.getAddress(), 1234n, 1001n)]);

    return {
      forwarder,
      owner,
      executor,
      operator,
      ad1,
      ad2,
      holder1,
      approveController,
      equip,
      takebackWallet,
    };
  }

  before(async () => {
    await loadFixture(fixture);
  });

  function onlyOwner(
    cb: (equip: MaplestoryEquip, f: Awaited<ReturnType<typeof fixture>>) => Promise<PopulatedTransaction>
  ) {
    it("should not be reverted when forwarded sender is the owner", async function () {
      const f = await loadFixture(fixture);
      const { forwarder, equip, owner } = f;

      await expect(sendMetaTransaction(forwarder, await owner.getAddress(), await cb(equip, f))).not.to.be.reverted;
    });

    it("should be reverted when forwarder is the owner but forwarded sender is not", async function () {
      const f = await loadFixture(fixture);
      const { forwarder, equip, owner } = f;
      await equip.transferOwnership(await forwarder.getAddress());

      await expect(sendMetaTransaction(forwarder, await owner.getAddress(), await cb(equip, f))).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });
  }

  function whenExecutable(
    cb: (equip: MaplestoryEquip, f: Awaited<ReturnType<typeof fixture>>) => Promise<PopulatedTransaction>
  ) {
    it("should not be reverted when forwarded sender is an executor", async function () {
      const f = await loadFixture(fixture);
      const { forwarder, equip, executor } = f;

      await expect(sendMetaTransaction(forwarder, await executor.getAddress(), await cb(equip, f))).not.to.be.reverted;
    });

    it("should be reverted when forwarder is an executor but forwarded sender is not", async function () {
      const f = await loadFixture(fixture);
      const { forwarder, equip, ad2 } = f;
      await equip.grantExecutor(await forwarder.getAddress());

      await expect(sendMetaTransaction(forwarder, await ad2.getAddress(), await cb(equip, f))).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });
  }

  describe("mint", function () {
    whenExecutable(async (equip, { ad1 }) => equip.populateTransaction.mint(await ad1.getAddress(), 1234n, 1n));
  });

  describe("mintBatch", function () {
    whenExecutable(async (equip, { ad1 }) =>
      equip.populateTransaction.mintBatch(await ad1.getAddress(), [{ itemId: 1234n, tokenId: 1n }])
    );
  });

  describe("setDefaultURI", function () {
    whenExecutable(async (equip) => equip.populateTransaction.setDefaultURI("asdf"));
  });

  describe("setItemURI", function () {
    whenExecutable(async (equip) => equip.populateTransaction.setItemURI(1234n, "uuuu"));
  });

  describe("setLimitSupply", function () {
    onlyOwner(async (equip) => equip.populateTransaction.setLimitSupply(12345n, 5000n, true));
  });

  describe("transferFrom", function () {
    it("should transfer forwarded sender's token", async function () {
      const { forwarder, equip, holder1 } = await loadFixture(fixture);

      await expect(
        sendMetaTransaction(
          forwarder,
          await holder1.getAddress(),
          await equip.populateTransaction.transferFrom(await holder1.getAddress(), receiverAddress, 1001n)
        ),
        "transferFrom transaction"
      ).not.to.be.reverted;

      expect(await equip.ownerOf(1001n), "token owner after transfer").to.eq(receiverAddress);
    });

    it("should transfer forwarder's token when forwarder forwards his own transaction", async function () {
      const { forwarder, equip, executor } = await loadFixture(fixture);
      await equip.connect(executor).mint(await forwarder.getAddress(), 1234n, 1n);

      await expect(
        sendMetaTransaction(
          forwarder,
          await forwarder.getAddress(),
          await equip.populateTransaction.transferFrom(await forwarder.getAddress(), receiverAddress, 1n)
        ),
        "transferFrom transaction"
      ).not.to.be.reverted;

      expect(await equip.ownerOf(1n), "token owner after transfer").to.eq(receiverAddress);
    });

    it("should be reverted when the token owner is the forwarder but not the forwarded sender", async function () {
      const { forwarder, equip, executor } = await loadFixture(fixture);
      await equip.connect(executor).mint(await forwarder.getAddress(), 1234n, 1n);

      await expect(
        sendMetaTransaction(
          forwarder,
          await executor.getAddress(),
          await equip.populateTransaction.transferFrom(await forwarder.getAddress(), receiverAddress, 1n)
        ),
        "transferFrom transaction"
      ).to.be.revertedWith(nxErrors.ERC721.transferForbidden);
    });

    it("should be reverted when forwarded sender was not approved", async function () {
      const { forwarder, equip, executor, holder1 } = await loadFixture(fixture);

      await expect(
        sendMetaTransaction(
          forwarder,
          await executor.getAddress(),
          await equip.populateTransaction.transferFrom(await holder1.getAddress(), receiverAddress, 1001n)
        )
      ).to.be.revertedWith(nxErrors.ERC721.transferForbidden);
    });

    it("should be reverted even when forwarder was approved", async function () {
      const { forwarder, equip, executor, holder1 } = await loadFixture(fixture);
      await equip.connect(holder1).approve(await forwarder.getAddress(), 1001n);

      await expect(
        sendMetaTransaction(
          forwarder,
          await executor.getAddress(),
          await equip.populateTransaction.transferFrom(await holder1.getAddress(), receiverAddress, 1001n)
        )
      ).to.be.revertedWith(nxErrors.ERC721.transferForbidden);
    });

    it("should be reverted even when forwarder is an operator", async function () {
      const { forwarder, owner, approveController, equip, executor, holder1 } = await loadFixture(fixture);
      await Promise.all([
        approveController.connect(holder1).setApprove(true),
        equip.connect(owner).approveOperator(await forwarder.getAddress()),
      ]);

      expect(
        await equip.isApprovedForAll(await holder1.getAddress(), await forwarder.getAddress()),
        "isApprovedForAll (approved by approve controller)"
      ).to.be.true;

      await expect(
        sendMetaTransaction(
          forwarder,
          await executor.getAddress(),
          await equip.populateTransaction.transferFrom(await holder1.getAddress(), receiverAddress, 1001n)
        ),
        "transferFrom transaction"
      ).to.be.revertedWith(nxErrors.ERC721.transferForbidden);
    });

    it("should not be reverted when the forwarded sender was approved", async function () {
      const { forwarder, equip, ad1, holder1 } = await loadFixture(fixture);
      await equip.connect(holder1).approve(await ad1.getAddress(), 1001n);

      await expect(
        sendMetaTransaction(
          forwarder,
          await ad1.getAddress(),
          await equip.populateTransaction.transferFrom(await holder1.getAddress(), receiverAddress, 1001n)
        ),
        "transferFrom transaction"
      ).not.to.be.reverted;
    });

    it("should not be reverted when approved by approve controller", async function () {
      const { forwarder, equip, approveController, operator, holder1 } = await loadFixture(fixture);
      await approveController.connect(holder1).setApprove(true);

      await expect(
        sendMetaTransaction(
          forwarder,
          await operator.getAddress(),
          await equip.populateTransaction.transferFrom(await holder1.getAddress(), receiverAddress, 1001n)
        ),
        "transferFrom transaction"
      ).not.to.be.reverted;
    });
  });

  describe("burn", function () {
    it("should burn forwarded sender's token", async function () {
      const { forwarder, equip, holder1 } = await loadFixture(fixture);

      await expect(
        sendMetaTransaction(forwarder, await holder1.getAddress(), await equip.populateTransaction.burn(1001n))
      ).not.to.be.reverted;
    });

    it("should not be reverted when the forwarded sender was approved", async function () {
      const { forwarder, equip, ad1, holder1 } = await loadFixture(fixture);
      await equip.connect(holder1).approve(await ad1.getAddress(), 1001n);

      await expect(
        sendMetaTransaction(forwarder, await ad1.getAddress(), await equip.populateTransaction.burn(1001n)),
        "burn transaction"
      ).not.to.be.reverted;
    });

    it("should not be reverted when the forwarded sender was approved", async function () {
      const { forwarder, equip, ad1, holder1 } = await loadFixture(fixture);
      await equip.connect(holder1).approve(await ad1.getAddress(), 1001n);

      await expect(
        sendMetaTransaction(forwarder, await ad1.getAddress(), await equip.populateTransaction.burn(1001n)),
        "burn transaction"
      ).not.to.be.reverted;
    });
  });
});
