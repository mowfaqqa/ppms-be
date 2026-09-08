import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "path";
import crypto from "crypto";

/**
 * Cloudflare R2 storage.
 *
 * R2 is S3-compatible, so this uses the AWS S3 SDK pointed at the R2 endpoint.
 *
 * Convention used throughout the app: the database stores the R2 **object key**
 * (e.g. "project-files/1712345678-abc123-report.pdf"), never a URL. Buckets are
 * private by default, so URLs are generated on demand — presigned, or built from
 * R2_PUBLIC_BASE_URL when the bucket is served by a public/custom domain.
 */

const DEFAULT_URL_TTL_SECONDS = 15 * 60; // 15 minutes

const required = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not set. Cloudflare R2 storage is not configured.`
    );
  }

  return value;
};

export const getBucketName = (): string => required("R2_BUCKET_NAME");

/**
 * Account-scoped S3 endpoint. Set R2_ENDPOINT explicitly to override (for
 * example when using a jurisdiction-specific endpoint).
 */
const getEndpoint = (): string =>
  process.env.R2_ENDPOINT ||
  `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;

let client: S3Client | null = null;

/**
 * Built lazily so that importing this module never throws — the app should only
 * fail when file storage is actually used without configuration.
 */
export const getR2Client = (): S3Client => {
  if (!client) {
    client = new S3Client({
      region: process.env.R2_REGION || "auto",
      endpoint: getEndpoint(),
      credentials: {
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  return client;
};

/** True when the environment carries enough config to talk to R2. */
export const isR2Configured = (): boolean =>
  Boolean(
    process.env.R2_BUCKET_NAME &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT)
  );

/**
 * Build a collision-resistant object key that keeps the original extension and
 * a readable hint of the original name.
 */
export const buildObjectKey = (
  originalName: string,
  folder = "project-files"
): string => {
  const ext = path.extname(originalName).toLowerCase();
  const base = path
    .basename(originalName, path.extname(originalName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  const unique = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;

  return `${folder}/${unique}${base ? `-${base}` : ""}${ext}`;
};

/** Upload a buffer and return the stored object key. */
export const uploadObject = async (
  key: string,
  body: Buffer,
  contentType: string,
  originalName?: string
): Promise<string> => {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: body,
      ContentType: contentType,
      // Preserved so a download can restore the user's original filename even
      // if the database row is ever lost.
      ContentDisposition: originalName
        ? `attachment; filename="${encodeURIComponent(originalName)}"`
        : undefined,
    })
  );

  return key;
};

/**
 * A time-limited URL for reading an object. When downloadName is given the
 * browser is told to save the file under the original name.
 */
export const getSignedDownloadUrl = async (
  key: string,
  downloadName?: string,
  expiresInSeconds: number = DEFAULT_URL_TTL_SECONDS
): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ResponseContentDisposition: downloadName
      ? `attachment; filename="${encodeURIComponent(downloadName)}"`
      : undefined,
  });

  return getSignedUrl(getR2Client(), command, {
    expiresIn: expiresInSeconds,
  });
};

/**
 * Public URL for an object, when the bucket is exposed via an r2.dev or custom
 * domain. Returns null if no public base URL is configured, in which case
 * callers should presign instead.
 */
export const getPublicUrl = (key: string): string | null => {
  const base = process.env.R2_PUBLIC_BASE_URL;

  if (!base) return null;

  return `${base.replace(/\/+$/, "")}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
};

/**
 * Resolve an object key to something a browser can open: the public URL when
 * one is configured, otherwise a presigned URL.
 */
export const resolveFileUrl = async (
  key: string,
  downloadName?: string
): Promise<string> => getPublicUrl(key) ?? getSignedDownloadUrl(key, downloadName);

/** Delete a single object. */
export const deleteObject = async (key: string): Promise<void> => {
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    })
  );
};

/** Delete many objects in one request. */
export const deleteObjects = async (keys: string[]): Promise<void> => {
  if (keys.length === 0) return;

  await getR2Client().send(
    new DeleteObjectsCommand({
      Bucket: getBucketName(),
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    })
  );
};
