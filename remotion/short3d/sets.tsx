// Scene sets: ground, walls and built-in dressing. Actors stand around x=0, z=0;
// the camera looks from +z toward -z.
import type { Scene3D } from "../../lib/short3d/spec";
import { Matte, Toon } from "./materials";
import { PropView } from "./props";
import { useMemo } from "react";
import { rng } from "./util";

function Ground({ color, size = 60 }: { color: string; size?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <Matte color={color} />
    </mesh>
  );
}

function Room({ wall, floor, width = 7, depth = 7, height = 3.2 }: { wall: string; floor: string; width?: number; depth?: number; height?: number }) {
  return (
    <group>
      <Ground color={floor} size={30} />
      <mesh position={[0, height / 2, -depth / 2]}>
        <planeGeometry args={[width, height]} />
        <Matte color={wall} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * width) / 2, height / 2, 0]} rotation={[0, -s * (Math.PI / 2), 0]}>
          <planeGeometry args={[depth * 2, height]} />
          <Matte color={wall} />
        </mesh>
      ))}
      <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth * 2]} />
        <Matte color="#15121a" />
      </mesh>
      {/* skirting board */}
      <mesh position={[0, 0.06, -depth / 2 + 0.02]}>
        <boxGeometry args={[width, 0.12, 0.04]} />
        <Matte color="#2a2026" />
      </mesh>
    </group>
  );
}

function Moon({ position = [-8, 12, -45] as [number, number, number], size = 1.6 }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 32, 24]} />
      <meshBasicMaterial color="#f3f0dc" fog={false} />
    </mesh>
  );
}

/** All stars in one draw call (cheap on software WebGL). */
function Stars({ seed }: { seed: number }) {
  const positions = useMemo(() => {
    const r = rng(seed);
    const arr = new Float32Array(90 * 3);
    for (let i = 0; i < 90; i++) {
      arr[i * 3] = (r() - 0.5) * 90;
      arr[i * 3 + 1] = 8 + r() * 28;
      arr[i * 3 + 2] = -38 - r() * 10;
    }
    return arr;
  }, [seed]);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#e8ecff" size={2.2} sizeAttenuation={false} fog={false} />
    </points>
  );
}

function House({ lit, t }: { lit: boolean; t: number }) {
  return (
    <group position={[0, 0, -9]}>
      <mesh position={[0, 1.8, 0]} castShadow>
        <boxGeometry args={[6, 3.6, 4]} />
        <Toon color="#3a3348" rough={0.9} />
      </mesh>
      <mesh position={[0, 4.4, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[4.6, 2.2, 4]} />
        <Toon color="#1f1a29" rough={0.9} />
      </mesh>
      <mesh position={[2.2, 4.6, -0.4]}>
        <boxGeometry args={[0.6, 1.6, 0.6]} />
        <Toon color="#2a2433" />
      </mesh>
      {[
        [-1.7, 2.4],
        [1.7, 2.4],
        [-1.7, 0.9],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 2.01]}>
          <planeGeometry args={[0.9, 1.1]} />
          <Matte color={lit && i === 0 ? "#ffd27a" : "#1a1830"} glow={lit && i === 0 ? "#ffb84d" : undefined} glowIntensity={1.4 + Math.sin(t * 7) * 0.2} />
        </mesh>
      ))}
      <mesh position={[0.9, 0.95, 2.01]}>
        <planeGeometry args={[1.0, 1.9]} />
        <Matte color="#2a1a14" />
      </mesh>
      {/* porch */}
      <mesh position={[0.9, 0.08, 2.6]}>
        <boxGeometry args={[2.4, 0.16, 1.2]} />
        <Toon color="#3b2c24" />
      </mesh>
    </group>
  );
}

