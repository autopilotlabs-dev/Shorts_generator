// Soft, smooth "animated film" materials. Standard (not physical) shading: clearcoat/sheen cost ~10% more
// render time on CPU-only machines for little visible difference at this size.
export function Toon({ color, rough = 0.5, glow, glowIntensity = 1, opacity = 1 }: { color: string; rough?: number; glow?: string; glowIntensity?: number; opacity?: number; sheen?: number }) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={rough}
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
