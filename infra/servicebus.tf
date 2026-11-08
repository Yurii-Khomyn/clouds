resource "azurerm_servicebus_namespace" "main" {
  name                = "sb-${var.project}-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
}

resource "azurerm_servicebus_queue" "orders" {
  name         = "orders"
  namespace_id = azurerm_servicebus_namespace.main.id

  max_delivery_count = 10
  lock_duration      = "PT1M"
}

resource "azurerm_servicebus_namespace_authorization_rule" "app" {
  name         = "app"
  namespace_id = azurerm_servicebus_namespace.main.id

  listen = true
  send   = true
  manage = true
}
