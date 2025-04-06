import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { trivialOverridesERC721ApproveControlled, trivialOverridesERC721Pausable } from "../lib/trivial-overrides";
import nxErrors from "../lib/nx-errors";
const fakeAddress = "0x0000000000000000000000000000000000000001";

describe("MaplestoryEquip Contract Test", function () {
  async function equipFixture() {
    const [owner, executor, operator, ad1, ad2] = await ethers.getSigners();
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

    // set limitSupply of all tokens and mint tokens
    const itemIds = [
      ...new Set(tokens.map(({ itemId }) => itemId)),
      ...new Set(mintTokens.map(({ itemId }) => itemId)),
    ];

    // token info for testing limitSupply
    const newItemId = 7;
    const newTokenId = 11;
    const newLimitSupply = 3;

    const [Equip, Controller, ItemIssuance] = await Promise.all([
      ethers.getContractFactory("MaplestoryEquip"),
      ethers.getContractFactory("ApproveController"),
      ethers.getContractFactory("ItemIssuance"),
    ]);

    const controller = await Controller.connect(owner).deploy(fakeAddress);
    const itemIssuance = await ItemIssuance.deploy(fakeAddress, fakeAddress, fakeAddress);
    await itemIssuance.createUniverse("MapleStory Universe");

    // initial settings
    await controller.connect(ad1).setApprove(true);
    const equip = await Equip.connect(owner).deploy(fakeAddress, controller.address, itemIssuance.address, defaultURI);
    const paused = await Equip.connect(owner).deploy(fakeAddress, controller.address, itemIssuance.address, defaultURI);

    await itemIssuance.registerItem721Contract(1, equip.address);
    await itemIssuance.registerItem721Contract(1, paused.address);
    await equip.connect(owner).grantExecutor(executor.address);
    await equip.connect(owner).approveOperator(operator.address);

    await Promise.all(itemIds.map((id) => equip.connect(owner).setLimitSupply(id, newLimitSupply, false)));
    await Promise.all(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
        (id) => paused.connect(owner).setLimitSupply(id, "0xffffffffffffffff", true) // MaxUint64
      )
    );

    await equip.connect(executor).mintBatch(await ad1.getAddress(), tokens);
    await paused.mint(await ad1.getAddress(), 1, 1);
    await paused.pause();

    expect(await equip.itemIssuance()).to.equal(itemIssuance.address);

    return {
      equip,
      controller,
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
      contract: equip,
      paused,
      notPaused: equip,
      holder: ad1,
      approver: ad1,
    };
  }

  // preload fixture
  before(async function () {
    await loadFixture(equipFixture);
  });

  describe("Set executor", function () {
    it("Only admin can set executor address", async function () {
      const { equip, owner, ad1 } = await loadFixture(equipFixture);

      await equip.connect(owner).grantExecutor(await ad1.getAddress());
      expect(await equip.isExecutor(await ad1.getAddress())).to.be.true;
    });

    it("Grant executor fail when msg sender is not admin", async function () {
      const { equip, ad1 } = await loadFixture(equipFixture);

      await expect(equip.connect(ad1).grantExecutor(await ad1.getAddress())).to.be.revertedWith(
        nxErrors.ownerForbidden
      );
      expect(await equip.isExecutor(await ad1.getAddress())).to.be.false;
    });
  });

  describe("Mint tokens", function () {
    it("Mint token by executor", async function () {
      const { equip, executor, ad1, mintItemId, mintTokenId } = await loadFixture(equipFixture);
      await equip.connect(executor).mint(await ad1.getAddress(), mintItemId, mintTokenId);
      expect(await equip.ownerOf(mintTokenId)).to.be.equal(await ad1.getAddress());
    });

    it("Mint fail when msg sender is not executor", async function () {
      const { equip, ad1, mintItemId, mintTokenId } = await loadFixture(equipFixture);
      await expect(equip.connect(ad1).mint(await ad1.getAddress(), mintItemId, mintTokenId)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });

    it("MintBatch fail when msg sender is not executor", async function () {
      const { equip, ad1, mintItemId, mintTokenId } = await loadFixture(equipFixture);
      await expect(
        equip.connect(ad1).mintBatch(await ad1.getAddress(), [{ itemId: mintItemId, tokenId: mintTokenId }])
      ).to.be.revertedWith(nxErrors.executorForbidden);
    });

    it("Mint fail when already item supply exceeded", async function () {
      const { equip, executor, ad1, itemId } = await loadFixture(equipFixture);
      await expect(equip.connect(executor).mint(await ad1.getAddress(), itemId, 6)).to.be.revertedWith(
        nxErrors.MaplestoryEquip.mintInvalidItem
      );
    });

    it("Mint fail when already exist tokenId", async function () {
      const { equip, executor, ad1, mintItemId, mintTokenId } = await loadFixture(equipFixture);
      await equip.connect(executor).mint(await ad1.getAddress(), mintItemId, mintTokenId);
      await expect(equip.connect(executor).mint(await ad1.getAddress(), mintItemId, mintTokenId)).to.be.revertedWith(
        nxErrors.ERC721.mintDuplicate
      );
    });

    it("Mint token by executor fail when paused", async function () {
      const { equip, executor, ad1, mintItemId, mintTokenId } = await loadFixture(equipFixture);
      await equip.connect(executor).pause();
      await expect(equip.connect(executor).mint(await ad1.getAddress(), mintItemId, mintTokenId)).to.be.revertedWith(
        nxErrors.paused
      );
    });

    it("Mint batch token by executor", async function () {
      const { equip, executor, ad1, mintTokens } = await loadFixture(equipFixture);
      await equip.connect(executor).mintBatch(await ad1.getAddress(), mintTokens);

      for (const { tokenId } of mintTokens) {
        expect(await equip.ownerOf(tokenId)).to.be.equal(await ad1.getAddress());
      }
    });

    it("Mint batch token fail when msg sender is not executor", async function () {
      const { equip, ad1, mintTokens } = await loadFixture(equipFixture);
      await expect(equip.connect(ad1).mintBatch(await ad1.getAddress(), mintTokens)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });

    it("Mint batch token fail when paused", async function () {
      const { equip, executor, ad1, mintTokens } = await loadFixture(equipFixture);
      await equip.connect(executor).pause();
      await expect(equip.connect(executor).mintBatch(await ad1.getAddress(), mintTokens)).to.be.revertedWith(
        nxErrors.paused
      );
    });

    it("should be reverted when limit supply is zero", async function () {
      const { equip, executor, ad1 } = await loadFixture(equipFixture);
      await expect(equip.connect(executor).mint(await ad1.getAddress(), 12345, 6)).to.be.revertedWith(
        nxErrors.MaplestoryEquip.mintInvalidItem
      );
    });
  });

  describe("Set Supplys", function () {
    it("Set item limit supply by owner", async function () {
      const { equip, owner, newItemId, newLimitSupply } = await loadFixture(equipFixture);
      await equip.connect(owner).setLimitSupply(newItemId, newLimitSupply, true);
      expect(await equip.itemLimitSupply(newItemId)).to.be.equal(newLimitSupply);
    });

    it("Set item limit supply fail when msg sender is not owner", async function () {
      const { equip, ad1, newItemId, newLimitSupply } = await loadFixture(equipFixture);
      await expect(equip.connect(ad1).setLimitSupply(newItemId, newLimitSupply, true)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });

    it("Set item limit supply that already set", async function () {
      const { equip, owner, itemId, newLimitSupply } = await loadFixture(equipFixture);
      await expect(equip.connect(owner).setLimitSupply(itemId, newLimitSupply, true)).to.be.revertedWith(
        nxErrors.MaplestoryEquip.setLimitSupply
      );
    });
  });

  describe("Token info getter Test", function () {
    it("Get token info", async function () {
      const { equip } = await loadFixture(equipFixture);
      expect(await equip.tokenItemId(1)).equal(1);
      expect(await equip.tokenNumber(2)).equal(2);
    });
    it("Check total & limit supply and burned amount of minted token", async function () {
      const { equip, itemId } = await loadFixture(equipFixture);
      expect(await equip.itemTotalSupply(itemId)).equal(3);
      expect(await equip.itemLimitSupply(itemId)).equal(3);
      expect(await equip.itemBurnedAmount(itemId)).equal(0);
      expect(await equip.totalSupply()).equal(5);
    });
    it("Check total & limit supply and burned amount after burn", async function () {
      const { equip, itemId, ad1 } = await loadFixture(equipFixture);
      await equip.connect(ad1).burn(itemId);
      expect(await equip.itemTotalSupply(itemId)).equal(2);
      expect(await equip.itemLimitSupply(itemId)).equal(3);
      expect(await equip.itemBurnedAmount(itemId)).equal(1);
      expect(await equip.totalSupply()).equal(4);
      expect(await equip.burnedAmount()).equal(1);
    });
    it("Get token info about not exist tokens", async function () {
      const { equip, newTokenId } = await loadFixture(equipFixture);
      await expect(equip.tokenItemId(newTokenId)).to.be.revertedWith(nxErrors.MaplestoryEquip.tokenNotExists);
      await expect(equip.tokenNumber(newTokenId)).to.be.revertedWith(nxErrors.MaplestoryEquip.tokenNotExists);
    });
    it("Get Item info about not exist item", async function () {
      const { equip, newItemId } = await loadFixture(equipFixture);
      await expect(equip.itemTotalSupply(newItemId)).to.be.revertedWith(nxErrors.MaplestoryEquip.itemNotExists);
      await expect(equip.itemLimitSupply(newItemId)).to.be.revertedWith(nxErrors.MaplestoryEquip.itemNotExists);
      await expect(equip.itemBurnedAmount(newItemId)).to.be.revertedWith(nxErrors.MaplestoryEquip.itemNotExists);
    });
  });

  describe("Transfer Token", function () {
    it("Transfer token by token's owner", async function () {
      const { equip, ad1, ad2, tokenId } = await loadFixture(equipFixture);
      await equip.connect(ad1).transferFrom(await ad1.getAddress(), await ad2.getAddress(), tokenId);
      expect(await equip.ownerOf(tokenId)).to.be.equal(await ad2.getAddress());
    });
    it("Transfer token fail when msg sender is not token's owner", async function () {
      const { equip, ad1, ad2, tokenId } = await loadFixture(equipFixture);
      await expect(
        equip.connect(ad2).transferFrom(await ad1.getAddress(), await ad2.getAddress(), tokenId)
      ).to.be.revertedWith(nxErrors.ERC721.transferForbidden);
    });
    it("Transfer token by the one not token's owner, but approved using approve controller", async function () {
      const { equip, operator, ad1, ad2, tokenId } = await loadFixture(equipFixture);
      await equip.connect(operator).transferFrom(await ad1.getAddress(), await ad2.getAddress(), tokenId);
      expect(await equip.ownerOf(tokenId)).to.be.equal(await ad2.getAddress());
    });
    it("Transfer token by the one not token's owner, but approved using erc721 approval", async function () {
      const { controller, equip, ad1, ad2, tokenId } = await loadFixture(equipFixture);
      await controller.setAllowlist(await ad2.getAddress(), true);
      await equip.connect(ad1).setApprovalForAll(await ad2.getAddress(), true);
      await equip.connect(ad2).transferFrom(await ad1.getAddress(), await ad2.getAddress(), tokenId);
      expect(await equip.ownerOf(tokenId)).to.be.equal(await ad2.getAddress());
    });
  });

  describe("Batch Transfer Token", function () {
    it("Batch transfer token by token's owner", async function () {
      const { equip, ad1, ad2, tokens } = await loadFixture(equipFixture);
      const tokenIds = tokens.map(({ tokenId }) => tokenId);
      await equip.connect(ad1).safeBatchTransferFrom(await ad1.getAddress(), await ad2.getAddress(), tokenIds);

      expect(await equip.ownerOfBatch(tokenIds)).to.deep.equal([
        await ad2.getAddress(),
        await ad2.getAddress(),
        await ad2.getAddress(),
        await ad2.getAddress(),
        await ad2.getAddress(),
      ]);
    });
    it("Batch transfer token fail when msg sender is not token's owner", async function () {
      const { equip, ad1, ad2, tokens } = await loadFixture(equipFixture);
      await equip.connect(ad1).transferFrom(await ad1.getAddress(), await ad2.getAddress(), tokens[2].tokenId);
      await expect(
        equip.connect(ad2).safeBatchTransferFrom(
          await ad1.getAddress(),
          await ad2.getAddress(),
          tokens.map(({ tokenId }) => tokenId)
        )
      ).to.be.revertedWith(nxErrors.ERC721.transferForbidden);
    });
    it("Batch transfer token by the one not token's owner, but approved using approve controller", async function () {
      const { equip, operator, ad1, ad2, tokens } = await loadFixture(equipFixture);
      const tokenIds = tokens.map(({ tokenId }) => tokenId);
      await equip.connect(operator).safeBatchTransferFrom(await ad1.getAddress(), await ad2.getAddress(), tokenIds);

      expect(await equip.ownerOfBatch(tokenIds)).to.deep.equal([
        await ad2.getAddress(),
        await ad2.getAddress(),
        await ad2.getAddress(),
        await ad2.getAddress(),
        await ad2.getAddress(),
      ]);
    });
    it("Batch ransfer token by the one not token's owner, but approved using erc721 approval", async function () {
      const { controller, equip, ad1, ad2, tokens } = await loadFixture(equipFixture);
      await controller.setAllowlist(await ad2.getAddress(), true);
      await equip.connect(ad1).setApprovalForAll(await ad2.getAddress(), true);
      const tokenIds = tokens.map(({ tokenId }) => tokenId);
      await equip.connect(ad2).safeBatchTransferFrom(await ad1.getAddress(), await ad2.getAddress(), tokenIds);

      expect(await equip.ownerOfBatch(tokenIds)).to.deep.equal([
        await ad2.getAddress(),
        await ad2.getAddress(),
        await ad2.getAddress(),
        await ad2.getAddress(),
        await ad2.getAddress(),
      ]);
    });
  });

  describe("Pause & Unpause", function () {
    it("Pause contract by owner", async function () {
      const { equip, executor, ad1, ad2, tokenId } = await loadFixture(equipFixture);
      expect(await equip.paused()).equal(false);
      await equip.connect(executor).pause();
      expect(await equip.paused()).equal(true);
      await expect(
        equip.connect(ad1).transferFrom(await ad1.getAddress(), await ad2.getAddress(), tokenId)
      ).to.be.revertedWith(nxErrors.ERC721.paused);
    });
    it("Unpause contract by owner", async function () {
      const { equip, owner, executor } = await loadFixture(equipFixture);
      await equip.connect(executor).pause();
      expect(await equip.paused()).equal(true);
      await equip.connect(owner).unpause();
      expect(await equip.paused()).equal(false);
    });
    it("Pause fail when already paused", async function () {
      const { equip, executor } = await loadFixture(equipFixture);
      await equip.connect(executor).pause();
      expect(await equip.paused()).equal(true);
      await expect(equip.connect(executor).pause()).to.be.revertedWith(nxErrors.paused);
    });
    it("Unpause fail when already unpaused", async function () {
      const { equip, owner } = await loadFixture(equipFixture);
      await expect(equip.connect(owner).unpause()).to.be.revertedWith(nxErrors.notPaused);
    });
    it("Pause fail when msg sender is not executor", async function () {
      const { equip, ad1 } = await loadFixture(equipFixture);
      await expect(equip.connect(ad1).pause()).to.be.revertedWith(nxErrors.executorForbidden);
    });
    it("Unpause fail when msg sender is not owner", async function () {
      const { equip, executor, ad1 } = await loadFixture(equipFixture);
      await equip.connect(executor).pause();
      await expect(equip.connect(ad1).unpause()).to.be.revertedWith(nxErrors.ownerForbidden);
    });
  });

  describe("Burn tokens", function () {
    it("Burn token by token's owner", async function () {
      const { equip, ad1, tokenId } = await loadFixture(equipFixture);
      await equip.connect(ad1).burn(tokenId);
      await expect(equip.tokenURI(tokenId)).to.be.revertedWith(nxErrors.MaplestoryEquip.uriInvalidID);
    });
    it("Burn token by approved wallet", async function () {
      const { controller, equip, executor, ad1, tokenId } = await loadFixture(equipFixture);
      await controller.setAllowlist(await executor.getAddress(), true);
      await equip.connect(ad1).setApprovalForAll(await executor.getAddress(), true);
      expect(await equip.isApprovedForAll(await ad1.getAddress(), await executor.getAddress())).to.equal(true);
      await equip.connect(executor).burn(tokenId);
      await expect(equip.tokenURI(tokenId)).to.be.revertedWith(nxErrors.MaplestoryEquip.uriInvalidID);
    });
    it("Burn batch tokens by token's owner", async function () {
      const { equip, ad1, tokens } = await loadFixture(equipFixture);
      const tokenIds = tokens.map(({ tokenId }) => tokenId);
      await equip.connect(ad1).burnBatch(tokenIds);
      for (const tokenId of tokenIds) {
        await expect(equip.ownerOf(tokenId)).to.be.revertedWith(
          new RegExp(`^MaplestoryEquip/ownerOfInvalidID:.+${tokenId}`)
        );
      }
      expect(await equip.burnedAmount()).to.be.equal(tokenIds.length);
    });
    it("Burn token fail when msg sender is not owner nor approved", async function () {
      const { equip, ad2, tokenId } = await loadFixture(equipFixture);
      await expect(equip.connect(ad2).burn(tokenId)).to.be.revertedWith(nxErrors.MaplestoryEquip.burnForbidden);
    });
    it("Burn token fail when token is not exist", async function () {
      const { equip, ad1, newTokenId } = await loadFixture(equipFixture);
      await expect(equip.connect(ad1).burn(newTokenId)).to.be.revertedWith(nxErrors.ERC721.invalidID);
    });
  });

  describe("URI Test", function () {
    it("Set URI by executor", async function () {
      const { equip, executor, defaultURI, changedURI, tokenId } = await loadFixture(equipFixture);
      expect(await equip.tokenURI(tokenId)).to.be.equal(`${defaultURI}${tokenId}.json`);
      await expect(equip.connect(executor).setDefaultURI(changedURI))
        .to.emit(equip, "DefaultBaseURIChanged")
        .withArgs(defaultURI, changedURI);
      expect(await equip.tokenURI(tokenId)).to.be.equal(`${changedURI}${tokenId}.json`);
    });
    it("Set token's URI by executor", async function () {
      const { equip, executor, defaultURI, itemId, tokenId, itemURI } = await loadFixture(equipFixture);
      expect(await equip.tokenURI(tokenId)).to.be.equal(`${defaultURI}${tokenId}.json`);
      await expect(equip.connect(executor).setItemURI(itemId, itemURI))
        .to.emit(equip, "ItemBaseURIChanged")
        .withArgs(itemId, "", itemURI);
      expect(await equip.tokenURI(tokenId)).to.be.equal(`${itemURI}${tokenId}.json`);
    });
    it("Set URI fail when msg sender is not executor", async function () {
      const { equip, ad1, changedURI } = await loadFixture(equipFixture);
      await expect(equip.connect(ad1).setDefaultURI(changedURI)).to.be.revertedWith(nxErrors.executorForbidden);
    });
    it("Set token's URI fail when msg sender is not executor", async function () {
      const { equip, ad1, itemId, itemURI } = await loadFixture(equipFixture);
      await expect(equip.connect(ad1).setItemURI(itemId, itemURI)).to.be.revertedWith(nxErrors.executorForbidden);
    });
    it("Set URI by executor fail when paused", async function () {
      const { equip, executor, changedURI } = await loadFixture(equipFixture);
      await equip.connect(executor).pause();
      await expect(equip.connect(executor).setDefaultURI(changedURI)).to.be.revertedWith(nxErrors.paused);
    });
    it("Set token's URI by executor fail when paused", async function () {
      const { equip, executor, itemId, itemURI } = await loadFixture(equipFixture);
      await equip.connect(executor).pause();
      await expect(equip.connect(executor).setItemURI(itemId, itemURI)).to.be.revertedWith(nxErrors.paused);
    });
    it("Token URI cannot be return when token doesn't exist", async function () {
      const { equip } = await loadFixture(equipFixture);
      await expect(equip.tokenURI(6)).to.be.revertedWith(nxErrors.MaplestoryEquip.uriInvalidID);
    });
  });

  describe("ownerOfBatch Test", function () {
    it("Success", async function () {
      const { equip, executor, ad1, ad2, mintTokens } = await loadFixture(equipFixture);

      await Promise.all([
        equip.connect(executor).mintBatch(await ad1.getAddress(), mintTokens.slice(0, 2)),
        equip.connect(executor).mintBatch(await ad2.getAddress(), mintTokens.slice(2)),
      ]);

      expect(await equip.ownerOfBatch([...mintTokens.map(({ tokenId }) => tokenId)])).to.deep.equal([
        await ad1.getAddress(),
        await ad1.getAddress(),
        await ad2.getAddress(),
        await ad2.getAddress(),
        await ad2.getAddress(),
      ]);
    });

    it("invalid token ID", async function () {
      const { equip, executor, ad1, ad2, mintTokens } = await loadFixture(equipFixture);

      await Promise.all([
        equip.connect(executor).mintBatch(await ad1.getAddress(), mintTokens.slice(0, 2)),
        equip.connect(executor).mintBatch(await ad2.getAddress(), mintTokens.slice(2, 4)),
      ]);

      await expect(equip.ownerOfBatch([...mintTokens.map(({ tokenId }) => tokenId)])).to.be.revertedWith(
        new RegExp(`^MaplestoryEquip/ownerOfInvalidID:.+${mintTokens.pop()!.tokenId}`)
      );
    });
  });

  describe("approve", function () {
    it("Success", async function () {
      const { controller, equip, ad1, ad2 } = await loadFixture(equipFixture);

      await controller.setAllowlist(await ad1.getAddress(), true);
      await equip.connect(ad2).setApprovalForAll(await ad1.getAddress(), true);
    });
    it("should revert when not allowlisted", async function () {
      const { equip, ad1, ad2 } = await loadFixture(equipFixture);

      await expect(equip.connect(ad2).setApprovalForAll(await ad1.getAddress(), true)).to.be.revertedWith(
        nxErrors.notAllowlisted
      );
    });
  });

  describe("retrieve ERC721 Test", () => {
    it("retrieve ERC721", async () => {
      const { owner, ad1, holder, equip } = await loadFixture(equipFixture);
      await expect(
        equip.connect(owner).retrieveERC721(await holder.getAddress(), await ad1.getAddress(), 1, "bad situation")
      )
        .to.emit(equip, "RetrievedERC721")
        .withArgs(await holder.getAddress(), await ad1.getAddress(), 1, "bad situation");
    });

    it("retrieve ERC721 from not owner", async () => {
      const { ad1, holder, equip } = await loadFixture(equipFixture);
      await expect(
        equip.connect(ad1).retrieveERC721(await holder.getAddress(), await ad1.getAddress(), 1, "bad situation")
      ).to.revertedWith(nxErrors.ownerForbidden);
    });
  });

  describe("setApprovalForAll", function () {
    it("Success", async function () {
      const { controller, equip, ad1, ad2 } = await loadFixture(equipFixture);

      await controller.setAllowlist(await ad1.getAddress(), true);
      await equip.connect(ad2).setApprovalForAll(await ad1.getAddress(), true);
    });
    it("should revert when not allowlisted", async function () {
      const { equip, ad1, ad2 } = await loadFixture(equipFixture);

      await expect(equip.connect(ad2).setApprovalForAll(await ad1.getAddress(), true)).to.be.revertedWith(
        nxErrors.notAllowlisted
      );
    });
  });

  trivialOverridesERC721Pausable(equipFixture);
  trivialOverridesERC721ApproveControlled(equipFixture);
});
