import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { trivialOverridesERC20ApproveControlled, trivialOverridesERC20Pausable } from "../lib/trivial-overrides";
import nxErrors from "../lib/nx-errors";
import { parseEther } from "ethers/lib/utils";

describe("NextMeso", function () {
  async function deployContractsFixture() {
    const [owner, executor, operator, ad1, ad2] = await ethers.getSigners();

    const [ApproveController, NextMeso, MockReceiver, ERC1155] = await Promise.all([
      ethers.getContractFactory("ApproveController"),
      ethers.getContractFactory("NextMeso"),
      ethers.getContractFactory("MockReceiver"),
      ethers.getContractFactory("ERC1155PresetMinterPauser"),
    ]);

    const approveController = await ApproveController.deploy(ethers.constants.AddressZero);
    const nextMeso = await NextMeso.deploy(ethers.constants.AddressZero, approveController.address, 100_000);

    await nextMeso.grantExecutor(await executor.getAddress());
    await nextMeso.approveOperator(await operator.getAddress());

    const erc1155 = await ERC1155.deploy("");
    await erc1155.mint(ad1.address, 1, 1, "0x");

    const receiver = await MockReceiver.deploy(nextMeso.address);

    const exchangeRate = 100_000n;

    return {
      owner,
      executor,
      operator,
      ad1,
      ad2,
      approveController,
      nextMeso,
      exchangeRate,
      erc1155,
      receiver,
    };
  }

  async function mintAndApproveFixture() {
    const { nextMeso, owner, executor, operator, ad1, ad2, approveController } = await loadFixture(
      deployContractsFixture
    );

    await approveController.setAllowlist(await operator.getAddress(), true);
    await nextMeso.connect(ad1).deposit({ value: parseEther("1") });
    await nextMeso.connect(ad1).increaseAllowance(await operator.getAddress(), 1);
    await approveController.connect(ad1).setApprove(true);

    return { nextMeso, owner, executor, operator, ad1, ad2, approveController };
  }

  async function pausedFixture() {
    const { nextMeso, owner, executor, ad1, ad2 } = await loadFixture(deployContractsFixture);

    await nextMeso.connect(ad1).deposit({ value: parseEther("1") });
    await nextMeso.connect(executor).pause();

    return { nextMeso, owner, executor, ad1, ad2 };
  }

  before(async () => await loadFixture(deployContractsFixture));

  describe("Deposit", function () {
    it("send ether", async function () {
      const { nextMeso, ad1, exchangeRate } = await loadFixture(deployContractsFixture);
      const tx = {
        to: nextMeso.address,
        value: parseEther("1"),
      };

      await expect(ad1.sendTransaction(tx))
        .to.emit(nextMeso, "Deposit")
        .to.changeTokenBalance(nextMeso, await ad1.getAddress(), 1_000_000_000_000_000_000n * exchangeRate);
    });
    it("call funtion deposit", async function () {
      const { nextMeso, exchangeRate, ad1 } = await loadFixture(deployContractsFixture);
      const tx = nextMeso.connect(ad1).deposit({ value: parseEther("1") });
      await expect(tx)
        .to.emit(nextMeso, "Deposit")
        .to.changeTokenBalance(nextMeso, await ad1.getAddress(), 1_000_000_000_000_000_000n * exchangeRate);
    });
    it("fail - no value with call function", async function () {
      const { nextMeso, ad1 } = await loadFixture(deployContractsFixture);
      const tx = nextMeso.connect(ad1).deposit();
      await expect(tx).to.be.revertedWith(nxErrors.NextMeso.wrongValue);
    });
    it("fail - no value with fallback", async function () {
      const { nextMeso, ad1 } = await loadFixture(deployContractsFixture);
      const tx = { to: nextMeso.address, data: "0x" };
      await expect(ad1.sendTransaction(tx)).to.be.revertedWith(nxErrors.NextMeso.wrongValue);
    });
  });
  describe("Withdraw", function () {
    it("success", async function () {
      const { nextMeso, exchangeRate, ad1 } = await loadFixture(deployContractsFixture);
      await loadFixture(mintAndApproveFixture);
      await expect(nextMeso.connect(ad1).withdraw(parseEther("1")))
        .to.emit(nextMeso, "Withdrawal")
        .to.changeEtherBalance(nextMeso.address, -(1_000_000_000_000_000_000n / exchangeRate));
    });
    it("fail - low amount", async function () {
      const { nextMeso, ad1 } = await loadFixture(deployContractsFixture);
      await loadFixture(mintAndApproveFixture);
      await expect(nextMeso.connect(ad1).withdraw(1)).to.be.revertedWith(nxErrors.NextMeso.wrongAmount);
    });
    it("fail - failed to send ether", async function () {
      const { nextMeso, ad1, erc1155, receiver } = await loadFixture(deployContractsFixture);
      await loadFixture(mintAndApproveFixture);
      await nextMeso.connect(ad1).transfer(receiver.address, 100_000n);
      await expect(erc1155.connect(ad1).safeTransferFrom(ad1.address, receiver.address, 1, 1, "0x")).to.be.revertedWith(
        nxErrors.NextMeso.transferFailed
      );
    });
  });
  describe("pause", function () {
    it("should make all token transfer calls to be reverted", async function () {
      const { nextMeso, ad1 } = await loadFixture(pausedFixture);

      await expect(nextMeso.connect(ad1).transfer(await ad1.getAddress(), 1)).to.be.revertedWith(nxErrors.ERC20.paused);
    });
  });

  describe("transferFrom", function () {
    it("can called when allowance is sufficient", async function () {
      const { nextMeso, ad1, operator } = await loadFixture(mintAndApproveFixture);

      expect(
        await nextMeso.connect(operator).transferFrom(await ad1.getAddress(), await operator.getAddress(), 1)
      ).to.changeTokenBalances(nextMeso, [await ad1.getAddress(), await operator.getAddress()], [-1, 1]);
    });

    it("can called by operator when owner setAprove to approveController contract", async function () {
      const { nextMeso, operator, ad1, ad2 } = await loadFixture(mintAndApproveFixture);

      expect(
        await nextMeso.connect(operator).transferFrom(await ad1.getAddress(), await ad2.getAddress(), 1)
      ).to.changeTokenBalances(nextMeso, [await ad1.getAddress(), await ad2.getAddress()], [-1, 1]);
    });

    it("using approve function", async function () {
      const { approveController, nextMeso, ad1, ad2 } = await loadFixture(deployContractsFixture);

      await nextMeso.connect(ad2).deposit({ value: parseEther("0.01") });

      await approveController.setAllowlist(await ad1.getAddress(), true);
      await nextMeso.connect(ad2).approve(await ad1.getAddress(), 100n);
      expect(
        await nextMeso.connect(ad1).transferFrom(await ad2.getAddress(), await ad1.getAddress(), 50)
      ).to.changeTokenBalances(nextMeso, [await ad2.getAddress(), await ad1.getAddress()], [-50, 50]);
    });
  });

  describe("approve", function () {
    it("Success", async function () {
      const { approveController, nextMeso, ad1, ad2 } = await loadFixture(deployContractsFixture);

      await approveController.setAllowlist(await ad1.getAddress(), true);
      await nextMeso.connect(ad2).approve(await ad1.getAddress(), 100n);
    });
  });

  describe("retrieve neso", () => {
    it("retrieve neso", async () => {
      const { owner, ad1, ad2, nextMeso } = await loadFixture(mintAndApproveFixture);
      await expect(
        nextMeso.connect(owner).retrieveNeso(await ad1.getAddress(), await ad2.getAddress(), 1, "bad situation")
      )
        .to.emit(nextMeso, "RetrievedNeso")
        .withArgs(await ad1.getAddress(), await ad2.getAddress(), 1, "bad situation");
    });

    it("retrieve neso from not owner", async () => {
      const { ad1, ad2, nextMeso } = await loadFixture(mintAndApproveFixture);
      await expect(
        nextMeso.connect(ad1).retrieveNeso(await ad1.getAddress(), await ad2.getAddress(), 1, "bad situation")
      ).to.revertedWith(nxErrors.ownerForbidden);
    });
  });

  describe("balanceOfBatch", function () {
    it("Success", async function () {
      const { nextMeso, ad1, ad2, exchangeRate } = await loadFixture(deployContractsFixture);
      await nextMeso.connect(ad1).deposit({ value: parseEther("0.001") });
      await nextMeso.connect(ad2).deposit({ value: parseEther("0.003") });
      expect(await nextMeso.balanceOfBatch([await ad1.getAddress(), await ad2.getAddress()])).to.deep.equal([
        ethers.BigNumber.from(1_000_000_000_000_000n * exchangeRate),
        ethers.BigNumber.from(3_000_000_000_000_000n * exchangeRate),
      ]);
    });
  });
  async function trivialOverridesFixture() {
    const { nextMeso, owner, approveController, ad1 } = await loadFixture(deployContractsFixture);

    const NextMeso = await ethers.getContractFactory("NextMeso");

    const paused = await NextMeso.deploy(ethers.constants.AddressZero, approveController.address, 100_000);
    const tx = { to: nextMeso.address, value: parseEther("1") };
    const pausedTx = { to: paused.address, value: parseEther("1") };
    await ad1.sendTransaction(tx);
    await ad1.sendTransaction(pausedTx);
    await paused.pause();

    await approveController.connect(ad1).setApprove(true);

    return {
      contract: nextMeso,
      owner,
      paused,
      notPaused: nextMeso,
      holder: ad1,
      approver: ad1,
    };
  }

  trivialOverridesERC20Pausable(trivialOverridesFixture);
  trivialOverridesERC20ApproveControlled(trivialOverridesFixture);
});
