resource "azurerm_container_app" "redis" {
  name                         = "ca-${var.project}-redis"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"

  ingress {
    external_enabled = false
    transport        = "tcp"
    target_port      = 6379
    exposed_port     = 6379
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name    = "redis"
      image   = "docker.io/library/redis:7-alpine"
      cpu     = 0.25
      memory  = "0.5Gi"
      command = ["redis-server", "--appendonly", "no", "--maxmemory", "128mb", "--maxmemory-policy", "allkeys-lru"]
    }
  }
}
