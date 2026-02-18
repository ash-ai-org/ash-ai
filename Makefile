.PHONY: install build clean test test-integration test-cli test-restore typecheck bench bench-sandbox bench-sandbox-crdb bench-all \
       server qa-bot deploy-qa-bot \
       dev dev-no-sandbox kill logs \
       docker-build docker-start docker-stop docker-status docker-logs \
       ec2-deploy ec2-teardown ec2-smoke-test \
       gce-deploy gce-teardown gce-smoke-test \
       publish publish-dry-run \
       openapi sdk-python

# -- Setup --------------------------------------------------------------------

install:
	pnpm install

build:
	pnpm build

clean:
	pnpm clean

# -- Quality ------------------------------------------------------------------

test:
	pnpm test

test-integration:
	pnpm test:integration

test-cli: build docker-build
	npx vitest run --config vitest.integration.config.ts test/integration/cli.test.ts

test-restore: build docker-build
	npx vitest run --config vitest.integration.config.ts test/integration/session-restore.test.ts

test-all:
	pnpm test:all

typecheck:
	pnpm typecheck

bench:
	pnpm bench

bench-sandbox: build docker-build
	tsx test/bench/sandbox-startup.ts

bench-sandbox-crdb: build docker-build
	tsx test/bench/sandbox-startup.ts --db crdb

bench-all: build docker-build
	pnpm bench
	tsx test/bench/sandbox-startup.ts
	tsx test/bench/sandbox-startup.ts --db crdb

# -- Run (native) -------------------------------------------------------------

server:
	ASH_REAL_SDK=1 pnpm --filter '@ash-ai/server' dev

qa-bot:
	pnpm --filter qa-bot dev

# Deploy the qa-bot agent to a running Ash server, then start the web UI
deploy-qa-bot:
	npx tsx packages/cli/src/index.ts deploy ./examples/qa-bot/agent --name qa-bot

# Start Ash server in Docker, deploy qa-bot agent, then start QA Bot UI
dev: docker-build
	@echo "Starting Ash server (Docker) + QA Bot UI..."
	@echo ""
	npx tsx packages/cli/src/index.ts start --image ash-dev --no-pull
	@echo ""
	@echo "Deploying qa-bot agent..."
	npx tsx packages/cli/src/index.ts deploy ./examples/qa-bot/agent --name qa-bot
	@echo ""
	@echo "  Ash server  → http://localhost:4100 (Docker)"
	@echo "  QA Bot UI   → http://localhost:3100"
	@echo ""
	@trap 'npx tsx packages/cli/src/index.ts stop 2>/dev/null; kill 0' EXIT; \
	pnpm --filter qa-bot dev & \
	wait

# Start both server + qa-bot natively (no Docker, no sandbox)
dev-no-sandbox:
	@echo "Starting Ash server + QA Bot UI (native, no sandbox)..."
	@echo "  Ash server  → http://localhost:4100"
	@echo "  QA Bot UI   → http://localhost:3100"
	@echo ""
	@trap 'kill 0' EXIT; \
	ASH_REAL_SDK=1 pnpm --filter '@ash-ai/server' dev & \
	sleep 2 && pnpm --filter qa-bot dev & \
	wait

# Kill processes on dev ports (4100, 3100) and stop Docker container
kill:
	@echo "Killing processes on ports 4100 and 3100..."
	@-npx tsx packages/cli/src/index.ts stop 2>/dev/null; true
	@-lsof -ti :4100 | xargs kill 2>/dev/null; true
	@-lsof -ti :3100 | xargs kill 2>/dev/null; true
	@echo "Done."

# -- Docker -------------------------------------------------------------------

# Build local dev image (ash-dev)
docker-build:
	docker build -t ash-dev .

# Start server in Docker using local dev image
docker-start: docker-build
	npx tsx packages/cli/src/index.ts start --image ash-dev --no-pull

# Stop server container
docker-stop:
	npx tsx packages/cli/src/index.ts stop

# Show container status + health
docker-status:
	npx tsx packages/cli/src/index.ts status

# Show container logs (-f to follow)
docker-logs:
	npx tsx packages/cli/src/index.ts logs

# -- EC2 Deployment -----------------------------------------------------------

# Deploy Ash server to EC2 (requires .env with AWS credentials)
ec2-deploy:
	./scripts/deploy-ec2.sh

# Tear down EC2 instance
ec2-teardown:
	./scripts/teardown-ec2.sh

# Run smoke test against deployed EC2 instance
ec2-smoke-test:
	./scripts/smoke-test-ec2.sh

# -- GCE Deployment -----------------------------------------------------------

# Deploy Ash server to GCE (requires gcloud CLI authenticated)
gce-deploy:
	./scripts/deploy-gce.sh

# Tear down GCE instance
gce-teardown:
	./scripts/teardown-gce.sh

# Run smoke test against deployed GCE instance
gce-smoke-test:
	./scripts/smoke-test-ec2.sh

# -- OpenAPI / SDK generation --------------------------------------------------

# Generate OpenAPI spec from route schemas
openapi: build
	pnpm --filter '@ash-ai/server' openapi
	cp packages/server/openapi.json docs/openapi.json

# Generate Python SDK from OpenAPI spec (requires openapi-python-client)
sdk-python: openapi
	cd packages/sdk-python && ./generate.sh

# -- Publish ------------------------------------------------------------------

# Dry run: see what would be published without actually publishing
publish-dry-run: build
	cd packages/shared && npm publish --dry-run
	cd packages/bridge && npm publish --dry-run
	cd packages/server && npm publish --dry-run
	cd packages/sdk && npm publish --dry-run
	cd packages/cli && npm publish --dry-run

# Publish all packages to npm (shared first since others depend on it)
# Requires NPM_TOKEN in env or ~/.npmrc with auth configured
publish: build
	cd packages/shared && npm publish --access public
	cd packages/bridge && npm publish --access public
	cd packages/server && npm publish --access public
	cd packages/sdk && npm publish --access public
	cd packages/cli && npm publish --access public
