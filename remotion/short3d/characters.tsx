// Animated-film style 3D cartoon characters, sculpted from rounded primitives:
// big heads with full cheeks, large glossy eyes with lids and highlights, sculpted
// hair, tapered bodies with hands and shoes, squash & stretch. Fully procedural and
// frame-deterministic (no randomness, everything is a function of time).
import { type Actor } from "../../lib/short3d/spec";
import { Vector2 } from "three";
import { Toon } from "./materials";
import { clamp01, easeIn, hashString, lerp, noise, smooth } from "./util";

type Expression = Actor["expression"];

export interface ActorPose {
  pos: [number, number, number];
  rotY: number;
  rotX: number;
  visible: boolean;
  opacity: number;
  scale: number;
  walk: number; // walk-cycle phase in radians (0 = standing)
  stride: number; // 0..1 how much the limbs swing
  headYaw: number;
  headTilt: number;
  lean: number; // + forward, - backward
  armsUp: number; // 0..1 (scared/raised arms)
  expression: Expression;
  blink: number; // 0 open .. 1 closed
  eyeYaw: number; // eye darts / looking sideways (radians)
  eyePitch: number;
  squash: number; // vertical squash & stretch (+ stretch, - squash)
}

const FACING_ROT = { camera: 0, left: -Math.PI / 2, right: Math.PI / 2, away: Math.PI } as const;

/** Where an actor is and what it's doing at scene-local time t. */
export function actorPose(a: Actor, t: number, sceneDuration: number): ActorPose {
  const seed = hashString(a.id);
  const local = t - a.start;
  const started = local >= 0;
  const p: ActorPose = {
    pos: [a.x, 0, a.z],
    rotY: FACING_ROT[a.facing],
    rotX: 0,
    visible: true,
    opacity: 1,
    scale: a.scale,
    walk: 0,
    stride: 0,
    headYaw: noise(t * 0.4, seed) * 0.12,
    headTilt: noise(t * 0.3, seed + 1) * 0.05,
    lean: 0,
    armsUp: 0,
    expression: a.expression,
    blink: 0,
    eyeYaw: noise(t * 0.7, seed + 5) * 0.22,
    eyePitch: noise(t * 0.5, seed + 6) * 0.08,
    squash: 0,
  };
  // Blink for ~0.12s every ~3.5s (offset per actor).
  const bt = (t + (seed % 1000) / 300) % 3.5;
  p.blink = bt < 0.12 ? 1 - Math.abs(bt - 0.06) / 0.06 : 0;
  const breathe = Math.sin(t * 2.2 + seed) * 0.012;
  p.pos[1] = breathe;

  const walkTo = (from: [number, number], to: [number, number], dur: number, speedHz: number) => {
    const u = started ? clamp01(local / dur) : 0;
    const e = smooth(u);
    p.pos[0] = lerp(from[0], to[0], e);
    p.pos[2] = lerp(from[1], to[1], e);
    const moving = started && u < 1;
    p.stride = moving ? 1 : 0;
    p.walk = moving ? local * speedHz * Math.PI * 2 : 0;
    p.pos[1] += moving ? Math.abs(Math.sin(p.walk)) * 0.035 : 0;
    return u;
  };

  switch (a.action) {
    case "walk_in":
      p.rotY = 0;
      walkTo([a.x, a.z - 5], [a.x, a.z], Math.min(4, sceneDuration * 0.7), 1.6);
      break;
    case "walk_away":
      p.rotY = Math.PI;
      walkTo([a.x, a.z], [a.x, a.z - 6], Math.max(3, sceneDuration * 0.9), 1.5);
      break;
    case "walk_left":
      p.rotY = -Math.PI / 2;
      walkTo([a.x + 3, a.z], [a.x, a.z], Math.min(3.5, sceneDuration * 0.7), 1.6);
      break;
    case "walk_right":
      p.rotY = Math.PI / 2;
      walkTo([a.x - 3, a.z], [a.x, a.z], Math.min(3.5, sceneDuration * 0.7), 1.6);
      break;
    case "run":
      p.rotY = 0;
      walkTo([a.x, a.z - 7], [a.x, a.z + 1.2], Math.min(2.6, sceneDuration * 0.8), 2.8);
      p.lean = 0.25;
      p.expression = a.expression === "neutral" ? "scared" : a.expression;
      break;
    case "creep_closer": {
      const u = started ? clamp01(local / Math.max(1, sceneDuration - a.start)) : 0;
      p.pos[2] = lerp(a.z - 2.5, a.z + 1.4, easeIn(u));
      p.pos[0] = a.x + Math.sin(t * 0.9 + seed) * 0.08;
      p.stride = 0.35;
      p.walk = local * 0.8 * Math.PI * 2;
      p.lean = 0.12;
      p.headTilt = 0.18 * Math.sin(t * 0.7);
      break;
    }
    case "peek": {
      const u = smooth(started ? local / 1.2 : 0);
      p.pos[0] = a.x + (1 - u) * 0.7 * Math.sign(a.x || 1);
      p.headTilt = -0.35 * u * Math.sign(a.x || 1);
      p.lean = 0.1;
      break;
    }
    case "float":
      p.pos[1] = 0.35 + Math.sin(t * 1.6 + seed) * 0.12;
      p.pos[0] = a.x + Math.sin(t * 0.7 + seed) * 0.25;
      p.headTilt = Math.sin(t * 0.9) * 0.15;
      break;
    case "reveal": {
      const u = smooth(started ? local / 1.4 : 0);
      p.visible = started;
      p.opacity = u;
      p.pos[1] = lerp(-0.6, 0, u) + breathe;
      p.scale = a.scale * lerp(0.85, 1, u);
      break;
    }
    case "scared":
      p.lean = -0.18;
      p.pos[0] = a.x + noise(t * 25, seed) * 0.015;
      p.armsUp = 0.7;
      p.expression = a.expression === "neutral" ? "scared" : a.expression;
      break;
    case "look_around":
      p.headYaw = Math.sin(t * 1.3 + seed) * 0.85;
      p.eyeYaw = Math.sin(t * 1.3 + seed + 0.4) * 0.35; // eyes lead the head
      break;
    case "sleep":
      p.rotX = -Math.PI / 2;
      p.pos[1] = 0.62;
      p.expression = "closed";
      break;
    case "turn_around": {
      const u = smooth(started ? local / 0.9 : 0);
      p.rotY = lerp(Math.PI, 0, u);
      if (u < 1) p.expression = "neutral";
      break;
    }
    case "idle":
    default:
      break;
  }
  // Squash & stretch: bounce while moving, gentle breathing otherwise.
  p.squash = p.stride > 0 ? Math.sin(p.walk * 2) * 0.035 : Math.sin(t * 2.2 + seed) * 0.012;
  if (a.expression === "scared" || p.expression === "scared") p.eyeYaw += noise(t * 9, seed + 7) * 0.18;
  if (a.action !== "reveal" && !started && ["walk_in", "run", "walk_left", "walk_right"].includes(a.action)) p.visible = true;
  return p;
}

