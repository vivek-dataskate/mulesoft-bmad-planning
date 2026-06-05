import { fileURLToPath } from 'url';
import path from 'path';

export const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
