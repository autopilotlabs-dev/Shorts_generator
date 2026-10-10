// Caption/title fonts shared by the 2D and 3D compositions (served from /public/fonts).
import { staticFile } from "remotion";

const FONTS: [family: string, file: string, weight?: string][] = [
  ["Oswald", "fonts/Oswald-SemiBold.ttf"],
  ["Special Elite", "fonts/SpecialElite.ttf"],
  ["Creepster", "fonts/Creepster.ttf"],
  ["Plus Jakarta Sans", "fonts/PlusJakartaSans-SemiBold.ttf", "600"],
];

let loading: Promise<void> | null = null;
export function loadFonts(): Promise<void> {
  loading ??= Promise.all(
    FONTS.map(async ([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(file)})`, { weight: weight ?? "400" });
      document.fonts.add(await face.load());
    }),
  ).then(() => undefined);
  return loading;
}
