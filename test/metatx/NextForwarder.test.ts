import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { TypedDataDomain } from "@ethersproject/abstract-signer";
import { encodeError } from "../lib/abi";
import nxErrors from "../lib/nx-errors";
import {
  cancelReqeustTypes,
  ForwardRequest,
  forwardRequestTypes,
  hashForwardRequest,
  nextForwarderNameAndVersion,
} from "../lib/forward";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";

describe("NextForwarder", function () {
  async function fixture() {
    const [alice, bob, anyone, other] = await ethers.getSigners();
    const [NextForwarder, MockCallee, MockCounter, MockReverter] = await Promise.all([
      ethers.getContractFactory("NextForwarder"),
      ethers.getContractFactory("MockCallee"),
      ethers.getContractFactory("MockCounter"),
      ethers.getContractFactory("MockReverter"),
    ]);
    const [forwarder, callee, counter, reverter] = await Promise.all([
      NextForwarder.deploy(),
      MockCallee.deploy(),
      MockCounter.deploy(),
      MockReverter.deploy(),
    ]);

    const domain: TypedDataDomain = {
      ...nextForwarderNameAndVersion,
      chainId: (await forwarder.provider.getNetwork()).chainId,
      verifyingContract: forwarder.address,
    };

    return { forwarder, callee, counter, reverter, alice, bob, anyone, other, domain };
  }

  before(async function () {
    await loadFixture(fixture);
  });

  describe("execute", function () {
    it("should execute", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, forwardRequestTypes, req);

      await expect(forwarder.connect(alice).execute(req, signature)).to.emit(callee, "MockCalled");
    });

    it("should be executed by anyone", async function () {
      const { forwarder, callee, anyone, bob, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, forwardRequestTypes, req);

      await expect(forwarder.connect(anyone).execute(req, signature)).not.to.be.reverted;
    });

    it("should check domain", async function () {
      const { forwarder, callee, alice, bob } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(
        {
          name: "NextForwarder",
          version: "1.0.0",
          chainId: "1112378643212746175",
          verifyingContract: forwarder.address,
        },
        forwardRequestTypes,
        req
      );

      await expect(forwarder.connect(alice).execute(req, signature)).to.be.revertedWith(nxErrors.invalidSignature);
    });

    it("should be reverted when signature is invalid", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, forwardRequestTypes, { ...req, salt: 1 });

      await expect(forwarder.connect(alice).execute(req, signature)).to.be.revertedWith(nxErrors.invalidSignature);
    });

    it("should be reverted when signed by other", async function () {
      const { forwarder, callee, alice, bob, other, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await other._signTypedData(domain, forwardRequestTypes, req);

      await expect(forwarder.connect(alice).execute(req, signature)).to.be.revertedWith(nxErrors.invalidSignature);
    });

    it("should be reverted when double sent", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, forwardRequestTypes, req);

      await forwarder.connect(alice).execute(req, signature);
      await expect(forwarder.connect(alice).execute(req, signature)).to.be.revertedWith(
        nxErrors.NextForwarder.duplicate
      );
    });

    it("should accept same request with different salts", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req1: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const req2: ForwardRequest = {
        ...req1,
        salt: 1,
      };
      const signature1 = await bob._signTypedData(domain, forwardRequestTypes, req1);
      const signature2 = await bob._signTypedData(domain, forwardRequestTypes, req2);

      await expect(forwarder.connect(alice).execute(req1, signature1)).not.to.be.reverted;
      await expect(forwarder.connect(alice).execute(req2, signature2)).not.to.be.reverted;
    });

    it("should accept same request with different from addresses", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req1: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const req2: ForwardRequest = {
        ...req1,
        from: await alice.getAddress(),
      };
      const signature1 = await bob._signTypedData(domain, forwardRequestTypes, req1);
      const signature2 = await alice._signTypedData(domain, forwardRequestTypes, req2);

      await expect(forwarder.connect(alice).execute(req1, signature1)).not.to.be.reverted;
      await expect(forwarder.connect(alice).execute(req2, signature2)).not.to.be.reverted;
    });

    it("should be reverted when deadline exceeded", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: 1_000_000_000_000n,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, forwardRequestTypes, req);

      await setNextBlockTimestamp(999_999_999_999n);
      await mine();
      await expect(forwarder.callStatic.execute(req, signature)).not.to.be.reverted;

      await setNextBlockTimestamp(1_000_000_000_000n);
      await mine();
      await expect(forwarder.connect(alice).execute(req, signature)).to.be.revertedWith(
        nxErrors.NextForwarder.deadline
      );
    });

    it("should call with correct data", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0xabba",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, forwardRequestTypes, req);

      await expect(forwarder.connect(alice).execute(req, signature))
        .to.emit(callee, "MockCalled")
        .withArgs(ethers.utils.solidityPack(["bytes", "address"], [req.data, req.from]), 0);
    });

    it("should be reverted when gas limit is insufficient", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1_000_000_000,
        data: "0x",
        deadline: 1_000_000_000_000n,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, forwardRequestTypes, req);

      await expect(
        alice.sendTransaction({
          ...(await forwarder.connect(alice).populateTransaction.execute(req, signature)),
          gasLimit: 100000,
        })
      ).to.be.rejectedWith(/invalid opcode/);
    });

    it("should return and emit return data on success", async function () {
      const { forwarder, counter, alice, bob, domain } = await loadFixture(fixture);

      await counter.loadAndAdd(5050);

      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: counter.address,
        gas: 1000000,
        data: counter.interface.encodeFunctionData("loadAndAdd", [505]),
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, forwardRequestTypes, req);

      {
        const { success, returndata } = await forwarder.callStatic.execute(req, signature);
        expect(success, "returned success").to.be.true;
        expect(returndata, "returned returndata").to.eq(ethers.utils.solidityPack(["uint256"], [5050]));
      }

      await expect(forwarder.connect(alice).execute(req, signature), "transaction")
        .to.emit(forwarder, "Executed")
        .withArgs(req.from, hashForwardRequest(req), true, ethers.utils.solidityPack(["uint256"], [5050]));

      expect(await counter.value(), "counter value after metatx").to.eq(5555);
    });

    it("should return and emit revert reason on failure", async function () {
      const { forwarder, reverter, alice, bob, domain } = await loadFixture(fixture);

      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: reverter.address,
        gas: 1000000,
        data: reverter.interface.encodeFunctionData("revertYay"),
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, forwardRequestTypes, req);

      {
        const { success, returndata } = await forwarder.callStatic.execute(req, signature);
        expect(success, "returned success").to.be.false;
        expect(returndata, "returned returndata").to.eq(encodeError("Yay"));
      }

      await expect(forwarder.connect(alice).execute(req, signature), "transaction")
        .to.emit(forwarder, "Executed")
        .withArgs(req.from, hashForwardRequest(req), false, encodeError("Yay"));
    });
  });

  describe("cancel", function () {
    it("should make execute calls revert", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, cancelReqeustTypes, { request: req });

      await expect(forwarder.connect(alice).cancel({ request: req }, signature)).not.to.be.reverted;

      await expect(
        forwarder.connect(alice).execute(req, await bob._signTypedData(domain, forwardRequestTypes, req))
      ).to.be.revertedWith(nxErrors.NextForwarder.duplicate);
    });

    it("should be executed by anyone", async function () {
      const { forwarder, callee, anyone, bob, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, cancelReqeustTypes, { request: req });

      await expect(forwarder.connect(anyone).cancel({ request: req }, signature)).not.to.be.reverted;
    });

    it("should check domain", async function () {
      const { forwarder, callee, alice, bob } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(
        {
          name: "NextForwarder",
          version: "1.0.0",
          chainId: "1112378643212746175",
          verifyingContract: forwarder.address,
        },
        forwardRequestTypes,
        req
      );

      await expect(forwarder.connect(alice).cancel({ request: req }, signature)).to.be.revertedWith(
        nxErrors.invalidSignature
      );
    });

    it("should be reverted when signature is invalid", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, forwardRequestTypes, { ...req, salt: 1 });

      await expect(forwarder.connect(alice).cancel({ request: req }, signature)).to.be.revertedWith(
        nxErrors.invalidSignature
      );
    });

    it("should be reverted when signed by other", async function () {
      const { forwarder, callee, alice, bob, other, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await other._signTypedData(domain, forwardRequestTypes, req);

      await expect(forwarder.connect(alice).cancel({ request: req }, signature)).to.be.revertedWith(
        nxErrors.invalidSignature
      );
    });

    it("should not cancel the same request with different salt", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req1: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const req2: ForwardRequest = {
        ...req1,
        salt: 1,
      };
      const signature1 = await bob._signTypedData(domain, cancelReqeustTypes, { request: req1 });
      const signature2 = await bob._signTypedData(domain, forwardRequestTypes, req2);

      await expect(forwarder.connect(alice).cancel({ request: req1 }, signature1)).not.to.be.reverted;
      await expect(forwarder.connect(alice).execute(req2, signature2)).not.to.be.reverted;
    });

    it("should not cancel the same request with different from address", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req1: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const req2: ForwardRequest = {
        ...req1,
        from: await alice.getAddress(),
      };
      const signature1 = await bob._signTypedData(domain, cancelReqeustTypes, { request: req1 });
      const signature2 = await alice._signTypedData(domain, forwardRequestTypes, req2);

      await expect(forwarder.connect(alice).cancel({ request: req1 }, signature1)).not.to.be.reverted;
      await expect(forwarder.connect(alice).execute(req2, signature2)).not.to.be.reverted;
    });

    it("should emit canceled event", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, cancelReqeustTypes, { request: req });

      await expect(forwarder.connect(alice).cancel({ request: req }, signature))
        .to.emit(forwarder, "Canceled")
        .withArgs(req.from, hashForwardRequest(req));
    });
  });

  describe("hashRequest", function () {
    it("should calculate correct hash", async function () {
      const { forwarder, callee, bob } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };

      expect(await forwarder.hashRequest(req)).to.eq(hashForwardRequest(req));
    });
  });

  describe("fulfilled", function () {
    it("should return false when not fulfilled", async function () {
      const { forwarder, callee, bob } = await loadFixture(fixture);

      expect(await forwarder.fulfilled(ethers.constants.HashZero)).to.be.false;
      expect(await forwarder.fulfilled("0x6400f45e01d8db92e50341f1cd2c384e69189911c18056baaec12034897f9629")).to.be
        .false;
      expect(
        await forwarder.fulfilled(
          hashForwardRequest({
            from: await bob.getAddress(),
            to: callee.address,
            gas: 1000000,
            data: "0x",
            deadline: ethers.constants.MaxUint256,
            salt: 0,
          })
        )
      ).to.be.false;
    });

    it("should return true after executed", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, forwardRequestTypes, req);

      await forwarder.connect(alice).execute(req, signature);

      expect(await forwarder.fulfilled(hashForwardRequest(req))).to.be.true;
    });

    it("should return true after canceled", async function () {
      const { forwarder, callee, alice, bob, domain } = await loadFixture(fixture);
      const req: ForwardRequest = {
        from: await bob.getAddress(),
        to: callee.address,
        gas: 1000000,
        data: "0x",
        deadline: ethers.constants.MaxUint256,
        salt: 0,
      };
      const signature = await bob._signTypedData(domain, cancelReqeustTypes, { request: req });

      await forwarder.connect(alice).cancel({ request: req }, signature);

      expect(await forwarder.fulfilled(hashForwardRequest(req))).to.be.true;
    });
  });
});
