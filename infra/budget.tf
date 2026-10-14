# Бюджет із сповіщеннями на email: 50% / 80% / 100% фактичних витрат і прогноз 100%.
resource "azurerm_consumption_budget_subscription" "main" {
  name            = "budget-${var.project}"
  subscription_id = "/subscriptions/${var.subscription_id}"
  amount          = var.budget_amount
  time_grain      = "Monthly"

  time_period {
    start_date = var.budget_start_date
  }

  dynamic "notification" {
    for_each = {
      actual_50      = { threshold = 50, type = "Actual" }
      actual_80      = { threshold = 80, type = "Actual" }
      actual_100     = { threshold = 100, type = "Actual" }
      forecasted_100 = { threshold = 100, type = "Forecasted" }
    }
    content {
      enabled        = true
      threshold      = notification.value.threshold
      threshold_type = notification.value.type
      operator       = "GreaterThan"
      contact_emails = [var.alert_email]
    }
  }

  lifecycle {
    ignore_changes = [time_period]
  }
}
