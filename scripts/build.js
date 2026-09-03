/**
 *
 * build.js
 *
 */

import path from 'path';
import fse from 'fs-extra';

// 获取当前文件所在目录
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const baseDir = path.join(__dirname, '..');
const distDir = path.join(baseDir, 'dist');
const sourceDirMappings = {
  'web-native': path.join(baseDir, 'examples', 'web-native'),
};

// 清空或创建 dist 目录
fse.emptyDirSync(distDir);

// 复制文件到对应的子目录
Object.entries(sourceDirMappings).forEach(([subDir, sourceDir]) => {
  const targetDir = path.join(distDir, subDir);
  fse.ensureDirSync(targetDir); // 确保子目录存在
  fse.copySync(sourceDir, targetDir, { overwrite: true });
});

console.log('Build completed successfully!');
