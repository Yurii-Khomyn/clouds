variable "subscription_id" {
  description = "ID підписки Azure"
  type        = string
}

variable "alert_email" {
  description = "Email для сповіщень про бюджет"
  type        = string
}

variable "location" {
  description = "Регіон (студентська підписка дозволяє лише кілька регіонів)"
  type        = string
  default     = "switzerlandnorth"
}

variable "project" {
  description = "Префікс імен ресурсів"
  type        = string
  default     = "iot"
}

variable "client_ip" {
  description = "Публічна IP-адреса автора для прямого доступу до бази під час демонстрації (порожньо: без доступу)"
  type        = string
  default     = ""
}

variable "enable_pgbouncer" {
  description = "Увімкнути вбудований PgBouncer у PostgreSQL (пул з'єднань для функцій). Не підтримується на тарифі Burstable (B1ms), лише на General Purpose і Memory Optimized"
  type        = bool
  default     = false
}

variable "budget_amount" {
  description = "Місячний бюджет у валюті підписки"
  type        = number
  default     = 15
}

variable "budget_start_date" {
  description = "Перше число поточного місяця (вимога Azure)"
  type        = string
  default     = "2026-11-01T00:00:00Z"
}

variable "db_sku" {
  description = "SKU PostgreSQL Flexible Server (B1ms інколи недоступний через обмеження потужності регіону)"
  type        = string
  default     = "B_Standard_B1ms"
}

variable "db_location" {
  description = "Регіон бази даних (у switzerlandnorth і austriaeast PostgreSQL зараз недоступний: SkuNotAvailable; дозволені студентською підпискою регіони: belgiumcentral, germanywestcentral, switzerlandnorth, austriaeast, spaincentral)"
  type        = string
  default     = "spaincentral"
}

variable "cosmos_location" {
  description = "Регіон Cosmos DB"
  type        = string
  default     = "switzerlandnorth"
}
