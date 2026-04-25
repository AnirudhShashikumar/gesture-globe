"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  type FaceLandmarkerResult,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type {
  DerivedGestures,
  Handedness,
  PerHandDerivedGesture,
  Point2D,
  Point3D,
  TrackingResults,
  Velocity2D,
} from "@/types";
import {
  FIST_CURL_THRESHOLD,
  PINCH_GRAB_THRESHOLD,
  POINT_HOLD_FRAMES,
} from "@/utils/gestureMapper";

interface UseMediapipeOptions {
  videoElement: HTMLVideoElement | null;
  onResults: (results: TrackingResults) => void;
  onReady: () => void;
  onError?: (message: string) => void;
}

const TASKS_VISION_WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const HAND_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const PALM_CENTER_INDICES = [0, 5, 9, 13, 17] as const;
const FINGER_CURL_PAIRS: Array<readonly [number, number]> = [
  [8, 5],
  [12, 9],
  [16, 13],
  [20, 17],
];
const FINGER_TIPS = [8, 12, 16, 20] as const;
const FINGER_PIPS = [6, 10, 14, 18] as const;
const HAND_LANDMARK_SMOOTHING = 0.42;
const FACE_LANDMARK_SMOOTHING = 0.28;

type FrameState = {
  palmHistory: Point2D[];
  wasOpen: boolean;
  lastOpenFrame: number;
  pointHoldFrames: number;
  previousWristRotation: number | null;
};

type TrackingStateStore = Record<Handedness, FrameState>;
type SmoothedLandmarkStore = {
  face: Point3D[] | null;
  hands: Record<Handedness, Point3D[] | null>;
};

const createHandState = (): FrameState => ({
  palmHistory: [],
  wasOpen: false,
  lastOpenFrame: -1000,
  pointHoldFrames: 0,
  previousWristRotation: null,
});

const mapLandmarks = (
  landmarks: Array<{ x: number; y: number; z: number }>
): Point3D[] => landmarks.map(({ x, y, z }) => ({ x, y, z }));

const smoothPoint = (previous: Point3D, next: Point3D, alpha: number): Point3D => ({
  x: previous.x + (next.x - previous.x) * alpha,
  y: previous.y + (next.y - previous.y) * alpha,
  z: previous.z + (next.z - previous.z) * alpha,
});

const smoothLandmarkList = (
  previous: Point3D[] | null,
  next: Point3D[],
  alpha: number
): Point3D[] => {
  if (!previous || previous.length !== next.length) {
    return next.map((point) => ({ ...point }));
  }

  return next.map((point, index) => smoothPoint(previous[index], point, alpha));
};

const getShortestAngleDelta = (next: number, previous: number) => {
  let delta = next - previous;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
};

const distance2D = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

const getPalmCenter = (landmarks: Point3D[]): Point2D => {
  let x = 0;
  let y = 0;

  for (const index of PALM_CENTER_INDICES) {
    x += landmarks[index].x;
    y += landmarks[index].y;
  }

  return {
    x: x / PALM_CENTER_INDICES.length,
    y: y / PALM_CENTER_INDICES.length,
  };
};

const getPinchPosition = (landmarks: Point3D[]): Point2D => ({
  x: (landmarks[4].x + landmarks[8].x) / 2,
  y: (landmarks[4].y + landmarks[8].y) / 2,
});

const getIsFist = (landmarks: Point3D[]) => {
  let totalCurlDistance = 0;

  for (const [tipIndex, baseIndex] of FINGER_CURL_PAIRS) {
    totalCurlDistance += distance2D(landmarks[tipIndex], landmarks[baseIndex]);
  }

  return totalCurlDistance / FINGER_CURL_PAIRS.length < FIST_CURL_THRESHOLD;
};

const getIsOpenPalm = (landmarks: Point3D[]) =>
  FINGER_TIPS.every((tip, index) => landmarks[tip].y < landmarks[FINGER_PIPS[index]].y);

const getIsIndexPointing = (landmarks: Point3D[]) => {
  const indexExtended = landmarks[8].y < landmarks[6].y;
  const middleCurled = landmarks[12].y > landmarks[10].y;
  const ringCurled = landmarks[16].y > landmarks[14].y;
  const pinkyCurled = landmarks[20].y > landmarks[18].y;
  const thumbCurled = distance2D(landmarks[4], landmarks[2]) < 0.12;

  return indexExtended && middleCurled && ringCurled && pinkyCurled && thumbCurled;
};

const getWristRotation = (landmarks: Point3D[]) =>
  Math.atan2(landmarks[9].y - landmarks[0].y, landmarks[9].x - landmarks[0].x);

