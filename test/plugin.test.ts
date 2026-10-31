import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SonarReporter from 'vitest-sonar-reporter';
import { configDefaults } from 'vitest/config';
import { createVitest } from 'vitest/node';

import { quality } from '../src';

interface TestConfig {
  coverage?: Record<string, unknown>;
  reporters?: unknown;
  root?: string;
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'quality-plugin-'));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

async function resolveConfig(test: TestConfig = {}, cli: TestConfig = {}) {
  const vitest = await createVitest(
    'test',
    { root, ...cli, config: false, watch: false } as Parameters<
      typeof createVitest
    >[1],
    { plugins: [quality()], test: test as never },
  );

  const { coverage, reporters } = vitest.config;

  await vitest.close();

  return { coverage, reporters };
}

function reporterNames(reporters: unknown[]) {
  return reporters.map((reporter) => {
    if (reporter instanceof SonarReporter) {
      return 'sonar';
    }

    return Array.isArray(reporter) ? (reporter as unknown[])[0] : reporter;
  });
}

describe('quality', () => {
  it('fills an empty config', async () => {
    const { coverage, reporters } = await resolveConfig();

    expect(reporterNames(reporters)).toEqual([
      ...configDefaults.reporters,
      'sonar',
    ]);

    expect(coverage.enabled).toBe(true);
    expect(coverage.provider).toBe('v8');

    expect(reporterNames(coverage.reporter as unknown[])).toEqual([
      'text-summary',
      'lcov',
    ]);
  });

  it('writes the test report to the path the scanner expects', async () => {
    const { reporters } = await resolveConfig();

    const sonar = reporters.find(
      (reporter) => reporter instanceof SonarReporter,
    );

    expect(sonar?.options.outputFile).toBe('coverage/sonar-report.xml');
  });

  it('keeps the test report next to the coverage report', async () => {
    const { reporters } = await resolveConfig({
      coverage: { reportsDirectory: 'reports' },
    });

    const sonar = reporters.find(
      (reporter) => reporter instanceof SonarReporter,
    );

    expect(sonar?.options.outputFile).toBe('reports/sonar-report.xml');
  });

  it('extends user reporters', async () => {
    const { coverage, reporters } = await resolveConfig({
      coverage: { reporter: ['html'] },
      reporters: ['dot'],
    });

    expect(reporterNames(reporters)).toEqual(['dot', 'sonar']);

    expect(reporterNames(coverage.reporter as unknown[])).toEqual([
      'html',
      'lcov',
    ]);
  });

  it('accepts reporters set as a single string', async () => {
    const { coverage, reporters } = await resolveConfig({
      coverage: { reporter: 'html' },
      reporters: 'dot',
    });

    expect(reporterNames(reporters)).toEqual(['dot', 'sonar']);

    expect(reporterNames(coverage.reporter as unknown[])).toEqual([
      'html',
      'lcov',
    ]);
  });

  it('keeps user coverage settings', async () => {
    const { coverage } = await resolveConfig({
      coverage: {
        enabled: false,
        exclude: ['src/generated.ts'],
        provider: 'istanbul',
      },
    });

    expect(coverage.enabled).toBe(false);
    expect(coverage.provider).toBe('istanbul');
    expect(coverage.exclude).toContain('src/generated.ts');
  });

  it('does not duplicate reporters', async () => {
    const { coverage, reporters } = await resolveConfig(
      {
        coverage: { reporter: [['lcov', { projectRoot: '.' }]] },
        reporters: [
          'default',
          ['vitest-sonar-reporter', { outputFile: 'custom.xml' }],
        ],
      },
      { root: process.cwd() },
    );

    expect(reporterNames(reporters)).toEqual([
      'default',
      'vitest-sonar-reporter',
    ]);

    expect(reporterNames(coverage.reporter as unknown[])).toEqual(['lcov']);
  });

  it('respects CLI options', async () => {
    const { coverage } = await resolveConfig(
      {},
      { coverage: { enabled: false } },
    );

    expect(coverage.enabled).toBe(false);
  });
});
