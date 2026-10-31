import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scan } from '@sonar/scan';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertSonarEnv,
  getDefaultProperties,
  loadSonarEnv,
  runCli,
} from '../src/scan.ts';

vi.mock('@sonar/scan', () => ({ scan: vi.fn() }));

const REQUIRED = {
  SONAR_HOST_URL: 'http://localhost:9000',
  SONAR_TOKEN: 'token',
};

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'quality-plugin-'));
  vi.mocked(scan).mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { force: true, recursive: true });
});

describe('loadSonarEnv', () => {
  it('loads only SONAR_* variables', async () => {
    await writeFile(join(root, '.env'), 'SONAR_TOKEN=secret\nOTHER=value\n');

    const env = {};

    await loadSonarEnv(root, env);

    expect(env).toEqual({ SONAR_TOKEN: 'secret' });
  });

  it('keeps variables that are already set', async () => {
    await writeFile(
      join(root, '.env'),
      'SONAR_TOKEN=file\nSONAR_HOST_URL=file\n',
    );

    const env = { SONAR_HOST_URL: '', SONAR_TOKEN: 'env' };

    await loadSonarEnv(root, env);

    expect(env).toEqual({ SONAR_HOST_URL: 'file', SONAR_TOKEN: 'env' });
  });

  it('works without .env', async () => {
    const env = { SONAR_TOKEN: 'env' };

    await loadSonarEnv(root, env);

    expect(env).toEqual({ SONAR_TOKEN: 'env' });
  });

  it('rethrows other read errors', async () => {
    await mkdir(join(root, '.env'));

    await expect(loadSonarEnv(root, {})).rejects.toMatchObject({
      code: 'EISDIR',
    });
  });
});

describe('assertSonarEnv', () => {
  it('names every missing variable', () => {
    expect(() => assertSonarEnv({ SONAR_TOKEN: ' ' })).toThrow(
      'SONAR_HOST_URL, SONAR_TOKEN',
    );
  });

  it('accepts a complete environment', () => {
    expect(() => assertSonarEnv(REQUIRED)).not.toThrow();
  });
});

describe('getDefaultProperties', () => {
  it('uses existing directories and the scoped package name', async () => {
    await mkdir(join(root, 'src'));
    await mkdir(join(root, 'test'));

    await writeFile(
      join(root, 'package.json'),
      '{"name":"@svifty7/eslint-config"}',
    );

    expect(await getDefaultProperties(root)).toEqual({
      'sonar.javascript.lcov.reportPaths': 'coverage/lcov.info',
      'sonar.projectKey': 'svifty7:eslint-config',
      'sonar.sources': 'src',
      'sonar.testExecutionReportPaths': 'coverage/sonar-report.xml',
      'sonar.tests': 'test',
    });
  });

  it('follows coverage.reportsDirectory from the Vitest config', async () => {
    await mkdir(join(root, 'test'));

    await writeFile(
      join(root, 'vitest.config.mjs'),
      'export default { test: { coverage: { reportsDirectory: "reports/unit" } } };',
    );

    expect(await getDefaultProperties(root)).toMatchObject({
      'sonar.javascript.lcov.reportPaths': 'reports/unit/lcov.info',
      'sonar.testExecutionReportPaths': 'reports/unit/sonar-report.xml',
    });
  });

  it('falls back to coverage when the Vitest config is broken', async () => {
    await mkdir(join(root, 'test'));

    await writeFile(
      join(root, 'vitest.config.mjs'),
      'throw new Error("broken");',
    );

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await getDefaultProperties(root)).toMatchObject({
      'sonar.javascript.lcov.reportPaths': 'coverage/lcov.info',
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('broken'));
  });

  it('leaves unscoped names to the scanner', async () => {
    await writeFile(join(root, 'package.json'), '{"name":"plain"}');

    expect(await getDefaultProperties(root)).toEqual({});
  });

  it('skips test settings without a test directory', async () => {
    await mkdir(join(root, 'src'));

    expect(await getDefaultProperties(root)).toEqual({
      'sonar.sources': 'src',
    });
  });

  it('adds nothing when sonar-project.properties exists', async () => {
    await mkdir(join(root, 'src'));

    await writeFile(
      join(root, 'sonar-project.properties'),
      'sonar.projectKey=own\n',
    );

    expect(await getDefaultProperties(root)).toEqual({});
  });
});

describe('runCli', () => {
  it('fails without required variables and does not scan', async () => {
    expect(await runCli([], root, {})).toBe(1);
    expect(scan).not.toHaveBeenCalled();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('SONAR_HOST_URL'),
    );
  });

  it('rejects unknown arguments', async () => {
    expect(await runCli(['--nope'], root, { ...REQUIRED })).toBe(1);
    expect(scan).not.toHaveBeenCalled();
  });

  it('passes defaults as options and -D through define', async () => {
    await mkdir(join(root, 'src'));

    const code = await runCli(
      ['-Dsonar.a=b', '-D', 'sonar.c=d=e', '-X'],
      root,
      { ...REQUIRED },
    );

    expect(code).toBe(0);

    expect(scan).toHaveBeenCalledWith(
      { options: { 'sonar.sources': 'src' } },
      { debug: true, define: ['sonar.a=b', 'sonar.c=d=e'] },
    );
  });

  it('looks for defaults in sonar.projectBaseDir', async () => {
    await mkdir(join(root, 'app/src'), { recursive: true });

    await runCli(['-Dsonar.projectBaseDir=app'], root, { ...REQUIRED });

    expect(vi.mocked(scan).mock.calls[0]?.[0]).toEqual({
      options: { 'sonar.sources': 'src' },
    });
  });

  it('returns the scanner exit code', async () => {
    vi.mocked(scan).mockRejectedValue(
      new Error('Scanner engine failed with code 3'),
    );

    expect(await runCli([], root, { ...REQUIRED })).toBe(3);
  });

  it('falls back to 1 for other scanner errors', async () => {
    vi.mocked(scan).mockRejectedValue(new Error('network'));

    expect(await runCli([], root, { ...REQUIRED })).toBe(1);
  });
});
