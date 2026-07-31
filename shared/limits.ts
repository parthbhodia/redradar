/**
 * Product limits shared by the server (which enforces them) and the UI (which
 * explains them before anyone hits one).
 */

/** Seats per workspace, including the owner. */
export const MAX_ORG_MEMBERS = 3

/** Manual scans per user per UTC day. */
export const DAILY_SCAN_LIMIT = 3
