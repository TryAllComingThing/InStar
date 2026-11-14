import type { VerifiedFileHandle } from './path-safety.mjs';

export interface FileLock {
  handle?: VerifiedFileHandle | null;
  token: string;
  root: string;
  lockRelative: string;
  ownerRelative: string;
}

export function acquireFileLock(file: string, options: {
  root: string;
  relative?: string;
  action?: string;
  label?: string;
}): Promise<FileLock>;

export function releaseFileLock(lock: FileLock | null | undefined): Promise<void>;
