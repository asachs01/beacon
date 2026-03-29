.PHONY: dev build lint typecheck docker-build docker-push clean cap-sync cap-ios cap-android

IMAGE := ghcr.io/asachs01/beacon
TAG   := $(shell grep '^version:' config.yaml | sed 's/version: *"\{0,1\}\([^"]*\)"\{0,1\}/\1/')

## Development server
dev:
	npm run dev

## Production build
build:
	npm run build

## Lint (add eslint when configured)
lint:
	@echo "No linter configured yet"

## TypeScript type-check (no emit)
typecheck:
	npx tsc --noEmit

## Build Docker image locally
docker-build:
	docker buildx build \
		--platform linux/amd64 \
		--tag $(IMAGE):$(TAG) \
		--tag $(IMAGE):latest \
		--load \
		.

## Push Docker image to GHCR
docker-push:
	docker buildx build \
		--platform linux/amd64,linux/arm64,linux/arm/v7 \
		--tag $(IMAGE):$(TAG) \
		--tag $(IMAGE):latest \
		--push \
		.

## Sync web build to native platforms
cap-sync:
	npm run cap:sync

## Open iOS project in Xcode
cap-ios:
	npm run cap:ios

## Open Android project in Android Studio
cap-android:
	npm run cap:android

## Remove build artifacts
clean:
	rm -rf dist node_modules
