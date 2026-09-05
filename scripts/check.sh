#!/usr/bin/env bash
#
# Run the checks and say plainly whether they passed.
#
# The last line is the verdict, and it is the point of this script. Piping a
# checker into `tail` reports the pipeline's exit status, which is tail's, so
# a failure reads as success -- that is how nine lint violations were
# committed in this project. A verdict on stdout survives any pipe.
#
# Exit status is still correct for anything that reads it, the hook included.
#
#   scripts/check.sh            everything
#   scripts/check.sh frontend   one side only
#   scripts/check.sh backend
#   scripts/check.sh --tests    also run the test suites
#
set -uo pipefail
cd "$(dirname "$0")/.."

WHICH=all
WITH_TESTS=0
for arg in "$@"; do
  case "$arg" in
    frontend|backend) WHICH="$arg" ;;
    --tests) WITH_TESTS=1 ;;
  esac
done

passed=0
failed=0
declare -a failures

run() {
  local name="$1" dir="$2"; shift 2
  local out
  # Captured, not piped: the exit status has to be the command's own.
  out=$(cd "$dir" && "$@" 2>&1)
  local rc=$?
  if [ $rc -eq 0 ]; then
    printf '  %-24s ok\n' "$name"
    passed=$((passed + 1))
  else
    printf '  %-24s FAIL\n' "$name"
    printf '%s\n' "$out" | sed 's/^/      /' | head -25
    failed=$((failed + 1))
    failures+=("$name")
  fi
}

if [ "$WHICH" = "all" ] || [ "$WHICH" = "frontend" ]; then
  run "frontend oxfmt"  frontend npx oxfmt --check .
  run "frontend oxlint" frontend npx oxlint --deny-warnings
  run "frontend tsc"    frontend npx tsc -b
fi

if [ "$WHICH" = "all" ] || [ "$WHICH" = "backend" ]; then
  run "backend ruff format" backend uv run ruff format --check app tests
  run "backend ruff check"  backend uv run ruff check app tests
  [ "$WITH_TESTS" = "1" ] && run "backend pytest" backend uv run pytest -q
fi

echo "  ----------------------------------------"
if [ "$failed" -eq 0 ]; then
  echo "  OK: $passed check(s) passed"
  exit 0
fi
echo "  FAILED: ${failures[*]}  ($failed of $((passed + failed)))"
exit 1
