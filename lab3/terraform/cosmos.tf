resource "azurerm_cosmosdb_account" "main" {
  name                = "cosmos-${var.project}-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.cosmos_location
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  capabilities {
    name = "EnableServerless"
  }

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = var.cosmos_location
    failover_priority = 0
  }
}

resource "azurerm_cosmosdb_sql_database" "telemetry" {
  name                = "telemetry"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
}

resource "azurerm_cosmosdb_sql_container" "raw" {
  name                = "raw"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  database_name       = azurerm_cosmosdb_sql_database.telemetry.name

  partition_key_paths   = ["/sensor_id"]
  partition_key_version = 2
}
