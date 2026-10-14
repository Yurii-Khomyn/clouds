# Пароль адміна генерується Terraform і живе лише в state (він у .gitignore),
# тобто в репозиторії його немає ніде.
resource "random_password" "db" {
  length  = 24
  special = false
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                = "psql-${var.project}-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  version    = "17"
  sku_name   = "B_Standard_B1ms" # найдешевший, Burstable
  storage_mb = 32768

  administrator_login    = "shopadmin"
  administrator_password = random_password.db.result

  # Приватний доступ: сервер у делегованій підмережі, публічної адреси немає.
  delegated_subnet_id           = azurerm_subnet.db.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgres.id
  public_network_access_enabled = false

  backup_retention_days = 7

  lifecycle {
    ignore_changes = [zone]
  }

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres]
}

resource "azurerm_postgresql_flexible_server_database" "shop" {
  name      = "shop"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}
