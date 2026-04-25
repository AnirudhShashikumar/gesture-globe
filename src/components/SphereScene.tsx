"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  MAX_SPHERE_SCALE,
  MIN_SPHERE_SCALE,
  POINT_HOLD_FRAMES,
} from "@/utils/gestureMapper";
import type {
  GestureInput,
  HudEvent,
  Point2D,
  SceneOverlayState,
} from "@/types";

const CAMERA_Z = 5.8;
const SPAWN_ANIMATION_MS = 400;
const COLOR_TRANSITION_MS = 800;
const SHOCKWAVE_DURATION_MS = 600;
const SHATTER_FADE_MS = 1200;
const SHATTER_REFORM_DELAY_MS = 1500;
const SHATTER_END_MS = 2700;
const SHATTER_PARTICLE_COUNT = 224;
const THROW_DAMPING = 0.975;
const THROW_SCALE = 0.8;
const SCALE_LERP_FACTOR = 0.06;
const POSITION_LERP_FACTOR = 0.1;
const VELOCITY_LERP = 0.22;
const MOTION_GHOST_OPACITY = [0.4, 0.3, 0.2, 0.1, 0.05] as const;
const PALETTE = ["#00FFFF", "#BF00FF", "#FF0040", "#FFD700"] as const;

type ShockwaveState = {
  mesh: THREE.Mesh;
  startTime: number;
};

type SphereState = {
  group: THREE.Group;
  core: THREE.Mesh;
  wire: THREE.LineSegments;
  points: THREE.Points;
  aura: THREE.Mesh;
  motionGhosts: THREE.Group[];
  visible: boolean;
  targetVisible: boolean;
  animationStart: number;
  baseScale: number;
  targetScale: number;
  velocity: THREE.Vector2;
  grabbed: boolean;
  ghostTrail: THREE.Vector3[];
  shatterActive: boolean;
  shatterStartTime: number;
  shatterPositions: Float32Array;
  shatterVelocities: Float32Array;
  shatterHome: Float32Array;
  shatterGeometry: THREE.BufferGeometry;
  shatterPoints: THREE.Points;
  shockwaves: ShockwaveState[];
};

interface SphereSceneProps {
  gestureInput: GestureInput;
  trackingActive: boolean;
  onOverlayChange: (overlayState: SceneOverlayState) => void;
}

const easeOutCubic = (progress: number) => 1 - Math.pow(1 - progress, 3);
const easeInCubic = (progress: number) => progress * progress * progress;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const projectToScreen = (
  position: THREE.Vector3,
  camera: THREE.PerspectiveCamera
): Point2D => {
  const projected = position.clone().project(camera);
  return {
    x: (projected.x + 1) / 2,
    y: (1 - projected.y) / 2,
  };
};

const getProjectedRadiusPx = (
  position: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  scale: number
) => {
  const viewportHeight = renderer.domElement.height / renderer.getPixelRatio();
  const distance = camera.position.distanceTo(position);
  const projected =
    (scale / Math.max(distance, 0.0001)) /
    Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  return projected * viewportHeight * 0.5;
};

const setSphereColor = (sphere: SphereState, color: THREE.Color) => {
  (sphere.core.material as THREE.MeshPhongMaterial).emissive.copy(color);
  (sphere.core.material as THREE.MeshPhongMaterial).color.copy(color);
  (sphere.wire.material as THREE.LineBasicMaterial).color.copy(color);
  (sphere.points.material as THREE.PointsMaterial).color.copy(color);
  (sphere.aura.material as THREE.MeshBasicMaterial).color.copy(color);
  (sphere.shatterPoints.material as THREE.PointsMaterial).color.copy(color);

  for (const ghost of sphere.motionGhosts) {
    ghost.traverse((child) => {
      const material = child instanceof THREE.LineSegments
        ? child.material
        : child instanceof THREE.Points
          ? child.material
          : null;
      if (material instanceof THREE.Material && "color" in material) {
        (material.color as THREE.Color).copy(color);
      }
    });
  }
};

const createMotionGhost = (
  wireGeometry: THREE.WireframeGeometry,
  pointsGeometry: THREE.IcosahedronGeometry,
  color: THREE.Color,
  opacity: number
) => {
  const ghost = new THREE.Group();
  ghost.visible = false;

  ghost.add(
    new THREE.LineSegments(
      wireGeometry,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
      })
    )
  );

  ghost.add(
    new THREE.Points(
      pointsGeometry,
      new THREE.PointsMaterial({
        color,
        size: 0.04,
        transparent: true,
        opacity: opacity * 0.9,
        blending: THREE.AdditiveBlending,
      })
    )
  );

  return ghost;
};

