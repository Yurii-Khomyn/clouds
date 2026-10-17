output "app_url" {
  description = "Публічна адреса магазину (через балансувальник)"
  value       = "http://${azurerm_public_ip.lb.fqdn}"
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

# Нижче ідентифікатори, не секрети: їх підставляє workflow через змінні GitHub.
output "github_client_id" {
  value = azurerm_user_assigned_identity.github.client_id
}

output "tenant_id" {
  value = data.azurerm_client_config.current.tenant_id
}

output "acr_login_server" {
  value = azurerm_container_registry.main.login_server
}
