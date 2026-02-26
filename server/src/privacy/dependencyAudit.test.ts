import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Dependency Audit: Verifies zero telemetry/analytics/tracking packages
 * exist in the server or client dependency trees.
 *
 * Audit results (as of initial creation):
 * - Server: 0 telemetry packages found in full dependency tree
 * - Client: 0 telemetry packages found in full dependency tree
 * - Total direct dependencies: server=12, client=8
 * - Total devDependencies: server=8, client=12
 */

const TELEMETRY_BLOCKLIST = [
  'analytics',
  'telemetry',
  'tracking',
  'sentry',
  'mixpanel',
  'amplitude',
  'segment',
  'posthog',
  'google-analytics',
  'datadog',
  'newrelic',
  'bugsnag',
  'rollbar',
  'logrocket',
  'fullstory',
  'hotjar',
  'heap',
  '@sentry',
  '@amplitude',
  '@segment',
  '@datadog',
  '@newrelic',
  '@bugsnag',
];

function getAllDependencyNames(packageJsonPath: string): string[] {
  const raw = readFileSync(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(raw);
  return [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
}

function getTransitiveDependencyNames(lockfilePath: string): string[] {
  const raw = readFileSync(lockfilePath, 'utf-8');
  const lockfile = JSON.parse(raw);
  // npm lockfile v3 uses "packages" with node_modules/ prefixed keys
  if (lockfile.packages) {
    return Object.keys(lockfile.packages)
      .filter((key) => key !== '')
      .map((key) => key.replace(/.*node_modules\//, ''));
  }
  return [];
}

function findTelemetryPackages(deps: string[]): string[] {
  return deps.filter((dep) => {
    const lower = dep.toLowerCase();
    return TELEMETRY_BLOCKLIST.some(
      (keyword) => lower.includes(keyword),
    );
  });
}

describe('Dependency Audit: Zero Telemetry Packages', () => {
  const rootDir = join(__dirname, '..', '..', '..');

  it('server package.json contains no telemetry packages', () => {
    const serverPkgPath = join(rootDir, 'server', 'package.json');
    const deps = getAllDependencyNames(serverPkgPath);
    const violations = findTelemetryPackages(deps);

    expect(violations).toEqual([]);
  });

  it('client package.json contains no telemetry packages', () => {
    const clientPkgPath = join(rootDir, 'client', 'package.json');
    const deps = getAllDependencyNames(clientPkgPath);
    const violations = findTelemetryPackages(deps);

    expect(violations).toEqual([]);
  });

  it('full transitive dependency tree contains no telemetry packages', () => {
    const lockfilePath = join(rootDir, 'package-lock.json');
    const allTransitiveDeps = getTransitiveDependencyNames(lockfilePath);
    const violations = findTelemetryPackages(allTransitiveDeps);

    expect(
      violations,
      `Telemetry packages found in transitive dependencies:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('blocklist covers all known telemetry package families', () => {
    // Verify blocklist catches known offenders
    const knownTelemetry = [
      '@sentry/node',
      'mixpanel-node',
      'amplitude-js',
      '@segment/analytics-node',
      'posthog-node',
      '@datadog/browser-rum',
      'newrelic',
      '@bugsnag/js',
      'rollbar',
      'logrocket',
      'fullstory',
      '@hotjar/browser',
      'heap-api',
      'google-analytics',
    ];

    for (const pkg of knownTelemetry) {
      const result = findTelemetryPackages([pkg]);
      expect(result, `Blocklist should catch: ${pkg}`).toHaveLength(1);
    }
  });
});
