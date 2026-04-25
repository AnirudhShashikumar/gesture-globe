import type {
  Handedness,
  Point2D,
  SceneOverlayState,
  TrackingResults,
} from "@/types";
import {
  createTrailBuffers,
  drawAuraTrails,
  drawHeatmap,
  drawSkeletonLabels,
  pushTrailPoint,
} from "@/utils/arOverlays";

const NEON_GREEN = "#39FF14";
const NEON_CYAN = "#00FFFF";
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
];

type LabelAlphaMap = Record<string, number>;

interface DrawingLoopOptions {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  getFrame: () => TrackingResults | null;
  getOverlayState: () => SceneOverlayState | null;
  onFps: (fps: number) => void;
}

const toCanvasPoint = (point: Point2D, width: number, height: number): Point2D => ({
  x: point.x * width,
  y: point.y * height,
});

const drawHandSkeleton = (
  ctx: CanvasRenderingContext2D,
  frame: TrackingResults,
  width: number,
  height: number
) => {
  ctx.save();
  ctx.strokeStyle = NEON_GREEN;
  ctx.fillStyle = NEON_GREEN;
  ctx.shadowBlur = 6;
  ctx.shadowColor = NEON_GREEN;
  ctx.lineWidth = 1.5;

  for (const hand of frame.derivedGestures.handResults) {
    for (const [fromIndex, toIndex] of HAND_CONNECTIONS) {
      const start = toCanvasPoint(hand[fromIndex], width, height);
      const end = toCanvasPoint(hand[toIndex], width, height);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    for (const point of hand) {
      const position = toCanvasPoint(point, width, height);
      ctx.beginPath();
      ctx.arc(position.x, position.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
};

const drawPinchIndicators = (
  ctx: CanvasRenderingContext2D,
  frame: TrackingResults,
  width: number,
  height: number
) => {
  ctx.save();

  for (const hand of frame.derivedGestures.perHand) {
    if (!hand.isPinching) {
      continue;
    }

    const position = toCanvasPoint(hand.pinchPosition, width, height);
    const glowRadius = 10 + (1 - hand.pinchDistance / 0.05) * 8;

    ctx.strokeStyle = "rgba(0,255,255,0.95)";
    ctx.shadowBlur = 10;
    ctx.shadowColor = NEON_CYAN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(position.x, position.y, glowRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
};

const drawGrabBeam = (
  ctx: CanvasRenderingContext2D,
  overlayState: SceneOverlayState,
  width: number,
  height: number
) => {
  if (!overlayState.grabBeam) {
    return;
  }

  const from = toCanvasPoint(overlayState.grabBeam.from, width, height);
  const to = toCanvasPoint(overlayState.grabBeam.to, width, height);

  ctx.save();
  ctx.strokeStyle = "rgba(0,255,255,0.9)";
  ctx.lineWidth = 2.2;
  ctx.shadowBlur = 12;
  ctx.shadowColor = NEON_CYAN;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
};

const drawShatterCharge = (
  ctx: CanvasRenderingContext2D,
  overlayState: SceneOverlayState,
  width: number,
  height: number
) => {
  if (!overlayState.shatterCharge) {
    return;
  }

  const point = toCanvasPoint(overlayState.shatterCharge.position, width, height);

  ctx.save();
  ctx.strokeStyle = "rgba(0,255,255,0.95)";
  ctx.lineWidth = 2;
  ctx.shadowBlur = 14;
  ctx.shadowColor = NEON_CYAN;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 16 + overlayState.shatterCharge.progress * 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

const drawClapBursts = (
  ctx: CanvasRenderingContext2D,
  overlayState: SceneOverlayState,
  width: number,
  height: number
) => {
  ctx.save();

  for (const burst of overlayState.clapBursts) {
    const center = toCanvasPoint(burst, width, height);
    const gradient = ctx.createRadialGradient(center.x, center.y, 2, center.x, center.y, 42);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 42, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};

const updateLabelAlphaMap = (
  labelAlphaMap: LabelAlphaMap,
  hands: TrackingResults["derivedGestures"]["perHand"]
) => {
  const activeKeys = new Set<string>();

  for (const hand of hands) {
    for (const fingerIndex of [4, 8, 12, 16, 20]) {
      const key = `${hand.handedness}-${fingerIndex}`;
      labelAlphaMap[key] = Math.min(1, (labelAlphaMap[key] ?? 0) + 0.12);
      activeKeys.add(key);
    }
  }

  for (const key of Object.keys(labelAlphaMap)) {
    if (!activeKeys.has(key)) {
      labelAlphaMap[key] = Math.max(0, labelAlphaMap[key] - 0.08);
    }
  }
};

const pushTrailFrame = (
  frame: TrackingResults | null,
  trailBuffers: Record<Handedness, ReturnType<typeof createTrailBuffers>[Handedness]>
) => {
  const perHand = frame?.derivedGestures.perHand ?? [];
  const left = perHand.find((hand) => hand.handedness === "Left") ?? null;
  const right = perHand.find((hand) => hand.handedness === "Right") ?? null;

  pushTrailPoint(trailBuffers.Left, left?.palmCenter ?? null);
  pushTrailPoint(trailBuffers.Right, right?.palmCenter ?? null);
};

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  frame: TrackingResults | null,
  overlayState: SceneOverlayState | null,
  trailBuffers: Record<Handedness, ReturnType<typeof createTrailBuffers>[Handedness]>,
  labelAlphaMap: LabelAlphaMap
) {
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  if (frame) {
    drawHeatmap(
      ctx,
      frame.derivedGestures.perHand.map((hand) => ({
        center: hand.palmCenter,
        speed: hand.velocity.magnitude,
      })),
      width,
      height,
      frame.derivedGestures.frameCount
    );
  }

  ctx.drawImage(video, 0, 0, width, height);

  if (!frame || !overlayState) {
    return;
  }

  drawHandSkeleton(ctx, frame, width, height);
  drawPinchIndicators(ctx, frame, width, height);
  drawAuraTrails(ctx, trailBuffers, width, height);
  drawGrabBeam(ctx, overlayState, width, height);
  drawShatterCharge(ctx, overlayState, width, height);
  drawClapBursts(ctx, overlayState, width, height);
  drawSkeletonLabels(
    ctx,
    frame.derivedGestures.perHand.map((hand) => ({
      landmarks: hand.landmarks,
      handedness: hand.handedness,
    })),
    width,
    height,
    labelAlphaMap
  );
}

export function startDrawingLoop({
  canvas,
  video,
  getFrame,
  getOverlayState,
  onFps,
}: DrawingLoopOptions) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return () => {};
  }

  const trailBuffers = createTrailBuffers();
  const labelAlphaMap: LabelAlphaMap = {};

  let animationFrameId = 0;
  let fpsFrames = 0;
  let fpsWindowStart = performance.now();

  const tick = () => {
    animationFrameId = window.requestAnimationFrame(tick);

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    const frame = getFrame();
    pushTrailFrame(frame, trailBuffers);

    if (frame) {
      updateLabelAlphaMap(labelAlphaMap, frame.derivedGestures.perHand);
    }

    drawFrame(
      ctx,
      video,
      canvas,
      frame,
      getOverlayState(),
      trailBuffers,
      labelAlphaMap
    );

    fpsFrames += 1;
    const now = performance.now();
    if (now - fpsWindowStart >= 1000) {
      onFps(Math.round((fpsFrames * 1000) / (now - fpsWindowStart)));
      fpsFrames = 0;
      fpsWindowStart = now;
    }
  };

  tick();

  return () => {
    window.cancelAnimationFrame(animationFrameId);
  };
}
