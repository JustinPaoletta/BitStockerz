#!/usr/bin/env bash
# Shared helpers for reading apps/api/.env from shell scripts (never commit .env).

# Loads DATABASE_URL from apps/api/.env when it is not already exported.
# Returns 0 whether or not a URL was found.
load_database_url_from_api_env() {
  local api_dir="${1:?api directory required}"

  if [[ -n "${DATABASE_URL:-}" ]]; then
    return 0
  fi

  local env_file="$api_dir/.env"
  if [[ ! -f "$env_file" ]]; then
    return 0
  fi

  local line=""
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    if [[ "$line" == DATABASE_URL=* ]]; then
      local value="${line#DATABASE_URL=}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ "$value" == \"*\" && "$value" == *\" ]]; then
        value="${value:1:-1}"
      elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
        value="${value:1:-1}"
      fi
      if [[ -n "$value" ]]; then
        export DATABASE_URL="$value"
      fi
      return 0
    fi
  done <"$env_file"
}