// ---------- shared look ----------

/** Skin gets a faint warm emissive so it reads soft and alive (a cheap stand-in for subsurface scattering). */
function Skin({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return <meshStandardMaterial color={color} roughness={0.55} emissive="#ff7a5a" emissiveIntensity={0.06} transparent={opacity < 1} opacity={opacity} />;
}

function Cloth({ color, opacity = 1, rough = 0.78 }: { color: string; opacity?: number; rough?: number }) {
  return <meshStandardMaterial color={color} roughness={rough} transparent={opacity < 1} opacity={opacity} />;
}

/** A sphere cap facing +z (used for iris/pupil so they hug the eyeball). */
function Cap({ r, angle, color, basic, z = 0 }: { r: number; angle: number; color: string; basic?: boolean; z?: number }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, z]}>
      <sphereGeometry args={[r, 28, 10, 0, Math.PI * 2, 0, angle]} />
      {basic ? <meshBasicMaterial color={color} /> : <meshStandardMaterial color={color} roughness={0.15} />}
    </mesh>
  );
}

// ---------- face ----------

interface FaceStyle {
  skin: string;
  iris: string;
  brow: string;
  glow?: string;
  blush: boolean;
  lips?: string;
  teeth?: boolean;
}

const LID_OPEN: Record<Expression, number> = {
  neutral: 0.34, // a little lid over the top of the eye: the classic animated look
  scared: 0.12,
  surprised: 0.05,
  smile: 0.5,
  creepy_smile: 0.62,
  angry: 0.58,
  closed: 1,
};

