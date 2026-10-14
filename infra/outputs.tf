output "app_url" {
  description = "Публічна адреса магазину"
  value       = "https://${azurerm_container_app.shop.ingress[0].fqdn}"
}

output "resource_group" {
  value = azurerm_resource_group.main.name
}

output "acr_name" {
  value = azurerm_container_registry.main.name
}

output "container_app_name" {
  value = azurerm_container_app.shop.name
}

output "db_fqdn" {
  description = "Приватна адреса бази (з інтернету недоступна)"
  value       = azurerm_postgresql_flexible_server.main.fqdn
}
