// Lighting, fog, weather and camera for one scene.
import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import type { Scene3D } from "../../lib/short3d/spec";
import { actorFocus } from "./characters";
import { clamp01, easeIn, flickerAt, lerp, noise, rng, smooth } from "./util";

/** Per-mood colour grading for background, fog, ambient light and rim light. */
export const MOOD_LOOK = {
  dread: { bg: "#0b1020", fog: "#121a2e", ambient: "#5a6a9a", rim: "#7f9cff" },
  tension: { bg: "#08140f", fog: "#10241c", ambient: "#4f7a68", rim: "#7fffd0" },
  terror: { bg: "#140608", fog: "#2a0c10", ambient: "#8a3a40", rim: "#ff5a5a" },
  eerie: { bg: "#100a1a", fog: "#20142e", ambient: "#7a5a9a", rim: "#c49cff" },
  sad: { bg: "#0a0f18", fog: "#16202e", ambient: "#5a6a80", rim: "#9cc4ff" },
} as const;

const OUTDOOR = new Set(["house_exterior", "forest", "graveyard", "lake", "void"]);

export function Lighting({ scene, t }: { scene: Scene3D; t: number }) {
  const look = MOOD_LOOK[scene.mood];
  const f = scene.flicker ? flickerAt(t, scene.id.length) : 1;
  const outdoor = OUTDOOR.has(scene.set);
  // Lightning: two flashes at fixed times in the scene.
  const strike = scene.keyLight === "lightning" ? Math.max(0, 1 - Math.abs(((t + 0.3) % 3.1) - 0.15) * 8) : 0;
  const key = (() => {
    switch (scene.keyLight) {
      case "lamp":
        return <pointLight position={[1.6, 2.2, 1.2]} intensity={16 * f} distance={14} color="#ffb877" />;
      case "candle":
        return <pointLight position={[0.5, 1.2, 1.2]} intensity={7 * f} distance={8} color="#ff9d4a" />;
      case "flashlight":
        return <spotLight position={[0.4, 1.4, 3.5]} angle={0.42} penumbra={0.6} intensity={45 * f} distance={18} color="#fff3d6" />;
      case "tv":
        return <pointLight position={[0, 1.0, 2.2]} intensity={10 * f} distance={10} color="#9fbfff" />;
      case "red_emergency":
        return <pointLight position={[0, 2.8, 0.5]} intensity={(10 + Math.sin(t * 5) * 6) * f} distance={14} color="#ff2a2a" />;
      case "none":
        return null;
      case "moon":
      case "lightning":
      default:
        return <directionalLight position={outdoor ? [-6, 9, -6] : [3, 5, -4]} intensity={(outdoor ? 1.4 : 0.9) * f} color="#c8d6ff" />;
    }
  })();
  return (
    <>
      <color attach="background" args={[look.bg]} />
      <hemisphereLight args={[look.ambient, "#0a0808", 0.55]} />
      {key}
      {/* rim light from behind for that animated-film silhouette */}
      <directionalLight position={[2, 4, -6]} intensity={0.9} color={look.rim} />
      {/* soft front fill so faces never go fully black */}
      <pointLight position={[0, 1.6, 4]} intensity={2.2} distance={10} color="#ffe2c8" />
      {strike > 0 && <ambientLight intensity={strike * 4} color="#dfe8ff" />}
    </>
  );
}

export function Fog({ scene }: { scene: Scene3D }) {
  const look = MOOD_LOOK[scene.mood];
  const far = lerp(40, 9, scene.fog);
  const near = lerp(12, 1.5, scene.fog);
  return <fog attach="fog" args={[look.fog, near, far]} />;
}

