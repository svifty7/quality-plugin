# @svifty7/quality-plugin

Connects a Vitest project to SonarQube with a single package: the plugin sets up test and coverage reports, and the `quality-scan` command runs the analysis. The only thing you configure is environment variables.

## Installation

```bash
pnpm add -D @svifty7/quality-plugin vitest
```

Requires Node.js `^22.22.2 || >=24.15.0` and Vitest 5. `@vitest/coverage-v8` is a peer dependency: pnpm installs it for you unless `auto-install-peers` is turned off. Otherwise, install it separately, in the same version as Vitest. `@sonar/scan` and `vitest-sonar-reporter` come with the package.

## Vitest setup

```ts
// vitest.config.ts
import { quality } from '@svifty7/quality-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [quality()],
  test: {
    coverage: {
      include: ['src/**/*.ts'],
    },
  },
});
```

The plugin only extends your configuration. Values from your Vitest config and CLI are kept:

| Option                   | What the plugin does                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `test.reporters`         | Adds `vitest-sonar-reporter`, writing `sonar-report.xml` to `coverage.reportsDirectory`. Keeps Vitest's default reporters if the list is empty |
| `test.coverage.enabled`  | `true` if not set                                                                                                                              |
| `test.coverage.provider` | `v8` if not set                                                                                                                                |
| `test.coverage.reporter` | `text-summary` and `lcov` if not set; otherwise adds `lcov`                                                                                    |

Limitations:

- The `--reporter` flag replaces the whole reporter list, so `vitest run --reporter=dot` does not produce `sonar-report.xml`.
- `lcov.info` is not written with `--coverage.enabled=false`, or when tests fail unless `coverage.reportOnFailure` is on.
- A `vitest-sonar-reporter` you add to the config yourself writes to its own `outputFile`, which `quality-scan` does not take into account.

## Environment variables

| Variable                      | Required | Description                                                   |
| ----------------------------- | -------- | ------------------------------------------------------------- |
| `SONAR_HOST_URL`              | yes      | SonarQube server URL                                          |
| `SONAR_TOKEN`                 | yes      | Analysis token                                                |
| `SONAR_SCANNER_JAVA_EXE_PATH` | no       | Path to `java`. When set, the scanner does not download a JRE |

`quality-scan` reads `SONAR_*` from the `.env` file in the current directory. Other scanner settings work the same way: for example, `SONAR_SCANNER_FOO_BAR` becomes the `sonar.scanner.fooBar` property. Variables already set in the environment take priority over `.env`. The `.env` file is optional and should stay out of git.

```dotenv
SONAR_HOST_URL=http://localhost:9000
SONAR_TOKEN=squ_...
SONAR_SCANNER_JAVA_EXE_PATH=/path/to/jdk/bin/java
```

## Usage

```json
{
  "scripts": {
    "test": "vitest run",
    "sonar": "quality-scan"
  }
}
```

```bash
pnpm test
```

```bash
pnpm sonar
```

The command accepts `-Dproperty=value` and `-X` (verbose log). On failure it exits with the scanner's exit code, or with 1 if there is none.

```bash
pnpm sonar -Dsonar.branch.name=dev -X
```

## Defaults

Without a `sonar-project.properties` file, `quality-scan` sets:

| Property                            | Value                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `sonar.projectKey`                  | `scope:name` for a package named `@scope/name`                            |
| `sonar.sources`                     | `src`, if the directory exists                                            |
| `sonar.tests`                       | `test` or `tests`, if the directory exists                                |
| `sonar.testExecutionReportPaths`    | `sonar-report.xml` in the reports directory, if a test directory is found |
| `sonar.javascript.lcov.reportPaths` | `lcov.info` in the reports directory, if a test directory is found        |

`quality-scan` takes the reports directory from `coverage.reportsDirectory` in your Vitest config: it loads the config but does not run the tests. If the config fails to load, the command prints a warning and looks for reports in `coverage`.

The scanner works out the project name, version and links on its own. For a package name without a scope, `sonar.projectKey` is left to the scanner too.

`scan()` options outrank the file, so when `sonar-project.properties` exists, no defaults are passed at all: the file has to describe the whole project, including report paths. Priority, from highest to lowest:

1. `-D` arguments.
2. The defaults from the table above.
3. Environment variables, including `SONAR_SCANNER_JSON_PARAMS`.
4. `sonar-project.properties`.
5. `package.json`.

If you set `sonar.sources` or `sonar.tests` through `SONAR_SCANNER_JSON_PARAMS`, the defaults override them. In that case, add a `sonar-project.properties` file or pass the properties with `-D`.

If your tests live next to the code in `src`, no test directory is found. Describe the project in `sonar-project.properties` using `sonar.tests`, `sonar.test.inclusions` and `sonar.exclusions`.

## CI

Run the tests first, then the analysis. For GitHub Actions:

```yaml
- name: Test
  run: pnpm test

- name: SonarQube
  run: pnpm sonar
  env:
    SONAR_HOST_URL: ${{ vars.SONAR_HOST_URL }}
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

For SonarQube Cloud, set the URL to `https://sonarcloud.io`, along with your organization and the project key if it differs from `scope:name`. Turn off Automatic Analysis in the project settings (Administration → Analysis Method), otherwise the CI analysis fails.

```yaml
- name: SonarQube Cloud
  run: pnpm sonar -Dsonar.projectKey=my-org_my-project
  env:
    SONAR_HOST_URL: https://sonarcloud.io
    SONAR_ORGANIZATION: my-org
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

SonarQube reads history from git, so set `fetch-depth: 0` on the `actions/checkout` step.

## License

[MIT](./LICENSE)