const createSphere = (scene: THREE.Scene, color: THREE.Color): SphereState => {
  const group = new THREE.Group();
  scene.add(group);

  const baseGeometry = new THREE.IcosahedronGeometry(1, 4);
  const wireGeometry = new THREE.WireframeGeometry(baseGeometry);
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 3),
    new THREE.MeshPhongMaterial({
      color,
      transparent: true,
      opacity: 0.07,
      emissive: color,
      emissiveIntensity: 1.4,
      shininess: 100,
    })
  );
  const wire = new THREE.LineSegments(
    wireGeometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
    })
  );
  const points = new THREE.Points(
    baseGeometry,
    new THREE.PointsMaterial({
      color,
      size: 0.042,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    })
  );
  const aura = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.18, 3),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    })
  );

  group.add(core, wire, points, aura);

  const motionGhosts = MOTION_GHOST_OPACITY.map((opacity) => {
    const ghost = createMotionGhost(wireGeometry, baseGeometry, color, opacity);
    scene.add(ghost);
    return ghost;
  });

  const shatterPositions = new Float32Array(SHATTER_PARTICLE_COUNT * 3);
  const shatterVelocities = new Float32Array(SHATTER_PARTICLE_COUNT * 3);
  const shatterHome = new Float32Array(SHATTER_PARTICLE_COUNT * 3);

  for (let index = 0; index < SHATTER_PARTICLE_COUNT; index += 1) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = 1 + Math.random() * 0.18;
    const offset = index * 3;
    shatterPositions[offset] = radius * Math.sin(phi) * Math.cos(theta);
    shatterPositions[offset + 1] = radius * Math.cos(phi);
    shatterPositions[offset + 2] = radius * Math.sin(phi) * Math.sin(theta);
    shatterHome[offset] = shatterPositions[offset];
    shatterHome[offset + 1] = shatterPositions[offset + 1];
    shatterHome[offset + 2] = shatterPositions[offset + 2];
  }

  const shatterGeometry = new THREE.BufferGeometry();
  shatterGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(shatterPositions, 3)
  );
  const shatterPoints = new THREE.Points(
    shatterGeometry,
    new THREE.PointsMaterial({
      color,
      size: 0.05,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    })
  );

  group.add(shatterPoints);
  group.visible = false;

  return {
    group,
    core,
    wire,
    points,
    aura,
    motionGhosts,
    visible: false,
    targetVisible: false,
    animationStart: 0,
    baseScale: 1,
    targetScale: 1,
    velocity: new THREE.Vector2(),
    grabbed: false,
    ghostTrail: MOTION_GHOST_OPACITY.map(() => new THREE.Vector3()),
    shatterActive: false,
    shatterStartTime: -1,
    shatterPositions,
    shatterVelocities,
    shatterHome,
    shatterGeometry,
    shatterPoints,
    shockwaves: [],
  };
};

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    if ("geometry" in child && child.geometry instanceof THREE.BufferGeometry) {
      child.geometry.dispose();
    }
    if ("material" in child) {
      const material = child.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose());
      } else if (material instanceof THREE.Material) {
        material.dispose();
      }
    }
  });
};

