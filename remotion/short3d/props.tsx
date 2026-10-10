// Props Claude can place in a scene. Chunky, rounded shapes in the same soft cartoon style.
import type { Prop } from "../../lib/short3d/spec";
import { Matte, Toon } from "./materials";
import { flickerAt, hashString, smooth } from "./util";

const deg = (d: number) => (d * Math.PI) / 180;

function Tree({ dead, seed }: { dead?: boolean; seed: number }) {
  const lean = ((seed % 100) / 100 - 0.5) * 0.15;
  if (dead) {
    return (
      <group rotation={[0, 0, lean]}>
        <mesh position={[0, 1.4, 0]}>
          <cylinderGeometry args={[0.08, 0.2, 2.8, 8]} />
          <Matte color="#2a1f1c" />
        </mesh>
        {[0.7, -0.6, 0.9, -0.8].map((r, i) => (
          <mesh key={i} position={[r * 0.35, 1.6 + i * 0.35, 0]} rotation={[0, i, r]}>
            <cylinderGeometry args={[0.025, 0.06, 1.1, 6]} />
            <Matte color="#2a1f1c" />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <group rotation={[0, 0, lean]}>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 1.4, 8]} />
        <Matte color="#3a2a22" />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 1.5 + i * 0.65, 0]}>
          <coneGeometry args={[1.0 - i * 0.25, 1.3, 10]} />
          <Toon color={["#1f3a2e", "#244234", "#2a4a3a"][i]} rough={0.8} sheen={0.2} />
        </mesh>
      ))}
    </group>
  );
}

