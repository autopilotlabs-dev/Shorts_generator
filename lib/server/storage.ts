// Media storage behind one interface:
//  - "local": files under DATA_DIR/media (personal use, single machine)
//  - "s3":    any S3-compatible bucket (Cloudflare R2, AWS S3, MinIO) for production
// Objects are addressed by key: `<userId>/<projectId>/<file>`. Browsers fetch them through
// /api/media/<key> (session-checked); the render worker gets short-lived signed URLs.
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StoredObject {
  body: ReadableStream;
  size: number;
  contentType: string;
  status: 200 | 206;
  range?: string;
}

export interface Storage {
  put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  /** Stream an object, honouring an optional HTTP Range header. Null if missing. */
  open(key: string, range?: string | null): Promise<StoredObject | null>;
  /** URL another process (the render worker's browser) can fetch without a session. */
  signedUrl(key: string, expiresInSec?: number): Promise<string>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};
export const contentTypeOf = (key: string) => TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream";

/** Keys are generated server-side; still reject anything that could escape a prefix. */
export function isSafeKey(key: string): boolean {
  return /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)+$/.test(key) && !key.split("/").some((p) => p === "." || p === "..");
}

function secret() {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("BETTER_AUTH_SECRET is not set");
  return s;
}

export function signKey(key: string, exp: number): string {
  return createHmac("sha256", secret()).update(`${key}:${exp}`).digest("base64url");
}

export function verifySignature(key: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = Buffer.from(signKey(key, Number(exp)));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function parseRange(range: string | null | undefined, size: number): [number, number] | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range || "");
  if (!m || (!m[1] && !m[2])) return null;
  let start = m[1] ? Number(m[1]) : size - Number(m[2]);
  let end = m[1] && m[2] ? Number(m[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  return start <= end ? [start, end] : null;
}

class LocalStorage implements Storage {
  constructor(private root: string) {}

  private file(key: string) {
    if (!isSafeKey(key)) throw new Error("Invalid storage key");
    return path.join(this.root, ...key.split("/"));
  }

  async put(key: string, data: Buffer | Uint8Array) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, data);
  }

  read(key: string) {
    return readFile(this.file(key));
  }

  async open(key: string, range?: string | null): Promise<StoredObject | null> {
    const f = this.file(key);
    const info = await stat(f).catch(() => null);
    if (!info?.isFile()) return null;
    const r = parseRange(range, info.size);
    const stream = r ? createReadStream(f, { start: r[0], end: r[1] }) : createReadStream(f);
    return {
      body: Readable.toWeb(stream) as ReadableStream,
      size: r ? r[1] - r[0] + 1 : info.size,
      contentType: contentTypeOf(key),
      status: r ? 206 : 200,
      range: r ? `bytes ${r[0]}-${r[1]}/${info.size}` : undefined,
    };
  }

  async signedUrl(key: string, expiresInSec = 3600) {
    const base = (process.env.INTERNAL_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
    const exp = Math.floor(Date.now() / 1000) + expiresInSec;
    return `${base}/api/media/${key}?exp=${exp}&sig=${signKey(key, exp)}`;
  }

  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }

  async deletePrefix(prefix: string) {
    if (!isSafeKey(prefix)) return;
    await rm(this.file(prefix), { recursive: true, force: true });
  }
}

class S3Storage implements Storage {
  private client: S3Client;
  constructor(private bucket: string) {
    this.client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async put(key: string, data: Buffer | Uint8Array, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }));
  }

  async read(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }

  async open(key: string, range?: string | null): Promise<StoredObject | null> {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range || undefined }));
      return {
        body: r.Body!.transformToWebStream() as ReadableStream,
        size: r.ContentLength ?? 0,
        contentType: r.ContentType || contentTypeOf(key),
        status: r.ContentRange ? 206 : 200,
        range: r.ContentRange,
      };
    } catch (err) {
      if ((err as { name?: string }).name === "NoSuchKey") return null;
      throw err;
    }
  }

  signedUrl(key: string, expiresInSec = 3600) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSec });
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: [{ Key: key }] } }));
  }

  async deletePrefix(prefix: string) {
    let token: string | undefined;
    do {
      const list = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: `${prefix}/`, ContinuationToken: token }));
      const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys } }));
      token = list.NextContinuationToken;
    } while (token);
  }
}

let instance: Storage | undefined;
export function storage(): Storage {
  if (!instance) {
    const driver = process.env.STORAGE_DRIVER || "local";
    if (driver === "s3") {
      if (!process.env.S3_BUCKET) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
      instance = new S3Storage(process.env.S3_BUCKET);
    } else {
      const dataDir = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || "data");
      instance = new LocalStorage(path.join(dataDir, "media"));
    }
  }
  return instance;
}

export const newFileId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);
export const projectPrefix = (userId: string, projectId: string) => `${userId}/${projectId}`;