function Eye({ r, side, pose, style }: { r: number; side: number; pose: ActorPose; style: FaceStyle }) {
  const e = pose.expression;
  const wide = e === "surprised" ? 1.12 : e === "scared" ? 1.06 : 1;
  const pupil = e === "scared" ? 0.16 : e === "surprised" ? 0.22 : e === "creepy_smile" ? 0.14 : 0.3;
  const lidAmount = Math.max(LID_OPEN[e], pose.blink);
  // Upper lid: a skin shell from the top pole; theta grows as the eye closes.
  const lidTheta = lerp(0.55, Math.PI * 0.92, lidAmount);
  const angry = e === "angry" ? side * 0.35 : 0;
  const sad = e === "scared" ? -side * 0.2 : 0;
  return (
    <group scale={wide}>
      {/* eyeball (looks around) */}
      <group rotation={[pose.eyePitch, pose.eyeYaw, 0]}>
        <mesh>
          <sphereGeometry args={[r, 32, 24]} />
          {style.glow ? <meshBasicMaterial color={style.glow} /> : <meshStandardMaterial color="#fbfaf5" roughness={0.12} />}
        </mesh>
        {!style.glow && (
          <>
            <Cap r={r * 1.004} angle={0.62} color={style.iris} />
            <Cap r={r * 1.008} angle={0.62 * pupil * 2} color="#0d0a10" />
            {/* catch-lights */}
            <mesh position={[r * 0.3, r * 0.32, r * 0.92]}>
              <sphereGeometry args={[r * 0.17, 12, 12]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <mesh position={[-r * 0.22, -r * 0.2, r * 0.97]}>
              <sphereGeometry args={[r * 0.07, 8, 8]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </>
        )}
      </group>
      {/* upper lid: tilts for angry/sad brows */}
      <group rotation={[-0.25, 0, angry + sad]}>
        <mesh>
          <sphereGeometry args={[r * 1.07, 28, 14, 0, Math.PI * 2, 0, lidTheta]} />
          <Skin color={style.skin} />
        </mesh>
      </group>
      {/* lower lid */}
      <mesh rotation={[Math.PI + 0.15, 0, 0]}>
        <sphereGeometry args={[r * 1.05, 24, 8, 0, Math.PI * 2, 0, e === "smile" || e === "creepy_smile" ? 0.95 : 0.55]} />
        <Skin color={style.skin} />
      </mesh>
    </group>
  );
}

function Brow({ R, side, expression, color }: { R: number; side: number; expression: Expression; color: string }) {
  const [lift, inner] = {
    neutral: [0, 0],
    scared: [0.06, 0.3],
    surprised: [0.1, 0.05],
    smile: [0.02, -0.05],
    creepy_smile: [-0.02, -0.35],
    angry: [-0.04, -0.5],
    closed: [-0.01, 0],
  }[expression];
  return (
    <group position={[side * R * 0.36, R * (0.42 + lift), R * 0.86]} rotation={[0.25, side * -0.35, side * inner]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[R * 0.055, R * 0.26, 6, 10]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

function MouthShape({ R, pose, t, style }: { R: number; pose: ActorPose; t: number; style: FaceStyle }) {
  const e = pose.expression;
  const dark = "#4a1620";
  const y = -R * 0.47;
  const z = R * 0.9;
  if (e === "surprised" || e === "scared") {
    const open = e === "surprised" ? 1 : 0.7 + Math.sin(t * 13) * 0.08;
    return (
      <group position={[0, y, z]}>
        <mesh scale={[0.85, open * 1.2, 0.45]}>
          <sphereGeometry args={[R * 0.13, 20, 16]} />
          <meshStandardMaterial color={dark} roughness={0.4} />
        </mesh>
        <mesh position={[0, -R * 0.06 * open, R * 0.03]} scale={[0.6, 0.3, 0.3]}>
          <sphereGeometry args={[R * 0.1, 12, 10]} />
          <meshStandardMaterial color="#c4505a" roughness={0.5} />
        </mesh>
      </group>
    );
  }
  if (e === "creepy_smile") {
    return (
      <group position={[0, y + R * 0.04, z - R * 0.02]}>
        {/* a too-wide grin: dark crescent with a row of small teeth */}
        <mesh position={[0, -R * 0.05, 0]} scale={[1, 0.42, 0.25]}>
          <sphereGeometry args={[R * 0.3, 24, 16, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5]} />
          <meshStandardMaterial color={dark} roughness={0.6} />
        </mesh>
        {Array.from({ length: 7 }, (_, i) => {
          const x = (i - 3) * R * 0.075;
          return (
            <mesh key={i} position={[x, -R * 0.06 - Math.abs(x) * 0.25, R * 0.06]} scale={[0.8, 1, 0.5]}>
              <coneGeometry args={[R * 0.03, R * 0.07, 4]} />
              <meshStandardMaterial color="#f5f0e2" roughness={0.3} />
            </mesh>
          );
        })}
      </group>
    );
  }
  const frown = e === "angry";
  const width = e === "smile" ? 0.2 : e === "closed" ? 0.09 : 0.12;
  return (
    <mesh position={[0, y + (frown ? -R * 0.07 : 0), z]} rotation={[0.15, 0, frown ? 0 : Math.PI]}>
      <torusGeometry args={[R * width, R * 0.028, 8, 18, Math.PI * 0.9]} />
      <meshStandardMaterial color={style.lips ?? dark} roughness={0.5} />
    </mesh>
  );
}

/** Head sculpted from overlapping spheres: cranium, full cheeks, soft jaw, ears. */
function Head({ R, pose, t, style, hair, hairStyle, opacity, stretch = 1, faceless = false }: { R: number; pose: ActorPose; t: number; style: FaceStyle; hair?: string; hairStyle: HairStyle; opacity: number; stretch?: number; faceless?: boolean }) {
  const eyeR = R * 0.25;
  return (
    <group scale={[1, stretch, 1]}>
      <mesh scale={[1, 1.0, 0.97]} castShadow>
        <sphereGeometry args={[R, 40, 32]} />
        <Skin color={style.skin} opacity={opacity} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`cheek${side}`} position={[side * R * 0.34, -R * 0.28, R * 0.28]}>
          <sphereGeometry args={[R * 0.46, 28, 20]} />
          <Skin color={style.skin} opacity={opacity} />
        </mesh>
      ))}
      <mesh position={[0, -R * 0.4, R * 0.2]} scale={[1.0, 0.85, 1]}>
        <sphereGeometry args={[R * 0.58, 28, 20]} />
        <Skin color={style.skin} opacity={opacity} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`ear${side}`} position={[side * R * 0.98, -R * 0.08, -R * 0.02]} scale={[0.45, 1, 0.8]}>
          <sphereGeometry args={[R * 0.22, 16, 14]} />
          <Skin color={style.skin} opacity={opacity} />
        </mesh>
      ))}
      {!faceless && (
        <>
          {[-1, 1].map((side) => (
            <group key={`eye${side}`} position={[side * R * 0.37, R * 0.06, R * 0.72]}>
              <Eye r={eyeR} side={side} pose={pose} style={style} />
            </group>
          ))}
          {[-1, 1].map((side) => (
            <Brow key={`brow${side}`} R={R} side={side} expression={pose.expression} color={style.brow} />
          ))}
          {/* button nose */}
          <mesh position={[0, -R * 0.2, R * 1.0]} scale={[1.1, 0.9, 1]}>
            <sphereGeometry args={[R * 0.11, 16, 14]} />
            <Skin color={style.skin} opacity={opacity} />
          </mesh>
          {style.blush &&
            [-1, 1].map((side) => (
              <mesh key={`blush${side}`} position={[side * R * 0.5, -R * 0.28, R * 0.76]} rotation={[0, side * 0.55, 0]}>
                <circleGeometry args={[R * 0.13, 20]} />
                <meshBasicMaterial color="#ff7b8a" transparent opacity={0.28} depthWrite={false} />
              </mesh>
            ))}
          <MouthShape R={R} pose={pose} t={t} style={style} />
        </>
      )}
      {faceless && style.glow &&
        [-1, 1].map((side) => (
          <mesh key={side} position={[side * R * 0.3, R * 0.05, R * 0.88]} scale={[1, 0.7, 0.5]}>
            <sphereGeometry args={[R * 0.12, 14, 12]} />
            <meshBasicMaterial color={style.glow} />
          </mesh>
        ))}
      {hair && hairStyle !== "bald" && <Hair R={R} style={hairStyle} color={hair} opacity={opacity} t={t} />}
    </group>
  );
}

