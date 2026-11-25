resource "azurerm_storage_account" "functions" {
  name                     = "st${var.project}${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  allow_nested_items_to_be_public = false
  min_tls_version                 = "TLS1_2"
}

resource "azurerm_storage_container" "deploy" {
  name                  = "app-package"
  storage_account_id    = azurerm_storage_account.functions.id
  container_access_type = "private"
}

resource "azurerm_service_plan" "functions" {
  name                = "plan-${var.project}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "FC1"
}

resource "azurerm_function_app_flex_consumption" "main" {
  name                = "func-${var.project}-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.functions.id

  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "${azurerm_storage_account.functions.primary_blob_endpoint}${azurerm_storage_container.deploy.name}"
  storage_authentication_type = "StorageAccountConnectionString"
  storage_access_key          = azurerm_storage_account.functions.primary_access_key

  runtime_name           = "node"
  runtime_version        = "22"
  maximum_instance_count = 10
  instance_memory_in_mb  = 512

  site_config {}

  app_settings = {
    SERVICEBUS_CONNECTION                 = azurerm_servicebus_namespace_authorization_rule.functions.primary_connection_string
    SERVICEBUS_QUEUE                      = azurerm_servicebus_queue.telemetry.name
    DATABASE_URL                          = local.database_url
    INGEST_API_KEY                        = random_password.api_key.result
    APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.main.connection_string
    COSMOS_ENDPOINT                       = azurerm_cosmosdb_account.main.endpoint
    COSMOS_KEY                            = azurerm_cosmosdb_account.main.primary_key
    COSMOS_DATABASE                       = azurerm_cosmosdb_sql_database.telemetry.name
    COSMOS_CONTAINER                      = azurerm_cosmosdb_sql_container.raw.name
    MEDIA_ACCOUNT_NAME                    = azurerm_storage_account.media.name
    MEDIA_ACCOUNT_KEY                     = azurerm_storage_account.media.primary_access_key
    MEDIA_CONTAINER                       = azurerm_storage_container.camera.name
  }
}

resource "terraform_data" "deploy_functions" {
  triggers_replace = [
    azurerm_function_app_flex_consumption.main.id,
    sha1(join("", [for f in sort(fileset("${path.module}/../functions/src", "**")) : filesha1("${path.module}/../functions/src/${f}")])),
    filesha1("${path.module}/../functions/package.json"),
    filesha1("${path.module}/../functions/host.json"),
  ]

  provisioner "local-exec" {
    command = <<-EOT
      set -e
      cd ${path.module}/../functions
      npm ci --omit=dev --silent
      rm -f ../functions.zip
      zip -qr ../functions.zip . -x "local.settings.json" -x ".funcignore"
      az functionapp deployment source config-zip \
        --resource-group ${azurerm_resource_group.main.name} \
        --name ${azurerm_function_app_flex_consumption.main.name} \
        --src ../functions.zip
    EOT
  }
}
