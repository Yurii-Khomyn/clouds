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

  # Середовище живе у нашій VNet, тому застосунок бачить базу за приватною адресою.
  infrastructure_subnet_id = azurerm_subnet.app.id

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
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

  # Рядок підключення: секрет Container Apps, а в контейнер потрапляє як змінна середовища.
  secret {
    name  = "database-url"
    value = "postgres://${azurerm_postgresql_flexible_server.main.administrator_login}:${random_password.db.result}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/${azurerm_postgresql_flexible_server_database.shop.name}"
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = 1
    max_replicas = 2

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
        name  = "DB_SSL"
        value = "true" # керований Postgres приймає лише TLS
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

  # Образ далі оновлює CI, а Terraform цю зміну не відкочує.
  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [
    time_sleep.role_propagation,
    terraform_data.initial_image,
  ]
}
