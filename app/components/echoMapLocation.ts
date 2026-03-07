export function shouldRequestPreciseLocation(options: {
  hasUserPosition: boolean;
  isTeleportModeActive: boolean;
}) {
  return !options.isTeleportModeActive && !options.hasUserPosition;
}
