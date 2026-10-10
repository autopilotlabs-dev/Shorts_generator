// Stylised 3D cartoon characters built from rounded primitives: big heads, big eyes,
// soft materials. Fully procedural and frame-deterministic.
import { type Actor } from "../../lib/short3d/spec";
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
  if (a.action !== "reveal" && !started && ["walk_in", "run", "walk_left", "walk_right"].includes(a.action)) p.visible = true;
  return p;
}

// ---------- face ----------

function Eyes({ y, z, gap, r, expression, blink, skin, glowing, pupilColor = "#1b1320" }: { y: number; z: number; gap: number; r: number; expression: Expression; blink: number; skin: string; glowing?: string; pupilColor?: string }) {
  const big = { scared: 1.22, surprised: 1.32, creepy_smile: 0.9, smile: 0.95, angry: 0.95, neutral: 1, closed: 1 }[expression];
  const pupil = { scared: 0.32, surprised: 0.42, creepy_smile: 0.22, smile: 0.5, angry: 0.45, neutral: 0.5, closed: 0.5 }[expression];
  const lid = expression === "closed" ? 1 : Math.max(blink, expression === "smile" ? 0.35 : expression === "creepy_smile" ? 0.45 : expression === "angry" ? 0.3 : 0);
  return (
    <group position={[0, y, z]}>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * gap, 0, 0]} scale={[big, big, big]}>
          <mesh scale={[1, 1.15, 0.75]}>
            <sphereGeometry args={[r, 24, 24]} />
            {glowing ? <meshBasicMaterial color={glowing} /> : <Toon color="#fbfbf7" rough={0.15} />}
          </mesh>
          {!glowing && (
            <>
              <mesh position={[0, -r * 0.05, r * 0.62]} scale={[1, 1.1, 0.5]}>
                <sphereGeometry args={[r * pupil, 20, 20]} />
                <Toon color={pupilColor} rough={0.1} />
              </mesh>
              <mesh position={[r * 0.2, r * 0.28, r * 0.78]}>
                <sphereGeometry args={[r * 0.14, 10, 10]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </>
          )}
          {lid > 0.01 && (
            // Upper eyelid: a skin-coloured cap that slides down over the eye.
            <mesh position={[0, r * 1.15 * (1 - lid * 1.1), r * 0.05]} scale={[1.08, 1.2 * lid + 0.05, 0.75]}>
              <sphereGeometry args={[r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <Toon color={skin} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function Brows({ y, z, gap, w, expression, color }: { y: number; z: number; gap: number; w: number; expression: Expression; color: string }) {
  const [lift, angle] = {
    scared: [0.04, 0.35],
    surprised: [0.07, 0.1],
    creepy_smile: [-0.01, -0.3],
    smile: [0.02, 0.05],
    angry: [-0.02, -0.45],
    neutral: [0, 0],
    closed: [-0.005, 0],
  }[expression];
  return (
    <group position={[0, y + lift, z]}>
      {[-1, 1].map((side) => (
        // Capsules are vertical by default; rotate to horizontal, then tilt per expression.
        <mesh key={side} position={[side * gap, 0, 0]} rotation={[0, 0, Math.PI / 2 + side * angle]}>
          <capsuleGeometry args={[w * 0.12, w * 0.8, 4, 8]} />
          <Toon color={color} />
        </mesh>
      ))}
    </group>
  );
}

function Mouth({ y, z, size, expression, t }: { y: number; z: number; size: number; expression: Expression; t: number }) {
  const dark = "#3a1418";
  if (expression === "surprised" || expression === "scared") {
    const open = expression === "surprised" ? 1 : 0.6 + Math.sin(t * 14) * 0.08;
    return (
      <mesh position={[0, y, z]} scale={[0.8, open * 1.1, 0.4]}>
        <sphereGeometry args={[size * 0.5, 16, 16]} />
        <Toon color={dark} rough={0.3} />
      </mesh>
    );
  }
  if (expression === "creepy_smile") {
    return (
      <group position={[0, y, z]}>
        <mesh rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[size * 1.15, size * 0.14, 8, 24, Math.PI]} />
          <Toon color={dark} />
        </mesh>
        <mesh position={[0, -size * 0.75, size * 0.05]} scale={[1, 0.25, 0.3]}>
          <boxGeometry args={[size * 1.6, size * 0.5, size * 0.3]} />
          <Toon color="#f4efe0" rough={0.2} />
        </mesh>
      </group>
    );
  }
  const frown = expression === "angry";
  const width = expression === "smile" ? 0.75 : expression === "closed" ? 0.4 : 0.5;
  return (
    <mesh position={[0, y + (frown ? -size * 0.3 : 0), z]} rotation={[0, 0, frown ? 0 : Math.PI]}>
      <torusGeometry args={[size * width, size * 0.1, 8, 20, Math.PI]} />
      <Toon color={dark} />
    </mesh>
  );
}

// ---------- humanoid ----------

interface Build {
  legLen: number;
  legR: number;
  bodyR: number;
  bodyLen: number;
  headR: number;
  armLen: number;
  armR: number;
  headStretch?: number;
}

const KID: Build = { legLen: 0.24, legR: 0.085, bodyR: 0.22, bodyLen: 0.24, headR: 0.37, armLen: 0.28, armR: 0.065 };
const ADULT: Build = { legLen: 0.48, legR: 0.1, bodyR: 0.26, bodyLen: 0.42, headR: 0.32, armLen: 0.46, armR: 0.075 };
const MONSTER: Build = { legLen: 0.85, legR: 0.09, bodyR: 0.2, bodyLen: 0.8, headR: 0.24, armLen: 1.0, armR: 0.06, headStretch: 1.35 };

function Humanoid({
  b,
  pose,
  t,
  skin,
  outfit,
  hair,
  pants,
  glowEyes,
  opacity,
  hairStyle = "cap",
  faceless = false,
  extra,
}: {
  b: Build;
  pose: ActorPose;
  t: number;
  skin: string;
  outfit: string;
  hair?: string;
  pants: string;
  glowEyes?: string;
  opacity: number;
  hairStyle?: "cap" | "long" | "none" | "horns";
  faceless?: boolean;
  extra?: React.ReactNode;
}) {
  const hipY = b.legR + b.legLen + b.legR * 0.5;
  const bodyY = hipY + b.bodyLen / 2 + b.bodyR * 0.55;
  const shoulderY = bodyY + b.bodyLen / 2 + b.bodyR * 0.25;
  const headY = shoulderY + b.headR * (b.headStretch ?? 1) * 0.92;
  const swing = Math.sin(pose.walk) * 0.55 * pose.stride;
  const legLen = b.legLen + b.legR;
  const armLen = b.armLen + b.armR;
  const shiver = pose.expression === "scared" ? Math.sin(t * 40) * 0.02 : 0;
  const hs = b.headStretch ?? 1;
  return (
    <group rotation={[pose.lean, 0, 0]}>
      {/* legs */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * b.bodyR * 0.48, hipY, 0]} rotation={[side * swing, 0, 0]}>
          <mesh position={[0, -legLen / 2, 0]} castShadow>
            <capsuleGeometry args={[b.legR, b.legLen, 6, 14]} />
            <Toon color={pants} opacity={opacity} />
          </mesh>
          <mesh position={[0, -legLen + 0.01, b.legR * 0.6]} scale={[1, 0.6, 1.5]}>
            <sphereGeometry args={[b.legR * 1.2, 14, 10]} />
            <Toon color="#2a2228" opacity={opacity} />
          </mesh>
        </group>
      ))}
      {/* body */}
      <mesh position={[0, bodyY, 0]} castShadow>
        <capsuleGeometry args={[b.bodyR, b.bodyLen, 8, 20]} />
        <Toon color={outfit} opacity={opacity} sheen={0.8} />
      </mesh>
      {/* arms */}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * (b.bodyR + b.armR * 0.7), shoulderY - b.armR, 0]}
          rotation={[-side * swing * 0.9 - pose.armsUp * 1.6, 0, side * (0.12 + pose.armsUp * 0.35)]}
        >
          <mesh position={[0, -armLen / 2, 0]} castShadow>
            <capsuleGeometry args={[b.armR, b.armLen, 6, 12]} />
            <Toon color={outfit} opacity={opacity} sheen={0.8} />
          </mesh>
          <mesh position={[0, -armLen - b.armR * 0.4, 0]}>
            <sphereGeometry args={[b.armR * 1.25, 14, 12]} />
            <Toon color={skin} opacity={opacity} />
          </mesh>
        </group>
      ))}
      {/* head */}
      <group position={[shiver, headY, 0]} rotation={[pose.headTilt * 0.4, pose.headYaw, pose.headTilt]}>
        <mesh scale={[1, hs, 1]} castShadow>
          <sphereGeometry args={[b.headR, 40, 32]} />
          <Toon color={skin} opacity={opacity} rough={0.5} />
        </mesh>
        {!faceless && (
          <>
            <Eyes
              y={b.headR * 0.05 * hs}
              z={b.headR * 0.84}
              gap={b.headR * 0.36}
              r={b.headR * 0.27}
              expression={pose.expression}
              blink={pose.blink}
              skin={skin}
              glowing={glowEyes}
            />
            <Brows y={b.headR * 0.4 * hs} z={b.headR * 0.88} gap={b.headR * 0.36} w={b.headR * 0.35} expression={pose.expression} color={hair ?? "#3b2a22"} />
            <mesh position={[0, -b.headR * 0.12 * hs, b.headR * 0.97]}>
              <sphereGeometry args={[b.headR * 0.09, 12, 12]} />
              <Toon color={skin} opacity={opacity} />
            </mesh>
            <Mouth y={-b.headR * 0.38 * hs} z={b.headR * 0.9} size={b.headR * 0.22} expression={pose.expression} t={t} />
          </>
        )}
        {faceless && glowEyes && (
          <Eyes y={b.headR * 0.1 * hs} z={b.headR * 0.85} gap={b.headR * 0.32} r={b.headR * 0.13} expression="neutral" blink={pose.blink} skin={skin} glowing={glowEyes} />
        )}
        {hair && hairStyle === "cap" && (
          <mesh position={[0, b.headR * 0.06, -b.headR * 0.06]} rotation={[-0.75, 0, 0]} scale={[1.07, 1.03, 1.07]}>
            <sphereGeometry args={[b.headR, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            <Toon color={hair} opacity={opacity} sheen={0.9} />
          </mesh>
        )}
        {hair && hairStyle === "long" && (
          <>
            <mesh position={[0, b.headR * 0.06, -b.headR * 0.06]} rotation={[-0.7, 0, 0]} scale={[1.08, 1.04, 1.08]}>
              <sphereGeometry args={[b.headR, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
              <Toon color={hair} opacity={opacity} sheen={0.9} />
            </mesh>
            <mesh position={[0, -b.headR * 0.45, -b.headR * 0.35]} scale={[1.05, 1.4, 0.6]}>
              <sphereGeometry args={[b.headR * 0.95, 24, 16]} />
              <Toon color={hair} opacity={opacity} sheen={0.9} />
            </mesh>
          </>
        )}
        {hairStyle === "horns" &&
          [-1, 1].map((side) => (
            <mesh key={side} position={[side * b.headR * 0.55, b.headR * 0.85 * hs, 0]} rotation={[0, 0, -side * 0.45]}>
              <coneGeometry args={[b.headR * 0.18, b.headR * 0.8, 12]} />
              <Toon color="#2b2422" opacity={opacity} />
            </mesh>
          ))}
      </group>
      {extra}
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

const DEFAULTS: Record<Actor["character"], { skin: string; outfit: string; hair?: string; pants: string }> = {
  kid: { skin: "#f2c4a0", outfit: "#e8b04a", hair: "#5a3420", pants: "#36507a" },
  adult: { skin: "#e6b591", outfit: "#6b7f5a", hair: "#2c2420", pants: "#3a3430" },
  monster: { skin: "#4a4f5c", outfit: "#2a2d36", pants: "#22252d" },
  shadow_figure: { skin: "#050507", outfit: "#050507", pants: "#050507" },
  doll: { skin: "#f6e7dc", outfit: "#b23a48", hair: "#c9a050", pants: "#f6e7dc" },
  ghost: { skin: "#eef3ff", outfit: "#eef3ff", pants: "#eef3ff" },
  cat: { skin: "#1d1a22", outfit: "#1d1a22", pants: "#1d1a22" },
};

export function Character({ actor, t, sceneDuration }: { actor: Actor; t: number; sceneDuration: number }) {
  const pose = actorPose(actor, t, sceneDuration);
  if (!pose.visible) return null;
  const d = DEFAULTS[actor.character];
  const skin = actor.skin ?? d.skin;
  const outfit = actor.outfit ?? d.outfit;
  const hair = actor.hair ?? d.hair;
  const glow = actor.glowingEyes ? (actor.character === "monster" ? "#ff3b2f" : "#ffe14d") : undefined;
  const common = { pose, t, opacity: pose.opacity };

  let body: React.ReactNode;
  switch (actor.character) {
    case "kid":
      body = <Humanoid b={KID} skin={skin} outfit={outfit} hair={hair} pants={d.pants} glowEyes={glow} {...common} />;
      break;
    case "adult":
      body = <Humanoid b={ADULT} skin={skin} outfit={outfit} hair={hair} pants={d.pants} glowEyes={glow} {...common} />;
      break;
    case "doll":
      body = <Humanoid b={{ ...KID, headR: 0.4 }} skin={skin} outfit={outfit} hair={hair} hairStyle="long" pants={skin} glowEyes={glow} {...common} pose={{ ...pose, headTilt: pose.headTilt + 0.25 }} />;
      break;
    case "monster":
      body = (
        <Humanoid b={MONSTER} skin={skin} outfit={outfit} pants={d.pants} hairStyle="horns" glowEyes={glow ?? "#ff3b2f"} {...common} pose={{ ...pose, lean: pose.lean + 0.18 }} />
      );
      break;
    case "shadow_figure":
      body = (
        <Humanoid b={{ ...MONSTER, bodyR: 0.17, headR: 0.22 }} skin={skin} outfit={outfit} pants={d.pants} hairStyle="none" faceless glowEyes={glow ?? "#f2f2ff"} {...common} opacity={0.92 * pose.opacity} />
      );
      break;
    case "ghost":
      body = <Ghost {...common} />;
      break;
    case "cat":
      body = <Cat {...common} />;
      break;
  }

  return (
    <group position={pose.pos} rotation={[pose.rotX, pose.rotY, 0]} scale={pose.scale}>
      {body}
      {/* soft contact shadow: cheaper than real-time shadows and very "animated film" */}
      {pose.rotX === 0 && (
        <mesh position={[0, 0.005 - pose.pos[1], 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[actor.character === "cat" ? 0.3 : 0.45, 32]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35 * pose.opacity} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** World-space point a camera should look at for this actor (roughly the face). */
export function actorFocus(actor: Actor, t: number, sceneDuration: number): [number, number, number] {
  const p = actorPose(actor, t, sceneDuration);
  const h = { kid: 1.15, adult: 1.6, doll: 1.1, monster: 2.5, shadow_figure: 2.3, ghost: 1.1, cat: 0.5 }[actor.character] * p.scale;
  return [p.pos[0], p.pos[1] + (p.rotX !== 0 ? 0.7 : h), p.pos[2] + (p.rotX !== 0 ? -0.3 : 0)];
}
