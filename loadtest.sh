#!/bin/bash
# Admin API ga ko'p so'rov yuborish (yuklama testi) — har bir javob ekranga chiqadi
#
#   ./loadtest.sh                       soni so'raladi, POST /api/bot/checkin (kelish)
#   ./loadtest.sh 50                    50 ta checkin
#   ./loadtest.sh 100 -c 10             100 ta, bir vaqtda 10 tadan (parallel)
#   ./loadtest.sh 20 --out              ketish (CHECK_OUT)
#   ./loadtest.sh 100 --today           GET /api/bot/today (faqat o'qiydi, hech narsa yozmaydi)
#   ./loadtest.sh 10 --link             POST /api/bot/link
#
# Qo'shimcha:
#   --tg ID          Telegram ID (standart: ilovaga oxirgi kirgan talabaniki)
#   --hemis ID       /link uchun HEMIS ID (standart: oxirgi bog'langan ID)
#   --lat X --lng Y  joylashuv (standart: oxirgi belgilangan joy)
#   --acc M          GPS aniqligi, metr
#
# DIQQAT: checkin — haqiqiy so'rov. Bugun hali belgilanmagan bo'lsa, birinchisi admin saytda
# haqiqiy davomat bo'lib yoziladi (keyingilari odatda 409 "allaqachon belgilangan").
# Yuborilgan so'rovlar v2 ning o'z loglariga yozilmaydi — faqat yakuniy natija (system/load_test).
set -u
cd "$(dirname "$0")"

COUNT=""
ARGS=(-e LT_ENDPOINT=checkin)
while [ $# -gt 0 ]; do
  case "$1" in
    -c | --parallel) ARGS+=(-e "LT_CONCURRENCY=$2"); shift ;;
    --out) ARGS+=(-e LT_TYPE=CHECK_OUT) ;;
    --in) ARGS+=(-e LT_TYPE=CHECK_IN) ;;
    --today) ARGS+=(-e LT_ENDPOINT=today) ;;
    --link) ARGS+=(-e LT_ENDPOINT=link) ;;
    --checkin) ARGS+=(-e LT_ENDPOINT=checkin) ;;
    --tg) ARGS+=(-e "LT_TG=$2"); shift ;;
    --hemis) ARGS+=(-e "LT_HEMIS=$2"); shift ;;
    --lat) ARGS+=(-e "LT_LAT=$2"); shift ;;
    --lng) ARGS+=(-e "LT_LNG=$2"); shift ;;
    --acc) ARGS+=(-e "LT_ACC=$2"); shift ;;
    -h | --help) sed -n '2,20p' "$0"; exit 0 ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then COUNT="$1"; else echo "Noma'lum: $1"; sed -n '2,20p' "$0"; exit 1; fi
      ;;
  esac
  shift
done

if [ -z "$COUNT" ]; then
  read -r -p "Nechta so'rov yuborilsin? " COUNT
fi
[[ "$COUNT" =~ ^[0-9]+$ ]] && [ "$COUNT" -gt 0 ] || { echo "Son kiriting (masalan 100)"; exit 1; }

export PODMAN_COMPOSE_WARNING_LOGS=false
docker compose ps --status running gateway 2>/dev/null | grep -q sc2-gateway || { echo ">>> v2 gateway ishlamayapti:  ./run.sh"; exit 1; }

# Skript gateway konteyneri ichida ishlaydi (ADMIN_API_URL / ADMIN_API_KEY o'sha yerda)
docker compose exec -T "${ARGS[@]}" -e "LT_COUNT=$COUNT" gateway \
  sh -c 'cat > /tmp/loadtest.mjs && node /tmp/loadtest.mjs' < tools/loadtest.mjs 2>&1 \
  | grep -v -e "Emulate Docker CLI" -e "compose provider" -e "^.\[0m$"
