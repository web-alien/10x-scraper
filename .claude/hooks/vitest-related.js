#!/usr/bin/env node
import { execSync } from 'child_process';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (raw += chunk));
process.stdin.on('end', () => {
  let filePath = '';
  try {
    filePath = JSON.parse(raw)?.tool_input?.file_path ?? '';
  } catch {
    process.exit(0);
  }

  if (!filePath) process.exit(0);

  const norm = filePath.replace(/\\/g, '/');

  const SKIP = [
    /\.(test|spec)\.[tj]sx?$/,
    /src\/types\/supabase\.ts$/,
    /\.config\.[tj]s$/,
    /\.(json|css|md|yml|yaml|lock)$/,
    /node_modules/,
  ];
  if (SKIP.some(re => re.test(norm))) process.exit(0);

  const RISK_AREAS = [/\bscripts\//, /\bsrc\//];
  if (!RISK_AREAS.some(re => re.test(norm))) process.exit(0);

  try {
    execSync(`npx vitest related "${filePath}" --run`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    process.exit(0);
  } catch {
    process.exit(2);
  }
});
