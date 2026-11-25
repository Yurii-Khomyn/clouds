output "ingest_url" {
  description = "Публічна адреса приймача (POST)"
  value       = "https://${azurerm_function_app_flex_consumption.main.default_hostname}/api/ingest"
}

output "history_url" {
  description = "Шаблон адреси історії (GET)"
  value       = "https://${azurerm_function_app_flex_consumption.main.default_hostname}/api/sensors/{sensor_id}/history"
}

output "api_key" {
  description = "Ключ доступу (заголовок x-api-key)"
  value       = random_password.api_key.result
  sensitive   = true
}

output "function_app_name" {
  value = azurerm_function_app_flex_consumption.main.name
}

output "resource_group" {
  value = azurerm_resource_group.main.name
}

output "db_host" {
  value = azurerm_postgresql_flexible_server.main.fqdn
}

output "db_password" {
  value     = random_password.db.result
  sensitive = true
}

output "servicebus_connection" {
  value     = azurerm_servicebus_namespace_authorization_rule.functions.primary_connection_string
  sensitive = true
}

output "servicebus_namespace" {
  value = azurerm_servicebus_namespace.main.name
}

output "upload_url_endpoint" {
  description = "Адреса видачі підписаного URL для камери (POST)"
  value       = "https://${azurerm_function_app_flex_consumption.main.default_hostname}/api/camera/upload-url"
}

output "cosmos_account" {
  value = azurerm_cosmosdb_account.main.name
}

output "media_account" {
  value = azurerm_storage_account.media.name
}

output "app_insights_name" {
  value = azurerm_application_insights.main.name
}
