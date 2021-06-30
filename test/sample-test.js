const { assert } = require("chai");

const { parseEther, getContractAddress } = ethers.utils;

describe("GovernorAlpha", function() {
  const supply = parseEther("10000000");
  let comp, governorAlpha, addr1, timelock, example, delay;
  before(async () => {
    [addr1] = await ethers.provider.listAccounts();

    const Comp = await ethers.getContractFactory("Comp");
    comp = await Comp.deploy(addr1);
    await comp.deployed();

    const nonce = await ethers.provider.getTransactionCount(addr1);
    const govAlphaAddr = getContractAddress({ from: addr1, nonce: nonce + 1 });
    delay = 60 * 60 * 24 * 2;
    const Timelock = await ethers.getContractFactory("Timelock");
    timelock = await Timelock.deploy(govAlphaAddr, delay);
    await timelock.deployed();

    const GovernorAlpha = await ethers.getContractFactory("GovernorAlpha");
    governorAlpha = await GovernorAlpha.deploy(timelock.address, comp.address, addr1);
    await governorAlpha.deployed();

    const Example = await ethers.getContractFactory("Example");
    example = await Example.deploy();
    await example.deployed();
  });

  it("should have minted the total supply", async function() {
    const balance = await comp.balanceOf(addr1);
    assert(balance.eq(supply));
  });

  describe("after creating a proposal", () => {
    before(async () => {
      await comp.delegate(addr1);

      const targets = [example.address];
      const values = ["0"];
      const signatures = [""];
      const calldatas = [example.interface.encodeFunctionData("setX", [42])];
      const description = "set X!";

      await governorAlpha.propose(targets, values, signatures, calldatas, description);
    });

    it("should have been initialized", async () => {
      const proposal = await governorAlpha.proposals(1);
      assert(proposal.startBlock.gt(0));
    });

    describe('execute the proposal', () => {
      before(async () => {
        // 1. reach quorom through a vote (we have 100% of the tokens)
        await hre.network.provider.send("evm_mine");
        await governorAlpha.castVote(1, true);

        // 2. queue the vote in the Timelock
        const { startBlock, endBlock } = await governorAlpha.proposals(1);
        const diff = endBlock.sub(startBlock);
        for(let i = 0; i < diff.toNumber(); i++) {
          await hre.network.provider.send("evm_mine");
        }
        await governorAlpha.queue(1);

        const { eta } = await governorAlpha.proposals(1);

        // 3. execute the transaction
        await hre.network.provider.send("evm_setNextBlockTimestamp", [eta.toNumber()]);

        await governorAlpha.execute(1);
      });

      it('should see that x get updated', async () => {
        const x = await example.x();
        assert.equal(x.toNumber(), 42);
      });
    });
  });
});
