# Shared menu opening motion

The shared `MaterialCard.qml` (also `views/MaterialCard.qml` in Tusche Island)
uses `openingTimeScale = 1.35`. This is the owner's slower-opening trial from
2026-10-15, not a global animation-speed or Reduced Motion override.

- Ordinary roll: 351 ms instead of 260 ms, with the existing OutCubic curve.
- Glass spring: opening natural frequency is divided by 1.35; damping and
  physical position/velocity are preserved. Closing uses the original frequency.
- Lavur bloom: entry growth, content fade, clearing and drying use the same
  opening scale, preserving their relative timing.
- Dismissal durations, window-frame glints, material colors/transparency,
  geometry and native Reduced Motion behavior are unchanged.

The native state includes the opening scale and current spring frequency so
the loaded generation can be checked without assuming that a rescan replaced
cached QML. Reversing or reopening retains the current position and velocity.

To restore the former opening cadence, set the scale to 1.0 in both shared
component copies and install fresh immutable generations. Do not reset theme
files or the whole shell configuration.
