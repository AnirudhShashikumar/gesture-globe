import type { Handedness, Point2D, Point3D } from "@/types";

const NEON_CYAN = "#00FFFF";
const NEON_GREEN = "#39FF14";
const HOT_PINK = "#FF00FF";
const VISOR_FILL = "rgba(0, 255, 255, 0.08)";
const MAGENTA_ACCENT = "#8A2BE2";

const LEFT_EYE_OUTLINE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_OUTLINE = [362, 385, 387, 263, 373, 380];
const LOWER_FACE_GRID_ROWS = [
  [117, 118, 101, 205, 50],
  [346, 347, 330, 425, 280],
];
const TEMPLE_TRIANGLES: Array<[number, number, number]> = [
  [70, 63, 105],
  [300, 293, 334],
];
const FINGERTIP_LABELS: Array<{ index: number; text: string }> = [
  { index: 4, text: "THUMB" },
  { index: 8, text: "INDEX" },
  { index: 12, text: "MIDDLE" },
  { index: 16, text: "RING" },
  { index: 20, text: "PINKY" },
];

export interface TrailBuffer {
  points: Array<Point2D | null>;
  cursor: number;
  active: boolean;
}

export interface HandHeatmapInput {
  center: Point2D;
  speed: number;
}

type LabelAlphaMap = Record<string, number>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const toCanvasPoint = (point: Point2D, width: number, height: number): Point2D => ({
  x: point.x * width,
  y: point.y * height,
});

const rgbaFromHex = (hex: string, alpha: number) => {
  const cleaned = hex.replace("#", "");
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const drawPath = (
  ctx: CanvasRenderingContext2D,
  points: Point2D[],
  width: number,
  height: number,
  closePath = false
) => {
  if (!points.length) {
    return;
  }

  const first = toCanvasPoint(points[0], width, height);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);

  for (let index = 1; index < points.length; index += 1) {
    const point = toCanvasPoint(points[index], width, height);
    ctx.lineTo(point.x, point.y);
  }

  if (closePath) {
    ctx.closePath();
  }
};

export function createTrailBuffers(): Record<Handedness, TrailBuffer> {
  return {
    Left: { points: new Array(12).fill(null), cursor: 0, active: false },
    Right: { points: new Array(12).fill(null), cursor: 0, active: false },
  };
}

export function pushTrailPoint(
  buffer: TrailBuffer,
  point: Point2D | null
) {
  buffer.points[buffer.cursor] = point;
  buffer.cursor = (buffer.cursor + 1) % buffer.points.length;
  buffer.active = buffer.points.some(Boolean);
}

