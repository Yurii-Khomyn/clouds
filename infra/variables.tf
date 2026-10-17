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
  default     = "germanywestcentral"
}

variable "project" {
  description = "Префікс імен ресурсів"
  type        = string
  default     = "homeshop"
}

variable "image_tag" {
  description = "Тег образу для першого розгортання. Далі його оновлює CI (тег = хеш коміту)."
  type        = string
  default     = "bootstrap"
}

variable "budget_amount" {
  description = "Місячний бюджет у валюті підписки"
  type        = number
  default     = 20
}

variable "budget_start_date" {
  description = "Перше число поточного місяця (вимога Azure)"
  type        = string
  default     = "2026-10-01T00:00:00Z"
}

variable "github_repo" {
  description = "Репозиторій GitHub у форматі власник/назва. Лише йому дозволено деплой."
  type        = string
  default     = "Yurii-Khomyn/clouds"
}
