"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SphereScene from "@/components/SphereScene";
import { useMediapipe } from "@/hooks/useMediapipe";
import { startDrawingLoop } from "@/utils/canvasDrawing";
import {
  DEFAULT_GESTURE_MAPPER_STATE,
  mapGesturesToTransform,
} from "@/utils/gestureMapper";
import type {
  DerivedGestures,
  GestureInput,
  GestureMapperState,
  SceneOverlayState,
  TrackingResults,
} from "@/types";

const EMPTY_GESTURES: DerivedGestures = {
  perHand: [],
  palmCenter: { Left: null, Right: null },
  pinchDistance: { Left: null, Right: null },
  handSpread: 0,
  isGrabbing: false,
  grabPosition: null,
  isBothFistsClosed: false,
  wristRotationDelta: 0,
  flickVelocity: { x: 0, y: 0, magnitude: 0 },
  isClapDetected: false,
  isIndexPointing: false,
  pointingHandedness: null,
  pointHoldFrames: 0,
  pointingTip: null,
  faceResults: null,
  handResults: [],
  frameCount: 0,
};

const EMPTY_GESTURE_INPUT: GestureInput = {
  raw: EMPTY_GESTURES,
  transform: {
    rotationDelta: { x: 0, y: 0 },
    scaleDelta: 1,
    shouldScale: false,
    grabPosition: null,
    isPaused: false,
    shouldSpawnSphere: false,
    shouldShatter: false,
    colorShiftDelta: 0,
    shouldPulse: false,
    flickVector: null,
    isPointing: false,
  },
};

const EMPTY_OVERLAY_STATE: SceneOverlayState = {
  spheres: [],
  currentColor: "#00FFFF",
  nextColor: "#BF00FF",
  grabBeam: null,
  shatterCharge: null,
  clapBursts: [],
  hudEvents: [],
};

const describeError = (message: string) => {
  const normalized = message.toLowerCase();
  const isPermissionIssue =
    normalized.includes("permission") ||
    normalized.includes("denied") ||
    normalized.includes("notallowederror");

  if (isPermissionIssue) {
    return {
      title: "Camera Access Required",
      steps: [
        "Allow camera access in your browser permissions.",
        "Reload the page after granting access.",
        "If it still fails, close apps that may already be using the webcam.",
      ],
    };
  }

  return {
    title: "Tracking Initialization Failed",
    steps: [
      "Check your internet connection so the MediaPipe models can load.",
      "Reload the page to retry initialization.",
      "Open the console if the failure persists.",
    ],
  };
};

