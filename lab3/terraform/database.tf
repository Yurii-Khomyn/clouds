resource "azurerm_postgresql_flexible_server" "main" {
  name                = "psql-${var.project}-${var.db_location}-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.db_location

  version    = "17"
  sku_name   = var.db_sku
  storage_mb = 32768

  administrator_login    = "iotadmin"
  administrator_password = random_password.db.result

  public_network_access_enabled = true
  backup_retention_days         = 7

  lifecycle {
    ignore_changes = [zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "iot" {
  name      = "iot"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "allow-azure-services"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "client" {
  count = var.client_ip == "" ? 0 : 1

  name             = "author-client"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = var.client_ip
  end_ip_address   = var.client_ip
}

resource "azurerm_postgresql_flexible_server_configuration" "pgbouncer" {
  count = var.enable_pgbouncer ? 1 : 0

  name      = "pgbouncer.enabled"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "true"
}

locals {
  db_port      = var.enable_pgbouncer ? 6432 : 5432
  database_url = "postgres://${azurerm_postgresql_flexible_server.main.administrator_login}:${random_password.db.result}@${azurerm_postgresql_flexible_server.main.fqdn}:${local.db_port}/${azurerm_postgresql_flexible_server_database.iot.name}"
}
