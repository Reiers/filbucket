# FilBucket Project

## One-line description

A Dropbox-style file storage and sharing product built on top of Filecoin, without exposing Filecoin complexity to users.

## Core idea

The user experience should be centered on files, folders, links, and trust.
The infrastructure should quietly use Filecoin for durability and archive-grade storage.

## Problem

Existing Filecoin storage products are too infrastructure-shaped.
They ask users to think like protocol operators instead of people who just want to upload, store, and share files.

## Solution

FilBucket acts like a normal file product:
- upload files instantly
- keep files accessible
- secure them durably in the background
- share them easily
- restore archived content cleanly when needed

## Product pillars

### 1. Simplicity
No wallet, no token, no chain jargon.

### 2. Durability
Files should feel safer than generic cloud storage because the durability story is explicit and believable.

### 3. Shareability
Sharing must be elegant and fast.

### 4. Calm UX
No cyberpunk design language, no protocol theater.

## Candidate wedges

### Option A: Large file sharing
- send huge files with simple links
- better than WeTransfer for durability and retention

### Option B: Durable archive storage
- cold-ish storage with easy restore
- personal and small-team backup angle

### Option C: Team file buckets
- shared folders for teams/projects
- later expands into collaboration and permissions

## Recommendation

Start with **large-file sharing + durable archive**.
That is concrete, understandable, and easier to explain than a broad Dropbox competitor.

## MVP surface

### Frontend
- Landing page
- Auth
- File library
- Upload flow
- Share page
- File detail state

### Backend
- File metadata store
- Upload ingestion
- Hot storage/cache
- Background Filecoin durability pipeline
- Share-link generation and access control
- Restore orchestration

## Human file states
- Uploading
- Ready
- Secured
- Archived
- Restoring
- Failed

## Open questions
- What is the first ideal user?
- Consumer, prosumer, team, or dev?
- Which hot-storage layer should back instant availability?
- How should restore SLAs be explained?
- Should buckets be visible in MVP, or just folders?
- Should sharing be public-link-first or account-to-account first?

## Success criteria for MVP
- A non-crypto user can upload and share a file with no explanation
- A user understands what "secured" means without reading docs
- Archived files feel trustworthy, not lost
- The UI feels premium and obvious on first use
