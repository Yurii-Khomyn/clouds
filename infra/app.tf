resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${var.project}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${var.project}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  infrastructure_subnet_id = azurerm_subnet.app.id

  internal_load_balancer_enabled = false
  public_network_access          = "Enabled"

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}

resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "azurerm_container_app" "shop" {
  name                         = "ca-${var.project}"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.app.id
  }

  secret {
    name  = "database-url"
    value = "postgres://${azurerm_postgresql_flexible_server.main.administrator_login}:${random_password.db.result}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/${azurerm_postgresql_flexible_server_database.shop.name}"
  }

  secret {
    name  = "jwt-secret"
    value = random_password.jwt.result
  }

  secret {
    name  = "servicebus-connection"
    value = azurerm_servicebus_namespace_authorization_rule.app.primary_connection_string
  }

  ingress {
    external_enabled           = true
    allow_insecure_connections = true
    target_port                = 3000
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    cooldown_period_in_seconds = 300

    custom_scale_rule {
      name             = "day-schedule"
      custom_rule_type = "cron"
      metadata = {
        timezone        = var.schedule_timezone
        start           = var.schedule_day_start
        end             = var.schedule_day_end
        desiredReplicas = tostring(var.schedule_day_replicas)
      }
    }

    custom_scale_rule {
      name             = "cpu"
      custom_rule_type = "cpu"
      metadata = {
        type  = "Utilization"
        value = "60"
      }
    }

    container {
      name   = "shop"
      image  = "${azurerm_container_registry.main.login_server}/shop:${var.image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name        = "JWT_SECRET"
        secret_name = "jwt-secret"
      }
      env {
        name  = "DB_SSL"
        value = "true"
      }
      env {
        name  = "REDIS_URL"
        value = "redis://${azurerm_container_app.redis.name}:6379"
      }
      env {
        name  = "CACHE_ENABLED"
        value = tostring(var.cache_enabled)
      }
      env {
        name        = "SERVICEBUS_CONNECTION"
        secret_name = "servicebus-connection"
      }
      env {
        name  = "SERVICEBUS_QUEUE"
        value = azurerm_servicebus_queue.orders.name
      }
      env {
        name  = "ORDERS_MODE"
        value = var.orders_mode
      }
      env {
        name  = "CACHE_TTL_SECONDS"
        value = "45"
      }

      liveness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 3000
      }
      readiness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 3000
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [
    time_sleep.role_propagation,
    terraform_data.initial_image,
  ]
}
