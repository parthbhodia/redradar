/**
 * Global scan queue for shared Reddit API credentials.
 *
 * When multiple users scan simultaneously, they queue instead of overlapping.
 * Similar to Claude's "this feature is in high demand" messages.
 *
 * Flow:
 * 1. User requests scan → added to queue
 * 2. If queue empty → start immediately
 * 3. If queue has others → user waits, sees position + ETA
 * 4. As scans finish, next queued scan starts
 */

interface QueuedScan {
  id: string
  userId: string
  campaignId: string
  timestamp: number
  estimatedStartTime: number
}

const scanQueue: QueuedScan[] = []
let activeScanUserId: string | null = null
let activeStartTime: number | null = null

const SCAN_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes per scan
const SCAN_BUFFER_BETWEEN_USERS_MS = 2000 // 2 sec buffer between users' scans

export interface ScanQueueStatus {
  /** Position in queue (0 = currently scanning, 1+ = waiting) */
  position: number
  /** Estimated wait time in seconds until scan starts */
  estimatedWaitSeconds: number
  /** Is user currently scanning? */
  isScanning: boolean
  /** Message to show user */
  message: string
}

export interface ScanQueueResult {
  canProceed: boolean
  status: ScanQueueStatus
  /** Permission token to proceed (only when canProceed=true) */
  token?: string
}

/**
 * Request scan access. Returns queue position and wait time.
 * Does NOT start the scan — just reserves a spot.
 */
export function requestScanAccess(userId: string, campaignId: string): ScanQueueResult {
  const scanId = `${userId}-${campaignId}-${Date.now()}`
  const now = Date.now()

  // Check if this user is already scanning
  if (activeScanUserId === userId) {
    return {
      canProceed: true,
      status: {
        position: 0,
        estimatedWaitSeconds: 0,
        isScanning: true,
        message: 'Scan in progress...',
      },
      token: scanId,
    }
  }

  // Check if user already in queue
  const existingIndex = scanQueue.findIndex(s => s.userId === userId)
  if (existingIndex >= 0) {
    const scan = scanQueue[existingIndex]
    const waitMs = Math.max(0, scan.estimatedStartTime - now)
    return {
      canProceed: false,
      status: {
        position: existingIndex + 1,
        estimatedWaitSeconds: Math.ceil(waitMs / 1000),
        isScanning: false,
        message: `${existingIndex + 1} scans ahead. Your scan will start in ~${Math.ceil(waitMs / 1000)}s.`,
      },
    }
  }

  // If no active scan, user can proceed immediately
  if (activeScanUserId === null) {
    activeScanUserId = userId
    activeStartTime = now
    return {
      canProceed: true,
      status: {
        position: 0,
        estimatedWaitSeconds: 0,
        isScanning: true,
        message: 'Starting scan now...',
      },
      token: scanId,
    }
  }

  // Calculate position in queue
  const position = scanQueue.length + 1
  let estimatedStartTime = activeStartTime! + SCAN_TIMEOUT_MS

  // Add all queued scans' durations
  for (const scan of scanQueue) {
    estimatedStartTime += SCAN_TIMEOUT_MS + SCAN_BUFFER_BETWEEN_USERS_MS
  }

  const newScan: QueuedScan = {
    id: scanId,
    userId,
    campaignId,
    timestamp: now,
    estimatedStartTime,
  }

  scanQueue.push(newScan)

  const waitMs = Math.max(0, estimatedStartTime - now)

  return {
    canProceed: false,
    status: {
      position,
      estimatedWaitSeconds: Math.ceil(waitMs / 1000),
      isScanning: false,
      message: `${position} scans ahead of you. High demand! Your scan will start in ~${Math.ceil(waitMs / 1000)}s.`,
    },
  }
}

/**
 * Scan completed. Release slot and start next queued scan.
 * Call this AFTER the scan finishes (success or error).
 */
export function completeScan(token: string) {
  // Check if this was the active scan
  if (token.includes(`${activeScanUserId}-`)) {
    activeScanUserId = null
    activeStartTime = null
  }

  // Remove from queue if present
  const queueIndex = scanQueue.findIndex(s => s.id === token)
  if (queueIndex >= 0) {
    scanQueue.splice(queueIndex, 1)
  }
}

/**
 * Get current queue status (for UI indicators, monitoring, etc.)
 */
export function getQueueStatus() {
  return {
    activeUserId: activeScanUserId,
    queueLength: scanQueue.length,
    totalPending: (activeScanUserId ? 1 : 0) + scanQueue.length,
    nextStartTime: activeStartTime && activeScanUserId
      ? new Date(activeStartTime + SCAN_TIMEOUT_MS)
      : null,
  }
}

/**
 * Clear queue (admin/maintenance only)
 */
export function clearQueue() {
  scanQueue.length = 0
  activeScanUserId = null
  activeStartTime = null
}
