# Приватний реєстр: без автентифікації образи не завантажити. Admin-користувач вимкнено.
resource "azurerm_container_registry" "main" {
  name                = "acr${replace(var.project, "-", "")}${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = false
}

# Особистість застосунку. Через неї він тягне образ з реєстру, без жодного пароля.
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

# Права в Azure застосовуються не миттєво, тож чекаємо перед створенням застосунку.
resource "time_sleep" "role_propagation" {
  create_duration = "60s"
  depends_on      = [azurerm_role_assignment.acr_pull]
}

# Перша збірка і публікація образу, щоб `terraform apply` з порожнього акаунта
# одразу дав робочий сайт. Збираємо під linux/amd64: на Mac (arm64) без цього
# образ не запуститься в Azure. Далі образи публікує CI.
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