export function drawFaceMask(
  ctx: CanvasRenderingContext2D,
  faceLandmarks: Point3D[] | null,
  width: number,
  height: number,
  frameCount: number
) {
  if (!faceLandmarks) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = NEON_CYAN;
  ctx.fillStyle = NEON_CYAN;
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 12;
  ctx.shadowColor = NEON_CYAN;

  // Face mask landmark mapping:
  // 33/133 and 362/263 anchor the visor to the eye corners so the cyber-visor
  // stays locked to the upper face even during quick head movement.
  const visorFrame = [
    faceLandmarks[33],
    faceLandmarks[246],
    faceLandmarks[130],
    faceLandmarks[133],
    faceLandmarks[173],
    faceLandmarks[398],
    faceLandmarks[362],
    faceLandmarks[359],
    faceLandmarks[263],
    faceLandmarks[466],
  ];
  drawPath(ctx, visorFrame, width, height, true);
  ctx.fillStyle = VISOR_FILL;
  ctx.fill();
  ctx.stroke();

  ctx.lineWidth = 2.2;
  drawPath(
    ctx,
    LEFT_EYE_OUTLINE.map((index) => faceLandmarks[index]),
    width,
    height,
    true
  );
  ctx.stroke();

  drawPath(
    ctx,
    RIGHT_EYE_OUTLINE.map((index) => faceLandmarks[index]),
    width,
    height,
    true
  );
  ctx.stroke();

  ctx.lineWidth = 1.2;
  const noseTop = toCanvasPoint(faceLandmarks[168], width, height);
  const noseBottom = toCanvasPoint(faceLandmarks[6], width, height);
  ctx.beginPath();
  ctx.moveTo(noseTop.x, noseTop.y);
  ctx.lineTo(noseBottom.x, noseBottom.y);
  ctx.stroke();

  const browBridge = [
    faceLandmarks[70],
    faceLandmarks[63],
    faceLandmarks[105],
    faceLandmarks[66],
    faceLandmarks[107],
    faceLandmarks[336],
    faceLandmarks[296],
    faceLandmarks[334],
    faceLandmarks[293],
    faceLandmarks[300],
  ];
  ctx.strokeStyle = rgbaFromHex(MAGENTA_ACCENT, 0.35);
  drawPath(ctx, browBridge, width, height, false);
  ctx.stroke();

  ctx.strokeStyle = rgbaFromHex(NEON_CYAN, 0.45);
  for (const row of LOWER_FACE_GRID_ROWS) {
    drawPath(
      ctx,
      row.map((index) => faceLandmarks[index]),
      width,
      height
    );
    ctx.stroke();
  }

  const crossPairs: Array<[number, number]> = [
    [205, 425],
    [50, 280],
    [117, 346],
  ];
  for (const [leftIndex, rightIndex] of crossPairs) {
    const start = toCanvasPoint(faceLandmarks[leftIndex], width, height);
    const end = toCanvasPoint(faceLandmarks[rightIndex], width, height);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  ctx.strokeStyle = NEON_CYAN;
  for (const triangle of TEMPLE_TRIANGLES) {
    drawPath(
      ctx,
      triangle.map((index) => faceLandmarks[index]),
      width,
      height,
      true
    );
    ctx.stroke();
  }

  const leftTemple = toCanvasPoint(faceLandmarks[70], width, height);
  const rightTemple = toCanvasPoint(faceLandmarks[300], width, height);
  const templeAccents = [leftTemple, rightTemple];
  ctx.fillStyle = rgbaFromHex(MAGENTA_ACCENT, 0.6);
  for (const temple of templeAccents) {
    ctx.beginPath();
    ctx.moveTo(temple.x, temple.y);
    ctx.lineTo(temple.x - 8, temple.y - 16);
    ctx.lineTo(temple.x + 8, temple.y - 16);
    ctx.closePath();
    ctx.fill();
  }

  const maskBounds = [faceLandmarks[33], faceLandmarks[263], faceLandmarks[10], faceLandmarks[152]]
    .map((point) => toCanvasPoint(point, width, height));
  const minX = Math.min(...maskBounds.map((point) => point.x));
  const maxX = Math.max(...maskBounds.map((point) => point.x));
  const minY = Math.min(...maskBounds.map((point) => point.y));
  const maxY = Math.max(...maskBounds.map((point) => point.y));

  ctx.save();
  ctx.beginPath();
  ctx.rect(minX, minY, maxX - minX, maxY - minY);
  ctx.clip();

  const scanOffset = (frameCount * 2) % 14;
  for (let y = minY + scanOffset; y < maxY; y += 8) {
    ctx.strokeStyle = rgbaFromHex(NEON_CYAN, 0.3);
    ctx.beginPath();
    ctx.moveTo(minX, y);
    ctx.lineTo(maxX, y);
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

const getTrailColor = (speed: number) => {
  if (speed > 0.04) {
    return HOT_PINK;
  }

  if (speed > 0.01) {
    return NEON_CYAN;
  }

  return NEON_GREEN;
};

export function drawAuraTrails(
  ctx: CanvasRenderingContext2D,
  trailBuffers: Record<Handedness, TrailBuffer>,
  width: number,
  height: number
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const buffer of Object.values(trailBuffers)) {
    if (!buffer.active) {
      continue;
    }

    const orderedPoints = [
      ...buffer.points.slice(buffer.cursor),
      ...buffer.points.slice(0, buffer.cursor),
    ];

    for (let index = 1; index < orderedPoints.length; index += 1) {
      const previous = orderedPoints[index - 1];
      const current = orderedPoints[index];

      if (!previous || !current) {
        continue;
      }

      const ageProgress = index / (orderedPoints.length - 1);
      const alpha = ageProgress;
      const lineWidth = lerp(0.5, 6, ageProgress);
      const speed = Math.hypot(current.x - previous.x, current.y - previous.y);
      const start = toCanvasPoint(previous, width, height);
      const end = toCanvasPoint(current, width, height);

      ctx.strokeStyle = rgbaFromHex(getTrailColor(speed), alpha);
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

type GradientStop = {
  speed: number;
  rgb: [number, number, number];
  alpha: number;
};

const HEATMAP_STOPS: GradientStop[] = [
  { speed: 0, rgb: [0, 0, 255], alpha: 0.15 },
  { speed: 0.01, rgb: [0, 255, 255], alpha: 0.25 },
  { speed: 0.02, rgb: [57, 255, 20], alpha: 0.3 },
  { speed: 0.04, rgb: [255, 102, 0], alpha: 0.35 },
  { speed: 0.06, rgb: [255, 0, 0], alpha: 0.4 },
];

const interpolateHeatmapColor = (speed: number) => {
  const clampedSpeed = Math.max(0, Math.min(speed, HEATMAP_STOPS.at(-1)?.speed ?? 0.06));

  for (let index = 0; index < HEATMAP_STOPS.length - 1; index += 1) {
    const from = HEATMAP_STOPS[index];
    const to = HEATMAP_STOPS[index + 1];

    if (clampedSpeed >= from.speed && clampedSpeed <= to.speed) {
      const progress = (clampedSpeed - from.speed) / (to.speed - from.speed);

      // Heatmap gradient interpolation blends each RGB channel and alpha
      // independently so the palm glow transitions smoothly instead of jumping
      // between the speed buckets.
      return {
        r: Math.round(lerp(from.rgb[0], to.rgb[0], progress)),
        g: Math.round(lerp(from.rgb[1], to.rgb[1], progress)),
        b: Math.round(lerp(from.rgb[2], to.rgb[2], progress)),
        alpha: lerp(from.alpha, to.alpha, progress),
      };
    }
  }

  const last = HEATMAP_STOPS[HEATMAP_STOPS.length - 1];
  return { r: last.rgb[0], g: last.rgb[1], b: last.rgb[2], alpha: last.alpha };
};

export function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  palms: HandHeatmapInput[],
  width: number,
  height: number,
  frameCount: number
) {
  ctx.save();

  for (const palm of palms) {
    const center = toCanvasPoint(palm.center, width, height);
    const { r, g, b, alpha } = interpolateHeatmapColor(palm.speed);
    const pulse = Math.sin(frameCount * 0.18) * 5;
    const radius = 80 + pulse;
    const gradient = ctx.createRadialGradient(
      center.x,
      center.y,
      4,
      center.x,
      center.y,
      radius
    );

    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawSkeletonLabels(
  ctx: CanvasRenderingContext2D,
  hands: Array<{ landmarks: Point3D[]; handedness: Handedness }>,
  width: number,
  height: number,
  labelAlphaMap: LabelAlphaMap
) {
  ctx.save();
  ctx.font = "11px monospace";
  ctx.textBaseline = "middle";

  for (const hand of hands) {
    for (const label of FINGERTIP_LABELS) {
      const key = `${hand.handedness}-${label.index}`;
      const alpha = labelAlphaMap[key] ?? 0;

      if (alpha <= 0.01) {
        continue;
      }

      const point = toCanvasPoint(hand.landmarks[label.index], width, height);
      const isThumb = label.index === 4;
      const labelPosition = {
        x: point.x + (isThumb ? 20 : 0),
        y: point.y - (isThumb ? 4 : 20),
      };

      ctx.strokeStyle = rgbaFromHex(NEON_GREEN, alpha);
      ctx.fillStyle = rgbaFromHex(NEON_GREEN, alpha);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(labelPosition.x, labelPosition.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(label.text, labelPosition.x + 3, labelPosition.y - 2);
    }
  }

  ctx.restore();
}