export function SetView({ scene, t }: { scene: Scene3D; t: number }) {
  const seed = scene.id.length * 131 + scene.set.length;
  const r = rng(seed);
  switch (scene.set) {
    case "bedroom":
      return (
        <group>
          <Room wall="#3d4766" floor="#5a4032" />
          <mesh position={[0.2, 0.01, 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1.3, 40]} />
            <Matte color="#7a3a48" />
          </mesh>
          <PropView prop={{ type: "window", x: 1.6, z: -3.45, rotation: 0, scale: 1, active: false, start: 0 }} t={t} />
        </group>
      );
    case "hallway":
      return (
        <group>
          <Ground color="#4a3830" size={40} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh position={[s * 1.4, 1.5, -6]} rotation={[0, -s * (Math.PI / 2), 0]}>
                <planeGeometry args={[20, 3]} />
                <Matte color="#5a4a5e" />
              </mesh>
              {[-1, -4.5, -8, -11.5].map((z, i) => (
                <group key={z} position={[s * 1.38, 0, z]} rotation={[0, -s * (Math.PI / 2), 0]}>
                  <mesh position={[0, 1.05, 0.01]}>
                    <planeGeometry args={[0.95, 2.1]} />
                    <Toon color={i % 2 ? "#4a3022" : "#5b3a28"} />
                  </mesh>
                  <mesh position={[0.3, 1.0, 0.03]}>
                    <sphereGeometry args={[0.04, 10, 10]} />
                    <Toon color="#d8b25a" rough={0.3} />
                  </mesh>
                </group>
              ))}
            </group>
          ))}
          <mesh position={[0, 3, -6]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[2.8, 20]} />
            <Matte color="#241c26" />
          </mesh>
          <mesh position={[0, 1.5, -16]}>
            <planeGeometry args={[2.8, 3]} />
            <Matte color="#05040a" />
          </mesh>
          {/* runner carpet */}
          <mesh position={[0, 0.01, -6]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.1, 20]} />
            <Matte color="#6a2a34" />
          </mesh>
        </group>
      );
    case "house_exterior":
      return (
        <group>
          <Ground color="#232a2a" />
          <Stars seed={seed} />
          <Moon />
          <House lit t={t} />
          {Array.from({ length: 6 }, (_, i) => (
            <PropView key={i} prop={{ type: "dead_tree", x: (i % 2 ? 1 : -1) * (4 + r() * 4), z: -3 - r() * 10, rotation: r() * 360, scale: 0.9 + r() * 0.6, active: false, start: 0 }} t={t} />
          ))}
          {[-2.6, 2.6].map((x) => (
            <PropView key={x} prop={{ type: "fence", x, z: -4.5, rotation: 0, scale: 1, active: false, start: 0 }} t={t} />
          ))}
        </group>
      );
    case "forest":
      return (
        <group>
          <Ground color="#1f2a22" />
          <Stars seed={seed} />
          <Moon position={[7, 13, -45]} size={1.4} />
          {/* path */}
          <mesh position={[0, 0.01, -8]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.6, 24]} />
            <Matte color="#3a3026" />
          </mesh>
          {Array.from({ length: 16 }, (_, i) => {
            const side = i % 2 ? 1 : -1;
            return (
              <PropView
                key={i}
                prop={{ type: r() > 0.3 ? "tree" : "dead_tree", x: side * (1.8 + r() * 5), z: 1 - r() * 16, rotation: r() * 360, scale: 0.9 + r() * 0.9, active: false, start: 0 }}
                t={t}
              />
            );
          })}
        </group>
      );
    case "graveyard":
      return (
        <group>
          <Ground color="#262c26" />
          <Stars seed={seed} />
          <Moon position={[-6, 11, -45]} />
          {Array.from({ length: 14 }, (_, i) => (
            <PropView key={i} prop={{ type: "grave", x: ((i % 5) - 2) * 1.8 + (r() - 0.5) * 0.6, z: -2.5 - Math.floor(i / 5) * 2.2 - r(), rotation: (r() - 0.5) * 20, scale: 0.8 + r() * 0.5, active: false, start: 0 }} t={t} />
          ))}
          {[-5, 5].map((x) => (
            <PropView key={x} prop={{ type: "dead_tree", x, z: -7, rotation: x * 10, scale: 1.4, active: false, start: 0 }} t={t} />
          ))}
          {[-4, -2, 0, 2, 4].map((x) => (
            <PropView key={`f${x}`} prop={{ type: "fence", x, z: -10, rotation: 0, scale: 1, active: false, start: 0 }} t={t} />
          ))}
        </group>
      );
    case "lake":
      return (
        <group>
          <Ground color="#1d2420" />
          <Stars seed={seed} />
          <Moon position={[0, 11, -48]} size={1.9} />
          <mesh position={[0, 0.02, -12]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[11, 48]} />
            <meshStandardMaterial color="#0f1a2c" metalness={0.6} roughness={0.15} />
          </mesh>
          {/* dock */}
          <mesh position={[0, 0.15, -3]}>
            <boxGeometry args={[1.2, 0.1, 5]} />
            <Toon color="#4a3828" rough={0.9} />
          </mesh>
          {/* moon path on water */}
          <mesh position={[0, 0.03, -14]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.8 + Math.sin(t * 2) * 0.1, 14]} />
            <meshBasicMaterial color="#c8d4ff" transparent opacity={0.25} />
          </mesh>
          {Array.from({ length: 10 }, (_, i) => (
            <PropView key={i} prop={{ type: r() > 0.4 ? "tree" : "dead_tree", x: (i % 2 ? 1 : -1) * (9 + r() * 4), z: -6 - r() * 14, rotation: r() * 360, scale: 1 + r() * 0.8, active: false, start: 0 }} t={t} />
          ))}
        </group>
      );
    case "basement":
      return (
        <group>
          <Room wall="#4a4a46" floor="#3a3a38" width={8} />
          <PropView prop={{ type: "stairs", x: -2.6, z: -0.8, rotation: 0, scale: 1, active: false, start: 0 }} t={t} />
          {[
            [2.4, -2.5],
            [2.9, -1.9],
            [2.5, -1.4],
          ].map(([x, z], i) => (
            <PropView key={i} prop={{ type: "box", x, z, rotation: i * 20, scale: 0.8 + i * 0.15, active: false, start: 0 }} t={t} />
          ))}
          {/* hanging bulb */}
          <group position={[0.4, 3.2, -1]} rotation={[0, 0, Math.sin(t * 1.3) * 0.12]}>
            <mesh position={[0, -0.4, 0]}>
              <cylinderGeometry args={[0.008, 0.008, 0.8, 4]} />
              <Matte color="#111111" />
            </mesh>
            <mesh position={[0, -0.85, 0]}>
              <sphereGeometry args={[0.08, 14, 12]} />
              <meshBasicMaterial color="#fff2c8" />
            </mesh>
          </group>
        </group>
      );
    case "void":
    default:
      return <Ground color="#08070c" />;
  }
}