// ---------- hair ----------

type HairStyle = NonNullable<Actor["hairStyle"]>;

function Blob({ p, s, r = [0, 0, 0], color, opacity }: { p: [number, number, number]; s: [number, number, number]; r?: [number, number, number]; color: string; opacity: number }) {
  return (
    <mesh position={p} scale={s} rotation={r}>
      <sphereGeometry args={[1, 24, 18]} />
      <meshStandardMaterial color={color} roughness={0.6} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

/** Hair sculpted as soft volumes (cap + locks), the way stylised films block hair shapes. */
function Hair({ R, style, color, opacity, t }: { R: number; style: HairStyle; color: string; opacity: number; t: number }) {
  const sway = Math.sin(t * 2.2) * 0.04;
  const cap = (
    <mesh position={[0, R * 0.05, -R * 0.04]} rotation={[-0.5, 0, 0]} scale={[1.07, 1.05, 1.07]}>
      <sphereGeometry args={[R, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
      <meshStandardMaterial color={color} roughness={0.6} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
  const c = { color, opacity };
  switch (style) {
    case "short":
      return (
        <group>
          {cap}
          {/* swoopy fringe */}
          <Blob p={[-R * 0.22, R * 0.66, R * 0.62]} s={[R * 0.42, R * 0.2, R * 0.28]} r={[0.5, 0, 0.35]} {...c} />
          <Blob p={[R * 0.2, R * 0.72, R * 0.55]} s={[R * 0.36, R * 0.18, R * 0.26]} r={[0.5, 0, -0.25]} {...c} />
          {[-1, 1].map((sd) => (
            <Blob key={sd} p={[sd * R * 0.86, R * 0.15, -R * 0.08]} s={[R * 0.2, R * 0.38, R * 0.35]} {...c} />
          ))}
        </group>
      );
    case "messy":
      return (
        <group>
          {cap}
          {Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI * 1.6 - Math.PI * 0.8;
            return <Blob key={i} p={[Math.sin(a) * R * 0.55, R * 0.85, Math.cos(a) * R * 0.35]} s={[R * 0.17, R * 0.32, R * 0.17]} r={[Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.6]} {...c} />;
          })}
          <Blob p={[0, R * 0.68, R * 0.6]} s={[R * 0.5, R * 0.18, R * 0.25]} r={[0.6, 0, 0]} {...c} />
        </group>
      );
    case "bob":
    case "long":
    case "ponytail": {
      const long = style === "long";
      return (
        <group>
          {cap}
          {/* bangs */}
          <Blob p={[0, R * 0.6, R * 0.66]} s={[R * 0.78, R * 0.22, R * 0.3]} r={[0.45, 0, 0]} {...c} />
          {style !== "ponytail" &&
            [-1, 1].map((sd) => (
              <Blob key={sd} p={[sd * R * 0.82, long ? -R * 0.55 : -R * 0.2, -R * 0.12]} s={[R * 0.32, long ? R * 1.05 : R * 0.68, R * 0.55]} r={[0, 0, sd * sway]} {...c} />
            ))}
          {style !== "ponytail" && <Blob p={[0, long ? -R * 0.5 : -R * 0.15, -R * 0.55]} s={[R * 0.85, long ? R * 1.05 : R * 0.7, R * 0.5]} {...c} />}
          {style === "ponytail" && (
            <group position={[0, R * 0.35, -R * 0.95]} rotation={[0.5 + sway, 0, sway]}>
              <Blob p={[0, -R * 0.45, 0]} s={[R * 0.28, R * 0.6, R * 0.28]} {...c} />
              <mesh position={[0, 0, 0.02]}>
                <torusGeometry args={[R * 0.13, R * 0.04, 8, 16]} />
                <meshStandardMaterial color="#d9473b" roughness={0.5} />
              </mesh>
            </group>
          )}
        </group>
      );
    }
    default:
      return cap;
  }
}

// ---------- body ----------

interface Build {
  R: number; // head radius
  torso: number; // torso height
  torsoR: number; // torso radius at the belly
  leg: number; // leg length
  arm: number; // arm length
  limb: number; // limb thickness
  stretch?: number; // head vertical stretch
}

const BUILDS: Record<"kid" | "adult" | "monster" | "shadow" | "doll", Build> = {
  kid: { R: 0.27, torso: 0.42, torsoR: 0.2, leg: 0.34, arm: 0.36, limb: 0.06 },
  adult: { R: 0.235, torso: 0.6, torsoR: 0.23, leg: 0.74, arm: 0.6, limb: 0.068 },
  monster: { R: 0.24, torso: 0.9, torsoR: 0.26, leg: 1.0, arm: 1.15, limb: 0.075, stretch: 1.25 },
  shadow: { R: 0.2, torso: 0.9, torsoR: 0.17, leg: 1.05, arm: 1.05, limb: 0.05, stretch: 1.2 },
  doll: { R: 0.22, torso: 0.3, torsoR: 0.14, leg: 0.22, arm: 0.24, limb: 0.045 },
};

/** Pear-shaped torso profile (lathe), wider at the belly, narrow at the shoulders. */
function torsoPoints(h: number, r: number, dress: boolean) {
  const pts = dress
    ? [
        [0.001, 0],
        [r * 1.9, 0.02],
        [r * 1.55, 0.28],
        [r * 1.0, 0.62],
        [r * 0.95, 0.85],
        [r * 0.62, 0.98],
        [0.001, 1],
      ]
    : [
        [0.001, 0],
        [r * 1.06, 0.02],
        [r * 1.06, 0.12],
        [r * 1.04, 0.25],
        [r * 1.0, 0.55],
        [r * 0.92, 0.82],
        [r * 0.62, 0.98],
        [0.001, 1],
      ];
  return pts.map(([x, y]) => new Vector2(x, y * h));
}

function Limb({ len, r0, r1, color, skinTip, tipColor, opacity, foot }: { len: number; r0: number; r1: number; color: string; skinTip?: boolean; tipColor: string; opacity: number; foot?: { color: string } }) {
  return (
    <group>
      <mesh position={[0, -len / 2, 0]} castShadow>
        <cylinderGeometry args={[r0, r1, len, 14]} />
        <Cloth color={color} opacity={opacity} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[r0, 14, 10]} />
        <Cloth color={color} opacity={opacity} />
      </mesh>
      {skinTip && (
        // mitten hand with a thumb
        <group position={[0, -len - r1 * 0.6, 0]}>
          <mesh scale={[0.85, 1.1, 0.65]}>
            <sphereGeometry args={[r1 * 1.55, 16, 12]} />
            <Skin color={tipColor} opacity={opacity} />
          </mesh>
          <mesh position={[r1 * 0.9, r1 * 0.3, r1 * 0.5]} scale={[0.6, 1, 0.6]}>
            <sphereGeometry args={[r1 * 0.75, 10, 8]} />
            <Skin color={tipColor} opacity={opacity} />
          </mesh>
        </group>
      )}
      {foot && (
        // chunky sneaker with a pale sole
        <group position={[0, -len - r1 * 0.2, r1 * 0.9]}>
          <mesh scale={[1, 0.62, 1.55]}>
            <sphereGeometry args={[r1 * 1.55, 18, 12]} />
            <Cloth color={foot.color} opacity={opacity} rough={0.5} />
          </mesh>
          <mesh position={[0, -r1 * 0.75, 0]} scale={[1.02, 0.25, 1.58]}>
            <sphereGeometry args={[r1 * 1.55, 18, 8]} />
            <Cloth color="#e9e4da" opacity={opacity} rough={0.6} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function Humanoid({
  b,
  pose,
  t,
  style,
  outfit,
  pants,
  shoes,
  hair,
  hairStyle,
  opacity,
  dress = false,
  faceless = false,
  horns = false,
}: {
  b: Build;
  pose: ActorPose;
  t: number;
  style: FaceStyle;
  outfit: string;
  pants: string;
  shoes: string;
  hair?: string;
  hairStyle: HairStyle;
  opacity: number;
  dress?: boolean;
  faceless?: boolean;
  horns?: boolean;
}) {
  const swing = Math.sin(pose.walk) * 0.6 * pose.stride;
  const hipY = b.leg + b.limb * 1.6;
  const shoulderY = hipY + b.torso * 0.86;
  const neck = b.R * 0.35;
  const headY = shoulderY + neck + b.R * (b.stretch ?? 1) * 0.85;
  const shiver = pose.expression === "scared" ? Math.sin(t * 38) * 0.012 : 0;
  const stretch = 1 + pose.squash;
  return (
    <group rotation={[pose.lean, 0, 0]} scale={[1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch)]}>
      {/* legs */}
      {!dress &&
        [-1, 1].map((side) => (
          <group key={side} position={[side * b.torsoR * 0.48, hipY, 0]} rotation={[side * swing, 0, 0]}>
            <Limb len={b.leg} r0={b.limb * 1.25} r1={b.limb * 0.95} color={pants} tipColor={style.skin} opacity={opacity} foot={{ color: shoes }} />
          </group>
        ))}
      {dress &&
        [-1, 1].map((side) => (
          <group key={side} position={[side * b.torsoR * 0.45, hipY * 0.95, 0]} rotation={[side * swing * 0.5, 0, 0]}>
            <Limb len={b.leg} r0={b.limb * 0.9} r1={b.limb * 0.8} color={style.skin} tipColor={style.skin} opacity={opacity} foot={{ color: shoes }} />
          </group>
        ))}
      {/* torso */}
      <mesh position={[0, hipY - b.limb * 0.6, 0]} castShadow>
        <latheGeometry args={[torsoPoints(b.torso + b.limb * 0.6, b.torsoR, dress), 28]} />
        <Cloth color={outfit} opacity={opacity} />
      </mesh>
      {!dress && (
        // waistband / shorts top so shirt and trousers read as separate garments
        <mesh position={[0, hipY - b.limb * 1.0, 0]}>
          <cylinderGeometry args={[b.torsoR * 0.98, b.torsoR * 0.92, b.limb * 1.4, 24]} />
          <Cloth color={pants} opacity={opacity} />
        </mesh>
      )}
      {/* collar */}
      <mesh position={[0, shoulderY + b.limb * 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[neck * 0.75, b.limb * 0.45, 8, 20]} />
        <Cloth color={outfit} opacity={opacity} />
      </mesh>
      {/* neck */}
      <mesh position={[0, shoulderY + neck * 0.5, 0]}>
        <cylinderGeometry args={[neck * 0.55, neck * 0.65, neck * 1.4, 14]} />
        <Skin color={style.skin} opacity={opacity} />
      </mesh>
      {/* arms */}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * (b.torsoR * 0.95 + b.limb * 0.6), shoulderY - b.limb * 0.6, 0]}
          rotation={[-side * swing * 0.85 - pose.armsUp * 1.7, 0, side * (0.14 + pose.armsUp * 0.4)]}
        >
          <Limb len={b.arm * 0.48} r0={b.limb * 1.05} r1={b.limb * 0.9} color={outfit} tipColor={style.skin} opacity={opacity} />
          <group position={[0, -b.arm * 0.48, 0]} rotation={[-0.25 - pose.armsUp * 0.6, 0, 0]}>
            <Limb len={b.arm * 0.46} r0={b.limb * 0.82} r1={b.limb * 0.7} color={style.skin} tipColor={style.skin} skinTip opacity={opacity} />
          </group>
        </group>
      ))}
      {/* head */}
      <group position={[shiver, headY, 0]} rotation={[pose.headTilt * 0.4, pose.headYaw, pose.headTilt]}>
        <Head R={b.R} pose={pose} t={t} style={style} hair={hair} hairStyle={hairStyle} opacity={opacity} stretch={b.stretch} faceless={faceless} />
        {horns &&
          [-1, 1].map((side) => (
            <mesh key={side} position={[side * b.R * 0.55, b.R * 0.95 * (b.stretch ?? 1), 0]} rotation={[0, 0, -side * 0.5]}>
              <coneGeometry args={[b.R * 0.17, b.R * 0.75, 14]} />
              <meshStandardMaterial color="#e8dcc0" roughness={0.4} />
            </mesh>
          ))}
      </group>
    </group>
  );
}

// ---------- non-humanoids ----------

function Ghost({ pose, t, opacity }: { pose: ActorPose; t: number; opacity: number }) {
  const sway = Math.sin(t * 2.1) * 0.06;
  return (
    <group position={[0, 0.2, 0]} rotation={[0, 0, sway]}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <sphereGeometry args={[0.45, 36, 28, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Toon color="#eef3ff" glow="#9fb6ff" glowIntensity={0.35} opacity={0.88 * opacity} rough={0.35} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.45, 0.6, 0.8, 36, 1, true]} />
        <meshPhysicalMaterial color="#eef3ff" emissive="#9fb6ff" emissiveIntensity={0.35} transparent opacity={0.85 * opacity} side={2} roughness={0.4} />
      </mesh>
      {/* wavy hem */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.55, 0.06 + Math.sin(t * 3 + i) * 0.03, Math.sin(a) * 0.55]}>
            <sphereGeometry args={[0.13, 12, 10]} />
            <Toon color="#eef3ff" glow="#9fb6ff" glowIntensity={0.35} opacity={0.8 * opacity} />
          </mesh>
        );
      })}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.15, 0.95, 0.4]} scale={[1, 1.4 + (pose.expression === "surprised" ? 0.4 : 0), 0.5]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#141020" transparent opacity={opacity} />
        </mesh>
      ))}
      <mesh position={[0, 0.72, 0.42]} scale={[1, 1.3, 0.5]}>
        <sphereGeometry args={[0.07, 14, 14]} />
        <meshBasicMaterial color="#141020" transparent opacity={opacity} />
      </mesh>
    </group>
  );
}

