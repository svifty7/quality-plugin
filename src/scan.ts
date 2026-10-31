import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';

import { scan } from '@sonar/scan';

import { DEFAULT_REPORTS_DIR, TEST_REPORT_FILE } from './constants.ts';

const REQUIRED_ENV = ['SONAR_HOST_URL', 'SONAR_TOKEN'];

const SONAR_PROJECT_FILE = 'sonar-project.properties';

const SOURCE_DIRS = ['src'];
const TEST_DIRS = ['test', 'tests'];

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

/** Copies `SONAR_*` from `.env` into `env`; variables that are already set win. */
export async function loadSonarEnv(
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const content = await readOptionalFile(join(cwd, '.env'));

  for (const [key, value] of Object.entries(parseEnv(content ?? ''))) {
    if (key.startsWith('SONAR_') && !env[key]?.trim()) {
      env[key] = value;
    }
  }
}

export function assertSonarEnv(env: NodeJS.ProcessEnv): void {
  const missing = REQUIRED_ENV.filter((key) => !env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Для анализа нужны переменные: ${missing.join(', ')}. Задайте их в окружении или в файле .env`,
    );
  }
}

/** `@scope/name` becomes `scope:name`; the scanner would otherwise produce `scopename`. */
async function getProjectKey(baseDir: string): Promise<string | undefined> {
  const content = await readOptionalFile(join(baseDir, 'package.json'));
  const { name } = JSON.parse(content ?? '{}') as { name?: string };

  return name
    ?.match(/^@([^/]+)\/(.+)$/)
    ?.slice(1)
    .join(':');
}

/** Reads `coverage.reportsDirectory` from the Vitest config, relative to `baseDir`. */
async function getReportsDir(baseDir: string): Promise<string> {
  try {
    const { resolveConfig } = await import('vitest/node');
    const { test } = await resolveConfig({ root: baseDir, watch: false });

    return relative(baseDir, resolve(baseDir, test.coverage.reportsDirectory));
  } catch (error) {
    console.warn(
      `quality-scan: не удалось прочитать конфиг Vitest, отчёты ищем в ${DEFAULT_REPORTS_DIR}: ${String(error)}`,
    );

    return DEFAULT_REPORTS_DIR;
  }
}

/**
 * Defaults go to `scan()` options, which outrank `sonar-project.properties`, so
 * they are dropped as a whole when the file exists: a partial mix could index
 * the same file as both source and test.
 */
export async function getDefaultProperties(
  baseDir: string,
): Promise<Record<string, string>> {
  if (existsSync(join(baseDir, SONAR_PROJECT_FILE))) {
    return {};
  }

  const projectKey = await getProjectKey(baseDir);
  const sources = SOURCE_DIRS.find((dir) => existsSync(join(baseDir, dir)));
  const tests = TEST_DIRS.find((dir) => existsSync(join(baseDir, dir)));

  // The scanner rejects a test report that refers to files outside `sonar.tests`
  const reportsDir = tests && (await getReportsDir(baseDir));

  const reports = reportsDir && {
    'sonar.javascript.lcov.reportPaths': join(reportsDir, 'lcov.info'),
    'sonar.testExecutionReportPaths': join(reportsDir, TEST_REPORT_FILE),
    'sonar.tests': tests,
  };

  return {
    ...(projectKey && { 'sonar.projectKey': projectKey }),
    ...(sources && { 'sonar.sources': sources }),
    ...reports,
  };
}

interface CliArgs {
  debug: boolean;
  define: string[];
}

function parseCliArgs(args: string[]): CliArgs {
  const { values } = parseArgs({
    args,
    options: {
      define: { type: 'string', short: 'D', multiple: true, default: [] },
      debug: { type: 'boolean', short: 'X', default: false },
    },
  });

  return values;
}

function getBaseDir(cwd: string, define: string[]): string {
  const prefix = 'sonar.projectBaseDir=';
  const baseDir = define.findLast((property) => property.startsWith(prefix));

  return resolve(cwd, baseDir?.slice(prefix.length) ?? '');
}

function getExitCode(error: unknown): number {
  const code =
    error instanceof Error
      ? /failed with code (\d+)/.exec(error.message)?.[1]
      : undefined;

  return code ? Number(code) : 1;
}

/** Runs the analysis and resolves with the process exit code. */
export async function runCli(
  args: string[],
  cwd = process.cwd(),
  env = process.env,
): Promise<number> {
  let cliArgs: CliArgs;
  let options: Record<string, string>;

  try {
    cliArgs = parseCliArgs(args);
    await loadSonarEnv(cwd, env);
    assertSonarEnv(env);
    options = await getDefaultProperties(getBaseDir(cwd, cliArgs.define));
  } catch (error) {
    console.error(
      `quality-scan: ${error instanceof Error ? error.message : String(error)}`,
    );

    return 1;
  }

  try {
    // Reads SONAR_* from process.env; `define` outranks `options`
    await scan({ options }, cliArgs);

    return 0;
  } catch (error) {
    // The scanner has already logged the failure
    return getExitCode(error);
  }
}
