import {createReadStream} from 'node:fs';

export const MAX_JSON_INPUT_BYTES = 8 * 1024 * 1024;

async function collect(stream, maxBytes) {
  const chunks = []; let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) throw Error(`Input exceeds ${maxBytes} byte limit`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readBoundedFile(file, maxBytes = MAX_JSON_INPUT_BYTES) {
  return collect(createReadStream(file,{highWaterMark:64*1024}),maxBytes);
}

export async function readBoundedStdin(stream = process.stdin, maxBytes = MAX_JSON_INPUT_BYTES) {
  return collect(stream,maxBytes);
}

export function assertBoundedText(value, label, maxBytes = MAX_JSON_INPUT_BYTES) {
  if (Buffer.byteLength(value,'utf8') > maxBytes) throw Error(`${label} exceeds ${maxBytes} byte limit`);
  return value;
}
