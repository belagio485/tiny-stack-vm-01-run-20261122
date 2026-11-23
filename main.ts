import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";

// Tiny stack VM for make.fun tiny-stack-vm-01 (ISA.md in the kit):
// 32-bit wrapping ints, 256-value data stack, 64-address call stack,
// 256 words of memory, 65536 output bytes max, 1000000 steps max, ten traps.
// NP/NH: each opcode's pops/pushes, index = opcode (0-83). Valid opcodes:
// 00-07, 10-1E, 20-22, 30-34, 40-41, 50-53 (note: 1F is NOT an opcode).
const NP = "000112230000000022222221222122202220000000000000011000000000000012000000000000001101";
const NH = "011022330000000011111111111111101110000000000000000000000000000010000000000000000010";

function run(p: Uint8Array, inp: Uint8Array): [Uint8Array, number] {
  const s = new Int32Array(256), c = new Int32Array(64), m = new Int32Array(256);
  const o = new Uint8Array(65536);
  let sp = 0, cp = 0, pc = 0, t = 0, ip = 0, n = 0, code = -1;
  while (code < 0) {
    if (t >= 1000000) { code = 10; break; }
    if (pc < 0 || pc >= p.length) { code = 9; break; }
    const op = p[pc];
    if (!(op <= 7 || (op >= 16 && op <= 30) || (op >= 32 && op <= 34) || (op >= 48 && op <= 52) || op === 64 || op === 65 || (op >= 80 && op <= 83))) { code = 5; break; }
    let il = 0;
    if (op === 1) il = 1;
    else if (op === 2) il = 4;
    else if (op >= 48 && op <= 51) il = 2;
    if (pc + 1 + il > p.length) { code = 9; break; }
    t++;
    const nx = pc + 1 + il;
    let np = nx;
    const j = ((p[pc + 1] | (p[pc + 2] << 8)) << 16) >> 16;
    const po = NP.charCodeAt(op) - 48, pu = NH.charCodeAt(op) - 48;
    if (sp < po) { code = 2; break; }
    if (sp - po + pu > 256) { code = 3; break; }
    switch (op) {
      case 0x00: code = 0; break;
      case 0x01: { const b = p[pc + 1]; s[sp++] = b < 128 ? b : b - 256; } break;
      case 0x02: s[sp++] = p[pc + 1] | (p[pc + 2] << 8) | (p[pc + 3] << 16) | (p[pc + 4] << 24); break;
      case 0x03: sp--; break;
      case 0x04: s[sp] = s[sp - 1]; sp++; break;
      case 0x05: { const a = s[sp - 1]; s[sp - 1] = s[sp - 2]; s[sp - 2] = a; } break;
      case 0x06: s[sp] = s[sp - 2]; sp++; break;
      case 0x07: { const a = s[sp - 3]; s[sp - 3] = s[sp - 2]; s[sp - 2] = s[sp - 1]; s[sp - 1] = a; } break;
      case 0x10: { const b = s[--sp]; s[sp - 1] = (s[sp - 1] + b) | 0; } break;
      case 0x11: { const b = s[--sp]; s[sp - 1] = (s[sp - 1] - b) | 0; } break;
      case 0x12: { const b = s[--sp]; s[sp - 1] = Math.imul(s[sp - 1], b); } break;
      case 0x13: { const b = s[--sp]; if (b === 0) { code = 4; break; } s[sp - 1] = (s[sp - 1] / b) | 0; } break;
      case 0x14: { const b = s[--sp]; if (b === 0) { code = 4; break; } s[sp - 1] = (s[sp - 1] % b) | 0; } break;
      case 0x15: { const b = s[--sp]; if (b === 0) { code = 4; break; } s[sp - 1] = ((s[sp - 1] >>> 0) / (b >>> 0)) | 0; } break;
      case 0x16: { const b = s[--sp]; if (b === 0) { code = 4; break; } s[sp - 1] = ((s[sp - 1] >>> 0) % (b >>> 0)) | 0; } break;
      case 0x17: s[sp - 1] = (-s[sp - 1]) | 0; break;
      case 0x18: { const b = s[--sp]; s[sp - 1] = s[sp - 1] & b; } break;
      case 0x19: { const b = s[--sp]; s[sp - 1] = s[sp - 1] | b; } break;
      case 0x1a: { const b = s[--sp]; s[sp - 1] = s[sp - 1] ^ b; } break;
      case 0x1b: s[sp - 1] = ~s[sp - 1]; break;
      case 0x1c: { const b = s[--sp]; s[sp - 1] = s[sp - 1] << (b & 31); } break;
      case 0x1d: { const b = s[--sp]; s[sp - 1] = s[sp - 1] >> (b & 31); } break;
      case 0x1e: { const b = s[--sp]; s[sp - 1] = (s[sp - 1] >>> (b & 31)) | 0; } break;
      case 0x20: { const b = s[--sp]; s[sp - 1] = s[sp - 1] === b ? 1 : 0; } break;
      case 0x21: { const b = s[--sp]; s[sp - 1] = s[sp - 1] < b ? 1 : 0; } break;
      case 0x22: { const b = s[--sp]; s[sp - 1] = (s[sp - 1] >>> 0) < (b >>> 0) ? 1 : 0; } break;
      case 0x30: np = nx + j; break;
      case 0x31: if (s[--sp] === 0) np = nx + j; break;
      case 0x32: if (s[--sp] !== 0) np = nx + j; break;
      case 0x33: if (cp >= 64) { code = 7; break; } c[cp++] = nx; np = p[pc + 1] | (p[pc + 2] << 8); break;
      case 0x34: if (cp === 0) { code = 8; break; } np = c[--cp]; break;
      case 0x40: { const a = s[sp - 1]; if (a < 0 || a > 255) { code = 6; break; } s[sp - 1] = m[a]; } break;
      case 0x41: { const a = s[sp - 1]; const v = s[sp - 2]; if (a < 0 || a > 255) { code = 6; break; } m[a] = v; sp -= 2; } break;
      case 0x50: { const v = s[--sp]; const d = String(v); if (n + d.length > 65536) { code = 11; break; } for (let i = 0; i < d.length; i++) o[n++] = d.charCodeAt(i); } break;
      case 0x51: { const v = s[--sp]; if (n >= 65536) { code = 11; break; } o[n++] = v & 255; } break;
      case 0x52: s[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: code = s[--sp] & 255; break;
    }
    pc = np;
  }
  return [o.subarray(0, n), code];
}

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

for (const id of readdirSync(IN_DIR).sort()) {
  if (!/^i\d+$/.test(id)) continue;
  const dir = `${IN_DIR}/${id}`;
  let prog: Buffer;
  try { prog = readFileSync(`${dir}/program.bin`); } catch { continue; }
  let inp: Uint8Array;
  try { inp = readFileSync(`${dir}/input.bin`); } catch { inp = new Uint8Array(0); }
  const [out, code] = run(prog, inp);
  mkdirSync(`${OUT_DIR}/${id}`, { recursive: true });
  writeFileSync(`${OUT_DIR}/${id}/stdout.bin`, out);
  writeFileSync(`${OUT_DIR}/${id}/exit.txt`, `${code}\n`);
}
