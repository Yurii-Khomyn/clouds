# Лабораторна 3: обробка даних з IoT-сенсорів (serverless)

Емулятор датчиків надсилає вимірювання по HTTP у приймач, той кладе їх у чергу, serverless-функції обробляють повідомлення й пишуть у базу, окремий запит повертає історію. Постійно запущених контейнерів немає: усе в хмарі виконують функції Azure Functions (план Flex Consumption), що запускаються подіями й оплачуються за виклик.

## Публічна адреса приймача

| Що | Адреса |
|---|---|
| Приймач (POST) | `https://func-iot-ex7oo.azurewebsites.net/api/ingest` |
| Історія (GET) | `https://func-iot-ex7oo.azurewebsites.net/api/sensors/{sensor_id}/history` |
| URL для знімка камери (POST) | `https://func-iot-ex7oo.azurewebsites.net/api/camera/upload-url` |
| Перевірка, що працює (GET) | `https://func-iot-ex7oo.azurewebsites.net/api/health` |

Усі адреси, крім `health`, вимагають заголовок `x-api-key`. Ключ генерує Terraform: `terraform output -raw api_key`. Після `terraform destroy` і нового `apply` суфікс у назві (`ex7oo`) зміниться; актуальні адреси показує `terraform output`.

## Архітектура

```
емулятор ──POST /ingest──▶ функція ingest ──▶ Service Bus (черга telemetry) ──тригер──▶ функція process ──▶ PostgreSQL
 (3 датчики + камера)          (202 / 400)          │ після 3 невдач                     │      └──▶ Cosmos DB (сирі дані)
        │                                          ▼                                    ▼
        └──PUT за підписаним URL──▶ Blob Storage   telemetry/$deadletterqueue    перевірка знімка в Blob
GET /sensors/{id}/history ──▶ функція history ──▶ PostgreSQL (або Cosmos DB: ?source=nosql)
```

Докладно: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

| Ресурс Azure | Регіон | Для чого |
|---|---|---|
| Function App `func-iot-…` (Flex Consumption, Node.js 22) | Switzerland North | функції `ingest`, `process`, `history`, `cameraUploadUrl`, `health` |
| Service Bus `sb-iot-…` (Basic), черга `telemetry` | Switzerland North | буфер між приймачем і обробкою, DLQ після 3 спроб |
| PostgreSQL Flexible Server B1ms | **Spain Central** | оброблені вимірювання (у Швейцарії й Австрії SKU недоступний, див. `docs/DATA.md`) |
| Cosmos DB (serverless) | Switzerland North | сирі вимірювання, ключ розділу `/sensor_id` |
| Storage `stmedia…`, контейнер `camera` | Switzerland North | знімки камери |
| Application Insights + Log Analytics | Switzerland North | журнали функцій |
| Бюджет `budget-iot` | підписка | сповіщення на пошту при 50/80/100 % |

## Структура

```
lab3/
├─ emulator/      емулятор датчиків (index.js, config.json, images/, Dockerfile, README.md, mock-receiver.js)
├─ functions/     код функцій (src/functions/*.js, src/lib/*.js, host.json)
├─ terraform/     уся інфраструктура й розгортання коду функцій
├─ scripts/       send-poison.js, dlq.js (DLQ), db-stats.js (наповнення бази)
└─ docs/          ARCHITECTURE, INGEST, PROCESSING, DATA, DLQ, NOSQL, BLOB
```

## Розгортання

Потрібні: Azure CLI (`az login`), Terraform ≥ 1.9, Node.js 22+, `zip`.

```bash
cd lab3/terraform
cp terraform.tfvars.example terraform.tfvars   # впиши subscription_id і alert_email
terraform init
terraform apply -var "client_ip=$(curl -s https://api.ipify.org)"
```

`terraform apply` створює всі ресурси й сам розгортає код функцій (`terraform_data.deploy_functions`: `npm ci`, архів, `az functionapp deployment source config-zip`). Код перерозгортається, коли змінюються файли в `functions/`.

## Демонстрація

```bash
cd lab3/terraform
KEY=$(terraform output -raw api_key)
cd ../emulator
API_KEY=$KEY API_URL=$(cd ../terraform && terraform output -raw ingest_url) \
UPLOAD_URL_ENDPOINT=$(cd ../terraform && terraform output -raw upload_url_endpoint) \
DURATION_SECONDS=300 node index.js
```

Журнали обробки в реальному часі: портал Azure → Function App → Monitoring → Log stream (або Application Insights → Live metrics). Наповнення бази: `scripts/db-stats.js`. Історія:

```bash
curl -H "x-api-key: $KEY" "https://<функція>.azurewebsites.net/api/sensors/temp-kyiv-01/history?limit=5"
```

## Документи

| Завдання | Документ |
|---|---|
| 2. Приймання в чергу | [`docs/INGEST.md`](docs/INGEST.md) |
| 3. Обробка функціями | [`docs/PROCESSING.md`](docs/PROCESSING.md) |
| 4. Збереження й історія | [`docs/DATA.md`](docs/DATA.md) |
| 5. Черга недоставлених | [`docs/DLQ.md`](docs/DLQ.md) |
| 6. NoSQL | [`docs/NOSQL.md`](docs/NOSQL.md) |
| 7. Камера й Blob | [`docs/BLOB.md`](docs/BLOB.md) |

## Вартість і видалення

Функції, черга, Cosmos DB (serverless) і сховище в межах безкоштовних квот практично нічого не коштують. Платна частина: PostgreSQL B1ms (~$0,4 на добу). Після захисту:

```bash
cd lab3/terraform && terraform destroy
```
