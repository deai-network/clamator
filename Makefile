.PHONY: install build test lint clean release interop help

help:                    ## list targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "%-12s %s\n", $$1, $$2}'

install:    ## install deps in both langs
	cd ts && pnpm install
	cd py && uv sync

build:      ## build all packages
	cd ts && pnpm -r build || true
	cd py && uv build --all 2>/dev/null || true

lint:       ## lint both langs
	cd ts && pnpm -r lint
	cd py && uv run ruff check .

test:       ## per-lang unit tests (no interop)
	cd ts && pnpm -r test || true
	cd py && EXIT=0; uv run pytest || EXIT=$$?; \
	  if [ "$$EXIT" -eq 5 ]; then echo "(no python tests)"; exit 0; else exit $$EXIT; fi

interop:    ## cross-lang interop tests (regen fixtures, spin redis, run scenarios)
	bash tests/interop/run.sh

clean:      ## clean all artifacts
	cd ts && pnpm -r clean || true
	cd py && find packages -type d \( -name dist -o -name build -o -name .pytest_cache -o -name __pycache__ -o -name '*.egg-info' \) -exec rm -rf {} + 2>/dev/null || true
	rm -rf tests/interop/.tmp tests/interop/generated
	rm -rf ts/node_modules

release:    ## lockstep version bump + local publish to npm + PyPI
	bash scripts/release.sh
