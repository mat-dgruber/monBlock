# ==============================================================================
# Makefile Canônico - Padrão de Engenharia CPB (Frontend Web / IA)
# ==============================================================================

SHELL := /bin/bash

ENV_FILE ?= .env
ENV_EXAMPLE_FILE ?= .env.example

# Pacotes MCP globais para Agentes de IA
NODE_NPX_PACKAGES := \
	@modelcontextprotocol/server-sequential-thinking \
	@playwright/mcp@latest \
	@upstash/context7-mcp \
	@modelcontextprotocol/server-github \
	figma-mcp \
	discord-mcp-server \
	@_davideast/stitch-mcp

.PHONY: help dev build test test-cov test-e2e lint typecheck clean \
        setup setup-node setup-python install-browsers env check-env clean-env export-env \
        check-node check-python check-pip

# Default target
help: ## Exibir comandos disponíveis
	@printf "\n"
	@printf "  \033[1mFrontend Web\033[0m - Comandos disponíveis (Padrão Canônico CPB)\n"
	@printf "\n"
	@printf "  \033[1;33m🌐 Desenvolvimento & Build\033[0m\n"
	@printf "  \033[36m  dev\033[0m              Iniciar servidor de desenvolvimento local\n"
	@printf "  \033[36m  build\033[0m            Compilar build de produção\n"
	@printf "  \033[36m  typecheck\033[0m        Verificação estática de tipos TypeScript (tsc)\n"
	@printf "  \033[36m  lint\033[0m             Executar linter (ESLint)\n"
	@printf "\n"
	@printf "  \033[1;33m🧪 Testes e Qualidade\033[0m\n"
	@printf "  \033[36m  test\033[0m             Executar testes unitários e de componente\n"
	@printf "  \033[36m  test-cov\033[0m         Executar testes com relatório de cobertura\n"
	@printf "  \033[36m  test-e2e\033[0m         Executar testes End-to-End (Playwright)\n"
	@printf "\n"
	@printf "  \033[1;33m🤖 Ambiente de IA / Harness / MCPs\033[0m\n"
	@printf "  \033[36m  setup\033[0m            Instalar dependências Node/Python, browsers e configurar .env\n"
	@printf "  \033[36m  setup-node\033[0m       Instalar pacotes npm globais necessários (MCPs)\n"
	@printf "  \033[36m  setup-python\033[0m     Instalar mempalace via pip\n"
	@printf "  \033[36m  install-browsers\033[0m Instalar browsers do Playwright\n"
	@printf "  \033[36m  env\033[0m              Criar arquivo .env baseado no .env.example\n"
	@printf "  \033[36m  check-env\033[0m        Verificar se o .env existe e chaves não preenchidas\n"
	@printf "  \033[36m  export-env\033[0m       Instrução para carregar .env no terminal atual\n"
	@printf "\n"

# ==============================================================================
# DESENVOLVIMENTO & BUILD
# ==============================================================================

dev: ## Iniciar servidor de desenvolvimento local
	npm start

build: ## Compilar build de produção
	npm run build

typecheck: ## Verificação estática de tipos TypeScript
	npx tsc --noEmit

lint: ## Executar linter
	npm run lint

# ==============================================================================
# TESTES
# ==============================================================================

test: ## Executar testes unitários e de componente
	npm test

test-cov: ## Executar testes com relatório de cobertura
	npm run test:ci

test-e2e: ## Executar testes End-to-End com Playwright
	npx playwright test

# ==============================================================================
# AMBIENTE DE IA E MCPS
# ==============================================================================

check-node:
	@command -v node >/dev/null 2>&1 || (echo "Node.js não encontrado. Instale Node.js 18+." && exit 1)
	@command -v npm >/dev/null 2>&1 || (echo "npm não encontrado." && exit 1)

check-python:
	@command -v python3 >/dev/null 2>&1 || (echo "Python 3 não encontrado." && exit 1)

check-pip:
	@python3 -m pip --version >/dev/null 2>&1 || (echo "pip não encontrado para python3." && exit 1)

setup-node: ## Instalar pacotes npm globais dos MCPs
	@echo "Instalando pacotes npm globais dos MCPs..."
	@npm install -g $(NODE_NPX_PACKAGES)

setup-python: ## Instalar MemPalace via pip
	@echo "Instalando MemPalace via pip..."
	@python3 -m pip install --upgrade pip
	@python3 -m pip install mempalace

install-browsers: ## Instalar browsers do Playwright
	@echo "Instalando browsers do Playwright..."
	@npx -y playwright install

env: ## Criar arquivo .env baseado no .env.example se não existir
	@if [ ! -f $(ENV_EXAMPLE_FILE) ]; then \
		echo "❌ Erro: $(ENV_EXAMPLE_FILE) não encontrado no repositório."; \
		exit 1; \
	fi
	@if [ -f $(ENV_FILE) ]; then \
		echo "ℹ️  $(ENV_FILE) já existe. Nenhuma alteração feita."; \
	else \
		cp $(ENV_EXAMPLE_FILE) $(ENV_FILE); \
		echo "✅ Arquivo $(ENV_FILE) criado a partir de $(ENV_EXAMPLE_FILE)."; \
	fi

check-env: ## Verificar se o .env existe e chaves não preenchidas
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "❌ Erro: $(ENV_FILE) não encontrado. Execute 'make env' primeiro."; \
		exit 1; \
	fi
	@echo "🔍 Verificando chaves não preenchidas no $(ENV_FILE)..."
	@UNFILLED=$$(grep -i "your_" $(ENV_FILE) | cut -d= -f1 | tr -d ' '); \
	if [ -n "$$UNFILLED" ]; then \
		echo ""; \
		echo "⚠️  As seguintes variáveis ainda possuem valores placeholder:"; \
		echo "$$UNFILLED" | while IFS= read -r var; do echo "   • $$var"; done; \
		echo ""; \
	else \
		echo "✅ Todas as variáveis do $(ENV_FILE) estão preenchidas."; \
	fi

clean-env: ## Remover o arquivo .env atual
	@rm -f $(ENV_FILE)
	@echo "Arquivo $(ENV_FILE) removido."

export-env: ## Instrução para carregar .env no terminal atual
	@echo "⚠️  O Makefile não pode modificar seu terminal atual diretamente."
	@echo "👉 Para carregar as variáveis no seu shell, execute:"
	@echo ""
	@echo "   source scripts/load-env.sh"
	@echo ""

setup: check-node setup-node install-browsers env check-env ## Instalar dependências, MCPs, browsers e configurar .env
	@echo ""
	@echo "=================================================================================="
	@echo " ✅ Setup completo do Frontend e Harness de IA concluído!"
	@echo " Para carregar as variáveis no seu shell atual, execute:"
	@echo ""
	@echo "      make export-env"
	@echo "=================================================================================="