const getVelocity = (
  historyRef: MutableRefObject<TrackingStateStore>,
  handedness: Handedness,
  palmCenter: Point2D
): Velocity2D => {
  const history = historyRef.current[handedness].palmHistory;
  history.push(palmCenter);

  if (history.length > 3) {
    history.shift();
  }

  if (history.length < 2) {
    return { x: 0, y: 0, magnitude: 0 };
  }

  // Flick/throw velocity calculation uses the oldest and newest of the last
  // three palm samples to reduce single-frame jitter before release.
  const start = history[0];
  const end = history[history.length - 1];
  const x = end.x - start.x;
  const y = end.y - start.y;

  return { x, y, magnitude: Math.hypot(x, y) };
};

const computeDerivedGestures = (
  multiHandLandmarks: Point3D[][],
  handednesses: Handedness[],
  faceResults: Point3D[] | null,
  frameStateRef: MutableRefObject<TrackingStateStore>,
  frameCount: number
): DerivedGestures => {
  const perHand: PerHandDerivedGesture[] = multiHandLandmarks.map((landmarks, index) => {
    const handedness = handednesses[index] ?? "Right";
    const palmCenter = getPalmCenter(landmarks);
    const pinchDistance = distance2D(landmarks[4], landmarks[8]);
    const wristRotation = getWristRotation(landmarks);
    const handState = frameStateRef.current[handedness];
    const previousRotation = handState.previousWristRotation ?? wristRotation;

    // Wrist rotation detection logic tracks the mid-palm axis against the wrist
    // and compares it to the previous frame so twist gestures can shift color.
    const wristRotationDelta = getShortestAngleDelta(wristRotation, previousRotation);
    handState.previousWristRotation = wristRotation;

    const velocity = getVelocity(frameStateRef, handedness, palmCenter);
    const isOpenPalm = getIsOpenPalm(landmarks);
    const isFist = getIsFist(landmarks);
    const isIndexPointing = getIsIndexPointing(landmarks);

    if (isOpenPalm) {
      handState.wasOpen = true;
      handState.lastOpenFrame = frameCount;
    } else if (isFist && handState.wasOpen) {
      handState.wasOpen = false;
    }

    handState.pointHoldFrames = isIndexPointing
      ? Math.min(handState.pointHoldFrames + 1, POINT_HOLD_FRAMES)
      : 0;

    return {
      handedness,
      landmarks,
      palmCenter,
      pinchPosition: getPinchPosition(landmarks),
      pinchDistance,
      wristRotation,
      wristRotationDelta,
      velocity,
      isPinching: pinchDistance < PINCH_GRAB_THRESHOLD,
      isFist,
      isOpenPalm,
      isIndexPointing,
    };
  });

  const left = perHand.find((hand) => hand.handedness === "Left") ?? null;
  const right = perHand.find((hand) => hand.handedness === "Right") ?? null;
  const pinchingHand = perHand.find((hand) => hand.isPinching) ?? null;
  const pointingHand = perHand.find((hand) => hand.isIndexPointing) ?? null;

  let isClapDetected = false;
  for (const hand of perHand) {
    const state = frameStateRef.current[hand.handedness];
    if (hand.isFist && frameCount - state.lastOpenFrame <= 6) {
      isClapDetected = true;
      state.lastOpenFrame = -1000;
    }
  }

  const dominantVelocity =
    pinchingHand?.velocity ??
    pointingHand?.velocity ??
    perHand[0]?.velocity ?? { x: 0, y: 0, magnitude: 0 };

  return {
    perHand,
    palmCenter: {
      Left: left?.palmCenter ?? null,
      Right: right?.palmCenter ?? null,
    },
    pinchDistance: {
      Left: left?.pinchDistance ?? null,
      Right: right?.pinchDistance ?? null,
    },
    handSpread:
      left && right ? distance2D(left.palmCenter, right.palmCenter) : 0,
    isGrabbing: Boolean(pinchingHand),
    grabPosition: pinchingHand?.pinchPosition ?? null,
    isBothFistsClosed: perHand.length >= 2 && perHand.every((hand) => hand.isFist),
    wristRotationDelta: perHand.reduce(
      (sum, hand) => sum + hand.wristRotationDelta,
      0
    ),
    flickVelocity: dominantVelocity,
    isClapDetected,
    isIndexPointing: Boolean(pointingHand),
    pointingHandedness: pointingHand?.handedness ?? null,
    pointHoldFrames: pointingHand
      ? frameStateRef.current[pointingHand.handedness].pointHoldFrames
      : 0,
    pointingTip: pointingHand?.landmarks[8] ?? null,
    faceResults,
    handResults: multiHandLandmarks,
    frameCount,
  };
};

