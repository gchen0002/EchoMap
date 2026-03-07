import assert from "node:assert/strict";

function shouldRequestPreciseLocation(options) {
  return !options.isTeleportModeActive && !options.hasUserPosition;
}

assert.equal(
  shouldRequestPreciseLocation({
    hasUserPosition: false,
    isTeleportModeActive: false,
  }),
  true,
  "should request precise location when no known position exists"
);

assert.equal(
  shouldRequestPreciseLocation({
    hasUserPosition: true,
    isTeleportModeActive: false,
  }),
  false,
  "should not request precise location when a user position already exists"
);

assert.equal(
  shouldRequestPreciseLocation({
    hasUserPosition: true,
    isTeleportModeActive: true,
  }),
  false,
  "should not request precise location while teleport mode is active"
);

console.log("echoMapLocation tests passed");
