import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDefaultConfig, mergeConfig } from '@react-native/metro-config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {};

export default mergeConfig(getDefaultConfig(__dirname), config);
