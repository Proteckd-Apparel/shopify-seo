// Plain module (no "use server") so we can export the const + types.
// Next 16 rejects non-async exports from "use server" files, so types and
// constants need to live here and be imported by both actions.ts and the
// client component.

import type { CompressFormat } from "@/lib/image-compress";

export type CompressSettings = {
  format: CompressFormat; // webp/avif/jpeg
  quality: number; // 50-95
  maxWidth: number; // 1500-3000
  visionAlt: boolean;
  visionRename: boolean;
  overwriteExistingAlts: boolean;
  doNotReoptimize: boolean;
};

export const DEFAULT_COMPRESS_SETTINGS: CompressSettings = {
  format: "webp",
  quality: 80,
  maxWidth: 2000,
  visionAlt: false,
  visionRename: false,
  overwriteExistingAlts: false,
  doNotReoptimize: true,
};

export type TestResult = {
  ok: boolean;
  message: string;
  imageId?: string;
  imageUrl?: string;
  productTitle?: string;
  originalBytes?: number;
  compressedBytes?: number;
  savedPercent?: number;
  width?: number;
  height?: number;
  visionAlt?: string;
  visionFilename?: string;
};
