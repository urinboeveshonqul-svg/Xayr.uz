// ============================================================
// Admin mutation signal — CLIENT-SAFE (no server imports, no DB access).
//
// The admin tabs update their tables optimistically in local state rather than
// re-rendering the server layout, so after "approve"/"reject"/"mark read" the
// nav badge would otherwise keep showing the pre-action number until a hard
// reload. This is the one-line hook that closes that gap: an admin component
// calls notifyAdminMutation() after a write succeeds, AdminBadgeProvider hears it
// and refetches the counts.
//
// A window event rather than context/props on purpose: the action handlers stay
// completely decoupled from the badge implementation — they don't import the
// provider, don't need to be inside it, and don't have to know which counts (if
// any) their action affects.
// ============================================================

/** Dispatched on `window` after any admin write that could change a badge count. */
export const ADMIN_MUTATION_EVENT = 'xayr:admin-mutation';

/**
 * Announce that admin data changed, so the nav badges refresh without a page
 * reload. Call AFTER the write has succeeded. Safe to call from anywhere,
 * including during SSR (no-ops without a window) and when no provider is
 * mounted (nothing is listening).
 */
export function notifyAdminMutation(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ADMIN_MUTATION_EVENT));
}
