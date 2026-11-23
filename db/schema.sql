-- =====================================================================
-- StudentControl v2 — baza sxemasi (PostgreSQL 15+)
--
-- v2 da FAQAT LOGLAR saqlanadi. Talabalar, davomatlar, amaliyot joylari —
-- hammasi umumiy (admin sayt) API da. Biz faqat GET/POST qilamiz va natijani logga yozamiz.
-- Parol, selfi, HEMIS rasmi hech qayerda saqlanmaydi.
--
-- Fayl takroriy ishga tushirishga xavfsiz:
--   * Docker: postgres birinchi marta ishga tushganda avtomatik
--   * gateway har safar ishga tushganda ham bajaradi
--   * qo'lda:  ./run.sh schema
-- =====================================================================

-- Oldingi v2 versiyasidagi jadvallar (endi kerak emas)
DROP TABLE IF EXISTS checks;
DROP TABLE IF EXISTS students;

CREATE TABLE IF NOT EXISTS logs (
  id            bigserial    PRIMARY KEY,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  level         varchar(5)   NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  -- check | link | today | login | auth | system
  kind          varchar(16)  NOT NULL,
  -- check:  present | late | out_of_range | suspicious | rejected  (admin API qarori)
  --         refused (API rad etdi: 404/409/400) | api_error | unknown | bad_request | too_often | no_hemis_photo
  -- link:   ok | already | not_found | conflict | api_error
  -- today:  api_error
  -- login:  ok | wrong_password | hemis_down | not_mobile
  -- auth:   not_telegram | unofficial_client (Plus Messenger va boshqa norasmiy Telegram ilovalari)
  -- system: started | error
  status        varchar(32)  NOT NULL,
  message       text,
  student_id    bigint,                 -- HEMIS ichki ID
  student_name  text,
  telegram_id   bigint,
  ip            text,
  details       jsonb                   -- so'rov/javob tafsilotlari (koordinatalar, API statusi, masofa, izohlar ...)
);

-- Eski bazani yangilash
ALTER TABLE logs ADD COLUMN IF NOT EXISTS student_name text;
ALTER TABLE logs DROP COLUMN IF EXISTS check_id;

CREATE INDEX IF NOT EXISTS ix_logs_time ON logs (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_logs_status_time ON logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_logs_level_time ON logs (level, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_logs_student ON logs (student_id, created_at DESC);
