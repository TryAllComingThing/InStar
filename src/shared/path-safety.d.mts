export interface VerifiedDirectoryStat {
  dev: number;
  ino: number;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
  mode: number;
  size: number;
}

export interface VerifiedFileHandle {
  close(): Promise<void>;
  stat(options?: {bigint?: boolean}): Promise<any>;
  readFile(): Promise<Buffer>;
  read(buffer: Buffer, offset: number, length: number, position: number): Promise<{bytesRead: number}>;
  writeFile(data: string | Buffer): Promise<void>;
  write(data: Buffer): Promise<{bytesWritten: number}>;
}

export function safePath(root: string, relative: string): Promise<string>;
export function sameDirectoryIdentity(left: VerifiedDirectoryStat | null | undefined, right: VerifiedDirectoryStat | null | undefined): boolean;
export function openVerified(root: string, relative: string, flags: number, mode?: number): Promise<VerifiedFileHandle>;
export function readHandleVerified(root: string, relative: string, handle: VerifiedFileHandle, options?: {maxBytes?: number | null}): Promise<Buffer>;
export function readBufferVerified(root: string, relative: string, options?: {maxBytes?: number | null}): Promise<Buffer>;
export function readTextVerified(root: string, relative: string, options?: {maxBytes?: number | null}): Promise<string>;
export function readDirectoryVerified(root: string, relative: string, options?: {maxEntries?: number; label?: string}): Promise<any[]>;
export function pathExistsVerified(root: string, relative: string): Promise<boolean>;
export function lstatVerified(root: string, relative: string): Promise<VerifiedDirectoryStat>;
export function createDirectoryVerified(root: string, relative: string, options?: {mode?: number}): Promise<VerifiedDirectoryStat>;
export function ensureDirectoryVerified(root: string, relative: string, options?: {mode?: number}): Promise<VerifiedDirectoryStat>;
export function removeFileVerified(root: string, relative: string, options?: {expected?: VerifiedDirectoryStat | null}): Promise<boolean>;
export function removeDirectoryVerified(root: string, relative: string, opened: VerifiedDirectoryStat): Promise<boolean>;
export function renameDirectoryVerified(root: string, fromRelative: string, toRelative: string, expected: VerifiedDirectoryStat, options?: {replaceExpected?: VerifiedDirectoryStat | null}): Promise<VerifiedDirectoryStat>;
export function writeFileVerified(root: string, relative: string, data: string | Buffer, options?: {mode?: number; overwrite?: boolean; maxBytes?: number}): Promise<VerifiedDirectoryStat>;
export function removeTreeVerified(root: string, relative: string, options?: {expected?: VerifiedDirectoryStat | null; maxFiles?: number; maxDepth?: number; label?: string}): Promise<boolean>;
