.DEFAULT_GOAL := help

NPM := npm

.PHONY: help install dev build test lint typecheck clean start down

help: ## Show available project commands
	@awk 'BEGIN {FS = ":.*## "; printf "Usage: make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install all workspace dependencies
	$(NPM) install

dev: ## Start the client and server development servers
	$(NPM) run dev

down: ## Stop this project's dev and production processes
	@set -eu; \
	ROOT="$(CURDIR)"; \
	PIDS="$$( { \
		lsof -tiTCP:3001 -sTCP:LISTEN 2>/dev/null || true; \
		lsof -tiTCP:5173 -sTCP:LISTEN 2>/dev/null || true; \
		pgrep -f "$$ROOT/node_modules/.bin/(concurrently|tsx|vite)" 2>/dev/null || true; \
	} | sort -u)"; \
	if [ -n "$$PIDS" ]; then \
		echo "Stopping project processes: $$PIDS"; \
		kill $$PIDS 2>/dev/null || true; \
		sleep 1; \
		REMAINING="$$( { \
			lsof -tiTCP:3001 -sTCP:LISTEN 2>/dev/null || true; \
			lsof -tiTCP:5173 -sTCP:LISTEN 2>/dev/null || true; \
			pgrep -f "$$ROOT/node_modules/.bin/(concurrently|tsx|vite)" 2>/dev/null || true; \
		} | sort -u)"; \
		if [ -n "$$REMAINING" ]; then kill -KILL $$REMAINING 2>/dev/null || true; fi; \
	else \
		echo "No project processes found"; \
	fi

build: ## Build shared, server, and client packages
	$(NPM) run build

test: ## Run the shared package test suite
	$(NPM) test

lint: ## Lint the client and server packages
	$(NPM) run lint

typecheck: ## Typecheck shared, client, and server packages
	$(NPM) run typecheck

start: build ## Build the project and start the production server
	$(NPM) run start --workspace=server

clean: ## Remove generated build output
	rm -rf shared/dist client/dist server/dist