function Cat({ pose, t, opacity }: { pose: ActorPose; t: number; opacity: number }) {
  const tail = Math.sin(t * 2.4) * 0.5;
  const step = Math.sin(pose.walk) * 0.4 * pose.stride;
  return (
    <group>
      <mesh position={[0, 0.32, 0]} scale={[0.8, 0.75, 1.35]} castShadow>
        <sphereGeometry args={[0.22, 24, 20]} />
        <Toon color="#1d1a22" opacity={opacity} sheen={1} />
      </mesh>
      {[
        [-0.1, 0.18],
        [0.1, 0.18],
        [-0.1, -0.18],
        [0.1, -0.18],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.12, z]} rotation={[(i % 2 ? 1 : -1) * step, 0, 0]}>
          <capsuleGeometry args={[0.04, 0.16, 4, 8]} />
          <Toon color="#1d1a22" opacity={opacity} />
        </mesh>
      ))}
      <group position={[0, 0.55, 0.26]} rotation={[0, pose.headYaw, pose.headTilt]}>
        <mesh>
          <sphereGeometry args={[0.17, 28, 24]} />
          <Toon color="#1d1a22" opacity={opacity} sheen={1} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.1, 0.15, -0.02]} rotation={[0, 0, -side * 0.3]}>
            <coneGeometry args={[0.06, 0.13, 4]} />
            <Toon color="#1d1a22" opacity={opacity} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.065, 0.02, 0.14]} scale={[1, 1.2, 0.5]}>
            <sphereGeometry args={[0.045, 14, 14]} />
            <meshBasicMaterial color="#ffd23f" transparent opacity={opacity} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0.45, -0.32]} rotation={[0.9 + tail * 0.2, tail, 0]}>
        <capsuleGeometry args={[0.03, 0.4, 4, 8]} />
        <Toon color="#1d1a22" opacity={opacity} />
      </mesh>
    </group>
  );
}

