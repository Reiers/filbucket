/**
 * FileState — internal state enum.
 * UI MUST use FILE_STATE_LABEL for human-facing strings. Never show the raw value.
 * See ARCHITECTURE.md §3 + GLOSSARY.md "What we never say in the UI".
 */
export const FILE_STATE = {
  uploading: 'uploading',
  hot_ready: 'hot_ready',
  pdp_committed: 'pdp_committed',
  archived_cold: 'archived_cold',
  restore_from_cold: 'restore_from_cold',
  failed: 'failed',
} as const

export type FileState = (typeof FILE_STATE)[keyof typeof FILE_STATE]

export const FILE_STATE_VALUES: FileState[] = [
  'uploading',
  'hot_ready',
  'pdp_committed',
  'archived_cold',
  'restore_from_cold',
  'failed',
]

/**
 * Human labels — the ONLY strings allowed in UI for file state.
 * No "Filecoin", no "committed", no "PDP". Dropbox-clean.
 */
export const FILE_STATE_LABEL: Record<FileState, string> = {
  uploading: 'Uploading',
  hot_ready: 'Saving',
  pdp_committed: 'Secured',
  archived_cold: 'Archived',
  restore_from_cold: 'Restoring',
  failed: 'Failed',
}

export function fileStateLabel(state: FileState): string {
  return FILE_STATE_LABEL[state]
}

export const COMMIT_EVENT_KINDS = [
  'upload_complete',
  'store_ok',
  'commit_ok',
  'first_proof_ok',
  'fault',
  'repair',
] as const

export type CommitEventKind = (typeof COMMIT_EVENT_KINDS)[number]
