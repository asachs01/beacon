import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, beaconMediaFilename, fileProblem, importFileKind } from './files';

function file(name: string, type: string, size: number) {
  return { name, type, size };
}

describe('import file limits', () => {
  it('accepts one jpeg, png, heic, or pdf up to 10 MB', () => {
    expect(importFileKind(file('a.JPG', '', 10))).toBe('jpeg');
    expect(importFileKind(file('scan.pdf', 'application/pdf', 10))).toBe('pdf');
    expect(importFileKind(file('photo', 'image/heic', 10))).toBe('heic');
    expect(fileProblem([file('pic.png', 'image/png', MAX_IMPORT_BYTES)])).toBeNull();
  });

  it('rejects a second file, an oversize file, and an unsupported format', () => {
    expect(fileProblem([
      file('a.jpg', 'image/jpeg', 10),
      file('b.jpg', 'image/jpeg', 10),
    ])).toBe('import.oneFile');
    expect(fileProblem([file('big.jpg', 'image/jpeg', MAX_IMPORT_BYTES + 1)])).toBe('import.tooLarge');
    expect(fileProblem([file('notes.gif', 'image/gif', 10)])).toBe('import.badType');
    expect(fileProblem([file('notes.docx', '', 10)])).toBe('import.badType');
  });

  it('names uploads without the original filename', () => {
    const name = beaconMediaFilename('jpg');
    expect(name).toMatch(/^beacon-import-[0-9a-f]{16}\.jpg$/);
  });
});
