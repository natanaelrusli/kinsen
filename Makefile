# Kinsen VPS deployment (Ubuntu/Debian).
#
# First deploy:
#   make setup                               # system packages, Node, pnpm, deps
#   nano .env.local                          # fill in Clerk production keys
#   make deploy                              # bare IP over HTTP; or DOMAIN=kinsen.example.com
#   make deploy WEB_PORT=8080                # serve on another port, leaving 80 free
#   make https DOMAIN=kinsen.example.com CERTBOT_EMAIL=you@example.com
#
# Updates:  make update [DOMAIN=kinsen.example.com]   (git pull, rebuild, restart)

SHELL := /bin/bash
.DEFAULT_GOAL := help

APP_DIR  := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
APP_USER ?= $(shell id -un)
# Leave DOMAIN unset to serve on the server's bare IP over HTTP.
DOMAIN   ?= _
# Public nginx port. Use e.g. WEB_PORT=8080 to leave port 80 free for other apps.
WEB_PORT ?= 80
# Only claim default_server for bare-IP mode on port 80.
DEFAULT_SERVER := $(if $(and $(filter _,$(DOMAIN)),$(filter 80,$(WEB_PORT))),default_server,)
PUBLIC_IP = $(shell curl -fsS4 https://ifconfig.me 2>/dev/null || hostname -I | cut -d' ' -f1)
API_PORT ?= 3001
DATA_DIR ?= /var/lib/kinsen
SERVICE  := kinsen-api
NODE_MAJOR ?= 22
CERTBOT_EMAIL ?=

NGINX_SITE := /etc/nginx/sites-available/kinsen
ENV_FILE   := $(APP_DIR)/.env.local
PNPM       := pnpm

.PHONY: help setup packages node pnpm install env build migrate service nginx deploy update https \
        start stop restart status logs backup check-env check-domain

help:
	@echo "Kinsen deploy targets (override with DOMAIN=, WEB_PORT=, API_PORT=, DATA_DIR=):"
	@echo "  setup    Install nginx, Node $(NODE_MAJOR), pnpm, workspace dependencies; create .env.local"
	@echo "  deploy   Build, migrate DB, install systemd service + nginx site, (re)start"
	@echo "  update   git pull --ff-only, then deploy"
	@echo "  https    Obtain a Let's Encrypt certificate (needs DOMAIN= and CERTBOT_EMAIL=)"
	@echo "  start | stop | restart | status | logs   Manage the API service"
	@echo "  backup   Copy the SQLite database to $(DATA_DIR)/backups"

# ---------- setup ----------

setup: packages node pnpm install env
	@echo; echo "Setup done. Edit $(ENV_FILE), then run: make deploy"

packages:
	sudo apt-get update
	sudo apt-get install -y nginx curl ca-certificates git ufw sqlite3
	-sudo ufw allow OpenSSH
	-sudo ufw allow 'Nginx Full'
	@echo "Note: ufw rules added but ufw not enabled; run 'sudo ufw enable' yourself if desired."

node:
	@if node -v 2>/dev/null | grep -qE '^v($(NODE_MAJOR)|2[3-9]|[3-9][0-9])\.'; then \
	  echo "Node $$(node -v) already installed"; \
	else \
	  curl -fsSL https://deb.nodesource.com/setup_$(NODE_MAJOR).x | sudo -E bash - && \
	  sudo apt-get install -y nodejs; \
	fi

pnpm:
	@command -v corepack >/dev/null || sudo npm install -g corepack
	sudo corepack enable
	corepack prepare "$$(node -p "require('$(APP_DIR)/package.json').packageManager")" --activate

install:
	cd $(APP_DIR) && $(PNPM) install --frozen-lockfile

env:
	@if [ -f $(ENV_FILE) ]; then echo "$(ENV_FILE) exists, leaving it alone"; else \
	  printf '%s\n' \
	    '# Clerk PRODUCTION instance keys (https://dashboard.clerk.com)' \
	    'CLERK_PUBLISHABLE_KEY=' \
	    'CLERK_SECRET_KEY=' \
	    > $(ENV_FILE); \
	  chmod 600 $(ENV_FILE); \
	  echo "Created $(ENV_FILE) - fill in your Clerk keys"; \
	fi

check-env:
	@test -f $(ENV_FILE) || { echo "Missing $(ENV_FILE): run 'make setup'"; exit 1; }
	@grep -qE '^CLERK_PUBLISHABLE_KEY=.+' $(ENV_FILE) && grep -qE '^CLERK_SECRET_KEY=.+' $(ENV_FILE) || \
	  { echo "Fill CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in $(ENV_FILE)"; exit 1; }

check-domain:
	@test "$(DOMAIN)" != "_" || { echo "Set DOMAIN=your.domain"; exit 1; }

# ---------- build / deploy ----------

build: check-env
	cd $(APP_DIR) && $(PNPM) install --frozen-lockfile
	cd $(APP_DIR) && $(PNPM) --filter @kinsen/budget-domain build
	cd $(APP_DIR) && $(PNPM) --filter @kinsen/api build
	cd $(APP_DIR) && $(PNPM) --filter @kinsen/web build

migrate:
	sudo install -d -o $(APP_USER) -g $(APP_USER) -m 750 $(DATA_DIR)
	cd $(APP_DIR)/apps/api && set -a && . $(ENV_FILE) && set +a && \
	  DATABASE_PATH=$(DATA_DIR)/kinsen.sqlite $(PNPM) exec tsx src/db/migrate.ts

service:
	sed -e 's|@USER@|$(APP_USER)|g' -e 's|@APP_DIR@|$(APP_DIR)|g' \
	    -e 's|@API_PORT@|$(API_PORT)|g' -e 's|@DATA_DIR@|$(DATA_DIR)|g' \
	    -e 's|@NODE@|$(shell command -v node)|g' \
	    $(APP_DIR)/deploy/kinsen-api.service.in | sudo tee /etc/systemd/system/$(SERVICE).service >/dev/null
	sudo systemctl daemon-reload
	sudo systemctl enable $(SERVICE)
	sudo systemctl restart $(SERVICE)

nginx:
	# nginx (www-data) must be able to traverse to the built files.
	chmod o+x $(dir $(APP_DIR)) $(APP_DIR) $(APP_DIR)/apps $(APP_DIR)/apps/web
	chmod -R o+rX $(APP_DIR)/apps/web/dist
	sed -e 's|@DOMAIN@|$(DOMAIN)|g' -e 's|@APP_DIR@|$(APP_DIR)|g' -e 's|@API_PORT@|$(API_PORT)|g' \
	    -e 's|@WEB_PORT@|$(WEB_PORT)|g' -e 's|@DEFAULT_SERVER@|$(DEFAULT_SERVER)|g' \
	    $(APP_DIR)/deploy/nginx.conf.in | sudo tee $(NGINX_SITE) >/dev/null
	sudo ln -sf $(NGINX_SITE) /etc/nginx/sites-enabled/kinsen
	# Bare-IP mode: nginx's stock default site would also claim default_server.
	$(if $(DEFAULT_SERVER),-sudo unlink /etc/nginx/sites-enabled/default)
	-sudo ufw allow $(WEB_PORT)/tcp
	sudo nginx -t
	sudo systemctl reload nginx

deploy: build migrate service nginx
	@sleep 2; curl -fsS http://127.0.0.1:$(API_PORT)/api/health && echo && echo "Deployed: http://$(if $(filter _,$(DOMAIN)),$(PUBLIC_IP),$(DOMAIN))$(if $(filter 80,$(WEB_PORT)),,:$(WEB_PORT))"

update:
	cd $(APP_DIR) && git pull --ff-only
	$(MAKE) deploy DOMAIN='$(DOMAIN)'

https: check-domain
	@test -n "$(CERTBOT_EMAIL)" || { echo "Set CERTBOT_EMAIL=you@example.com"; exit 1; }
	sudo apt-get install -y certbot python3-certbot-nginx
	sudo certbot --nginx -d $(DOMAIN) -m $(CERTBOT_EMAIL) --agree-tos --no-eff-email --redirect -n

# ---------- operations ----------

start stop restart:
	sudo systemctl $@ $(SERVICE)

status:
	systemctl status $(SERVICE) --no-pager

logs:
	journalctl -u $(SERVICE) -f

backup:
	sudo install -d -o $(APP_USER) -g $(APP_USER) $(DATA_DIR)/backups
	sqlite3 $(DATA_DIR)/kinsen.sqlite ".backup '$(DATA_DIR)/backups/kinsen-$$(date +%F-%H%M%S).sqlite'"