export function Weather({ scene, t }: { scene: Scene3D; t: number }) {
  const parts = useMemo(() => {
    const r = rng(scene.id.length * 977 + 3);
    return Array.from({ length: scene.weather === "rain" ? 220 : 120 }, () => [r() * 16 - 8, r() * 8, r() * 14 - 10, r()] as const);
  }, [scene.id, scene.weather]);
  if (scene.weather === "none") return null;
  return (
    <group>
      {parts.map(([x, y0, z, s], i) => {
        if (scene.weather === "rain") {
          const y = 8 - ((y0 + t * (9 + s * 4)) % 8);
          return (
            <mesh key={i} position={[x - (8 - y) * 0.12, y, z]} rotation={[0, 0, 0.12]}>
              <boxGeometry args={[0.012, 0.35, 0.012]} />
              <meshBasicMaterial color="#b8c8ff" transparent opacity={0.45} />
            </mesh>
          );
        }
        if (scene.weather === "snow") {
          const y = 8 - ((y0 + t * (0.6 + s * 0.4)) % 8);
          return (
            <mesh key={i} position={[x + Math.sin(t + i) * 0.3, y, z]}>
              <sphereGeometry args={[0.03 + s * 0.02, 6, 6]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          );
        }
        if (scene.weather === "fireflies") {
          return (
            <mesh key={i} position={[x * 0.7 + Math.sin(t * 0.7 + i) * 0.4, 0.4 + y0 * 0.3 + Math.sin(t * 1.3 + i) * 0.2, z]}>
              <sphereGeometry args={[0.025, 6, 6]} />
              <meshBasicMaterial color="#d8ff7a" transparent opacity={0.5 + 0.5 * Math.sin(t * 3 + i * 1.7)} />
            </mesh>
          );
        }
        // dust motes
        return (
          <mesh key={i} position={[x * 0.4 + Math.sin(t * 0.3 + i) * 0.2, (y0 * 0.4 + t * 0.05 * s) % 3.2, z * 0.4]}>
            <sphereGeometry args={[0.012, 5, 5]} />
            <meshBasicMaterial color="#fff0d0" transparent opacity={0.6} />
          </mesh>
        );
      })}
    </group>
  );
}

// ---------- camera ----------

const FOV = 45;
const VISIBLE_HEIGHT: Record<Scene3D["camera"]["shot"], number> = {
  extreme_wide: 9,
  wide: 4.6,
  medium: 1.9,
  closeup: 0.95,
  extreme_closeup: 0.5,
  low_angle: 2.6,
  high_angle: 3.2,
  over_shoulder: 2.2,
  pov: 3,
};

/** Positions the camera for this frame from the shot, move and target. */
export function CameraRig({ scene, t, duration }: { scene: Scene3D; t: number; duration: number }) {
  const camera = useThree((s) => s.camera);
  const { shot, move, intensity } = scene.camera;
  const target = scene.actors.find((a) => a.id === scene.camera.target) ?? scene.actors[0];
  const u = clamp01(t / duration);

  useLayoutEffect(() => {
    const focus: [number, number, number] = target ? actorFocus(target, t, duration) : [0, 1.3, -1.5];
    // Wider shots aim lower (at the middle of the body / scene).
    if (shot === "wide" || shot === "extreme_wide") focus[1] = Math.max(0.9, focus[1] * 0.65);
    if (shot === "medium" || shot === "over_shoulder") focus[1] -= 0.15;
    let dist = VISIBLE_HEIGHT[shot] / (2 * Math.tan(((FOV / 2) * Math.PI) / 180));
    let height = focus[1];
    let yaw = 0;
    let lookOffsetX = 0;
    let lookOffsetY = 0;
    const k = intensity;
    switch (move) {
      case "dolly_in":
        dist *= lerp(1 + 0.3 * k, 1 - 0.12 * k, smooth(u));
        break;
      case "dolly_out":
        dist *= lerp(1 - 0.12 * k, 1 + 0.35 * k, smooth(u));
        break;
      case "push_in_fast":
        dist *= lerp(1.25, 0.55, easeIn(u) * k);
        break;
      case "pan_left":
        lookOffsetX = lerp(0.8, -0.8, smooth(u)) * k;
        break;
      case "pan_right":
        lookOffsetX = lerp(-0.8, 0.8, smooth(u)) * k;
        break;
      case "orbit_left":
        yaw = lerp(0.35, -0.35, smooth(u)) * k;
        break;
      case "orbit_right":
        yaw = lerp(-0.35, 0.35, smooth(u)) * k;
        break;
      case "tilt_up":
        lookOffsetY = lerp(-1.2, 0, smooth(u)) * k;
        break;
      case "crane_down":
        height += lerp(2.2, 0, smooth(u)) * k;
        break;
      default:
        break;
    }
    if (shot === "low_angle") height = 0.35;
    if (shot === "high_angle") height = focus[1] + dist * 0.8;
    if (shot === "over_shoulder") {
      yaw += 0.45;
      height = focus[1] + 0.1;
    }
    if (shot === "pov") {
      height = 1.45 + Math.sin(t * 6) * 0.025;
      dist *= lerp(1.2, 0.8, u);
    }
    // Handheld / shake add noise on top.
    const shake = move === "shake" ? 0.06 * k * (0.5 + u) : move === "handheld" ? 0.018 * k : 0.004;
    const nx = noise(t * 6, 1) * shake;
    const ny = noise(t * 6, 2) * shake;
    camera.position.set(focus[0] + Math.sin(yaw) * dist + nx, height + ny, focus[2] + Math.cos(yaw) * dist);
    camera.lookAt(focus[0] + lookOffsetX + nx * 0.5, focus[1] + lookOffsetY + ny * 0.5, focus[2]);
    if ("fov" in camera && camera.fov !== FOV) {
      camera.fov = FOV;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
