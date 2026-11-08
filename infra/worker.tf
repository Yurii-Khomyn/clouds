resource "azurerm_container_app" "worker" {
  name                         = "ca-${var.project}-worker"
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

  template {
    min_replicas = 1
    max_replicas = 3

    custom_scale_rule {
      name             = "queue-length"
      custom_rule_type = "azure-servicebus"
      metadata = {
        queueName    = azurerm_servicebus_queue.orders.name
        messageCount = "4"
      }
      authentication {
        secret_name       = "servicebus-connection"
        trigger_parameter = "connection"
      }
    }

    container {
      name    = "worker"
      image   = "${azurerm_container_registry.main.login_server}/shop:${var.image_tag}"
      cpu     = 0.25
      memory  = "0.5Gi"
      command = ["node", "src/worker.js"]

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
        name        = "SERVICEBUS_CONNECTION"
        secret_name = "servicebus-connection"
      }
      env {
        name  = "SERVICEBUS_QUEUE"
        value = azurerm_servicebus_queue.orders.name
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
