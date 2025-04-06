import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { trivialOverridesERC1155ApproveControlled, trivialOverridesERC1155Pausable } from "../lib/trivial-overrides";
import nxErrors from "../lib/nx-errors";
const fakeAddress = "0x0000000000000000000000000000000000000001";

describe("MaplestoryConsume", function () {
  async function consumeFixture() {
    const [owner, executor, ad1, ad2, holder] = await ethers.getSigners();
    const defaultURI = "https://defaultURI.com/";
    const changedURI = "https://changedURI.com/";
    const tokenURI = "https://tokenURI.com/";
    const DATA = "0x";

    // tokens that minted before test
    const tokenIds = [1, 2, 3, 4, 5];
    const tokenAmounts = [10, 20, 30, 40, 50];

    // tokens info for testing mint functions
    const mintTokenIds = [6, 7, 8, 9, 10];
    const mintTokenAmounts = [10, 20, 30, 40, 50];

    // token info for testing limitSupply
    const newTokenIds = [11, 12, 13, 14, 15];
    const newLimitSupply = 50;

    // deploy contracts
    const [Consume, Controller] = await Promise.all([
      ethers.getContractFactory("MaplestoryConsume"),
      ethers.getContractFactory("ApproveController"),
    ]);
    const controller = await Controller.connect(owner).deploy(fakeAddress);

    const consume = await Consume.connect(owner).deploy(fakeAddress, controller.address, defaultURI);

    // intial settings
    await consume.grantExecutor(await executor.getAddress());
    await consume.approveOperator(await executor.getAddress());
    await controller.connect(ad1).setApprove(true);

    // set limitSupply of all tokens and mint tokens
    await Promise.all(
      [...tokenIds, ...mintTokenIds].map((id) => consume.connect(owner).setLimitSupply(id, newLimitSupply))
    );

    await consume.connect(executor).mintBatch(await ad1.getAddress(), tokenIds, tokenAmounts, DATA);
    // deploy new equip contract for testing pause
    const [paused, notPaused] = await Promise.all([
      Consume.connect(owner).deploy(fakeAddress, controller.address, defaultURI),
      Consume.connect(owner).deploy(fakeAddress, controller.address, defaultURI),
    ]);
    await Promise.all(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => paused.connect(owner).setLimitSupply(id, "9223372036854775807")) // MaxInt64
    );
    await Promise.all(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => notPaused.connect(owner).setLimitSupply(id, "9223372036854775807"))
    );
    await Promise.all([
      controller.connect(holder).setApprove(true),
      notPaused.mint(await holder.getAddress(), 1, 1n, DATA),
      paused.mint(await holder.getAddress(), 1, 1n, DATA),
    ]);
    await paused.pause();
    return {
      consume,
      controller,
      owner,
      executor,
      ad1,
      ad2,
      defaultURI,
      changedURI,
      tokenURI,
      DATA,
      tokenIds,
      tokenAmounts,
      mintTokenIds,
      mintTokenAmounts,
      newTokenIds,
      newLimitSupply,
      contract: consume,
      paused,
      notPaused,
      approver: holder,
      holder,
    };
  }

  // preload fixture
  before(async function () {
    await loadFixture(consumeFixture);
  });

  describe("Minting Test", function () {
    it("Mint by executor", async function () {
      const { consume, executor, ad1, mintTokenIds, mintTokenAmounts, DATA } = await loadFixture(consumeFixture);
      await consume.connect(executor).mint(await ad1.getAddress(), mintTokenIds[0], mintTokenAmounts[0], DATA);
    });
    it("Mint fail when msg sender is not executor", async function () {
      const { consume, ad1, mintTokenIds, mintTokenAmounts, DATA } = await loadFixture(consumeFixture);
      await expect(
        consume.connect(ad1).mint(await ad1.getAddress(), mintTokenIds[0], mintTokenAmounts[0], DATA)
      ).to.be.revertedWith(nxErrors.executorForbidden);
    });
    it("Mint fail when mint to zero address", async function () {
      const { consume, executor, mintTokenIds, mintTokenAmounts, DATA } = await loadFixture(consumeFixture);
      await expect(
        consume.connect(executor).mint(ethers.constants.AddressZero, mintTokenIds[0], mintTokenAmounts[0], DATA)
      ).to.be.revertedWith(nxErrors.ERC1155.invalidRequest);
    });
    it("Mint fail when token limit supply is not set", async function () {
      const { consume, executor, newTokenIds, DATA } = await loadFixture(consumeFixture);
      await expect(consume.connect(executor).mint(executor.address, newTokenIds[0], 100n, DATA)).to.be.revertedWith(
        nxErrors.MaplestoryConsume.mintInvalidTokenID
      );
    });
    it("Mint fail when over mint", async function () {
      const { consume, executor, tokenIds, DATA } = await loadFixture(consumeFixture);
      await expect(consume.connect(executor).mint(executor.address, tokenIds[0], 100n, DATA)).to.be.revertedWith(
        nxErrors.MaplestoryConsume.overMint
      );
    });
    it("Mint fail when amount overflow", async function () {
      const { consume, executor, tokenIds, DATA } = await loadFixture(consumeFixture);
      await expect(
        consume.connect(executor).mint(executor.address, tokenIds[0], 9223372036854775808n, DATA)
      ).to.be.revertedWith(nxErrors.MaplestoryConsume.amountOverflow);
    });
    it("Mint fail when paused", async function () {
      const { consume, executor, ad1, mintTokenIds, mintTokenAmounts, DATA } = await loadFixture(consumeFixture);
      await consume.connect(executor).pause();
      await expect(
        consume.connect(executor).mint(await ad1.getAddress(), mintTokenIds[0], mintTokenAmounts[0], DATA)
      ).to.be.revertedWith(nxErrors.paused);
    });
    it("Mint batch token by executor", async function () {
      const { consume, executor, ad1, mintTokenIds, mintTokenAmounts, DATA } = await loadFixture(consumeFixture);
      await consume.connect(executor).mintBatch(await ad1.getAddress(), mintTokenIds, mintTokenAmounts, DATA);
    });
    it("Mint batch fail when token limit supply is not set", async function () {
      const { consume, executor, ad1, newTokenIds, mintTokenAmounts, DATA } = await loadFixture(consumeFixture);
      await expect(
        consume.connect(executor).mintBatch(await ad1.getAddress(), newTokenIds, mintTokenAmounts, DATA)
      ).to.be.revertedWith(nxErrors.MaplestoryConsume.mintInvalidTokenID);
    });
    it("Mint batch fail when over mint", async function () {
      const { consume, executor, tokenIds, DATA } = await loadFixture(consumeFixture);
      const mintTokenAmounts = [100n, 100n, 100n, 100n, 100n];
      await expect(
        consume.connect(executor).mintBatch(executor.address, tokenIds, mintTokenAmounts, DATA)
      ).to.be.revertedWith(nxErrors.MaplestoryConsume.overMint);
    });

    it("Mint batch fail when amount overflow", async function () {
      const { consume, executor, tokenIds, DATA } = await loadFixture(consumeFixture);
      const mintTokenAmounts = [
        9223372036854775808n,
        9223372036854775808n,
        9223372036854775808n,
        9223372036854775808n,
        9223372036854775808n,
      ];
      await expect(
        consume.connect(executor).mintBatch(executor.address, tokenIds, mintTokenAmounts, DATA)
      ).to.be.revertedWith(nxErrors.MaplestoryConsume.amountOverflow);
    });
    it("Mint batch fail when have differ with amounts and ids length", async function () {
      const { consume, executor, ad1, mintTokenAmounts, DATA } = await loadFixture(consumeFixture);
      const newTokenIds = [11, 12, 13, 14];

      await expect(
        consume.connect(executor).mintBatch(await ad1.getAddress(), newTokenIds, mintTokenAmounts, DATA)
      ).to.be.revertedWith(nxErrors.ERC1155.invalidRequest);
    });
    it("Mint batch token fail when msg sender is not executor", async function () {
      const { consume, ad1, mintTokenIds, mintTokenAmounts, DATA } = await loadFixture(consumeFixture);
      await expect(
        consume.connect(ad1).mintBatch(await ad1.getAddress(), mintTokenIds, mintTokenAmounts, DATA)
      ).to.be.revertedWith(nxErrors.executorForbidden);
    });
    it("Mint batch token fail when paused", async function () {
      const { consume, executor, ad1, mintTokenIds, mintTokenAmounts, DATA } = await loadFixture(consumeFixture);
      await consume.connect(executor).pause();
      await expect(
        consume.connect(executor).mintBatch(await ad1.getAddress(), mintTokenIds, mintTokenAmounts, DATA)
      ).to.be.revertedWith(nxErrors.paused);
    });
  });

  describe("Set Supplys", function () {
    it("Set item limit supply by owner", async function () {
      const { consume, owner, newTokenIds, newLimitSupply } = await loadFixture(consumeFixture);
      await consume.connect(owner).setLimitSupply(newTokenIds[0], newLimitSupply);
      expect(await consume.getTokenLimitSupply(newTokenIds[0])).to.be.equal(newLimitSupply);
    });
    it("Set item limit supply fail when over int64 max value", async function () {
      const { consume, owner, newTokenIds } = await loadFixture(consumeFixture);
      const newLimitSupply = "9223372036854775808";
      await expect(consume.connect(owner).setLimitSupply(newTokenIds[0], newLimitSupply)).to.be.revertedWith(
        nxErrors.MaplestoryConsume.setSupplyOverflow
      );
    });
    it("Set item limit supply fail when msg sender is not owner", async function () {
      const { consume, ad1, newTokenIds, newLimitSupply } = await loadFixture(consumeFixture);
      await expect(consume.connect(ad1).setLimitSupply(newTokenIds[0], newLimitSupply)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });
    it("Set item limit supply that already set", async function () {
      const { consume, owner, tokenIds, newLimitSupply } = await loadFixture(consumeFixture);
      await expect(consume.connect(owner).setLimitSupply(tokenIds[0], newLimitSupply)).to.be.revertedWith(
        nxErrors.MaplestoryConsume.setLimitSupply
      );
    });
  });

  describe("Token info getter Test", function () {
    it("Check total & limit supply of minted token", async function () {
      const { consume } = await loadFixture(consumeFixture);
      expect(await consume.getTokenLimitSupply(1)).equal(50n);
      expect(await consume.getTokenOnChainAmount(1)).to.be.equal(10);
      expect(await consume.getTokenOffChainAmount(1)).to.be.equal(-10);
      expect(await consume.getTokenOnChainBurnedAmount(1)).to.be.equal(0);
      expect(await consume.getTokenOffChainUsedAmount(1)).to.be.equal(0);
      expect(await consume.getTokenIssuedAmount(1)).to.be.equal(0);
    });
    it("Check total & limit supply of not exist token ", async function () {
      const { consume, newTokenIds } = await loadFixture(consumeFixture);
      await expect(consume.getTokenLimitSupply(newTokenIds[0])).to.be.revertedWith(
        nxErrors.MaplestoryConsume.tokenNotExists
      );
      await expect(consume.getTokenOnChainAmount(newTokenIds[0])).to.be.revertedWith(
        nxErrors.MaplestoryConsume.tokenNotExists
      );
      await expect(consume.getTokenOffChainAmount(newTokenIds[0])).to.be.revertedWith(
        nxErrors.MaplestoryConsume.tokenNotExists
      );
      await expect(consume.getTokenOnChainBurnedAmount(newTokenIds[0])).to.be.revertedWith(
        nxErrors.MaplestoryConsume.tokenNotExists
      );
      await expect(consume.getTokenOffChainUsedAmount(newTokenIds[0])).to.be.revertedWith(
        nxErrors.MaplestoryConsume.tokenNotExists
      );
      await expect(consume.getTokenIssuedAmount(newTokenIds[0])).to.be.revertedWith(
        nxErrors.MaplestoryConsume.tokenNotExists
      );
    });
  });

  describe("Transfer Test", function () {
    it("Transfer by token's owner", async function () {
      const { consume, ad1, ad2, DATA } = await loadFixture(consumeFixture);
      await consume.connect(ad1).safeTransferFrom(await ad1.getAddress(), await ad2.getAddress(), 1, 10, DATA);
      expect(await consume.balanceOf(await ad2.getAddress(), 1)).to.be.equal(10);
    });
    it("Transfer by executor", async function () {
      const { consume, executor, ad1, ad2, DATA } = await loadFixture(consumeFixture);
      await consume.connect(executor).safeTransferFrom(await ad1.getAddress(), await ad2.getAddress(), 1, 10, DATA);
      expect(await consume.balanceOf(await ad2.getAddress(), 1)).to.be.equal(10);
    });
    it("Transfer fail when msg sender is not token's owner", async function () {
      const { consume, ad1, ad2, DATA } = await loadFixture(consumeFixture);
      await expect(
        consume.connect(ad2).safeTransferFrom(await ad1.getAddress(), await ad2.getAddress(), 1, 10, DATA)
      ).to.be.revertedWith(nxErrors.ERC1155.transferForbidden);
    });
    it("Transfer token by approved wallet", async function () {
      const { controller, consume, ad1, ad2, DATA } = await loadFixture(consumeFixture);
      await controller.setAllowlist(await ad2.getAddress(), true);
      await consume.connect(ad1).setApprovalForAll(await ad2.getAddress(), true);
      await consume.connect(ad2).safeTransferFrom(await ad1.getAddress(), await ad2.getAddress(), 1, 10, DATA);
      expect(await consume.balanceOf(await ad2.getAddress(), 1)).to.be.equal(10);
    });
  });

  describe("Pause Test", async function () {
    it("Pause by executor", async function () {
      const { consume, executor } = await loadFixture(consumeFixture);
      await consume.connect(executor).pause();
      expect(await consume.paused()).to.be.equal(true);
    });
    it("Transfer fail when paused", async function () {
      const { consume, executor, ad1, ad2, DATA } = await loadFixture(consumeFixture);
      await consume.connect(executor).pause();
      await expect(
        consume.connect(ad1).safeTransferFrom(await ad1.getAddress(), await ad2.getAddress(), 1, 10, DATA)
      ).to.be.revertedWith(nxErrors.ERC1155.paused);
    });
    it("Unpause by owner", async function () {
      const { consume, owner, executor } = await loadFixture(consumeFixture);
      await consume.connect(executor).pause();
      expect(await consume.paused()).to.be.equal(true);
      await consume.connect(owner).unpause();
      expect(await consume.paused()).to.be.equal(false);
    });
    it("Pause fail when msg sender is not executor", async function () {
      const { consume, ad1 } = await loadFixture(consumeFixture);
      await expect(consume.connect(ad1).pause()).to.be.revertedWith(nxErrors.executorForbidden);
    });
    it("Unpause fail when msg sender is not owner", async function () {
      const { consume, ad1, executor } = await loadFixture(consumeFixture);
      await consume.connect(executor).pause();
      await expect(consume.connect(ad1).unpause()).to.be.revertedWith(nxErrors.ownerForbidden);
    });
  });

  describe("Melt Test", async function () {
    it("Melt token by executor", async function () {
      const { consume, executor, ad1 } = await loadFixture(consumeFixture);
      const currentAmount = await consume.balanceOf(await ad1.getAddress(), 1);
      await consume.connect(executor).melt(await ad1.getAddress(), 1, 5);
      expect(await consume.balanceOf(await ad1.getAddress(), 1)).to.be.equal(currentAmount.sub(5));
    });
    it("Melt batch tokens by executor", async function () {
      const { consume, executor, ad1 } = await loadFixture(consumeFixture);
      const currentAmount_1 = await consume.balanceOf(await ad1.getAddress(), 1);
      const currentAmount_2 = await consume.balanceOf(await ad1.getAddress(), 2);
      await consume.connect(executor).meltBatch(await ad1.getAddress(), [1, 2], [5, 5]);
      expect(await consume.balanceOf(await ad1.getAddress(), 1)).to.be.equal(currentAmount_1.sub(5));
      expect(await consume.balanceOf(await ad1.getAddress(), 2)).to.be.equal(currentAmount_2.sub(5));
    });
    it("Melt fail when amount overflow", async function () {
      const { consume, executor, tokenIds } = await loadFixture(consumeFixture);
      await expect(
        consume.connect(executor).melt(executor.address, tokenIds[0], 9223372036854775808n)
      ).to.be.revertedWith(nxErrors.MaplestoryConsume.amountOverflow);
    });
    it("Melt batch fail when amount overflow", async function () {
      const { consume, executor, tokenIds } = await loadFixture(consumeFixture);
      const meltTokenAmounts = [
        9223372036854775808n,
        9223372036854775808n,
        9223372036854775808n,
        9223372036854775808n,
        9223372036854775808n,
      ];
      await expect(
        consume.connect(executor).meltBatch(executor.address, tokenIds, meltTokenAmounts)
      ).to.be.revertedWith(nxErrors.MaplestoryConsume.amountOverflow);
    });
    it("Melt fail when msg sender is not executor", async function () {
      const { consume, ad1 } = await loadFixture(consumeFixture);
      await expect(consume.connect(ad1).melt(await ad1.getAddress(), 1, 5)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });
    it("Melt batch fail when msg sender is not executor", async function () {
      const { consume, ad1 } = await loadFixture(consumeFixture);
      await expect(consume.connect(ad1).meltBatch(await ad1.getAddress(), [1, 2], [5, 5])).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });
  });

  describe("Burn Test", async function () {
    it("Burn by token's owner", async function () {
      const { consume, ad1 } = await loadFixture(consumeFixture);
      const currentAmount = await consume.balanceOf(await ad1.getAddress(), 1);
      await consume.connect(ad1).burn(await ad1.getAddress(), 1, 5);
      expect(await consume.balanceOf(await ad1.getAddress(), 1)).to.be.equal(currentAmount.sub(5));
    });
    it("Burn by approved wallet", async function () {
      const { controller, consume, ad1, ad2 } = await loadFixture(consumeFixture);
      const currentAmount = await consume.balanceOf(await ad1.getAddress(), 1);
      await controller.setAllowlist(await ad2.getAddress(), true);
      await consume.connect(ad1).setApprovalForAll(await ad2.getAddress(), true);
      await consume.connect(ad2).burn(await ad1.getAddress(), 1, 5);
      expect(await consume.balanceOf(await ad1.getAddress(), 1)).to.be.equal(currentAmount.sub(5));
      expect(await consume.getTokenOnChainBurnedAmount(1)).equal(5);
    });
    it("Burn batch tokens by token's owner", async function () {
      const { consume, ad1 } = await loadFixture(consumeFixture);
      const currentAmount_1 = await consume.balanceOf(await ad1.getAddress(), 1);
      const currentAmount_2 = await consume.balanceOf(await ad1.getAddress(), 2);
      await consume.connect(ad1).burnBatch(await ad1.getAddress(), [1, 2], [5, 5]);
      expect(await consume.balanceOf(await ad1.getAddress(), 1)).to.be.equal(currentAmount_1.sub(5));
      expect(await consume.balanceOf(await ad1.getAddress(), 2)).to.be.equal(currentAmount_2.sub(5));
    });
    it("Burn batch tokens by approved wallet", async function () {
      const { controller, consume, ad1, ad2 } = await loadFixture(consumeFixture);
      const currentAmount_1 = await consume.balanceOf(await ad1.getAddress(), 1);
      const currentAmount_2 = await consume.balanceOf(await ad1.getAddress(), 2);
      await controller.setAllowlist(await ad2.getAddress(), true);
      await consume.connect(ad1).setApprovalForAll(await ad2.getAddress(), true);
      await consume.connect(ad2).burnBatch(await ad1.getAddress(), [1, 2], [5, 5]);
      expect(await consume.balanceOf(await ad1.getAddress(), 1)).to.be.equal(currentAmount_1.sub(5));
      expect(await consume.balanceOf(await ad1.getAddress(), 2)).to.be.equal(currentAmount_2.sub(5));
    });
    it("Burn fail when amount overflow", async function () {
      const { consume, executor, tokenIds } = await loadFixture(consumeFixture);
      await expect(
        consume.connect(executor).burn(executor.address, tokenIds[0], 9223372036854775808n)
      ).to.be.revertedWith(nxErrors.MaplestoryConsume.amountOverflow);
    });
    it("Burn batch fail when amount overflow", async function () {
      const { consume, executor, tokenIds } = await loadFixture(consumeFixture);
      const burnTokenAmounts = [
        9223372036854775808n,
        9223372036854775808n,
        9223372036854775808n,
        9223372036854775808n,
        9223372036854775808n,
      ];
      await expect(
        consume.connect(executor).burnBatch(executor.address, tokenIds, burnTokenAmounts)
      ).to.be.revertedWith(nxErrors.MaplestoryConsume.amountOverflow);
    });
    it("Burn fail when msg sender is not owner nor token's owner nor approved", async function () {
      const { consume, ad1, ad2 } = await loadFixture(consumeFixture);
      await expect(consume.connect(ad2).burn(await ad1.getAddress(), 1, 5)).to.be.revertedWith(
        nxErrors.MaplestoryConsume.burnForbidden
      );
    });
    it("Burn batch tokens fail when msg sender is not owner nor token's owner nor approved", async function () {
      const { consume, ad1, ad2 } = await loadFixture(consumeFixture);
      await expect(consume.connect(ad2).burnBatch(await ad1.getAddress(), [1, 2], [5, 5])).to.be.revertedWith(
        nxErrors.MaplestoryConsume.burnForbidden
      );
    });
  });

  describe("offChainUsedAmount Test", async function () {
    it("setOffChainUsedAmount tokens", async function () {
      const { consume, owner } = await loadFixture(consumeFixture);
      await consume.connect(owner).setOffChainUsedAmount([1, 2, 3], [10, 10, 10]);
      expect(await consume.getTokenOffChainUsedAmount(1)).to.be.equal(10n);
    });
    it("setOffChainUsedAmount fail when msg sender is not owner", async function () {
      const { consume, ad1 } = await loadFixture(consumeFixture);
      await expect(consume.connect(ad1).setOffChainUsedAmount([1, 2, 3], [10, 10, 10])).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });
    it("setOffChainUsedAmount fail when ids and amounts length is not matched", async function () {
      const { consume, owner } = await loadFixture(consumeFixture);
      await expect(consume.connect(owner).setOffChainUsedAmount([1, 2, 3], [10, 10])).to.be.revertedWith(
        nxErrors.MaplestoryConsume.invalidRequest
      );
    });
    it("setOffChainUsedAmount fail when amount overflow", async function () {
      const { consume, owner } = await loadFixture(consumeFixture);
      await expect(
        consume
          .connect(owner)
          .setOffChainUsedAmount([1, 2, 3], [9223372036854775808n, 9223372036854775808n, 9223372036854775808n])
      ).to.be.revertedWith(nxErrors.MaplestoryConsume.amountOverflow);
    });
  });

  describe("issuedAmount Test", async function () {
    it("setIssuedAmount tokens", async function () {
      const { consume, owner } = await loadFixture(consumeFixture);
      await consume.connect(owner).setIssuedAmount([1, 2, 3], [10, 10, 10]);
      expect(await consume.getTokenIssuedAmount(1)).to.be.equal(10n);
      expect(await consume.getTokenOffChainAmount(1)).to.be.equal(0n);
    });
    it("setIssuedAmount fail when msg sender is not owner", async function () {
      const { consume, ad1 } = await loadFixture(consumeFixture);
      await expect(consume.connect(ad1).setIssuedAmount([1, 2, 3], [10, 10, 10])).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });
    it("setIssuedAmount fail when ids and amounts length is not matched", async function () {
      const { consume, owner } = await loadFixture(consumeFixture);
      await expect(consume.connect(owner).setIssuedAmount([1, 2, 3], [10, 10])).to.be.revertedWith(
        nxErrors.MaplestoryConsume.invalidRequest
      );
    });
    it("setIssuedAmount fail when over limitSupply", async function () {
      const { consume, owner } = await loadFixture(consumeFixture);
      await expect(consume.connect(owner).setIssuedAmount([1, 2, 3], [51, 51, 51])).to.be.revertedWith(
        nxErrors.MaplestoryConsume.issuedLimit
      );
    });
    it("setIssuedAmount fail when amount overflow", async function () {
      const { consume, owner } = await loadFixture(consumeFixture);
      await expect(
        consume
          .connect(owner)
          .setIssuedAmount([1, 2, 3], [9223372036854775808n, 9223372036854775808n, 9223372036854775808n])
      ).to.be.revertedWith(nxErrors.MaplestoryConsume.amountOverflow);
    });
  });

  describe("retrieve ERC1155 Test", () => {
    it("retrieve ERC1155", async () => {
      const { owner, ad1, holder, consume } = await loadFixture(consumeFixture);
      await consume.connect(owner).mint(await holder.getAddress(), 1, 5, "0x");
      await expect(
        consume.connect(owner).retrieveERC1155(await holder.getAddress(), await ad1.getAddress(), 1, 5, "bad situation")
      )
        .to.emit(consume, "RetrievedERC1155")
        .withArgs(await holder.getAddress(), await ad1.getAddress(), 1, 5, "bad situation");
    });

    it("retrieve ERC1155 from not owner", async () => {
      const { owner, ad1, holder, consume } = await loadFixture(consumeFixture);
      await consume.connect(owner).mint(await holder.getAddress(), 1, 5, "0x");
      await expect(
        consume.connect(ad1).retrieveERC1155(await holder.getAddress(), await ad1.getAddress(), 1, 5, "bad situation")
      ).to.revertedWith(nxErrors.ownerForbidden);
    });
  });

  describe("URI test", function () {
    it("Set URI by executor", async function () {
      const { consume, executor, defaultURI, changedURI } = await loadFixture(consumeFixture);
      expect(await consume.uri(1)).to.be.equal(`${defaultURI}1.json`);
      await expect(consume.connect(executor).setDefaultURI(changedURI))
        .to.emit(consume, "DefaultBaseURIChanged")
        .withArgs(defaultURI, changedURI);
      expect(await consume.uri(1)).to.be.equal(`${changedURI}1.json`);
    });
    it("Set token URI by executor", async function () {
      const { consume, executor, defaultURI, tokenURI } = await loadFixture(consumeFixture);
      expect(await consume.uri(1)).to.be.equal(`${defaultURI}1.json`);
      await expect(consume.connect(executor).setTokenURI(tokenURI, 1))
        .to.emit(consume, "TokenBaseURIChanged")
        .withArgs(1, "", tokenURI);
      expect(await consume.uri(1)).to.be.equal(`${tokenURI}1.json`);
    });
    it("Set URI fail when msg sender is not executor", async function () {
      const { consume, ad1, changedURI } = await loadFixture(consumeFixture);
      await expect(consume.connect(ad1).setDefaultURI(changedURI)).to.be.revertedWith(nxErrors.executorForbidden);
    });
    it("Set token URI fail when msg sender is not executor", async function () {
      const { consume, ad1, tokenURI } = await loadFixture(consumeFixture);
      await expect(consume.connect(ad1).setTokenURI(`${tokenURI}1.json`, 1)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });
    it("Set URI fail when paused", async function () {
      const { consume, executor, changedURI } = await loadFixture(consumeFixture);
      await consume.connect(executor).pause();
      await expect(consume.connect(executor).setDefaultURI(changedURI)).to.be.revertedWith(nxErrors.paused);
    });
    it("Set token URI fail when paused", async function () {
      const { consume, executor, tokenURI } = await loadFixture(consumeFixture);
      await consume.connect(executor).pause();
      await expect(consume.connect(executor).setTokenURI(`${tokenURI}1.json`, 1)).to.be.revertedWith(nxErrors.paused);
    });
    it("Get URI of item fail when item does not exists", async function () {
      const { consume } = await loadFixture(consumeFixture);
      await expect(consume.uri(1234)).to.be.revertedWith(nxErrors.MaplestoryConsume.tokenNotExists);
    });
  });

  describe("setApprovalForAll", function () {
    it("Success", async function () {
      const { controller, consume, ad1, ad2 } = await loadFixture(consumeFixture);

      await controller.setAllowlist(await ad2.getAddress(), true);
      await consume.connect(ad1).setApprovalForAll(await ad2.getAddress(), true);
    });

    it("should revert when not allowlisted", async function () {
      const { consume, ad1, ad2 } = await loadFixture(consumeFixture);

      await expect(consume.connect(ad1).setApprovalForAll(await ad2.getAddress(), true)).to.be.revertedWith(
        nxErrors.notAllowlisted
      );
    });
  });

  trivialOverridesERC1155Pausable(consumeFixture);
  trivialOverridesERC1155ApproveControlled(consumeFixture);
});