const initializeTasksVision = async () => {
  const vision = await FilesetResolver.forVisionTasks(TASKS_VISION_WASM_ROOT);

  const [handLandmarker, faceLandmarker] = await Promise.all([
    HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: HAND_LANDMARKER_MODEL_URL,
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.65,
      minTrackingConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
    }),
    FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: FACE_LANDMARKER_MODEL_URL,
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.6,
      minTrackingConfidence: 0.55,
      minFacePresenceConfidence: 0.55,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    }),
  ]);

  return { handLandmarker, faceLandmarker };
};

export function useMediapipe({
  videoElement,
  onResults,
  onReady,
  onError,
}: UseMediapipeOptions) {
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const onResultsRef = useRef(onResults);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const frameStateRef = useRef<TrackingStateStore>({
    Left: createHandState(),
    Right: createHandState(),
  });
  const smoothedLandmarksRef = useRef<SmoothedLandmarkStore>({
    face: null,
    hands: {
      Left: null,
      Right: null,
    },
  });

  useEffect(() => {
    onResultsRef.current = onResults;
  }, [onResults]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!videoElement) {
      return;
    }

    let disposed = false;
    let lastProcessedTime = -1;

    const processFrame = () => {
      if (disposed) {
        return;
      }

      if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const currentTime = videoElement.currentTime;

        if (currentTime !== lastProcessedTime) {
          lastProcessedTime = currentTime;
          const timestamp = performance.now();

          const handResult: HandLandmarkerResult | undefined =
            handLandmarkerRef.current?.detectForVideo(videoElement, timestamp);
          const faceResult: FaceLandmarkerResult | undefined =
            faceLandmarkerRef.current?.detectForVideo(videoElement, timestamp);

          const rawHandResults = (handResult?.landmarks ?? []).map(mapLandmarks);
          const handednesses: Handedness[] = (handResult?.handednesses ?? []).map(
            (handedness) =>
              handedness?.[0]?.categoryName === "Left" ? "Left" : "Right"
          );
          const handResults = rawHandResults.map((landmarks, index) => {
            const handedness = handednesses[index] ?? "Right";
            const smoothed = smoothLandmarkList(
              smoothedLandmarksRef.current.hands[handedness],
              landmarks,
              HAND_LANDMARK_SMOOTHING
            );
            smoothedLandmarksRef.current.hands[handedness] = smoothed;
            return smoothed;
          });
          const faceLandmarks = faceResult?.faceLandmarks?.[0]
            ? smoothLandmarkList(
                smoothedLandmarksRef.current.face,
                mapLandmarks(faceResult.faceLandmarks[0]),
                FACE_LANDMARK_SMOOTHING
              )
            : null;
          smoothedLandmarksRef.current.face = faceLandmarks;

          const activeHands = new Set(handednesses);
          if (!activeHands.has("Left")) {
            smoothedLandmarksRef.current.hands.Left = null;
          }
          if (!activeHands.has("Right")) {
            smoothedLandmarksRef.current.hands.Right = null;
          }

          frameCountRef.current += 1;

          onResultsRef.current({
            derivedGestures: computeDerivedGestures(
              handResults,
              handednesses,
              faceLandmarks,
              frameStateRef,
              frameCountRef.current
            ),
          });
        }
      }

      animationFrameRef.current = window.requestAnimationFrame(processFrame);
    };

    const initialize = async () => {
      try {
        const { handLandmarker, faceLandmarker } = await initializeTasksVision();

        if (disposed) {
          handLandmarker.close();
          faceLandmarker.close();
          return;
        }

        handLandmarkerRef.current = handLandmarker;
        faceLandmarkerRef.current = faceLandmarker;
        onReadyRef.current();
        processFrame();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to initialize MediaPipe tracking.";
        onErrorRef.current?.(message);
      }
    };

    void initialize();

    return () => {
      disposed = true;

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }

      handLandmarkerRef.current?.close();
      faceLandmarkerRef.current?.close();
      handLandmarkerRef.current = null;
      faceLandmarkerRef.current = null;
      frameCountRef.current = 0;
      frameStateRef.current = {
        Left: createHandState(),
        Right: createHandState(),
      };
      smoothedLandmarksRef.current = {
        face: null,
        hands: {
          Left: null,
          Right: null,
        },
      };
    };
  }, [videoElement]);
}