// ---------- public component ----------

const DEFAULTS: Record<Actor["character"], { skin: string; outfit: string; pants: string; shoes: string; hair?: string; hairStyle: HairStyle; iris: string }> = {
  kid: { skin: "#f3c6a5", outfit: "#e9a23b", pants: "#3c5a8a", shoes: "#c8423a", hair: "#5a3420", hairStyle: "short", iris: "#6b4a2b" },
  adult: { skin: "#e8b796", outfit: "#5f7a5a", pants: "#3a3836", shoes: "#2e2622", hair: "#2c2420", hairStyle: "short", iris: "#4a6a8a" },
  doll: { skin: "#f7e8de", outfit: "#b23a48", pants: "#f7e8de", shoes: "#2a1e22", hair: "#d0a35a", hairStyle: "bob", iris: "#4a7ac0" },
  monster: { skin: "#5c6a7a", outfit: "#2c3340", pants: "#252a33", shoes: "#1c1f26", hairStyle: "bald", iris: "#ffcc33" },
  shadow_figure: { skin: "#06060a", outfit: "#06060a", pants: "#06060a", shoes: "#06060a", hairStyle: "bald", iris: "#ffffff" },
  ghost: { skin: "#eef3ff", outfit: "#eef3ff", pants: "#eef3ff", shoes: "#eef3ff", hairStyle: "bald", iris: "#000000" },
  cat: { skin: "#1d1a22", outfit: "#1d1a22", pants: "#1d1a22", shoes: "#1d1a22", hairStyle: "bald", iris: "#ffd23f" },
};

