# Все для дому

Невеликий інтернет-магазин домашніх товарів: сторінка з каталогом і кошиком, REST API та база даних. Лабораторна робота з хмарних технологій: застосунок упакований у Docker, інфраструктура описана в Terraform і розгорнута в **Microsoft Azure**, а зміни в `main` автоматично потрапляють на сайт через GitHub Actions.

## Публічна адреса

**http://homeshop-ysap0.switzerlandnorth.cloudapp.azure.com**

Адреса належить балансувальнику навантаження: це єдине, що видно з інтернету. Після захисту ресурси видаляються командою `terraform destroy`, і адреса перестане відповідати.

## Що вміє застосунок

| Метод і шлях | Призначення |
|---|---|
| `GET /` | сторінка магазину (каталог, кошик, оформлення замовлення) |
| `GET /products` | каталог товарів із бази |
| `POST /orders` | створити замовлення (`{"customer": "Ім'я", "items": [{"productId": 1, "quantity": 2}]}`) |
| `GET /orders` | останні замовлення |
| `GET /health` | перевірка, що застосунок живий (її використовує балансувальник) |

Ціну замовлення сервер рахує за цінами з бази, а не з браузера.

## Технології

- **Застосунок:** Node.js 24, Express 5, PostgreSQL (драйвер `pg`), статичний фронтенд без фреймворків.
- **Контейнер:** Docker, базовий образ із зафіксованою версією, залежності окремим шаром, процес працює не від root.
- **Інфраструктура:** Terraform (провайдер `azurerm`), регіон `switzerlandnorth`.
- **Azure:** Container Apps, Container Registry (ACR), Database for PostgreSQL Flexible Server, Virtual Network, Application Gateway, Log Analytics.
- **CI/CD:** GitHub Actions, вхід в Azure через OIDC (без збережених ключів).

## Архітектура

```
Інтернет ──► Application Gateway (публічна IP, health check /health)
                  │
                  ▼   VNet 10.0.0.0/16
            Container Apps (внутрішнє середовище, snet-app)
                  │  порт 5432, лише з підмережі застосунку (NSG)
                  ▼
            PostgreSQL Flexible Server (приватна підмережа snet-db, без публічної адреси)
```

- База не має публічної адреси. Firewall (NSG) дозволяє підключення лише з підмережі застосунку.
- Контейнерне середовище внутрішнє, тому напряму до застосунку з інтернету не дістатись.
- Рядок підключення до бази передається застосунку змінною середовища `DATABASE_URL` (секрет Container Apps) і не зберігається в репозиторії.

## Структура проєкту

```
.
├── app/                      застосунок
│   ├── src/
│   │   ├── server.js         REST API (Express)
│   │   └── db.js             підключення до PostgreSQL, створення таблиць, початкові дані
│   ├── public/               фронтенд (index.html, app.js, style.css, img/)
│   ├── Dockerfile
│   ├── .dockerignore
│   └── package.json
├── compose.yaml              локальний запуск: застосунок + PostgreSQL з volume
├── .env.example              шаблон змінних для compose (пароль бази)
├── infra/                    Terraform
│   ├── versions.tf           провайдери
│   ├── variables.tf          змінні (регіон, префікс імен, репозиторій GitHub тощо)
│   ├── network.tf            VNet, підмережі, NSG бази, приватна DNS-зона
│   ├── database.tf           PostgreSQL Flexible Server
│   ├── registry.tf           ACR, особистість застосунку, перша збірка образу
│   ├── app.tf                Log Analytics, середовище Container Apps, застосунок
│   ├── loadbalancer.tf       Application Gateway і публічна IP
│   ├── github_oidc.tf        OIDC-доступ для GitHub Actions
│   ├── budget.tf             бюджет зі сповіщеннями на email
│   ├── outputs.tf            адреси й імена ресурсів
│   └── terraform.tfvars.example
├── .github/workflows/
│   └── deploy.yml            збірка, публікація образу, оновлення застосунку
└── DEFENSE.md                нотатки до захисту
```

## Локальний запуск (Docker)

Потрібен лише Docker.

```bash
cp .env.example .env            # задайте POSTGRES_PASSWORD у .env
docker compose up -d --build
open http://localhost:3000
```

Дані бази лежать в іменованому volume `db-data` і переживають `docker compose down`. Видалити їх можна лише командою `docker compose down -v`.

## Розгортання в Azure

Потрібні: Azure CLI (`az login`), Terraform ≥ 1.9, Docker.

1. Один раз зареєструвати провайдери ресурсів у підписці:
   ```bash
   for p in Microsoft.App Microsoft.ContainerRegistry Microsoft.DBforPostgreSQL \
            Microsoft.Network Microsoft.OperationalInsights Microsoft.Insights \
            Microsoft.ManagedIdentity; do az provider register --namespace $p; done
   ```
2. Підготувати змінні:
   ```bash
   cd infra
   cp terraform.tfvars.example terraform.tfvars   # subscription_id та alert_email
   ```
3. Створити інфраструктуру:
   ```bash
   terraform init
   terraform apply
   ```
   Адреса сайту виводиться в `app_url`. Перше створення займає близько 30 хвилин.
4. Видалити все:
   ```bash
   terraform destroy
   ```

`terraform.tfvars` і `terraform.tfstate` у `.gitignore`: у стані зберігається згенерований пароль бази, тому цей файл не можна публікувати.

## Автоматичний деплой

Кожен push у `main` запускає workflow `Deploy`:

1. вхід в Azure через OIDC (токен від GitHub, ключів немає);
2. збірка образу й публікація в ACR з тегом, що дорівнює **хешу коміту**;
3. оновлення Container App на цей образ.

Параметри (імена ресурсів і публічні ідентифікатори Azure) зберігаються як змінні репозиторію GitHub. Секретів у GitHub немає. Довіра до репозиторію налаштована в `infra/github_oidc.tf`: токени приймаються лише з гілки `main` цього репозиторію.

## Фото

Фотографії товарів з [Unsplash](https://unsplash.com) (вільна ліцензія Unsplash).
