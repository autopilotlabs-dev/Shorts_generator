// Child-process entry: reads a SegmentJob as JSON on stdin, renders it, and
// reports progress as "frames <n>" lines on stdout.
import { renderSegment, type SegmentJob } from "./render-video";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", async () => {
  try {
    const job = JSON.parse(raw) as SegmentJob;
    await renderSegment(job, (n) => process.stdout.write(`frames ${n}\n`));
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  }
});
