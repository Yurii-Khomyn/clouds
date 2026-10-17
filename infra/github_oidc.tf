# Доступ GitHub Actions до Azure через OIDC: без паролів і ключів.
# GitHub підписує короткоживучий токен, Azure перевіряє його проти федеративного
# облікового запису нижче і лише тоді видає права.

data "azurerm_client_config" "current" {}

resource "azurerm_user_assigned_identity" "github" {
  name                = "id-${var.project}-github"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
}

# Довіряємо токенам лише з нашого репозиторію і лише з гілки main.
# Інші гілки, форки та репозиторії отримають відмову.
resource "azurerm_federated_identity_credential" "github_main" {
  name                = "github-main"
  resource_group_name = azurerm_resource_group.main.name
  parent_id           = azurerm_user_assigned_identity.github.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = "https://token.actions.githubusercontent.com"
  subject             = "repo:${var.github_repo}:ref:refs/heads/main"
}

# Мінімально потрібні права: пушити образи в реєстр...
resource "azurerm_role_assignment" "github_acr_push" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPush"
  principal_id         = azurerm_user_assigned_identity.github.principal_id
}

# ...і оновлювати застосунок лише в нашій групі ресурсів, а не в усій підписці.
resource "azurerm_role_assignment" "github_deploy" {
  scope                = azurerm_resource_group.main.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.github.principal_id
}
