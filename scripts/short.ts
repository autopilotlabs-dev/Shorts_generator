// CLI for 3D cartoon horror shorts. Usage:
//   npm run short -- new <name>       scaffold shorts/<name>/short.json
//   npm run short -- check <name>     validate the spec and show timing
//   npm run short -- preview <name>   render one still per scene to shorts/<name>/preview/
//   npm run short -- render <name>    render shorts/<name>/out/<name>.mp4
//   npm run short -- voices           list narrator voices
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadSpec, preview, render, ROOT, shortDir, VOICES } from "../lib/short3d/pipeline";

const [cmd, name, ...rest] = process.argv.slice(2);

function needName() {
  if (!name || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(name)) {
    console.error("Give the short a name made of lowercase letters, digits and dashes, e.g. npm run short -- new the-knock");
    process.exit(1);
  }
}

async function main() {
  switch (cmd) {
    case "new": {
      needName();
      const dir = shortDir(name);
      if (existsSync(path.join(dir, "short.json"))) throw new Error(`shorts/${name}/short.json already exists.`);
      await mkdir(path.join(dir, "scenes"), { recursive: true });
      const template = await readFile(path.join(ROOT, "shorts", "_template", "short.json"), "utf8");
      await writeFile(path.join(dir, "short.json"), template);
      console.log(`Created shorts/${name}/short.json — edit it, then: npm run short -- preview ${name}`);
      break;
    }
    case "check": {
      needName();
      const spec = await loadSpec(name);
      const words = spec.scenes.reduce((a, s) => a + s.narration.split(/\s+/).filter(Boolean).length, 0);
      console.log(`OK: "${spec.title}", ${spec.scenes.length} scenes, ${words} narrated words (≈ ${(words / 2.3).toFixed(0)}s of narration before pauses).`);
      break;
    }
    case "preview": {
      needName();
      const at = rest.includes("--frames") ? [0.15, 0.55, 0.9] : undefined;
      await preview(name, { at });
      break;
    }
    case "render":
      needName();
      await render(name);
      break;
    case "voices":
      console.log(VOICES.join("\n"));
      break;
    default:
      console.log("Commands: new <name> | check <name> | preview <name> [--frames] | render <name> | voices");
  }
}

main().catch((err) => {
  console.error(`\n✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
