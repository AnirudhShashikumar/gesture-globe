import type {
  DerivedGestures,
  GestureMapperState,
  Point2D,
  SphereTransform,
} from "@/types";

export const FIST_CURL_THRESHOLD = 0.08;
export const PINCH_GRAB_THRESHOLD = 0.05;
export const MIN_SPHERE_SCALE = 0.4;
export const MAX_SPHERE_SCALE = 3.0;
export const ROTATION_SENSITIVITY = 2.5;
export const FLICK_VELOCITY_THRESHOLD = 0.04;
export const WRIST_COLOR_SENSITIVITY = 0.8;
export const CLAP_COOLDOWN_FRAMES = 20;
export const POINT_HOLD_FRAMES = 60;

const SPREAD_MIN = 0.12;
const SPREAD_MAX = 0.58;
const ROTATION_DEADZONE = 0.015;
const WRIST_ROTATION_NOISE_FLOOR = 0.025;
const COLOR_SHIFT_COOLDOWN_FRAMES = 14;

export const DEFAULT_GESTURE_MAPPER_STATE: GestureMapperState = {
  clapCooldown: 0,
  colorShiftCooldown: 0,
  accumulatedWristRotation: 0,
  prevBothFistsClosed: false,
  prevIsGrabbing: false,
};

const ZERO_POINT: Point2D = { x: 0, y: 0 };

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function mapGesturesToTransform(
  gestures: DerivedGestures,
  prevState: GestureMapperState
): { transform: SphereTransform; nextState: GestureMapperState } {
  const nextState: GestureMapperState = { ...prevState };

  if (nextState.clapCooldown > 0) {
    nextState.clapCooldown -= 1;
  }
  if (nextState.colorShiftCooldown > 0) {
    nextState.colorShiftCooldown -= 1;
  }

  const leadHand = gestures.perHand[0];
  const rotationDelta: Point2D = { ...ZERO_POINT };

  if (leadHand?.isOpenPalm) {
    const horizontal = 0.5 - leadHand.palmCenter.x;
    const vertical = leadHand.palmCenter.y - 0.5;

    rotationDelta.y =
      Math.abs(horizontal) > ROTATION_DEADZONE
        ? horizontal * ROTATION_SENSITIVITY
        : 0;
    rotationDelta.x =
      Math.abs(vertical) > ROTATION_DEADZONE
        ? vertical * ROTATION_SENSITIVITY
        : 0;
  }

  const scaleDelta =
    gestures.perHand.length >= 2
      ? MIN_SPHERE_SCALE +
        (MAX_SPHERE_SCALE - MIN_SPHERE_SCALE) *
          clamp(
            (gestures.handSpread - SPREAD_MIN) / (SPREAD_MAX - SPREAD_MIN),
            0,
            1
          )
      : 1;
  const shouldScale =
    gestures.perHand.length >= 2 &&
    gestures.perHand.every((hand) => hand.isOpenPalm && !hand.isPinching) &&
    !gestures.isGrabbing;

  const shouldPulse =
    gestures.isClapDetected && nextState.clapCooldown === 0;
  if (shouldPulse) {
    nextState.clapCooldown = CLAP_COOLDOWN_FRAMES;
  }

  const shouldSpawnSphere =
    gestures.isBothFistsClosed && !prevState.prevBothFistsClosed;

  const releasedFromGrab = prevState.prevIsGrabbing && !gestures.isGrabbing;
  const flickVector =
    releasedFromGrab && gestures.flickVelocity.magnitude > FLICK_VELOCITY_THRESHOLD
      ? {
          x: gestures.flickVelocity.x,
          y: gestures.flickVelocity.y,
        }
      : null;

  let colorShiftDelta = 0;
  const wristDelta = gestures.wristRotationDelta;
  if (Math.abs(wristDelta) < WRIST_ROTATION_NOISE_FLOOR) {
    nextState.accumulatedWristRotation *= 0.88;
  } else {
    const sameDirection =
      nextState.accumulatedWristRotation === 0 ||
      Math.sign(nextState.accumulatedWristRotation) === Math.sign(wristDelta);
    nextState.accumulatedWristRotation = sameDirection
      ? nextState.accumulatedWristRotation + wristDelta
      : wristDelta;
  }

  if (
    nextState.colorShiftCooldown === 0 &&
    Math.abs(nextState.accumulatedWristRotation) >= WRIST_COLOR_SENSITIVITY
  ) {
    colorShiftDelta = Math.sign(nextState.accumulatedWristRotation);
    nextState.accumulatedWristRotation = 0;
    nextState.colorShiftCooldown = COLOR_SHIFT_COOLDOWN_FRAMES;
  }

  const transform: SphereTransform = {
    rotationDelta,
    scaleDelta,
    shouldScale,
    grabPosition: gestures.grabPosition,
    isPaused: false,
    shouldSpawnSphere,
    shouldShatter: gestures.pointHoldFrames >= POINT_HOLD_FRAMES,
    colorShiftDelta,
    shouldPulse,
    flickVector,
    isPointing: gestures.isIndexPointing,
  };

  nextState.prevBothFistsClosed = gestures.isBothFistsClosed;
  nextState.prevIsGrabbing = gestures.isGrabbing;

  return { transform, nextState };
}
