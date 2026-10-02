import { randomBytes } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Media uploaded from the admin panel (exercise animations). The file is
// written to MEDIA_ROOT on the instance, which serves it through
// app/media/[...path], and copied to the media bucket under uploads/ so a
// recreated instance can restore it ('aws s3 sync s3://<bucket>/uploads <MEDIA_ROOT>').

export const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

const TYPES = {
  gif: "image/gif",
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  mp4: "video/mp4",
} as const;
export type MediaExtension = keyof typeof TYPES;

/** Identify the file by its first bytes, never by the name or the browser's claim. */
export function sniffMedia(bytes: Uint8Array): MediaExtension | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length < 12) return null;
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (ascii(4, 8) === "ftyp") return "mp4";
  return null;
}

export function mediaContentType(file: string): string | null {
  const ext = path.extname(file).slice(1).toLowerCase();
  return ext in TYPES ? TYPES[ext as MediaExtension] : null;
}

export function mediaRoot(): string {
  return process.env.MEDIA_ROOT || path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "media");
}

// Only names this module generates: folder/hex.ext. Anything else (dots,
// slashes, encoded traversal) is refused before touching the disk.
const SAFE_PATH = /^(exercises)\/[a-f0-9]{24}\.(gif|webp|png|jpg|mp4)$/;

export function resolveMediaPath(relative: string): string | null {
  if (!SAFE_PATH.test(relative)) return null;
  return path.join(/*turbopackIgnore: true*/ mediaRoot(), relative);
}

let s3: S3Client | null = null;

export async function storeMedia(folder: "exercises", bytes: Uint8Array): Promise<{ path: string; contentType: string } | { error: string }> {
  if (bytes.length > MAX_MEDIA_BYTES) return { error: "too_large" };
  const ext = sniffMedia(bytes);
  if (!ext) return { error: "unsupported_type" };

  const relative = `${folder}/${randomBytes(12).toString("hex")}.${ext}`;
  const absolute = path.join(/*turbopackIgnore: true*/ mediaRoot(), relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);

  const bucket = process.env.MEDIA_BUCKET;
  if (bucket) {
    try {
      s3 ??= new S3Client({ region: process.env.AWS_REGION });
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `uploads/${relative}`,
        Body: bytes,
        ContentType: TYPES[ext],
      }));
    } catch (error) {
      // The local copy already serves the file; the backup can be re-synced.
      console.error("[media] S3 backup failed", error);
    }
  }
  return { path: `/media/${relative}`, contentType: TYPES[ext] };
}

export async function readMedia(relative: string): Promise<Buffer | null> {
  const absolute = resolveMediaPath(relative);
  if (!absolute) return null;
  try {
    return await readFile(absolute);
  } catch {
    return null;
  }
}
