import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

/**
 * Outbound Request Audit: Verifies that no server source code makes
 * outbound HTTP/HTTPS requests to external services.
 *
 * mediasoup is an SFU — it receives inbound WebRTC connections and
 * relays media. It does not initiate outbound HTTP connections.
 * The server only binds to MEDIASOUP_LISTEN_IP for RTP and
 * Fastify's configured HOST:PORT for HTTP/WS.
 */

const OUTBOUND_PATTERNS = [
  /\bfetch\s*\(/,
  /\bhttp\.request\s*\(/,
  /\bhttps\.request\s*\(/,
  /\baxios\b/,
  /\bgot\s*\(/,
  /\bnode-fetch\b/,
  /\bundici\b/,
  /new\s+XMLHttpRequest/,
];

function collectTsFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && entry !== 'node_modules') {
      collectTsFiles(fullPath, files);
    } else if (stat.isFile() && extname(entry) === '.ts' && !entry.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('No Outbound HTTP Requests in Server Source', () => {
  const serverSrcDir = join(__dirname, '..');

  it('server source files contain no outbound HTTP request patterns', () => {
    const sourceFiles = collectTsFiles(serverSrcDir);
    const violations: { file: string; line: number; content: string }[] = [];

    for (const filePath of sourceFiles) {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of OUTBOUND_PATTERNS) {
          if (pattern.test(line)) {
            violations.push({
              file: filePath.replace(serverSrcDir, 'src'),
              line: i + 1,
              content: line.trim(),
            });
          }
        }
      }
    }

    expect(
      violations,
      `Found outbound HTTP patterns:\n${violations.map((v) => `  ${v.file}:${v.line} → ${v.content}`).join('\n')}`,
    ).toEqual([]);
  });

  it('no outbound HTTP client packages in server dependencies', () => {
    const serverPkgPath = join(serverSrcDir, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(serverPkgPath, 'utf-8'));
    const allDeps = [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
    ];

    const httpClientPackages = ['axios', 'got', 'node-fetch', 'undici', 'superagent', 'request', 'ky'];
    const violations = allDeps.filter((dep) => httpClientPackages.includes(dep));

    expect(violations).toEqual([]);
  });
});
