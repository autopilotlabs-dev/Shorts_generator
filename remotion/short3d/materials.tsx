// Soft, slightly glossy "animated film" materials: smooth shading, gentle clearcoat, warm subsurface-ish tints.
export function Toon({ color, rough = 0.55, glow, glowIntensity = 1, opacity = 1, sheen = 0.4 }: { color: string; rough?: number; glow?: string; glowIntensity?: number; opacity?: number; sheen?: number }) {
  return (
    <meshPhysicalMaterial
      color={color}
      roughness={rough}
      clearcoat={0.35}
      clearcoatRoughness={0.4}
      sheen={sheen}
      sheenColor="#ffffff"
      emissive={glow ?? "#000000"}
      emissiveIntensity={glow ? glowIntensity : 0}
      transparent={opacity < 1}
      opacity={opacity}
    />
  );
}

/** Cheaper matte material for large set surfaces. */
export function Matte({ color, rough = 0.9, glow, glowIntensity = 1 }: { color: string; rough?: number; glow?: string; glowIntensity?: number }) {
  return <meshStandardMaterial color={color} roughness={rough} emissive={glow ?? "#000000"} emissiveIntensity={glow ? glowIntensity : 0} />;
}
