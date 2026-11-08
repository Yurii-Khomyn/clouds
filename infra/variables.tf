variable "subscription_id" {
  description = "ID підписки Azure (az account show --query id)"
  type        = string
}

variable "alert_email" {
  description = "Email для сповіщень про бюджет"
  type        = string
}

variable "location" {
  description = "Регіон. Студентська підписка дозволяє лише 5 регіонів."
  type        = string
  default     = "switzerlandnorth"
}

variable "project" {
  description = "Префікс імен ресурсів"
  type        = string
  default     = "homeshop"
}

variable "image_tag" {
  description = "Тег образу для першого розгортання. Далі його оновлює CI (тег = хеш коміту)."
  type        = string
  default     = "v2"
}

variable "budget_amount" {
  description = "Місячний бюджет у валюті підписки"
  type        = number
  default     = 20
}

variable "budget_start_date" {
  description = "Перше число поточного місяця (вимога Azure)"
  type        = string
  default     = "2026-11-01T00:00:00Z"
}

variable "github_repo" {
  description = "Репозиторій GitHub у форматі власник/назва. Лише йому дозволено деплой."
  type        = string
  default     = "Yurii-Khomyn/clouds"
}

variable "github_owner_id" {
  description = "Числовий ID власника репозиторію (gh api repos/<repo> --jq .owner.id). GitHub підписує OIDC-токен за ID, а не за іменем."
  type        = string
  default     = "180960683"
}

variable "github_repo_id" {
  description = "Числовий ID репозиторію (gh api repos/<repo> --jq .id). Зміниться, якщо репозиторій створити заново."
  type        = string
  default     = "1423227999"
}

variable "cache_enabled" {
  description = "Чи використовує застосунок Redis-кеш (для порівняння прогонів навантаження)."
  type        = bool
  default     = true
}

variable "schedule_timezone" {
  description = "Часовий пояс розкладу масштабування."
  type        = string
  default     = "Europe/Kyiv"
}

variable "schedule_day_start" {
  description = "Початок «дня» у форматі cron (хвилини години * * *)."
  type        = string
  default     = "0 8 * * *"
}

variable "schedule_day_end" {
  description = "Кінець «дня» у форматі cron."
  type        = string
  default     = "0 22 * * *"
}

variable "schedule_day_replicas" {
  description = "Скільки екземплярів тримати вдень (вночі діє min_replicas = 1)."
  type        = number
  default     = 2
}

variable "orders_mode" {
  description = "queue: POST /orders кладе замовлення в чергу (202); direct: пише в базу одразу (201)."
  type        = string
  default     = "queue"
}