export default function SphereScene({
  gestureInput,
  trackingActive,
  onOverlayChange,
}: SphereSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef(gestureInput);
  const trackingActiveRef = useRef(trackingActive);

  useEffect(() => {
    gestureRef.current = gestureInput;
  }, [gestureInput]);

  useEffect(() => {
    trackingActiveRef.current = trackingActive;
  }, [trackingActive]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.z = CAMERA_Z;

    scene.add(new THREE.AmbientLight(0x66ffff, 0.4));
    const keyLight = new THREE.PointLight(0x66ffff, 1.3, 30);
    keyLight.position.set(0, 4, 6);
    scene.add(keyLight);

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(1800 * 3);
    for (let index = 0; index < 1800; index += 1) {
      const offset = index * 3;
      starPositions[offset] = (Math.random() - 0.5) * 90;
      starPositions[offset + 1] = (Math.random() - 0.5) * 60;
      starPositions[offset + 2] = -20 - Math.random() * 38;
    }
    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(starPositions, 3)
    );
    scene.add(
      new THREE.Points(
        starGeometry,
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 0.12,
          transparent: true,
          opacity: 0.68,
        })
      )
    );

    const sphere = createSphere(scene, new THREE.Color(PALETTE[0]));
    let previousBothFists = false;
    let colorIndex = 0;
    let colorTransitionActive = false;
    let colorTransitionStart = 0;
    const colorFrom = new THREE.Color(PALETTE[0]);
    const colorTo = new THREE.Color(PALETTE[0]);
    let lastGrabbed = false;
    const hudEventMap = new Map<string, number>();

    const pushHudEvent = (label: string, now: number) => {
      hudEventMap.set(label, now + 1000);
    };

    const mapNormalizedToWorld = (point: Point2D) => {
      const distance = camera.position.z;
      const frustumHeight =
        2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
      const frustumWidth = frustumHeight * camera.aspect;
      return new THREE.Vector3(
        (0.5 - point.x) * frustumWidth,
        (0.5 - point.y) * frustumHeight,
        0
      );
    };

    const triggerShockwave = (now: number) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.03, 12, 72),
        new THREE.MeshBasicMaterial({
          color: PALETTE[colorIndex],
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
        })
      );
      ring.position.copy(sphere.group.position);
      ring.rotation.x = Math.PI / 2;
      ring.scale.setScalar(sphere.baseScale);
      scene.add(ring);
      sphere.shockwaves.push({ mesh: ring, startTime: now });
    };

    const startShatter = (now: number) => {
      sphere.shatterActive = true;
      sphere.shatterStartTime = now;
      sphere.velocity.set(0, 0);
      sphere.wire.visible = false;
      sphere.points.visible = false;
      sphere.core.visible = false;
      (sphere.shatterPoints.material as THREE.PointsMaterial).opacity = 1;

      for (let index = 0; index < SHATTER_PARTICLE_COUNT; index += 1) {
        const offset = index * 3;
        const vector = new THREE.Vector3(
          sphere.shatterHome[offset],
          sphere.shatterHome[offset + 1],
          sphere.shatterHome[offset + 2]
        )
          .normalize()
          .multiplyScalar(0.08 + Math.random() * 0.09);
        sphere.shatterVelocities[offset] = vector.x;
        sphere.shatterVelocities[offset + 1] = vector.y;
        sphere.shatterVelocities[offset + 2] = vector.z;
        sphere.shatterPositions[offset] = sphere.shatterHome[offset];
        sphere.shatterPositions[offset + 1] = sphere.shatterHome[offset + 1];
        sphere.shatterPositions[offset + 2] = sphere.shatterHome[offset + 2];
      }
    };

    const updateMotionGhosts = () => {
      sphere.ghostTrail.pop();
      sphere.ghostTrail.unshift(sphere.group.position.clone());
      sphere.motionGhosts.forEach((ghost, index) => {
        const position = sphere.ghostTrail[index];
        const visible = sphere.visible && sphere.velocity.lengthSq() > 0.0002;
        ghost.visible = visible;
        if (!visible) {
          return;
        }
        ghost.position.copy(position);
        ghost.scale.copy(sphere.group.scale);
        ghost.rotation.copy(sphere.group.rotation);
      });
    };

    const updateShockwaves = (now: number) => {
      sphere.shockwaves = sphere.shockwaves.filter((wave) => {
        const progress = clamp(
          (now - wave.startTime) / SHOCKWAVE_DURATION_MS,
          0,
          1
        );
        wave.mesh.position.copy(sphere.group.position);
        wave.mesh.scale.setScalar(sphere.baseScale * (1 + progress * 2));
        (wave.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - progress;
        if (progress >= 1) {
          scene.remove(wave.mesh);
          disposeObject(wave.mesh);
          return false;
        }
        return true;
      });
    };

    const updateShatter = (now: number) => {
      if (!sphere.shatterActive) {
        return;
      }
      const elapsed = now - sphere.shatterStartTime;
      for (let index = 0; index < SHATTER_PARTICLE_COUNT; index += 1) {
        const offset = index * 3;
        if (elapsed < SHATTER_FADE_MS) {
          sphere.shatterPositions[offset] += sphere.shatterVelocities[offset];
          sphere.shatterPositions[offset + 1] += sphere.shatterVelocities[offset + 1];
          sphere.shatterPositions[offset + 2] += sphere.shatterVelocities[offset + 2];
          sphere.shatterVelocities[offset] *= 0.96;
          sphere.shatterVelocities[offset + 1] *= 0.96;
          sphere.shatterVelocities[offset + 2] *= 0.96;
        } else if (elapsed >= SHATTER_REFORM_DELAY_MS) {
          sphere.shatterPositions[offset] = THREE.MathUtils.lerp(
            sphere.shatterPositions[offset],
            sphere.shatterHome[offset],
            0.04
          );
          sphere.shatterPositions[offset + 1] = THREE.MathUtils.lerp(
            sphere.shatterPositions[offset + 1],
            sphere.shatterHome[offset + 1],
            0.04
          );
          sphere.shatterPositions[offset + 2] = THREE.MathUtils.lerp(
            sphere.shatterPositions[offset + 2],
            sphere.shatterHome[offset + 2],
            0.04
          );
        }
      }
      sphere.shatterGeometry.attributes.position.needsUpdate = true;
      (sphere.shatterPoints.material as THREE.PointsMaterial).opacity =
        elapsed < SHATTER_FADE_MS ? 1 - elapsed / SHATTER_FADE_MS : 0.72;
      if (elapsed >= SHATTER_END_MS) {
        sphere.shatterActive = false;
        (sphere.shatterPoints.material as THREE.PointsMaterial).opacity = 0;
        sphere.wire.visible = true;
        sphere.points.visible = true;
        sphere.core.visible = true;
      }
    };

    let rafId = 0;

    const animate = (now: number) => {
      rafId = window.requestAnimationFrame(animate);

      if (!trackingActiveRef.current) {
        sphere.group.visible = false;
        sphere.motionGhosts.forEach((ghost) => {
          ghost.visible = false;
        });
        renderer.render(scene, camera);
        return;
      }

      const input = gestureRef.current;
      const raw = input.raw;
      const transform = input.transform;
      const bothFists = raw.isBothFistsClosed;

      if (bothFists && !previousBothFists) {
        sphere.targetVisible = !sphere.targetVisible;
        sphere.animationStart = now;
        sphere.group.visible = true;
        pushHudEvent(sphere.targetVisible ? "SPAWN" : "DESPAWN", now);
      }
      previousBothFists = bothFists;

      if (transform.colorShiftDelta !== 0) {
        colorFrom.set(PALETTE[colorIndex]);
        colorIndex =
          (colorIndex + (transform.colorShiftDelta > 0 ? 1 : PALETTE.length - 1)) %
          PALETTE.length;
        colorTo.set(PALETTE[colorIndex]);
        colorTransitionStart = now;
        colorTransitionActive = true;
        pushHudEvent("COLOR SHIFT", now);
      }

      if (colorTransitionActive) {
        const progress = clamp(
          (now - colorTransitionStart) / COLOR_TRANSITION_MS,
          0,
          1
        );
        setSphereColor(sphere, colorFrom.clone().lerp(colorTo, progress));
        if (progress >= 1) {
          colorTransitionActive = false;
        }
      }

      const visibilityProgress = clamp(
        (now - sphere.animationStart) / SPAWN_ANIMATION_MS,
        0,
        1
      );
      const visibleScalar = sphere.targetVisible
        ? easeOutCubic(visibilityProgress)
        : 1 - easeInCubic(visibilityProgress);
      sphere.visible = visibleScalar > 0.01;
      sphere.group.visible = sphere.visible;

      if (sphere.visible) {
        if (transform.shouldScale) {
          sphere.targetScale = clamp(
            transform.scaleDelta,
            MIN_SPHERE_SCALE,
            MAX_SPHERE_SCALE
          );
        }
        sphere.baseScale = THREE.MathUtils.lerp(
          sphere.baseScale,
          sphere.targetScale,
          SCALE_LERP_FACTOR
        );
        sphere.group.scale.setScalar(sphere.baseScale * visibleScalar);
      }

      const grabWorld = transform.grabPosition
        ? mapNormalizedToWorld(transform.grabPosition)
        : null;
      const canGrab = sphere.visible && !sphere.shatterActive && raw.isGrabbing && grabWorld;
      sphere.grabbed = Boolean(canGrab);

      const coreMaterial = sphere.core.material as THREE.MeshPhongMaterial;
      coreMaterial.emissiveIntensity = sphere.grabbed ? 2 : 1.4;
      (sphere.aura.material as THREE.MeshBasicMaterial).opacity = sphere.grabbed ? 0.24 : 0.16;

      if (sphere.grabbed && grabWorld) {
        sphere.velocity.set(0, 0);
        sphere.group.position.lerp(grabWorld, POSITION_LERP_FACTOR);
        lastGrabbed = true;
        pushHudEvent("GRAB", now);
      } else if (!sphere.shatterActive && sphere.visible) {
        if (transform.flickVector && lastGrabbed) {
          const nextVelocity = new THREE.Vector2(
            -transform.flickVector.x * THROW_SCALE,
            -transform.flickVector.y * THROW_SCALE
          );
          sphere.velocity.lerp(nextVelocity, VELOCITY_LERP);
          sphere.velocity.add(nextVelocity.multiplyScalar(0.75));
          lastGrabbed = false;
          pushHudEvent("THROW", now);
        } else if (!raw.isGrabbing) {
          lastGrabbed = false;
        }

        if (sphere.velocity.lengthSq() > 0.00001) {
          sphere.group.position.x += sphere.velocity.x;
          sphere.group.position.y += sphere.velocity.y;
          sphere.velocity.multiplyScalar(THROW_DAMPING);

          const horizontalBound = 2.85;
          const verticalBound = 1.9;
          if (Math.abs(sphere.group.position.x) > horizontalBound) {
            sphere.group.position.x = Math.sign(sphere.group.position.x) * horizontalBound;
            sphere.velocity.x *= -1;
          }
          if (Math.abs(sphere.group.position.y) > verticalBound) {
            sphere.group.position.y = Math.sign(sphere.group.position.y) * verticalBound;
            sphere.velocity.y *= -1;
          }
        }
      }

      if (transform.shouldShatter && sphere.visible && !sphere.shatterActive) {
        const screenPosition = projectToScreen(sphere.group.position, camera);
        const viewportBase = Math.min(window.innerWidth, window.innerHeight);
        const radiusNorm =
          getProjectedRadiusPx(sphere.group.position, camera, renderer, sphere.baseScale) /
          viewportBase;
        const targeted =
          raw.pointingTip &&
          Math.hypot(
            raw.pointingTip.x - screenPosition.x,
            raw.pointingTip.y - screenPosition.y
          ) <= radiusNorm;
        if (targeted) {
          startShatter(now);
          pushHudEvent("SHATTER", now);
        }
      }

      const rotationTarget = sphere.grabbed || raw.perHand.some((hand) => hand.isOpenPalm);
      sphere.group.rotation.y += rotationTarget ? transform.rotationDelta.y * 0.01 : 0.003;
      sphere.group.rotation.x += rotationTarget ? transform.rotationDelta.x * 0.01 : 0;

      if (transform.shouldPulse && sphere.visible && !sphere.shatterActive) {
        triggerShockwave(now);
        pushHudEvent("CLAP DETECTED", now);
      }

      updateShockwaves(now);
      updateShatter(now);
      updateMotionGhosts();

      const activeHudEvents: HudEvent[] = [...hudEventMap.entries()]
        .filter(([, until]) => until > now)
        .map(([label, until]) => ({ label, until }));

      onOverlayChange({
        spheres: [
          {
            id: "A",
            visible: sphere.visible,
            screenPosition: sphere.visible ? projectToScreen(sphere.group.position, camera) : null,
            radiusPx: sphere.visible
              ? getProjectedRadiusPx(sphere.group.position, camera, renderer, sphere.baseScale)
              : 0,
            color: PALETTE[colorIndex],
            grabbed: sphere.grabbed,
          },
        ],
        currentColor: PALETTE[colorIndex],
        nextColor: PALETTE[(colorIndex + 1) % PALETTE.length],
        grabBeam:
          transform.grabPosition && sphere.grabbed
            ? {
                from: transform.grabPosition,
                to: projectToScreen(sphere.group.position, camera),
              }
            : null,
        shatterCharge:
          raw.pointingTip && sphere.visible
            ? {
                position: raw.pointingTip,
                progress: clamp(raw.pointHoldFrames / POINT_HOLD_FRAMES, 0, 1),
              }
            : null,
        clapBursts: raw.isClapDetected ? raw.perHand.map((hand) => hand.palmCenter) : [],
        hudEvents: activeHudEvents,
      });

      renderer.render(scene, camera);
    };

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", handleResize);
    rafId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      disposeObject(sphere.group);
      sphere.motionGhosts.forEach((ghost) => disposeObject(ghost));
      sphere.shockwaves.forEach((wave) => {
        scene.remove(wave.mesh);
        disposeObject(wave.mesh);
      });
      starGeometry.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [onOverlayChange]);

  return (
    <div
      ref={containerRef}
      className="scene-container"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        pointerEvents: "none",
      }}
    />
  );
}
