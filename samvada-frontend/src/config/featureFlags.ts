/**
 * Feature Flags
 * =============
 * Set a flag to 1 to ENABLE the feature, 0 to DISABLE it.
 *
 * AUDIO_PLAYBACK_ENABLED
 *   1 → Play buttons appear on every transcript entry.
 *       Citizen entries play the original mic recording.
 *       AI entries play the exact TTS audio sent to the citizen.
 *   0 → Play buttons are completely hidden. No audio is fetched.
 */
export const AUDIO_PLAYBACK_ENABLED: 0 | 1 = 1;
