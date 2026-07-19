#!/usr/bin/env bash
# Local MySQL 8 for BitStockerz (Docker).
# Usage: ./scripts/docker-mysql.sh [start|stop|status|logs|reset]
set -euo pipefail

CONTAINER_NAME="${BITSTOCKERZ_DB_CONTAINER:-bitstockerz-db}"
VOLUME_NAME="${BITSTOCKERZ_DB_VOLUME:-bitstockerz-mysql-data}"
MYSQL_PORT="${BITSTOCKERZ_MYSQL_PORT:-3306}"
MYSQL_DATABASE="${BITSTOCKERZ_MYSQL_DATABASE:-bitstockerz}"
MYSQL_USER="${BITSTOCKERZ_MYSQL_USER:-bitstockerz}"
MYSQL_PASSWORD="${BITSTOCKERZ_MYSQL_PASSWORD:-devpassword}"
MYSQL_ROOT_PASSWORD="${BITSTOCKERZ_MYSQL_ROOT_PASSWORD:-devpassword}"
IMAGE="${BITSTOCKERZ_MYSQL_IMAGE:-mysql:8}"

start() {
  if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    echo "MySQL container '$CONTAINER_NAME' is already running."
    return 0
  fi

  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    echo "Starting existing container '$CONTAINER_NAME'..."
    docker start "$CONTAINER_NAME" >/dev/null
  else
    echo "Creating MySQL container '$CONTAINER_NAME' on port $MYSQL_PORT..."
    docker run -d \
      --name "$CONTAINER_NAME" \
      -e MYSQL_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD" \
      -e MYSQL_DATABASE="$MYSQL_DATABASE" \
      -e MYSQL_USER="$MYSQL_USER" \
      -e MYSQL_PASSWORD="$MYSQL_PASSWORD" \
      -p "${MYSQL_PORT}:3306" \
      -v "${VOLUME_NAME}:/var/lib/mysql" \
      "$IMAGE" \
      --character-set-server=utf8mb4 \
      --collation-server=utf8mb4_unicode_ci >/dev/null
  fi

  echo "Waiting for MySQL to accept connections..."
  local attempts=60
  for ((i = 1; i <= attempts; i++)); do
    if docker exec "$CONTAINER_NAME" mysqladmin ping -h localhost -u root -p"$MYSQL_ROOT_PASSWORD" --silent 2>/dev/null; then
      echo "MySQL is ready."
      echo ""
      echo "DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@localhost:${MYSQL_PORT}/${MYSQL_DATABASE}"
      return 0
    fi
    sleep 2
  done

  echo "MySQL did not become ready in time. Check: ./scripts/docker-mysql.sh logs" >&2
  return 1
}

stop() {
  if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    docker stop "$CONTAINER_NAME" >/dev/null
    echo "Stopped '$CONTAINER_NAME'."
  else
    echo "Container '$CONTAINER_NAME' is not running."
  fi
}

status() {
  docker ps -a --filter "name=^/${CONTAINER_NAME}$" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
}

logs() {
  docker logs "$CONTAINER_NAME" --tail 50 -f
}

reset() {
  stop || true
  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    docker rm "$CONTAINER_NAME" >/dev/null
    echo "Removed container '$CONTAINER_NAME'."
  fi
  if docker volume ls --format '{{.Name}}' | grep -qx "$VOLUME_NAME"; then
    read -r -p "Delete volume '$VOLUME_NAME' (all data)? [y/N] " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
      docker volume rm "$VOLUME_NAME" >/dev/null
      echo "Deleted volume '$VOLUME_NAME'."
    fi
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  logs) logs ;;
  reset) reset ;;
  *)
    echo "Usage: $0 [start|stop|status|logs|reset]" >&2
    exit 1
    ;;
esac
