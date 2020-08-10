import fs from 'fs'
import { ethers } from '@nomiclabs/buidler'
import { Keypair } from 'maci-domainobjs'

import MACIArtifact from '../build/contracts/MACI.json'
import { getEventArg } from '../tests/utils'

async function main() {
  const [,,,,, contributor1, contributor2] = await ethers.getSigners()
  const state = JSON.parse(fs.readFileSync('state.json').toString())
  const fundingRound = await ethers.getContractAt('FundingRound', state.fundingRound)
  const tokenAddress = await fundingRound.nativeToken()
  const token = await ethers.getContractAt('AnyOldERC20Token', tokenAddress)
  const maciAddress = await fundingRound.maci()
  const maci = await ethers.getContractAt(MACIArtifact.abi, maciAddress)

  const contributionAmount = 10000
  const voiceCredits = Math.sqrt(contributionAmount)
  state.contributors = {}

  for (const contributor of [contributor1, contributor2]) {
    const contributorAddress = await contributor.getAddress()
    const contributorKeypair = new Keypair()
    const tokenAsContributor = token.connect(contributor)
    await tokenAsContributor.approve(
      fundingRound.address,
      contributionAmount,
    )
    const fundingRoundAsContributor = fundingRound.connect(contributor)
    const contributionTx = await fundingRoundAsContributor.contribute(
      contributorKeypair.pubKey.asContractParam(),
      contributionAmount,
    )
    const stateIndex = await getEventArg(contributionTx, maci, 'SignUp', '_stateIndex')
    state.contributors[contributorAddress] = {
      privKey: contributorKeypair.privKey.serialize(),
      pubKey: contributorKeypair.pubKey.serialize(),
      stateIndex: parseInt(stateIndex),
      voiceCredits: voiceCredits,
    }
    console.log(`Contributor ${contributorAddress} registered. State index: ${stateIndex}. Voice credits: ${voiceCredits}.`)
  }

  // Update state file
  fs.writeFileSync('state.json', JSON.stringify(state))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })