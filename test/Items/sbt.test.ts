import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import nxErrors from "../lib/nx-errors";

describe("MaplestoryEquipSBT Contract Test", function () {
  async function sbtFixture() {
    const [owner, executor, operator, ad1, ad2, ad3, ad4, ad5, ad6, ad7] = await ethers.getSigners();
    const defaultURI = "https://defaultURI.com/";
    const changedURI = "https://changedURI.com/";
    const itemURI = "https://itemURI.com/";

    // tokens that minted before test
    const itemId = 1;
    const tokenId = 1;
    const tokens = [
      { itemId: 1, tokenId: 1 },
      { itemId: 1, tokenId: 2 },
      { itemId: 1, tokenId: 3 },
      { itemId: 2, tokenId: 4 },
      { itemId: 3, tokenId: 5 },
    ];

    // tokens info for testing mint functions
    const mintItemId = 4;
    const mintTokenId = 6;
    const mintTokens = [
      { itemId: 4, tokenId: 6 },
      { itemId: 4, tokenId: 7 },
      { itemId: 4, tokenId: 8 },
      { itemId: 5, tokenId: 9 },
      { itemId: 6, tokenId: 10 },
    ];
    const airdropAddress = [ad3.address, ad4.address, ad5.address, ad6.address, ad7.address];

    // set limitSupply of all tokens and mint tokens
    const itemIds = [
      ...new Set(tokens.map(({ itemId }) => itemId)),
      ...new Set(mintTokens.map(({ itemId }) => itemId)),
    ];

    // token info for testing limitSupply
    const newItemId = 7;
    const newTokenId = 11;
    const newLimitSupply = 3;

    const SBT = await ethers.getContractFactory("MaplestoryEquipSBT");

    // initial settings
    const sbt = await SBT.connect(owner).deploy(defaultURI);
    const paused = await SBT.connect(owner).deploy(defaultURI);

    await sbt.connect(owner).grantExecutor(executor.address);

    await Promise.all(itemIds.map((id) => sbt.connect(owner).setLimitSupply(id, newLimitSupply)));
    await Promise.all(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
        (id) => paused.connect(owner).setLimitSupply(id, "0xffffffffffffffff") // MaxUint64
      )
    );

    await sbt.connect(executor).mintBatch(await ad1.getAddress(), tokens);
    await paused.mint(await ad1.getAddress(), 1, 1);
    await paused.pause();

    return {
      sbt,
      owner,
      executor,
      operator,
      ad1,
      ad2,
      defaultURI,
      changedURI,
      itemURI,
      itemId,
      tokenId,
      tokens,
      mintItemId,
      mintTokenId,
      mintTokens,
      newItemId,
      newTokenId,
      newLimitSupply,
      contract: sbt,
      paused,
      notPaused: sbt,
      holder: ad1,
      approver: ad1,
      airdropAddress,
    };
  }

  // preload fixture
  before(async function () {
    await loadFixture(sbtFixture);
  });

  describe("Set executor", function () {
    it("Only admin can set executor address", async function () {
      const { sbt, owner, ad1 } = await loadFixture(sbtFixture);

      await sbt.connect(owner).grantExecutor(await ad1.getAddress());
      expect(await sbt.isExecutor(await ad1.getAddress())).to.be.true;
    });

    it("Grant executor fail when msg sender is not admin", async function () {
      const { sbt, ad1 } = await loadFixture(sbtFixture);

      await expect(sbt.connect(ad1).grantExecutor(await ad1.getAddress())).to.be.revertedWith(nxErrors.ownerForbidden);
      expect(await sbt.isExecutor(await ad1.getAddress())).to.be.false;
    });
  });

  describe("Mint tokens", function () {
    it("Mint token by executor", async function () {
      const { sbt, executor, ad1, mintItemId, mintTokenId } = await loadFixture(sbtFixture);
      await sbt.connect(executor).mint(await ad1.getAddress(), mintItemId, mintTokenId);
      expect(await sbt.ownerOf(mintTokenId)).to.be.equal(await ad1.getAddress());
    });

    it("Mint fail when msg sender is not executor", async function () {
      const { sbt, ad1, mintItemId, mintTokenId } = await loadFixture(sbtFixture);
      await expect(sbt.connect(ad1).mint(await ad1.getAddress(), mintItemId, mintTokenId)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });

    it("MintBatch fail when msg sender is not executor", async function () {
      const { sbt, ad1, mintItemId, mintTokenId } = await loadFixture(sbtFixture);
      await expect(
        sbt.connect(ad1).mintBatch(await ad1.getAddress(), [{ itemId: mintItemId, tokenId: mintTokenId }])
      ).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Mint fail when already item supply exceeded", async function () {
      const { sbt, executor, ad1, itemId } = await loadFixture(sbtFixture);
      await expect(sbt.connect(executor).mint(await ad1.getAddress(), itemId, 6)).to.be.revertedWith(
        nxErrors.MaplestoryEquipSBT.mintInvalidItem
      );
    });

    it("Mint fail when already exist tokenId", async function () {
      const { sbt, executor, ad1, mintItemId, mintTokenId } = await loadFixture(sbtFixture);
      await sbt.connect(executor).mint(await ad1.getAddress(), mintItemId, mintTokenId);
      await expect(sbt.connect(executor).mint(await ad1.getAddress(), mintItemId, mintTokenId)).to.be.revertedWith(
        nxErrors.ERC721.mintDuplicate
      );
    });

    it("Mint token by executor fail when paused", async function () {
      const { sbt, executor, ad1, mintItemId, mintTokenId } = await loadFixture(sbtFixture);
      await sbt.connect(executor).pause();
      await expect(sbt.connect(executor).mint(await ad1.getAddress(), mintItemId, mintTokenId)).to.be.revertedWith(
        nxErrors.paused
      );
    });

    it("Mint batch token by executor", async function () {
      const { sbt, executor, ad1, mintTokens } = await loadFixture(sbtFixture);
      await sbt.connect(executor).mintBatch(await ad1.getAddress(), mintTokens);

      for (const { tokenId } of mintTokens) {
        expect(await sbt.ownerOf(tokenId)).to.be.equal(await ad1.getAddress());
      }
    });

    it("Mint batch token fail when msg sender is not executor", async function () {
      const { sbt, ad1, mintTokens } = await loadFixture(sbtFixture);
      await expect(sbt.connect(ad1).mintBatch(await ad1.getAddress(), mintTokens)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });

    it("Mint batch token fail when paused", async function () {
      const { sbt, executor, ad1, mintTokens } = await loadFixture(sbtFixture);
      await sbt.connect(executor).pause();
      await expect(sbt.connect(executor).mintBatch(await ad1.getAddress(), mintTokens)).to.be.revertedWith(
        nxErrors.paused
      );
    });

    it("should be reverted when limit supply is zero", async function () {
      const { sbt, executor, ad1 } = await loadFixture(sbtFixture);
      await expect(sbt.connect(executor).mint(await ad1.getAddress(), 12345, 6)).to.be.revertedWith(
        nxErrors.MaplestoryEquipSBT.mintInvalidItem
      );
    });

    ///

    it("Airdrop token by executor", async function () {
      const { sbt, executor, mintTokens, airdropAddress } = await loadFixture(sbtFixture);
      await sbt.connect(executor).airdrop(airdropAddress, mintTokens);

      for (let i = 0; i < airdropAddress.length; i++) {
        expect(await sbt.ownerOf(mintTokens[i].tokenId)).to.be.equal(airdropAddress[i]);
      }
    });

    it("Airdrop token fail when msg sender is not executor", async function () {
      const { sbt, ad1, mintTokens, airdropAddress } = await loadFixture(sbtFixture);
      await expect(sbt.connect(ad1).airdrop(airdropAddress, mintTokens)).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Airdrop token fail when paused", async function () {
      const { sbt, executor, mintTokens, airdropAddress } = await loadFixture(sbtFixture);
      await sbt.connect(executor).pause();
      await expect(sbt.connect(executor).airdrop(airdropAddress, mintTokens)).to.be.revertedWith(nxErrors.paused);
    });

    it("Airdrop token fail when using invalid arguments length", async function () {
      const { sbt, executor, mintTokens, airdropAddress } = await loadFixture(sbtFixture);
      await expect(sbt.connect(executor).airdrop(airdropAddress, mintTokens.slice(1))).to.be.revertedWith(
        nxErrors.MaplestoryEquipSBT.invalidLength
      );
    });
  });

  describe("Set Supplys", function () {
    it("Set item limit supply by owner", async function () {
      const { sbt, owner, newItemId, newLimitSupply } = await loadFixture(sbtFixture);
      await sbt.connect(owner).setLimitSupply(newItemId, newLimitSupply);
      expect(await sbt.itemLimitSupply(newItemId)).to.be.equal(newLimitSupply);
    });

    it("Set item limit supply fail when msg sender is not owner", async function () {
      const { sbt, ad1, newItemId, newLimitSupply } = await loadFixture(sbtFixture);
      await expect(sbt.connect(ad1).setLimitSupply(newItemId, newLimitSupply)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });

    it("Set item limit supply that already set", async function () {
      const { sbt, owner, itemId, newLimitSupply } = await loadFixture(sbtFixture);
      await expect(sbt.connect(owner).setLimitSupply(itemId, newLimitSupply)).to.be.revertedWith(
        nxErrors.MaplestoryEquipSBT.setLimitSupply
      );
    });
  });

  describe("Token info getter Test", function () {
    it("Get token info", async function () {
      const { sbt } = await loadFixture(sbtFixture);
      expect(await sbt.tokenItemId(1)).equal(1);
      expect(await sbt.tokenNumber(2)).equal(2);
    });
    it("Check total & limit supply of minted token", async function () {
      const { sbt, itemId } = await loadFixture(sbtFixture);
      expect(await sbt.itemTotalSupply(itemId)).equal(3);
      expect(await sbt.itemLimitSupply(itemId)).equal(3);
      expect(await sbt.totalSupply()).equal(5);
    });
    it("Get token info about not exist tokens", async function () {
      const { sbt, newTokenId } = await loadFixture(sbtFixture);
      await expect(sbt.tokenItemId(newTokenId)).to.be.revertedWith(nxErrors.MaplestoryEquipSBT.tokenNotExists);
      await expect(sbt.tokenNumber(newTokenId)).to.be.revertedWith(nxErrors.MaplestoryEquipSBT.tokenNotExists);
    });
    it("Get Item info about not exist item", async function () {
      const { sbt, newItemId } = await loadFixture(sbtFixture);
      await expect(sbt.itemTotalSupply(newItemId)).to.be.revertedWith(nxErrors.MaplestoryEquipSBT.itemNotExists);
      await expect(sbt.itemLimitSupply(newItemId)).to.be.revertedWith(nxErrors.MaplestoryEquipSBT.itemNotExists);
    });
  });

  describe("Transfer Token", function () {
    it("Transfer token by token's owner", async function () {
      const { sbt, ad1, ad2, tokenId } = await loadFixture(sbtFixture);
      await expect(
        sbt.connect(ad1).transferFrom(await ad1.getAddress(), await ad2.getAddress(), tokenId)
      ).to.be.revertedWith(nxErrors.MaplestoryEquipSBT.NotTransferable);
    });
    it("Transfer token fail when msg sender is not token's owner", async function () {
      const { sbt, ad1, ad2, tokenId } = await loadFixture(sbtFixture);
      await expect(
        sbt.connect(ad2).transferFrom(await ad1.getAddress(), await ad2.getAddress(), tokenId)
      ).to.be.revertedWith(nxErrors.ERC721.transferForbidden);
    });
  });

  describe("Pause & Unpause", function () {
    it("Pause contract by owner", async function () {
      const { sbt, executor, ad1 } = await loadFixture(sbtFixture);
      expect(await sbt.paused()).equal(false);
      await sbt.connect(executor).pause();
      expect(await sbt.paused()).equal(true);
      await expect(sbt.connect(ad1).mint(await ad1.getAddress(), 11, 11)).to.be.revertedWith(nxErrors.paused);
    });
    it("Unpause contract by owner", async function () {
      const { sbt, owner, executor } = await loadFixture(sbtFixture);
      await sbt.connect(executor).pause();
      expect(await sbt.paused()).equal(true);
      await sbt.connect(owner).unpause();
      expect(await sbt.paused()).equal(false);
    });
    it("Pause fail when already paused", async function () {
      const { sbt, executor } = await loadFixture(sbtFixture);
      await sbt.connect(executor).pause();
      expect(await sbt.paused()).equal(true);
      await expect(sbt.connect(executor).pause()).to.be.revertedWith(nxErrors.paused);
    });
    it("Unpause fail when already unpaused", async function () {
      const { sbt, owner } = await loadFixture(sbtFixture);
      await expect(sbt.connect(owner).unpause()).to.be.revertedWith(nxErrors.notPaused);
    });
    it("Pause fail when msg sender is not executor", async function () {
      const { sbt, ad1 } = await loadFixture(sbtFixture);
      await expect(sbt.connect(ad1).pause()).to.be.revertedWith(nxErrors.executorForbidden);
    });
    it("Unpause fail when msg sender is not owner", async function () {
      const { sbt, executor, ad1 } = await loadFixture(sbtFixture);
      await sbt.connect(executor).pause();
      await expect(sbt.connect(ad1).unpause()).to.be.revertedWith(nxErrors.ownerForbidden);
    });
  });

  describe("URI Test", function () {
    it("Set URI by executor", async function () {
      const { sbt, executor, defaultURI, changedURI, tokenId } = await loadFixture(sbtFixture);
      expect(await sbt.tokenURI(tokenId)).to.be.equal(`${defaultURI}${tokenId}.json`);
      await expect(sbt.connect(executor).setDefaultURI(changedURI))
        .to.emit(sbt, "DefaultBaseURIChanged")
        .withArgs(defaultURI, changedURI);
      expect(await sbt.tokenURI(tokenId)).to.be.equal(`${changedURI}${tokenId}.json`);
    });
    it("Set token's URI by executor", async function () {
      const { sbt, executor, defaultURI, itemId, tokenId, itemURI } = await loadFixture(sbtFixture);
      expect(await sbt.tokenURI(tokenId)).to.be.equal(`${defaultURI}${tokenId}.json`);
      await expect(sbt.connect(executor).setItemURI(itemId, itemURI))
        .to.emit(sbt, "ItemBaseURIChanged")
        .withArgs(itemId, "", itemURI);
      expect(await sbt.tokenURI(tokenId)).to.be.equal(`${itemURI}${tokenId}.json`);
    });
    it("Set URI fail when msg sender is not executor", async function () {
      const { sbt, ad1, changedURI } = await loadFixture(sbtFixture);
      await expect(sbt.connect(ad1).setDefaultURI(changedURI)).to.be.revertedWith(nxErrors.executorForbidden);
    });
    it("Set token's URI fail when msg sender is not executor", async function () {
      const { sbt, ad1, itemId, itemURI } = await loadFixture(sbtFixture);
      await expect(sbt.connect(ad1).setItemURI(itemId, itemURI)).to.be.revertedWith(nxErrors.executorForbidden);
    });
    it("Set URI by executor fail when paused", async function () {
      const { sbt, executor, changedURI } = await loadFixture(sbtFixture);
      await sbt.connect(executor).pause();
      await expect(sbt.connect(executor).setDefaultURI(changedURI)).to.be.revertedWith(nxErrors.paused);
    });
    it("Set token's URI by executor fail when paused", async function () {
      const { sbt, executor, itemId, itemURI } = await loadFixture(sbtFixture);
      await sbt.connect(executor).pause();
      await expect(sbt.connect(executor).setItemURI(itemId, itemURI)).to.be.revertedWith(nxErrors.paused);
    });
    it("Token URI cannot be return when token doesn't exist", async function () {
      const { sbt } = await loadFixture(sbtFixture);
      await expect(sbt.tokenURI(6)).to.be.revertedWith(nxErrors.MaplestoryEquipSBT.uriInvalidID);
    });
  });

  describe("ownerOfBatch Test", function () {
    it("Success", async function () {
      const { sbt, executor, ad1, ad2, mintTokens } = await loadFixture(sbtFixture);

      await Promise.all([
        sbt.connect(executor).mintBatch(await ad1.getAddress(), mintTokens.slice(0, 2)),
        sbt.connect(executor).mintBatch(await ad2.getAddress(), mintTokens.slice(2)),
      ]);

      expect(await sbt.ownerOfBatch([...mintTokens.map(({ tokenId }) => tokenId)])).to.deep.equal([
        await ad1.getAddress(),
        await ad1.getAddress(),
        await ad2.getAddress(),
        await ad2.getAddress(),
        await ad2.getAddress(),
      ]);
    });

    it("invalid token ID", async function () {
      const { sbt, executor, ad1, ad2, mintTokens } = await loadFixture(sbtFixture);

      await Promise.all([
        sbt.connect(executor).mintBatch(await ad1.getAddress(), mintTokens.slice(0, 2)),
        sbt.connect(executor).mintBatch(await ad2.getAddress(), mintTokens.slice(2, 4)),
      ]);

      await expect(sbt.ownerOfBatch([...mintTokens.map(({ tokenId }) => tokenId)])).to.be.revertedWith(
        new RegExp(`^MaplestoryEquipSBT/ownerOfInvalidID:.+${mintTokens.pop()!.tokenId}`)
      );
    });
  });

  describe("approve", function () {
    it("should revert because of SBT", async function () {
      const { sbt, ad1, ad2, tokenId } = await loadFixture(sbtFixture);

      await expect(sbt.connect(ad1).approve(await ad2.getAddress(), tokenId)).to.be.revertedWith(
        nxErrors.MaplestoryEquipSBT.NotTransferable
      );
    });
  });

  describe("setApprovalForAll", function () {
    it("should revert because of SBT", async function () {
      const { sbt, ad1, ad2 } = await loadFixture(sbtFixture);

      await expect(sbt.connect(ad2).setApprovalForAll(await ad1.getAddress(), true)).to.be.revertedWith(
        nxErrors.MaplestoryEquipSBT.NotTransferable
      );
    });
  });
});
