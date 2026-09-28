import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';

export function readLocalFile(filePath: string): { fileName: string; fileSize: number; bytes: Buffer } {
  if (!filePath || !existsSync(filePath)) {
    throw new Error(`Local file not found: ${filePath}`);
  }

  const stats = statSync(filePath);
  if (!stats.isFile()) {
    throw new Error(`Local file not found: ${filePath}`);
  }

  return {
    fileName: path.basename(filePath),
    fileSize: stats.size,
    bytes: readFileSync(filePath),
  };
}
