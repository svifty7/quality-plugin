import type { Plugin } from 'vitest/config';

import { join } from 'node:path';

import SonarReporter from 'vitest-sonar-reporter';

import { DEFAULT_REPORTS_DIR, TEST_REPORT_FILE } from './constants.ts';

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function hasSonarReporter(reporters: unknown[]): boolean {
  return reporters.some((reporter) => {
    const [name] = toArray(reporter);

    return name === 'vitest-sonar-reporter' || name instanceof SonarReporter;
  });
}

function hasLcov(reporters: unknown[]): boolean {
  return reporters.some((reporter) => toArray(reporter)[0] === 'lcov');
}

function getCoverageReporters(
  userReporters: unknown[],
): ('lcov' | 'text-summary')[] {
  if (userReporters.length === 0) {
    return ['text-summary', 'lcov'];
  }

  return hasLcov(userReporters) ? [] : ['lcov'];
}

/**
 * Adds the reports SonarQube needs to the Vitest config.
 *
 * The `config` hook runs after Vitest has applied CLI options to `config.test`,
 * so anything set there or in the user config is kept. Arrays are extended by
 * Vite's `mergeConfig`, which is why only the missing entries are returned.
 */
export function quality(): Plugin {
  return {
    name: 'svifty7:quality',
    config(config) {
      const { coverage, reporters } = config.test ?? {};
      const userReporters = toArray<unknown>(reporters);
      const reportsDir = coverage?.reportsDirectory ?? DEFAULT_REPORTS_DIR;

      return {
        test: {
          reporters: [
            // A plugin-provided list would otherwise replace Vitest's default reporter
            ...(userReporters.length === 0 ? ['default'] : []),
            ...(hasSonarReporter(userReporters)
              ? []
              : [
                  new SonarReporter({
                    outputFile: join(reportsDir, TEST_REPORT_FILE),
                  }),
                ]),
          ],
          coverage: {
            enabled: coverage?.enabled ?? true,
            provider: coverage?.provider ?? 'v8',
            reporter: getCoverageReporters(toArray(coverage?.reporter)),
          },
        },
      };
    },
  };
}