export function Character({ actor, t, sceneDuration }: { actor: Actor; t: number; sceneDuration: number }) {
  const pose = actorPose(actor, t, sceneDuration);
  if (!pose.visible) return null;
  const d = DEFAULTS[actor.character];
  const skin = actor.skin ?? d.skin;
  const outfit = actor.outfit ?? d.outfit;
  const pants = actor.pants ?? d.pants;
  const hair = actor.hair ?? d.hair;
  const hairStyle = actor.hairStyle ?? d.hairStyle;
  const glow = actor.glowingEyes ? (actor.character === "monster" ? "#ff3b2f" : "#ffe14d") : undefined;
  const style: FaceStyle = { skin, iris: actor.eyeColor ?? d.iris, brow: hair ?? "#3b2a22", glow, blush: actor.character === "kid" || actor.character === "doll" };
  const common = { pose, t, opacity: pose.opacity, outfit, pants, shoes: d.shoes, hair, hairStyle };

  let body: React.ReactNode;
  switch (actor.character) {
    case "kid":
      body = <Humanoid b={BUILDS.kid} style={style} {...common} />;
      break;
    case "adult":
      body = <Humanoid b={BUILDS.adult} style={style} {...common} />;
      break;
    case "doll":
      body = <Humanoid b={BUILDS.doll} style={{ ...style, lips: "#c23a4a" }} dress {...common} pose={{ ...pose, headTilt: pose.headTilt + 0.22 }} />;
      break;
    case "monster":
      body = (
        <Humanoid b={BUILDS.monster} style={{ ...style, brow: "#1c2128", glow: glow ?? "#ff3b2f" }} horns {...common} hair={undefined} pose={{ ...pose, lean: pose.lean + 0.2 }} />
      );
      break;
    case "shadow_figure":
      body = <Humanoid b={BUILDS.shadow} style={{ ...style, glow: glow ?? "#f2f2ff" }} faceless {...common} hair={undefined} opacity={0.94 * pose.opacity} />;
      break;
    case "ghost":
      body = <Ghost pose={pose} t={t} opacity={pose.opacity} />;
      break;
    case "cat":
      body = <Cat pose={pose} t={t} opacity={pose.opacity} />;
      break;
  }

  return (
    <group position={pose.pos} rotation={[pose.rotX, pose.rotY, 0]} scale={pose.scale}>
      {body}
      {/* soft contact shadow: much cheaper than real-time shadows on a CPU */}
      {pose.rotX === 0 && (
        <mesh position={[0, 0.005 - pose.pos[1], 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[actor.character === "cat" ? 0.3 : actor.character === "doll" ? 0.25 : 0.42, 32]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.38 * pose.opacity} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Height of each character's eyes, for camera framing. */
const EYE_HEIGHT: Record<Actor["character"], number> = { kid: 1.12, adult: 1.74, doll: 0.86, monster: 2.95, shadow_figure: 2.85, ghost: 1.2, cat: 0.55 };

/** World-space point a camera should look at for this actor (roughly the face). */
export function actorFocus(actor: Actor, t: number, sceneDuration: number): [number, number, number] {
  const p = actorPose(actor, t, sceneDuration);
  const h = EYE_HEIGHT[actor.character] * p.scale;
  return [p.pos[0], p.pos[1] + (p.rotX !== 0 ? 0.7 : h), p.pos[2] + (p.rotX !== 0 ? -0.3 : 0)];
}
