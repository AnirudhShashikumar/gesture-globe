export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D extends Point2D {
  z: number;
}

export type Handedness = "Left" | "Right";
export type SphereId = "A" | "B";

export interface Velocity2D extends Point2D {
  magnitude: number;
}

export interface PerHandDerivedGesture {
  handedness: Handedness;
  landmarks: Point3D[];
  palmCenter: Point2D;
  pinchPosition: Point2D;
  pinchDistance: number;
  wristRotation: number;
  wristRotationDelta: number;
  velocity: Velocity2D;
  isPinching: boolean;
  isFist: boolean;
  isOpenPalm: boolean;
  isIndexPointing: boolean;
}

export interface DerivedGestures {
  perHand: PerHandDerivedGesture[];
  palmCenter: Record<Handedness, Point2D | null>;
  pinchDistance: Record<Handedness, number | null>;
  handSpread: number;
  isGrabbing: boolean;
  grabPosition: Point2D | null;
  isBothFistsClosed: boolean;
  wristRotationDelta: number;
  flickVelocity: Velocity2D;
  isClapDetected: boolean;
  isIndexPointing: boolean;
  pointingHandedness: Handedness | null;
  pointHoldFrames: number;
  pointingTip: Point3D | null;
  faceResults: Point3D[] | null;
  handResults: Point3D[][];
  frameCount: number;
}

export interface TrackingResults {
  derivedGestures: DerivedGestures;
}

export interface SphereTransform {
  rotationDelta: Point2D;
  scaleDelta: number;
  shouldScale: boolean;
  grabPosition: Point2D | null;
  isPaused: boolean;
  shouldSpawnSphere: boolean;
  shouldShatter: boolean;
  colorShiftDelta: number;
  shouldPulse: boolean;
  flickVector: Point2D | null;
  isPointing: boolean;
}

export interface GestureInput {
  raw: DerivedGestures;
  transform: SphereTransform;
}

export interface GestureMapperState {
  clapCooldown: number;
  colorShiftCooldown: number;
  accumulatedWristRotation: number;
  prevBothFistsClosed: boolean;
  prevIsGrabbing: boolean;
}

export interface SphereOverlaySnapshot {
  id: SphereId;
  visible: boolean;
  screenPosition: Point2D | null;
  radiusPx: number;
  color: string;
  grabbed: boolean;
}

export interface HudEvent {
  label: string;
  until: number;
}

export interface SceneOverlayState {
  spheres: SphereOverlaySnapshot[];
  currentColor: string;
  nextColor: string;
  grabBeam: { from: Point2D; to: Point2D } | null;
  shatterCharge: { position: Point2D; progress: number } | null;
  clapBursts: Point2D[];
  hudEvents: HudEvent[];
}
