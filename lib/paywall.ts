// ─── Feature flag ─────────────────────────────────────────────────────────────
// Set FEATURE_PAYWALL=true in .env.local to activate gating.
// While false, all features are accessible to everyone.

export const PAYWALL_ENABLED = process.env.FEATURE_PAYWALL === 'true'

// ─── Gated features ───────────────────────────────────────────────────────────
// These are the features that will be restricted when the paywall is active.

export const PRO_FEATURES = {
  recommendations:   true,  // "What should I do?" section
  alerts:            true,  // Alerts + push notifications
  forecast:          true,  // 30-day forecast
  ai:                true,  // Future OpenAI features
} as const

export type ProFeature = keyof typeof PRO_FEATURES

// ─── Gate check ───────────────────────────────────────────────────────────────
// Returns true if the user can access the feature.
// When PAYWALL_ENABLED is false, always returns true.

export function canAccess(feature: ProFeature, is_pro: boolean): boolean {
  if (!PAYWALL_ENABLED) return true
  if (!PRO_FEATURES[feature]) return true   // feature is not gated
  return is_pro
}
