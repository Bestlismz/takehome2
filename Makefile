.DEFAULT_GOAL := help
.PHONY: help setup dev test test-js test-python build up down logs health

PYTHON ?= .venv/bin/python
UV ?= uv
NODE ?= node
COMPOSE = docker compose $(if $(wildcard .env.local),--env-file .env.local,)
PORT ?= $(if $(LUKLAAN_PORT),$(LUKLAAN_PORT),5173)

help:
	@echo "Luklaan | ลูกหลาน"
	@echo "  make setup        Install the pinned Python dependencies"
	@echo "  make dev          Run the app at http://localhost:$(PORT)"
	@echo "  make test         Run JavaScript and PostgreSQL-backed Python tests"
	@echo "  make up           Build and start Luklaan with PostgreSQL in Docker"
	@echo "  make down         Stop Docker services and keep database data"
	@echo "  make logs         Follow Docker service logs"
	@echo "  make health       Check the app health endpoint"

.venv/bin/python:
	$(UV) venv --python python3 .venv

setup: .venv/bin/python
	$(UV) pip install --python $(PYTHON) -r requirements.txt

dev:
	$(PYTHON) app/server.py --port $(PORT)

test: test-js test-python

test-js:
	PATH="$(CURDIR)/.venv/bin:$$PATH" $(NODE) --test app/tests/*.test.mjs

test-python:
	$(PYTHON) -m unittest discover -s app/tests -p 'test_*.py'

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

health:
	curl -fsS http://localhost:$(PORT)/api/health