export function PropView({ prop, t }: { prop: Prop; t: number }) {
  const seed = hashString(`${prop.type}${prop.x}${prop.z}`);
  const on = prop.active && t >= prop.start;
  const u = prop.active ? smooth((t - prop.start) / 1.4) : 0;
  const flick = flickerAt(t, seed % 17);
  let node: React.ReactNode = null;

  switch (prop.type) {
    case "bed":
      node = (
        <group>
          <mesh position={[0, 0.25, 0]} castShadow>
            <boxGeometry args={[1.2, 0.5, 2.1]} />
            <Toon color="#5a3d2b" rough={0.8} />
          </mesh>
          <mesh position={[0, 0.55, 0.05]}>
            <boxGeometry args={[1.15, 0.18, 1.95]} />
            <Toon color={prop.color ?? "#7c8fc4"} sheen={1} />
          </mesh>
          <mesh position={[0, 0.7, -0.75]} scale={[1, 0.45, 0.6]}>
            <sphereGeometry args={[0.38, 20, 14]} />
            <Toon color="#f1ece2" sheen={1} />
          </mesh>
          <mesh position={[0, 0.75, -1.07]}>
            <boxGeometry args={[1.25, 1.0, 0.1]} />
            <Toon color="#4a3122" rough={0.8} />
          </mesh>
        </group>
      );
      break;
    case "lamp":
      node = (
        <group>
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.03, 0.12, 1.2, 10]} />
            <Toon color="#8a7a6a" />
          </mesh>
          <mesh position={[0, 1.3, 0]}>
            <cylinderGeometry args={[0.15, 0.3, 0.35, 16, 1, true]} />
            <Toon color={prop.color ?? "#e9d7a8"} glow="#ffcf7a" glowIntensity={on ? 1.2 * flick : 0.05} />
          </mesh>
          {on && <pointLight position={[0, 1.25, 0]} intensity={6 * flick} distance={6} color="#ffc27a" />}
        </group>
      );
      break;
    case "door": {
      const open = prop.active ? u * 1.4 : 0;
      node = (
        <group>
          <mesh position={[0, 1.05, -0.06]}>
            <boxGeometry args={[1.1, 2.2, 0.1]} />
            <Matte color="#05040a" />
          </mesh>
          <group position={[-0.5, 0, 0]} rotation={[0, -open, 0]}>
            <mesh position={[0.5, 1.05, 0]}>
              <boxGeometry args={[1.0, 2.1, 0.08]} />
              <Toon color={prop.color ?? "#6b4630"} rough={0.75} />
            </mesh>
            <mesh position={[0.85, 1.0, 0.07]}>
              <sphereGeometry args={[0.05, 12, 12]} />
              <Toon color="#d8b25a" rough={0.2} />
            </mesh>
          </group>
          {open > 0.2 && (
            <group position={[0.15, 1.6, -0.3]}>
              {[-1, 1].map((s) => (
                <mesh key={s} position={[s * 0.07, 0, 0]}>
                  <sphereGeometry args={[0.035, 10, 10]} />
                  <meshBasicMaterial color="#ffe14d" />
                </mesh>
              ))}
            </group>
          )}
        </group>
      );
      break;
    }
    case "closet": {
      const open = prop.active ? u * 0.25 : 0.04;
      node = (
        <group>
          <mesh position={[0, 1.1, -0.3]}>
            <boxGeometry args={[1.3, 2.2, 0.6]} />
            <Toon color={prop.color ?? "#5d4636"} rough={0.8} />
          </mesh>
          <mesh position={[0, 1.1, 0.005]}>
            <boxGeometry args={[open * 2, 2.0, 0.02]} />
            <meshBasicMaterial color="#000000" />
          </mesh>
          {open > 0.1 &&
            [-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.05, 1.55, 0.02]}>
                <sphereGeometry args={[0.03, 10, 10]} />
                <meshBasicMaterial color="#ffe14d" />
              </mesh>
            ))}
        </group>
      );
      break;
    }
    case "window":
      node = (
        <group>
          <mesh position={[0, 1.6, 0]}>
            <planeGeometry args={[1.2, 1.4]} />
            <Matte color="#9fb2e6" glow="#7f96d8" glowIntensity={0.9} />
          </mesh>
          <mesh position={[0, 1.6, 0.01]}>
            <boxGeometry args={[0.06, 1.4, 0.04]} />
            <Matte color="#2a2230" />
          </mesh>
          <mesh position={[0, 1.6, 0.01]}>
            <boxGeometry args={[1.2, 0.06, 0.04]} />
            <Matte color="#2a2230" />
          </mesh>
          {prop.active && t >= prop.start && (
            // A silhouette appears in the window.
            <mesh position={[0.25, 1.5, 0.02]} scale={[0.6, 1, 1]}>
              <capsuleGeometry args={[0.18, 0.5, 6, 12]} />
              <meshBasicMaterial color="#05040a" transparent opacity={u} />
            </mesh>
          )}
        </group>
      );
      break;
    case "mirror":
      node = (
        <group>
          <mesh position={[0, 1.5, 0]} scale={[1, 1.4, 1]}>
            <torusGeometry args={[0.4, 0.06, 12, 40]} />
            <Toon color="#b08d4a" rough={0.3} />
          </mesh>
          <mesh position={[0, 1.5, -0.01]} scale={[1, 1.4, 1]}>
            <circleGeometry args={[0.4, 40]} />
            <meshStandardMaterial color="#9aa6b2" metalness={0.9} roughness={0.15} />
          </mesh>
          {prop.active && t >= prop.start && (
            <mesh position={[0.08, 1.55, 0.01]} scale={[0.8, 1, 0.2]}>
              <sphereGeometry args={[0.14, 16, 16]} />
              <meshBasicMaterial color="#e8e6dc" transparent opacity={0.8 * u} />
            </mesh>
          )}
        </group>
      );
      break;
    case "chair":
    case "rocking_chair": {
      const rock = prop.type === "rocking_chair" && on ? Math.sin((t - prop.start) * 2.4) * 0.18 : 0;
      node = (
        <group rotation={[rock, 0, 0]}>
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[0.55, 0.08, 0.55]} />
            <Toon color={prop.color ?? "#6b4a33"} rough={0.8} />
          </mesh>
          <mesh position={[0, 0.85, -0.25]}>
            <boxGeometry args={[0.55, 0.8, 0.06]} />
            <Toon color={prop.color ?? "#6b4a33"} rough={0.8} />
          </mesh>
          {[
            [-0.24, -0.24],
            [0.24, -0.24],
            [-0.24, 0.24],
            [0.24, 0.24],
          ].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.22, z]}>
              <cylinderGeometry args={[0.03, 0.03, 0.45, 6]} />
              <Toon color="#4a3122" />
            </mesh>
          ))}
          {prop.type === "rocking_chair" &&
            [-0.24, 0.24].map((x) => (
              <mesh key={x} position={[x, 0.02, 0]} rotation={[0, Math.PI / 2, 0]}>
                <torusGeometry args={[0.45, 0.025, 6, 20, Math.PI / 3]} />
                <Toon color="#4a3122" />
              </mesh>
            ))}
        </group>
      );
      break;
    }
    case "table":
      node = (
        <group>
          <mesh position={[0, 0.72, 0]}>
            <boxGeometry args={[1.2, 0.08, 0.7]} />
            <Toon color={prop.color ?? "#6b4a33"} rough={0.7} />
          </mesh>
          {[
            [-0.52, -0.28],
            [0.52, -0.28],
            [-0.52, 0.28],
            [0.52, 0.28],
          ].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.36, z]}>
              <cylinderGeometry args={[0.04, 0.04, 0.72, 6]} />
              <Toon color="#4a3122" />
            </mesh>
          ))}
        </group>
      );
      break;
    case "tv":
      node = (
        <group>
          <mesh position={[0, 0.75, 0]}>
            <boxGeometry args={[0.9, 0.7, 0.55]} />
            <Toon color="#3a3430" rough={0.6} />
          </mesh>
          <mesh position={[0, 0.77, 0.28]}>
            <planeGeometry args={[0.7, 0.52]} />
            <meshBasicMaterial color={on ? `hsl(220, 15%, ${45 + flick * 35}%)` : "#101418"} />
          </mesh>
          {on && <pointLight position={[0, 0.8, 0.8]} intensity={4 * flick} distance={5} color="#a8c4ff" />}
        </group>
      );
      break;
    case "phone":
      node = (
        <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.76, 0]}>
          <mesh>
            <boxGeometry args={[0.14, 0.28, 0.02]} />
            <Toon color="#1a1a20" rough={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.011]}>
            <planeGeometry args={[0.12, 0.25]} />
            <meshBasicMaterial color={on && Math.sin(t * 10) > -0.3 ? "#cfe0ff" : "#0d1018"} />
          </mesh>
          {on && <pointLight position={[0, 0, 0.3]} intensity={1.5} distance={2} color="#9fbfff" />}
        </group>
      );
      break;
    case "teddy":
      node = (
        <group position={[0, 0, 0]} rotation={[0, 0, on ? Math.sin(t * 1.3) * 0.15 : 0.1]}>
          <mesh position={[0, 0.18, 0]} scale={[1, 1.1, 0.9]}>
            <sphereGeometry args={[0.16, 18, 14]} />
            <Toon color={prop.color ?? "#9a6a44"} sheen={1} />
          </mesh>
          <mesh position={[0, 0.42, 0]}>
            <sphereGeometry args={[0.12, 18, 14]} />
            <Toon color={prop.color ?? "#9a6a44"} sheen={1} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.09, 0.52, 0]}>
              <sphereGeometry args={[0.045, 10, 10]} />
              <Toon color={prop.color ?? "#9a6a44"} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={`e${s}`} position={[s * 0.04, 0.44, 0.11]}>
              <sphereGeometry args={[0.018, 8, 8]} />
              {on ? <meshBasicMaterial color="#ff3b2f" /> : <Toon color="#111111" />}
            </mesh>
          ))}
        </group>
      );
      break;
    case "candle":
      node = (
        <group>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.04, 0.045, 0.24, 12]} />
            <Toon color="#efe6cf" />
          </mesh>
          <mesh position={[0, 0.29, 0]} scale={[1, 1.8 + Math.sin(t * 18 + seed) * 0.2, 1]}>
            <sphereGeometry args={[0.025, 10, 10]} />
            <meshBasicMaterial color="#ffd27a" />
          </mesh>
          <pointLight position={[0, 0.35, 0]} intensity={1.6 * flick} distance={3.5} color="#ffb35c" />
        </group>
      );
      break;
    case "tree":
      node = <Tree seed={seed} />;
      break;
    case "dead_tree":
      node = <Tree dead seed={seed} />;
      break;
    case "grave":
      node = (
        <group rotation={[0.06, 0, ((seed % 10) - 5) * 0.02]}>
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[0.6, 0.9, 0.15]} />
            <Toon color={prop.color ?? "#6d7078"} rough={0.95} />
          </mesh>
          <mesh position={[0, 0.9, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 0.15, 20, 1, false, 0, Math.PI]} />
            <Toon color={prop.color ?? "#6d7078"} rough={0.95} />
          </mesh>
          <mesh position={[0, 0.05, 0.45]} scale={[1, 0.25, 1.4]}>
            <sphereGeometry args={[0.4, 14, 10]} />
            <Matte color="#2a2a22" />
          </mesh>
        </group>
      );
      break;
    case "fence":
      node = (
        <group>
          {Array.from({ length: 7 }, (_, i) => (
            <mesh key={i} position={[(i - 3) * 0.3, 0.5, 0]}>
              <boxGeometry args={[0.07, 1.0 + ((seed >> i) % 3) * 0.05, 0.05]} />
              <Matte color="#1c1a1e" />
            </mesh>
          ))}
          <mesh position={[0, 0.75, 0]}>
            <boxGeometry args={[2.1, 0.05, 0.04]} />
            <Matte color="#1c1a1e" />
          </mesh>
        </group>
      );
      break;
    case "pumpkin":
      node = (
        <group>
          <mesh position={[0, 0.22, 0]} scale={[1.2, 0.85, 1.2]}>
            <sphereGeometry args={[0.25, 20, 14]} />
            <Toon color="#e0782a" glow={on ? "#ff9a3c" : undefined} glowIntensity={0.6 * flick} />
          </mesh>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.03, 0.04, 0.12, 6]} />
            <Toon color="#4a6a2a" />
          </mesh>
          {on && <pointLight position={[0, 0.25, 0.4]} intensity={2 * flick} distance={3} color="#ff9a3c" />}
        </group>
      );
      break;
    case "lantern":
      node = (
        <group>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.1, 0.12, 0.3, 8]} />
            <Toon color="#ffd27a" glow="#ffb84d" glowIntensity={1.5 * flick} opacity={0.9} />
          </mesh>
          <mesh position={[0, 0.45, 0]}>
            <coneGeometry args={[0.14, 0.12, 8]} />
            <Toon color="#2a2228" />
          </mesh>
          <pointLight position={[0, 0.3, 0]} intensity={3 * flick} distance={5} color="#ffb35c" />
        </group>
      );
      break;
    case "stairs":
      node = (
        <group>
          {Array.from({ length: 8 }, (_, i) => (
            <mesh key={i} position={[0, 0.1 + i * 0.2, -i * 0.28]}>
              <boxGeometry args={[1.0, 0.2, 0.3]} />
              <Toon color={prop.color ?? "#5a4636"} rough={0.85} />
            </mesh>
          ))}
        </group>
      );
      break;
    case "box":
      node = (
        <mesh position={[0, 0.3, 0]} rotation={[0, (seed % 10) * 0.1, 0]}>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <Toon color={prop.color ?? "#8a6a48"} rough={0.9} />
        </mesh>
      );
      break;
    case "music_box":
      node = (
        <group position={[0, 0, 0]}>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.3, 0.2, 0.22]} />
            <Toon color={prop.color ?? "#7a2a3a"} rough={0.4} />
          </mesh>
          <group position={[0, 0.2, 0]} rotation={[0, on ? (t - prop.start) * 2 : 0, 0]}>
            <mesh position={[0, 0.1, 0]}>
              <coneGeometry args={[0.05, 0.16, 10]} />
              <Toon color="#f2d6e0" />
            </mesh>
            <mesh position={[0, 0.21, 0]}>
              <sphereGeometry args={[0.035, 10, 10]} />
              <Toon color="#f6e7dc" />
            </mesh>
          </group>
        </group>
      );
      break;
  }
  return (
    <group position={[prop.x, 0, prop.z]} rotation={[0, deg(prop.rotation), 0]} scale={prop.scale}>
      {node}
    </group>
  );
}
