# @svifty7/quality-plugin

Подключает проект на Vitest к SonarQube одним пакетом: плагин настраивает отчёты о тестах и покрытии, а команда `quality-scan` запускает анализ. Настраивать нужно только переменные окружения.

## Установка

```bash
pnpm add -D @svifty7/quality-plugin vitest
```

Нужны Node.js `^22.22.2 || >=24.15.0` и Vitest 5. `@vitest/coverage-v8` объявлен как peer-зависимость: pnpm ставит его сам, если не отключён `auto-install-peers`. Иначе установите его отдельно, в той же версии, что и Vitest. `@sonar/scan` и `vitest-sonar-reporter` устанавливаются вместе с пакетом.

## Настройка Vitest

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

Плагин только дополняет конфигурацию. Значения из конфига и CLI Vitest сохраняются:

| Настройка                | Что делает плагин                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `test.reporters`         | Добавляет `vitest-sonar-reporter` с отчётом `sonar-report.xml` в папке `coverage.reportsDirectory`. Если список пуст, оставляет и `default` |
| `test.coverage.enabled`  | `true`, если не задано                                                                                                                      |
| `test.coverage.provider` | `v8`, если не задано                                                                                                                        |
| `test.coverage.reporter` | `text-summary` и `lcov`, если не задано; иначе добавляет `lcov`                                                                             |

Ограничения:

- Флаг `--reporter` заменяет весь список репортёров, поэтому `vitest run --reporter=dot` не создаст `sonar-report.xml`.
- Файл `lcov.info` не появится при `--coverage.enabled=false` и при упавших тестах, пока не включён `coverage.reportOnFailure`.
- `vitest-sonar-reporter`, добавленный в конфиг вручную, пишет отчёт по своему `outputFile`. `quality-scan` его не учитывает.

## Переменные окружения

| Переменная                    | Обязательна | Описание                                     |
| ----------------------------- | ----------- | -------------------------------------------- |
| `SONAR_HOST_URL`              | да          | Адрес сервера SonarQube                      |
| `SONAR_TOKEN`                 | да          | Токен анализа                                |
| `SONAR_SCANNER_JAVA_EXE_PATH` | нет         | Путь к `java`. С ним сканер не скачивает JRE |

`quality-scan` читает `SONAR_*` из файла `.env` в текущей папке. Остальные настройки сканера тоже можно задать так: например, `SONAR_SCANNER_FOO_BAR` становится свойством `sonar.scanner.fooBar`. Переменные, уже заданные в окружении, важнее значений из `.env`. Файл `.env` необязателен и не должен попадать в git.

```dotenv
SONAR_HOST_URL=http://localhost:9000
SONAR_TOKEN=squ_...
SONAR_SCANNER_JAVA_EXE_PATH=/path/to/jdk/bin/java
```

## Запуск

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

Команда принимает `-Dсвойство=значение` и `-X` (подробный лог). При ошибке она завершается с кодом сканера или с кодом 1, если кода нет.

```bash
pnpm sonar -Dsonar.branch.name=dev -X
```

## Значения по умолчанию

Если `sonar-project.properties` нет, `quality-scan` подставляет:

| Свойство                            | Значение                                                      |
| ----------------------------------- | ------------------------------------------------------------- |
| `sonar.projectKey`                  | `scope:name` для пакета `@scope/name`                         |
| `sonar.sources`                     | `src`, если папка есть                                        |
| `sonar.tests`                       | `test` или `tests`, если папка есть                           |
| `sonar.testExecutionReportPaths`    | `sonar-report.xml` в папке отчётов, если найдена папка тестов |
| `sonar.javascript.lcov.reportPaths` | `lcov.info` в папке отчётов, если найдена папка тестов        |

Папку отчётов `quality-scan` берёт из `coverage.reportsDirectory` конфига Vitest: для этого он загружает конфиг, но тесты не запускает. Если конфиг не загрузился, команда предупредит об этом и будет искать отчёты в `coverage`.

Имя, версию и ссылки проекта сканер определяет сам. Без области в имени пакета `sonar.projectKey` тоже остаётся за сканером.

Опции `scan()` важнее файла, поэтому при наличии `sonar-project.properties` значения по умолчанию не передаются вообще: файл должен описывать проект целиком, включая пути к отчётам. Приоритет такой, от высшего к низшему:

1. Аргументы `-D`.
2. Значения по умолчанию из таблицы выше.
3. Переменные окружения, включая `SONAR_SCANNER_JSON_PARAMS`.
4. `sonar-project.properties`.
5. `package.json`.

Если задаёте `sonar.sources` или `sonar.tests` через `SONAR_SCANNER_JSON_PARAMS`, значения по умолчанию их перекроют. В таком случае заведите `sonar-project.properties` или передайте свойства через `-D`.

Если тесты лежат рядом с кодом в `src`, папка тестов не будет найдена. Опишите проект в `sonar-project.properties` с `sonar.tests`, `sonar.test.inclusions` и `sonar.exclusions`.

## CI

Сначала запустите тесты, затем анализ. Для GitHub Actions:

```yaml
- name: Test
  run: pnpm test

- name: SonarQube
  run: pnpm sonar
  env:
    SONAR_HOST_URL: ${{ vars.SONAR_HOST_URL }}
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

Для SonarQube Cloud задайте адрес `https://sonarcloud.io`, организацию и ключ проекта, если он отличается от `scope:name`. Автоматический анализ в настройках проекта нужно выключить (Administration → Analysis Method), иначе анализ из CI завершится ошибкой.

```yaml
- name: SonarQube Cloud
  run: pnpm sonar -Dsonar.projectKey=my-org_my-project
  env:
    SONAR_HOST_URL: https://sonarcloud.io
    SONAR_ORGANIZATION: my-org
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

SonarQube берёт историю из git, поэтому в шаге `actions/checkout` задайте `fetch-depth: 0`.

## Лицензия

[MIT](./LICENSE)
