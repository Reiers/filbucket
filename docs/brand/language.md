# Language rules

FilBucket has strong opinions about what words appear in the product.

{% hint style="success" %}
**The one-line rule**: if it sounds like a crypto product, we're losing.
{% endhint %}

## Forbidden in primary UX

Never say any of these in the main app (upload flow, library, detail panel, share modal, share page, settings):

- CID, PieceCID, CommP
- Storage provider, SP, miner
- Wallet, address, sign, connect wallet
- Chain, on-chain, transaction, tx, gas
- Token, USDFC, FIL, coin
- Rail, epoch, proving period
- PDP, Proof of Data Possession
- Dataset, piece
- Synapse, FWSS, Filecoin Pay
- Web3, crypto, blockchain, dapp
- "Decentralized" (tell, don't show — durability and verifiability are better words)

## Allowed with discipline

Fine in narrow contexts:

- **Filecoin** — allowed once per page as a trust signal, typically in the footer. Also allowed in a single "How it stays safe" deep-link.
- **Secured** — our preferred word for "replicated + proven on-chain." Don't say "committed" or "pinned."
- **Ready** — preferred over "uploaded" or "stored."
- **CALIBRATION** — acceptable in a small footer microlabel marking dev env. Never in primary flow.

## Our preferred vocabulary

| Instead of | Say |
|---|---|
| "Upload" (verb) | "Drop files" / "add files" |
| "Connect wallet" | (nothing — there's no wallet) |
| "Committed to Filecoin" | "Secured" |
| "Pinned to IPFS" | "Kept safe" / "Stored" |
| "Storage deal" | (nothing, never expose this) |
| "Storage provider" | (nothing, abstract away) |
| "Retrieve" | "Download" |
| "Node" / "peer" | (nothing) |
| "Decentralized storage" | "Durable storage" / "Verifiable storage" |
| "Blockchain verification" | "Cryptographically proven" |

## Tone

- **Calm, sharp, direct.** Not hype-y.
- **Human, not corporate.** Say "your files," not "user artifacts."
- **Light dry humor when it fits.** Not every empty state needs a joke.
- **Never punch down, never overclaim.** Don't say "the most secure," say "verifiably durable."

## Examples

**✅ Good**:

- "Drop files in the bucket"
- "Let go, we've got it" (drag-over state)
- "Your file is secured"
- "Ready to share"
- "Files stay safe because Filecoin never forgets" (footer microcopy)

**❌ Bad**:

- "Connect your wallet to upload"
- "Your file has been pinned on-chain"
- "Generating CID..."
- "Our decentralized network of storage providers"
- "Secure web3 storage for the next generation"

## Auditing yourself

Before shipping any visible string, re-read it through two lenses:

1. **Would my Mom understand this?** If no, rewrite.
2. **Does this sound like a token project?** If yes, rewrite.

If both pass, ship it.
