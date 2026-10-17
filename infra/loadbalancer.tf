# Керований балансувальник Azure Application Gateway: єдине, що видно з інтернету.
# Контейнерне середовище внутрішнє (див. app.tf), тож напряму до застосунку не дістатись.

# Для Application Gateway потрібна власна підмережа без інших ресурсів.
resource "azurerm_subnet" "gateway" {
  name                 = "snet-gateway"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.4.0/24"]
}

# Єдина публічна адреса в усій інфраструктурі.
resource "azurerm_public_ip" "lb" {
  name                = "pip-${var.project}-lb"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  allocation_method   = "Static"
  sku                 = "Standard"
  domain_name_label   = "${var.project}-${random_string.suffix.result}"
}

locals {
  app_fqdn = azurerm_container_app.shop.ingress[0].fqdn
}

resource "azurerm_application_gateway" "main" {
  name                = "agw-${var.project}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  sku {
    name     = "Standard_v2"
    tier     = "Standard_v2"
    capacity = 1
  }

  gateway_ip_configuration {
    name      = "gateway-ip"
    subnet_id = azurerm_subnet.gateway.id
  }

  frontend_port {
    name = "http"
    port = 80
  }

  frontend_ip_configuration {
    name                 = "public"
    public_ip_address_id = azurerm_public_ip.lb.id
  }

  # Бекенд це приватна адреса внутрішнього середовища Container Apps.
  # Container Apps вибирає застосунок за заголовком Host, тому його підставляємо явно.
  backend_address_pool {
    name         = "shop"
    ip_addresses = [azurerm_container_app_environment.main.static_ip_address]
  }

  # Health check: балансувальник сам перевіряє /health і не шле трафік на нездорові екземпляри.
  probe {
    name                = "health"
    protocol            = "Http"
    host                = local.app_fqdn
    path                = "/health"
    interval            = 15
    timeout             = 5
    unhealthy_threshold = 3

    match {
      status_code = ["200"]
    }
  }

  backend_http_settings {
    name                  = "shop"
    port                  = 80
    protocol              = "Http"
    cookie_based_affinity = "Disabled"
    request_timeout       = 30
    host_name             = local.app_fqdn
    probe_name            = "health"
  }

  http_listener {
    name                           = "http"
    frontend_ip_configuration_name = "public"
    frontend_port_name             = "http"
    protocol                       = "Http"
  }

  request_routing_rule {
    name                       = "all"
    rule_type                  = "Basic"
    priority                   = 100
    http_listener_name         = "http"
    backend_address_pool_name  = "shop"
    backend_http_settings_name = "shop"
  }
}
