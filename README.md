# FilBucket

Dropbox-style file storage on Filecoin.

## Vision

FilBucket should feel like a normal, beautiful file product.
Not a crypto tool.
Not a protocol dashboard.
Not a pile of Web3 jargon.

The promise is simple:

**Upload, store, and share files simply, with Filecoin-grade durability underneath.**

Users should never need to think about:
- CIDs
- storage deals
- wallets
- miners
- retrieval markets
- on-chain anything

Those details belong inside the product, not in the user experience.

## Product Thesis

Most Filecoin products expose the plumbing.
That is why normal users do not adopt them.

FilBucket wins by doing the opposite:
- instant-feeling uploads
- human language for file state
- beautiful sharing
- calm, trustworthy UX
- Filecoin under the hood, invisible by default

This is not "access to Filecoin" as a product.
This is a real file-storage product powered by Filecoin.

## MVP

### Core user flows
- Upload files with drag-and-drop
- Organize files into folders or buckets
- Preview and download files
- Generate share links
- Control privacy, expiry, and optional password protection

### Reliability layer
- Hot storage / cache for immediate availability
- Background durability pipeline into Filecoin
- Human-readable file states:
  - Uploading
  - Ready
  - Secured
  - Archived
  - Restoring

### Authentication
- Email login
- Social login later if useful
- No wallet required

## UX Principles

### 1. Feel immediate
Uploads should feel done immediately, even if deeper durability work continues in the background.

### 2. Hide protocol complexity
No raw infrastructure language in the primary interface.

### 3. Make sharing delightful
A great share-link flow is table stakes.

### 4. Earn trust quietly
Show durability and integrity in plain language, not chain theater.

### 5. Be boring in the right way
This should feel more like Dropbox or Backblaze than a Web3 project.

## Positioning

### User-facing
- Simple file storage
- Durable backup
- Easy file sharing

### Infrastructure truth
- Filecoin-backed durability
- Retrieval acceleration via cache layer
- Optional future S3/API surface

## What FilBucket is not
- not a token product
- not a wallet product
- not an NFT file vault
- not a protocol explorer
- not a crypto-native UX experiment

## Possible wedge

Start with one sharp use case:
- large file sharing
- long-term archive storage
- dataset storage
- team dropbox for durable files

"Dropbox for Filecoin" is useful shorthand, but the actual wedge should be narrower and stronger.

## Near-Term Build Plan

1. Define the exact first wedge
2. Design the information architecture
3. Design the file-state model and storage pipeline
4. Build a simple upload + library + share-link MVP
5. Add Filecoin durability behind the scenes
6. Polish until it feels calm and obvious

## Initial concept

FilBucket should be:
- more normal than web3 products
- more trustworthy than hacker projects
- more elegant than infra dashboards

If it feels like crypto, it loses.
If it feels like a clean file product that quietly uses Filecoin well, it has a shot.
