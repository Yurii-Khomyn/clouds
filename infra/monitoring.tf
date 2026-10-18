# Моніторинг: логи в Log Analytics, дашборд із базовими метриками і тривоги на email.
#
# Логи застосунку потрапляють у Log Analytics автоматично: середовище Container Apps
# підключене до робочої області (app.tf). Тут додаємо логи балансувальника, дашборд і тривоги.

# --- Логи балансувальника в Log Analytics ---
resource "azurerm_monitor_diagnostic_setting" "gateway" {
  name                       = "to-log-analytics"
  target_resource_id         = azurerm_application_gateway.main.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  enabled_log {
    category = "ApplicationGatewayAccessLog"
  }

  enabled_metric {
    category = "AllMetrics"
  }
}

# --- Куди надсилати тривоги ---
resource "azurerm_monitor_action_group" "email" {
  name                = "ag-${var.project}-email"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "homeshop"

  email_receiver {
    name                    = "owner"
    email_address           = var.alert_email
    use_common_alert_schema = true
  }
}

# --- Тривога 1: health check не проходить (балансувальник бачить нездоровий бекенд) ---
resource "azurerm_monitor_metric_alert" "unhealthy" {
  name                = "alert-${var.project}-unhealthy-backend"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_application_gateway.main.id]
  description         = "Health check застосунку (/health) не проходить: нездоровий бекенд."
  severity            = 1
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace = "Microsoft.Network/applicationGateways"
    metric_name      = "UnhealthyHostCount"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 0
  }

  action {
    action_group_id = azurerm_monitor_action_group.email.id
  }
}

# --- Тривога 2: помилки 5xx ---
resource "azurerm_monitor_metric_alert" "errors_5xx" {
  name                = "alert-${var.project}-5xx"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_application_gateway.main.id]
  description         = "Сайт повертає помилки 5xx."
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace = "Microsoft.Network/applicationGateways"
    metric_name      = "ResponseStatus"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 0

    dimension {
      name     = "HttpStatusGroup"
      operator = "Include"
      values   = ["5xx"]
    }
  }

  action {
    action_group_id = azurerm_monitor_action_group.email.id
  }
}

# --- Дашборд ---
locals {
  gw_id  = azurerm_application_gateway.main.id
  app_id = azurerm_container_app.shop.id

  # aggregationType у дашбордах Azure: 1 = Sum, 4 = Average
  dashboard_tiles = [
    {
      title   = "Кількість запитів"
      id      = local.gw_id
      ns      = "microsoft.network/applicationgateways"
      x       = 0, y = 0
      metrics = [{ name = "TotalRequests", agg = 1, label = "Запити" }]
    },
    {
      title   = "Помилки 5xx"
      id      = local.gw_id
      ns      = "microsoft.network/applicationgateways"
      x       = 4, y = 0
      metrics = [{ name = "ResponseStatus", agg = 1, label = "Відповіді 5xx" }]
      filter  = { key = "HttpStatusGroup", values = ["5xx"] }
    },
    {
      title   = "Затримка відповіді, мс"
      id      = local.gw_id
      ns      = "microsoft.network/applicationgateways"
      x       = 8, y = 0
      metrics = [{ name = "ApplicationGatewayTotalTime", agg = 4, label = "Середня затримка" }]
    },
    {
      title = "Стан бекенду (health check)"
      id    = local.gw_id
      ns    = "microsoft.network/applicationgateways"
      x     = 0, y = 4
      metrics = [
        { name = "HealthyHostCount", agg = 4, label = "Здорові" },
        { name = "UnhealthyHostCount", agg = 4, label = "Нездорові" },
      ]
    },
    {
      title   = "CPU застосунку (наноядра)"
      id      = local.app_id
      ns      = "microsoft.app/containerapps"
      x       = 4, y = 4
      metrics = [{ name = "UsageNanoCores", agg = 4, label = "CPU" }]
    },
    {
      title   = "Пам'ять застосунку (байти)"
      id      = local.app_id
      ns      = "microsoft.app/containerapps"
      x       = 8, y = 4
      metrics = [{ name = "WorkingSetBytes", agg = 4, label = "Пам'ять" }]
    },
  ]

  dashboard_parts = {
    for i, t in local.dashboard_tiles : tostring(i) => {
      position = { x = t.x, y = t.y, colSpan = 4, rowSpan = 4 }
      metadata = {
        type = "Extension/HubsExtension/PartType/MonitorChartPart"
        inputs = [
          { name = "options", isOptional = true },
          { name = "sharedTimeRange", isOptional = true },
        ]
        settings = {
          content = {
            options = {
              chart = merge({
                title     = t.title
                titleKind = 2
                metrics = [
                  for m in t.metrics : {
                    resourceMetadata    = { id = t.id }
                    name                = m.name
                    aggregationType     = m.agg
                    namespace           = t.ns
                    metricVisualization = { displayName = m.label }
                  }
                ]
                visualization    = { chartType = 2 }
                openBladeOnClick = { openBlade = true }
                }, try(t.filter, null) == null ? {} : {
                filterCollection = {
                  filters = [{ key = t.filter.key, operator = 0, values = t.filter.values }]
                }
              })
            }
          }
        }
      }
    }
  }
}

resource "azurerm_portal_dashboard" "main" {
  name                = "dash-${var.project}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  # Ім'я, яке видно в порталі.
  tags = {
    "hidden-title" = "Все для дому: моніторинг"
  }

  dashboard_properties = jsonencode({
    lenses = {
      "0" = {
        order = 0
        parts = local.dashboard_parts
      }
    }
    metadata = { model = {} }
  })
}
