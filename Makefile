.PHONY: dev up down logs migrate studio build test typecheck

# ── Local dev (Docker) ────────────────────────────────────────────────────────
dev:
	docker compose up -d

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f app

tools:
	docker compose --profile tools up -d

# ── Database ──────────────────────────────────────────────────────────────────
migrate:
	npm run db:migrate

generate:
	npm run db:generate

studio:
	npm run db:studio

# ── App ───────────────────────────────────────────────────────────────────────
build:
	npm run build

test:
	npm test

typecheck:
	npx tsc --noEmit

# gate: chạy trước khi commit
check: typecheck test build
	@echo "✅ All gates passed"

# ── Production ────────────────────────────────────────────────────────────────
prod-up:
	docker compose -f docker-compose.prod.yml up -d

prod-down:
	docker compose -f docker-compose.prod.yml down

prod-logs:
	docker compose -f docker-compose.prod.yml logs -f app
