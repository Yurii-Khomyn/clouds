resource "azurerm_container_registry" "main" {
  name                = "acr${replace(var.project, "-", "")}${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = false
}

resource "azurerm_user_assigned_identity" "app" {
  name                = "id-${var.project}-app"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "time_sleep" "role_propagation" {
  create_duration = "60s"
  depends_on      = [azurerm_role_assignment.acr_pull]
}

resource "terraform_data" "initial_image" {
  triggers_replace = [azurerm_container_registry.main.id, var.image_tag]

  provisioner "local-exec" {
    command = <<-EOT
      az acr login --name ${azurerm_container_registry.main.name} &&
      docker buildx build --platform linux/amd64 --provenance=false \
        -t ${azurerm_container_registry.main.login_server}/shop:${var.image_tag} \
        --push ${path.module}/../app
    EOT
  }
}
