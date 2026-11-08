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

resource "azurerm_monitor_metric_alert" "max_replicas" {
  name                = "alert-${var.project}-max-replicas"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_container_app.shop.id]
  description         = "Досягнуто максимальну кількість екземплярів (3): масштабуватися далі нікуди."
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"
  auto_mitigate       = true

  criteria {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = "Replicas"
    aggregation      = "Maximum"
    operator         = "GreaterThanOrEqual"
    threshold        = 3
  }

  action {
    action_group_id = azurerm_monitor_action_group.email.id
  }
}

resource "azurerm_monitor_metric_alert" "errors_5xx" {
  name                = "alert-${var.project}-5xx"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_container_app.shop.id]
  description         = "Сайт повертає помилки 5xx."
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = "Requests"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 0

    dimension {
      name     = "statusCodeCategory"
      operator = "Include"
      values   = ["5xx"]
    }
  }

  action {
    action_group_id = azurerm_monitor_action_group.email.id
  }
}

locals {
  app_id = azurerm_container_app.shop.id

  latency_query = <<-KQL
    ContainerAppConsoleLogs_CL
    | where Log_s matches regex @" \d+ms$"
    | extend ms = toint(extract(@" (\d+)ms$", 1, Log_s))
    | summarize p95 = percentile(ms, 95) by bin(TimeGenerated, 1m)
    | order by TimeGenerated asc
  KQL

  dashboard_tiles = [
    {
      title   = "Екземпляри (Replicas)"
      x       = 0, y = 0
      metrics = [{ name = "Replicas", agg = 3, label = "Екземпляри" }]
    },
    {
      title   = "CPU, ядра (ліміт 0,25)"
      x       = 4, y = 0
      metrics = [{ name = "UsageNanoCores", agg = 4, label = "CPU" }]
    },
    {
      title   = "Запити за хвилину"
      x       = 8, y = 0
      metrics = [{ name = "Requests", agg = 1, label = "Запити" }]
    },
    {
      title   = "Черга замовлень (повідомлень)"
      id      = azurerm_servicebus_namespace.main.id
      ns      = "microsoft.servicebus/namespaces"
      x       = 8, y = 4
      metrics = [{ name = "ActiveMessages", agg = 4, label = "У черзі" }]
    },
    {
      title   = "Екземпляри обробника"
      id      = azurerm_container_app.worker.id
      x       = 0, y = 8
      metrics = [{ name = "Replicas", agg = 3, label = "Обробник" }]
    },
    {
      title   = "Відповіді 5xx"
      x       = 4, y = 4
      metrics = [{ name = "Requests", agg = 1, label = "5xx" }]
      filter  = { key = "statusCodeCategory", values = ["5xx"] }
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
                    resourceMetadata    = { id = try(t.id, local.app_id) }
                    name                = m.name
                    aggregationType     = m.agg
                    namespace           = try(t.ns, "microsoft.app/containerapps")
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

  latency_part = {
    position = { x = 0, y = 4, colSpan = 4, rowSpan = 4 }
    metadata = {
      type = "Extension/Microsoft_OperationsManagementSuite_Workspace/PartType/LogsDashboardPart"
      inputs = [
        { name = "resourceTypeMode", isOptional = true },
        { name = "ComponentId", isOptional = true },
        { name = "Scope", value = { resourceIds = [azurerm_log_analytics_workspace.main.id] }, isOptional = true },
        { name = "PartId", isOptional = true },
        { name = "Version", value = "2.0", isOptional = true },
        { name = "TimeRange", value = "PT1H", isOptional = true },
        { name = "DashboardId", isOptional = true },
        { name = "DraftRequestParameters", value = { scope = "hierarchy" }, isOptional = true },
        { name = "Query", value = local.latency_query, isOptional = true },
        { name = "ControlType", value = "FrameControlChart", isOptional = true },
        { name = "SpecificChart", value = "Line", isOptional = true },
        { name = "PartTitle", value = "Латентність p95, мс", isOptional = true },
        { name = "PartSubTitle", value = azurerm_log_analytics_workspace.main.name, isOptional = true },
        {
          name = "Dimensions"
          value = {
            xAxis       = { name = "TimeGenerated", type = "datetime" }
            yAxis       = [{ name = "p95", type = "real" }]
            splitBy     = []
            aggregation = "Sum"
          }
          isOptional = true
        },
        { name = "LegendOptions", value = { isEnabled = true, position = "Bottom" }, isOptional = true },
        { name = "IsQueryContainTimeRange", value = false, isOptional = true },
      ]
      settings = {}
    }
  }
}

resource "azurerm_portal_dashboard" "main" {
  name                = "dash-${var.project}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  tags = {
    "hidden-title" = "Все для дому: моніторинг"
  }

  dashboard_properties = jsonencode({
    lenses = {
      "0" = {
        order = 0
        parts = merge(local.dashboard_parts, { "4" = local.latency_part })
      }
    }
    metadata = { model = {} }
  })
}

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "latency" {
  name                 = "alert-${var.project}-latency-p95"
  resource_group_name  = azurerm_resource_group.main.name
  location             = azurerm_resource_group.main.location
  description          = "Латентність p95 понад 500 мс двічі поспіль (оцінка щохвилини)."
  severity             = 2
  evaluation_frequency = "PT1M"
  window_duration      = "PT5M"
  scopes               = [azurerm_log_analytics_workspace.main.id]

  auto_mitigation_enabled = true

  criteria {
    query                   = <<-KQL
      ContainerAppConsoleLogs_CL
      | where Log_s matches regex @" \d+ms$"
      | extend ms = toint(extract(@" (\d+)ms$", 1, Log_s))
      | summarize p95 = percentile(ms, 95) by bin(TimeGenerated, 1m)
    KQL
    time_aggregation_method = "Maximum"
    metric_measure_column   = "p95"
    operator                = "GreaterThan"
    threshold               = 500

    failing_periods {
      minimum_failing_periods_to_trigger_alert = 2
      number_of_evaluation_periods             = 2
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.email.id]
  }
}
