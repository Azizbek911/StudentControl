#!/bin/bash
# StudentControl v2 — Docker boshqaruvi
#
#   ./run.sh               = ./run.sh up
#   ./run.sh up            hammasini build qilib ishga tushirish va Mini App manzilini chiqarish
#   ./run.sh down          to'xtatish (ma'lumotlar qoladi)
#   ./run.sh restart       qayta build + ishga tushirish
#   ./run.sh logs [xizmat] loglar (masalan: ./run.sh logs gateway)
#   ./run.sh ps            konteynerlar holati
#   ./run.sh url           Mini App (tunnel) manzili
#   ./run.sh psql          bazaga kirish (psql)
#   ./run.sh schema        db/schema.sql ni bazaga qayta qo'llash (yangilash)
#   ./run.sh backup        bazani backups/ papkasiga saqlash
#   ./run.sh reset         loglarni butunlay o'chirish (tasdiq so'raladi)
#
# Eslatma: "${VAR:-...}" ichida apostrof (') ishlatmang — bash uni qo'shtirnoq deb o'qiydi
set -u
cd "$(dirname "$0")"

need_env() {
  [ -f .env ] || { echo ">>> v2/.env topilmadi:  cp .env.example .env   va BOT_TOKEN ni yozing"; exit 1; }
}
env_value() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2-; }
dc() { docker compose "$@"; }
db_user() { local v; v=$(env_value POSTGRES_USER); echo "${v:-student}"; }
db_name() { local v; v=$(env_value POSTGRES_DB); echo "${v:-studentcontrol_v2}"; }
psql_c() { dc exec -T postgres psql -v ON_ERROR_STOP=1 -U "$(db_user)" -d "$(db_name)" "$@"; }

tunnel_url() {
  dc logs bot 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
}

cmd_up() {
  need_env
  dc up -d --build || exit 1
  echo ">>> Tunnel manzili kutilmoqda..."
  local url=""
  for _ in $(seq 1 30); do
    url=$(tunnel_url)
    [ -n "$url" ] && break
    sleep 2
  done
  [ -n "$url" ] || url="hali tayyor emas, birozdan keyin:  ./run.sh url"
  local fp gp pp
  fp=$(env_value FRONTEND_PORT); gp=$(env_value GATEWAY_PORT); pp=$(env_value POSTGRES_PORT)
  dc ps
  echo
  echo ">>> Mini App:   $url"
  echo ">>> Lokal:      http://localhost:${fp:-8082}"
  echo ">>> Gateway:    http://localhost:${gp:-3001}/api/health"
  echo ">>> Postgres:   localhost:${pp:-5434}  (baza: $(db_name))"
  if [ -z "$(env_value ADMIN_API_URL)" ]; then
    echo ">>> DIQQAT: ADMIN_API_URL bo'sh — sinov (mock) admin API ishlayapti"
  fi
  echo ">>> Loglar:     ./run.sh logs gateway"
}

case "${1:-up}" in
  up) cmd_up ;;
  down) dc down ;;
  restart) dc down && cmd_up ;;
  logs) shift; dc logs -f --tail 100 "$@" ;;
  ps) dc ps ;;
  url) u=$(tunnel_url); echo "${u:-tunnel manzili topilmadi (./run.sh logs tunnel bot)}" ;;
  psql) dc exec postgres psql -U "$(db_user)" -d "$(db_name)" ;;
  schema)
    psql_c < db/schema.sql && echo ">>> Sxema qo'llandi"
    ;;
  backup)
    mkdir -p backups
    f="backups/v2-$(date +%Y%m%d-%H%M%S).sql.gz"
    dc exec -T postgres pg_dump -U "$(db_user)" -d "$(db_name)" | gzip > "$f" && echo ">>> Saqlandi: $f"
    ;;
  reset)
    read -r -p "Loglar bazasi butunlay o'chiriladi. Davom etasizmi? (ha/yo'q) " ans
    [ "$ans" = "ha" ] && dc down -v && echo ">>> O'chirildi"
    ;;
  *)
    sed -n '2,15p' "$0"
    exit 1
    ;;
esac
