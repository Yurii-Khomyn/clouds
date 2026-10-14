terraform {
  required_version = ">= 1.9"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
    }
  }
}

provider "azurerm" {
  features {}

  subscription_id = var.subscription_id
  # Провайдери ресурсів (App, Postgres, ...) зареєстровано заздалегідь через `az provider register`.
  resource_provider_registrations = "none"
}
