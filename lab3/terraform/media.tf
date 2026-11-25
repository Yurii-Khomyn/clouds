resource "azurerm_storage_account" "media" {
  name                     = "stmedia${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  allow_nested_items_to_be_public = false
  min_tls_version                 = "TLS1_2"
}

resource "azurerm_storage_container" "camera" {
  name                  = "camera"
  storage_account_id    = azurerm_storage_account.media.id
  container_access_type = "private"
}

resource "azurerm_storage_management_policy" "media" {
  storage_account_id = azurerm_storage_account.media.id

  rule {
    name    = "delete-old-snapshots"
    enabled = true
    filters {
      prefix_match = ["camera/"]
      blob_types   = ["blockBlob"]
    }
    actions {
      base_blob {
        delete_after_days_since_creation_greater_than = 7
      }
    }
  }
}