export default function TrackingView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestFrameRef = useRef<TrackingResults | null>(null);
  const latestGestureInputRef = useRef<GestureInput>(EMPTY_GESTURE_INPUT);
  const overlayStateRef = useRef<SceneOverlayState>(EMPTY_OVERLAY_STATE);
  const mapperStateRef = useRef<GestureMapperState>(
    DEFAULT_GESTURE_MAPPER_STATE
  );
  const lastReactSyncRef = useRef(0);

  const [trackingActive, setTrackingActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [gestureInput, setGestureInput] = useState<GestureInput>(EMPTY_GESTURE_INPUT);
  const [overlayState, setOverlayState] = useState<SceneOverlayState>(EMPTY_OVERLAY_STATE);
  const [fps, setFps] = useState(0);

  const syncReactState = useCallback(() => {
    const now = performance.now();
    if (now - lastReactSyncRef.current < 80) {
      return;
    }

    setGestureInput(latestGestureInputRef.current);
    setOverlayState({ ...overlayStateRef.current, hudEvents: [...overlayStateRef.current.hudEvents] });
    lastReactSyncRef.current = now;
  }, []);

  const handleOverlayChange = useCallback((nextOverlayState: SceneOverlayState) => {
    overlayStateRef.current = nextOverlayState;
    syncReactState();
  }, [syncReactState]);

  const handleResults = useCallback((results: TrackingResults) => {
    latestFrameRef.current = results;
    const mapped = mapGesturesToTransform(
      results.derivedGestures,
      mapperStateRef.current
    );
    mapperStateRef.current = mapped.nextState;
    latestGestureInputRef.current = {
      raw: results.derivedGestures,
      transform: mapped.transform,
    };
    if (
      mapped.transform.flickVector ||
      mapped.transform.colorShiftDelta !== 0 ||
      mapped.transform.shouldPulse ||
      mapped.transform.shouldSpawnSphere ||
      mapped.transform.shouldShatter
    ) {
      setGestureInput(latestGestureInputRef.current);
      lastReactSyncRef.current = performance.now();
    } else {
      syncReactState();
    }
  }, [syncReactState]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    let mounted = true;

    const requestCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
          void videoElement.play();
          setVideoElement(videoElement);
        };
      } catch (cameraError) {
        const message =
          cameraError instanceof Error
            ? cameraError.message
            : "Camera access denied.";
        setError(message);
        setIsLoading(false);
      }
    };

    void requestCamera();

    return () => {
      mounted = false;
      const stream = videoElement.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useMediapipe({
    videoElement,
    onResults: handleResults,
    onReady: () => {
      setTrackingActive(true);
      setIsLoading(false);
    },
    onError: (message) => {
      setError(message);
      setIsLoading(false);
    },
  });

  useEffect(() => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;

    if (!videoElement || !canvasElement) {
      return;
    }

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const resizeCanvas = () => {
      const width = videoElement.videoWidth || window.innerWidth;
      const height = videoElement.videoHeight || window.innerHeight;
      canvasElement.width = width;
      canvasElement.height = height;
    };

    const observer = new ResizeObserver(() => {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }

      resizeTimer = setTimeout(resizeCanvas, 100);
    });

    observer.observe(videoElement);
    resizeCanvas();

    return () => {
      observer.disconnect();
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
    };
  }, [videoElement]);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    const videoElement = videoRef.current;

    if (!canvasElement || !videoElement) {
      return;
    }

    return startDrawingLoop({
      canvas: canvasElement,
      video: videoElement,
      getFrame: () => latestFrameRef.current,
      getOverlayState: () => overlayStateRef.current,
      onFps: (nextFps) => {
        setFps(nextFps);
        syncReactState();
      },
    });
  }, [syncReactState]);

  const errorUi = error ? describeError(error) : null;
  const fpsColor = fps > 25 ? "#39FF14" : fps > 15 ? "#FFD700" : "#FF4040";

  return (
    <div className={`tracking-root ${trackingActive ? "tracking-ready" : ""}`}>
      <video
        ref={videoRef}
        className="hidden-video"
        autoPlay
        muted
        playsInline
      />

      <canvas ref={canvasRef} className="tracking-canvas" />

      <SphereScene
        gestureInput={gestureInput}
        trackingActive={trackingActive}
        onOverlayChange={handleOverlayChange}
      />

      <div className="scanline-overlay" />

      <div className="hud-status">
        <span className={`status-dot ${trackingActive ? "active" : ""}`} />
        <span className="status-text">
          {trackingActive ? "TRACKING ACTIVE" : "INITIALIZING"}
        </span>
      </div>

      <div className="hud-fps">
        <span style={{ color: fpsColor }}>{fps} FPS</span>
      </div>

      {trackingActive ? (
        <div className="hud-hands">
          <span className="hands-label">
            HANDS: {gestureInput.raw.perHand.length}
          </span>
          {overlayState.hudEvents.map((event) => (
            <span key={event.label} className="gesture-badge">
              ● {event.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="hud-color">
        <span>COLOR</span>
        <span
          className="swatch"
          style={{ backgroundColor: overlayState.currentColor }}
        />
        <span
          className="swatch"
          style={{ backgroundColor: overlayState.nextColor }}
        />
      </div>

      {isLoading ? (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <p className="loading-text">Initializing tracking models...</p>
          <p className="loading-subtext">
            Loading face mesh, hand tracking, and AR scene
          </p>
        </div>
      ) : null}

      {errorUi ? (
        <div className="error-overlay">
          <div className="error-card">
            <div className="error-icon">⚠</div>
            <h2 className="error-title">{errorUi.title}</h2>
            <p className="error-message">{error}</p>
            <div className="error-steps">
              <p>Try this:</p>
              <ol>
                {errorUi.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <button
              className="error-retry"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
