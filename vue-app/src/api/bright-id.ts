import { Contract, Signer } from 'ethers'
import { TransactionResponse } from '@ethersproject/abstract-provider'
import { formatBytes32String } from '@ethersproject/strings'

import { BrightIdUserRegistry } from './abi'

const NODE_URL = 'https://app.brightid.org/node/v6'
const CONTEXT = process.env.VUE_APP_BRIGHTID_CONTEXT || 'clr.fund'

export interface BrightId {
  isVerified: boolean // If is verified in BrightID
  verification?: Verification
}

export interface Verification {
  unique: boolean
  appUserId: string
  verificationHash: string
  sig: { r: string; s: string; v: number }
  timestamp: number
  app: string
}

export interface Sponsorship {
  timestamp: number
  app: string
  appHasAuthorized: boolean
  spendRequested: boolean
}

export async function selfSponsor(
  registryAddress: string,
  signer: Signer
): Promise<TransactionResponse> {
  const registry = new Contract(registryAddress, BrightIdUserRegistry, signer)
  const userAddress = await signer.getAddress()
  const transaction = await registry.sponsor(userAddress)
  return transaction
}

export function getBrightIdLink(userAddress: string): string {
  const deepLink = `brightid://link-verification/${CONTEXT}/${userAddress}`
  return deepLink
}

export class BrightIdError extends Error {
  code?: number

  constructor(code?: number) {
    const message = code ? `BrightID error ${code}` : 'Unexpected error'
    super(message)
    // https://github.com/Microsoft/TypeScript/issues/13965#issuecomment-388605613
    Object.setPrototypeOf(this, BrightIdError.prototype)
    this.code = code
  }
}

export async function getSponsorship(
  userAddress: string
): Promise<Sponsorship> {
  const apiUrl = `${NODE_URL}/sponsorships/${userAddress}`
  const response = await fetch(apiUrl)
  const data = await response.json()

  if (data['error']) {
    throw new BrightIdError(data['errorNum'])
  } else {
    return data['data']
  }
}

export async function getVerification(
  userAddress: string
): Promise<Verification> {
  // do not cache result so we get the status change sooner
  const headers = new Headers()
  headers.append('cache-control', 'no-store')
  const apiUrl = `${NODE_URL}/verifications/${CONTEXT}/${userAddress}?signed=eth&timestamp=seconds`
  const response = await fetch(apiUrl, { headers })
  const data = await response.json()

  if (data['error']) {
    throw new BrightIdError(data['errorNum'])
  } else {
    return data['data'][0]
  }
}

export async function registerUser(
  registryAddress: string,
  verification: Verification,
  signer: Signer
): Promise<TransactionResponse> {
  const registry = new Contract(registryAddress, BrightIdUserRegistry, signer)
  const transaction = await registry.register(
    formatBytes32String(CONTEXT),
    verification.appUserId,
    '0x' + verification.verificationHash,
    verification.timestamp,
    verification.sig.v,
    '0x' + verification.sig.r,
    '0x' + verification.sig.s
  )
  return transaction
}

export async function getBrightId(contextId: string): Promise<BrightId> {
  const brightId: BrightId = {
    isVerified: false,
  }

  try {
    const verification = await getVerification(contextId)
    // the `unique` field tell us if the user is a verified user
    brightId.isVerified = !!verification?.unique
    brightId.verification = verification
  } catch (error) {
    if (!(error instanceof BrightIdError)) {
      /* eslint-disable-next-line no-console */
      console.error(error)
    }
  }
  return brightId
}
