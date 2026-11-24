# StudentControl v2

Soddalashtirilgan versiya. Rollar ikkita: **talaba** va **developer**.

**v2 da faqat loglar saqlanadi.** Talabalar, davomatlar va amaliyot joylari umumiy (admin sayt) API da turadi. v2 faqat GET/POST so'rovlarni uzatadi: parol, selfi va HEMIS rasmi hech qayerda saqlanmaydi.

v2 davomat bo'yicha qaror chiqarmaydi. Qarorni **admin sayt API si** chiqaradi (`/api/bot/link`, `/api/bot/today`, `/api/bot/checkin`). v2 talabani o'sha saytga bog'laydi, joylashuv va selfini yuboradi, natijani talabaga ko'rsatadi va hamma voqeani developer uchun logga yozadi.

## Oqim

1. **Kirish.** Talaba HEMIS login va paroli bilan kiradi. Profili (ism, guruh, ID) bazaga yozilmaydi, imzolangan token ichida yuradi. Bitta Telegram akkaunt bitta talabaga bog'lanishini admin sayt nazorat qiladi (`409`).
2. **Bog'lash.** Gateway `POST /api/bot/link` ga `{ hemisId, telegramId }` yuboradi.
   - `hemisId` HEMIS dan olinadi, ya'ni login orqali tasdiqlangan.
   - `telegramId` imzolangan Telegram `initData` dan olinadi, talaba uni o'zgartira olmaydi.
   - Bog'lash bir marta qilinadi.
   - Admin API `404` yoki `409` qaytarsa, kirish rad etiladi va talaba API ning `error` matnini ko'radi.
   - Admin sayt vaqtincha ishlamasa, talaba kiraveradi. Bog'lash keyingi so'rovda qayta urinib ko'riladi.
3. **Bosh sahifa.** `GET /api/bot/today` dan bugungi joy, manzil, ish vaqti va radius olinib ko'rsatiladi. Bugun joy biriktirilmagan bo'lsa (`409`), shu xabar chiqadi.
4. **Kelish yoki ketish.** Talaba **«Kelishni belgilash»** (`CHECK_IN`) yoki **«Ketishni belgilash»** (`CHECK_OUT`) ni bosadi:
   1. joylashuvini aniqlaydi va xaritada ko'radi;
   2. old kamera bilan selfi oladi;
   3. gateway `POST /api/bot/checkin` ga yuboradi.
5. **Natija.** Talaba javobdagi statusni (`status`), masofani (`distanceM`) va izohlarni (`notes`) ko'radi. `OUT_OF_RANGE` bo'lsa **«Qayta urinish»** tugmasi chiqadi.

| API status | Talaba ko'radi | Ikonka |
|---|---|---|
| `PRESENT` | Siz joyidasiz | `CheckIcon`, yashil |
| `LATE` | Qayd etildi — kechikdingiz | `CheckIcon`, yashil |
| `OUT_OF_RANGE` | Amaliyot joyidan uzoqdasiz (+ qayta urinish) | `XIcon`, qizil |
| `SUSPICIOUS` | Qayd etildi, tekshiruvga yuborildi | `QuestionIcon`, sariq |
| `REJECTED` | Rad etildi | `XIcon`, qizil |

Interfeysda emoji ishlatilmaydi. Barcha ikonkalar `frontend/src/components/icons.tsx` dagi SVG lar: ular har qanday telefonda bir xil ko'rinadi va rangi matn rangidan olinadi. Yangi ikonka kerak bo'lsa, shu faylga qo'shing.

### Soxtalashtirishga qarshi talablar Mini App da

Admin API hujjatidagi talablar bot uchun yozilgan. Mini App da ular quyidagicha bajariladi:

| Hujjat talabi | v2 da |
|---|---|
| Forward qilingan lokatsiyani rad etish | Lokatsiya chat xabari emas, telefon GPS idan olinadi. Forward qilishning imkoni yo'q |
| "Joriy joylashuv" orqali olish, xaritadan qo'lda tanlamaslik | Telegram LocationManager yoki brauzer GPS i ishlatiladi. Qo'lda nuqta tanlab bo'lmaydi |
| Rasm faqat `photo` sifatida | Selfi faqat jonli old kameradan olinadi, galereyadan tanlab bo'lmaydi |
| `sentAt` lokatsiya olingan vaqt | Joylashuv aniqlangan vaqt yuboriladi. Selfi 60 soniyadan uzoq olinsa, joylashuv yuborishdan oldin yangilanadi. Kelajakdagi vaqt hozirgi vaqtga tushiriladi |
| Avval lokatsiya, keyin selfie, so'ng bitta `/checkin` | Xuddi shunday |
| `telegramId` ni `from.id` dan olish | Imzosi tekshirilgan Telegram `initData` dan olinadi |

### Faqat rasmiy Telegram

Talaba Mini App ni faqat rasmiy Telegram ilovasida ochishi mumkin. Plus Messenger, Nekogram, iMe kabi norasmiy ilovalar bloklanadi.

**Qanday aniqlanadi.** Android WebView har bir so'rovga `X-Requested-With` sarlavhasini qo'shadi. Unda ilovaning paket nomi bo'ladi:

| Ilova | Paket nomi | Natija |
|---|---|---|
| Telegram (Google Play, Huawei) | `org.telegram.messenger` | ruxsat |
| Telegram (telegram.org dan APK) | `org.telegram.messenger.web` | ruxsat |
| Telegram Beta | `org.telegram.messenger.beta` | ruxsat |
| Telegram X (Telegram jamoasiniki) | `org.thunderdog.challegram` | ruxsat |
| Plus Messenger | `org.telegram.plus` | bloklanadi |
| Boshqa har qanday ilova | ... | bloklanadi |

**Tekshiruv qayerda bajariladi.**
- Gateway talaba so'rovlarini tekshiradi: `/auth/login`, `/auth/refresh`, `/auth/me`, `/today`, `/check`. Ilova ro'yxatda bo'lmasa, `403` va `code: "unofficial_client"` qaytadi.
- Ilova ochilganda `/role` javobida `client.ok` keladi. `false` bo'lsa, talaba kirish sahifasi o'rniga "Faqat rasmiy Telegram" ekranini ko'radi.
- Har bir urinish logga yoziladi: `auth/unofficial_client`, ilova nomi va User-Agent bilan. Muvaffaqiyatli kirish logida ham ilova nomi saqlanadi (`details.client`).

**Cheklovlar.**
- **iOS.** iOS da bu sarlavha yo'q. Shuning uchun iPhone dagi norasmiy ilovalarni (Nicegram, iMe) ajratib bo'lmaydi, ular o'tkazib yuboriladi.
- **Sarlavha kelmasa.** Ba'zi eski Android WebView larda sarlavha kelmasligi mumkin. Standart holatda bunday so'rov o'tkaziladi, kirish logida esa `client: null` bo'ladi. Qat'iy rejim uchun `TG_CLIENT_STRICT=true` qo'ying, bunda sarlavhasiz Android so'rovlari ham bloklanadi. Uni yoqishdan oldin loglarda rasmiy Telegram foydalanuvchilarida `client` to'ldirilganini tekshiring.
- **Soxtalashtirish.** Sarlavhani ilova o'zi yuboradi. Maxsus o'zgartirilgan ilova uni soxtalashtirishi mumkin. Bu Plus Messenger kabi oddiy norasmiy ilovalarga qarshi to'siq, kriptografik kafolat emas.

### Yuz tekshiruvi

Talaba davomat yuborganda gateway selfini uning HEMIS dagi rasmiga solishtiradi. Buning uchun v1 dagi `face` servisi ishlatiladi (`face/`, Python + OpenCV: YuNet yuzni topadi, SFace yuz belgisini oladi).

1. Talaba kirganda gateway HEMIS rasmini yuklab, undagi yuz belgisini (128 son) oladi va xotirada saqlaydi. Har davomatda HEMIS rasmi qayta yuklanmaydi.
2. Davomatda selfidagi yuz belgisi olinadi va HEMIS rasminikiga solishtiriladi (kosinus o'xshashlik).
3. O'xshashlik `FACE_THRESHOLD` dan (standart 0.363, OpenCV tavsiyasi) past bo'lsa — boshqa odam.

| Holat | `FACE_MODE=block` (standart) | `FACE_MODE=log` |
|---|---|---|
| Selfida yuz yo'q | qayta suratga olish so'raladi, admin saytga yuborilmaydi | yuboriladi, logda «yuz: topilmadi» |
| Yuz HEMIS rasmiga mos emas | qayta suratga olish so'raladi, admin saytga yuborilmaydi | yuboriladi, logda «yuz: mos emas» |
| Mos | yuboriladi | yuboriladi |
| HEMIS da rasm yo'q yoki unda yuz topilmadi | yuboriladi (tekshirib bo'lmaydi) | yuboriladi |
| face servisi yoki HEMIS ishlamadi | yuboriladi, logda `face/face_down` | yuboriladi |

- Qayta suratga olishda 30 soniya kutish shart emas: 5 soniyadan keyin yuborsa bo'ladi.
- Natija har bir davomat logining `details.face` maydonida: `status`, `similarity`, `faces` (selfidagi yuzlar soni).
- `FACE_MODE=off` — tekshiruv o'chiq.
- Selfi, HEMIS rasmi va yuz belgilari diskka ham, bazaga ham yozilmaydi. `face` konteyneri tashqariga port ochmaydi.
- Haqiqiy talabalar bilan ishga tushirgandan keyin loglarda `face_mismatch` ni kuzating. O'z odami rad etilayotgan bo'lsa (HEMIS rasmi eski yoki sifatsiz), `FACE_THRESHOLD` ni pasaytiring (masalan 0.30) yoki `FACE_MODE=log` qo'ying.

### Admin sayt javob bermasa

Talabaga xato matni ko'rsatilmaydi. Uning o'rniga «Yuklanmoqda» animatsiyasi chiqadi va ilova so'rovni o'zi qayta yuboradi: avval 5, keyin 8, 12, so'ng har 15 soniyada.
- **Bosh sahifa.** `/api/today` javobida `retry: true` keladi. Admin sayt tiklanishi bilan bugungi joy chiqadi.
- **Davomat.** `/api/check` `502` va `code: "api_unavailable"` qaytaradi. Ilova shu selfi bilan qayta yuboradi. Joylashuv 60 soniyadan eski bo'lsa, yuborishdan oldin yangilanadi. Talaba «Orqaga» tugmasi bilan to'xtatishi mumkin.
- Xato developer loglarida avvalgidek yoziladi: `today/api_error`, `check/api_error`.

**HEMIS rasmi.** Hujjatdagi `/checkin` da HEMIS rasmi uchun maydon yo'q. Shuning uchun u standart holatda yuborilmaydi. Admin sayt qabul qilsa: `ADMIN_API_SEND_HEMIS_PHOTO=true` (u `hemisPhoto` fayl maydonida yuboriladi).

## Tuzilishi

```
Telegram ─https─> tunnel ─> frontend (nginx) ─/api─> gateway ─> postgres
                                                        ├─> face (yuz tekshiruvi, ichki)
                                                        └─> ADMIN SAYT API  (X-API-KEY)
bot — faqat "Ilovani ochish" tugmasi va /id
```

| Papka | Nima |
|---|---|
| `frontend/` | Mini App (React). Talaba: login, bugungi joy, kelish/ketish (xarita + selfi), natija. Developer: loglar |
| `gateway/` | Kichik Node server. Vazifalari: HEMIS login, yuz tekshiruvi, admin API ga uzatish, loglarni yozish |
| `face/` | Yuz servisi (Python, OpenCV YuNet + SFace). v1 dagi bilan bir xil. Faqat gateway murojaat qiladi |
| `bot/` | Mini App tugmasi va `/id` buyrug'i |
| `db/schema.sql` | Baza sxemasi (bitta fayl) |
| `docker-compose.yml`, `run.sh` | Docker va boshqaruv skripti |

v1 o'z joyida qoladi. v2 u bilan yonma-yon ishlaydi: alohida baza, alohida portlar.

## Ishga tushirish

1. @BotFather da v2 uchun **yangi bot** oching. v1 tokenini ishlatmang.
2. Sozlamalar faylini yarating:
   ```bash
   cd v2
   cp .env.example .env
   ```
   `.env` ga yozing:
   - `BOT_TOKEN`;
   - `DEVELOPER_IDS`: o'z Telegram ID ingiz (botga `/id` yozib bilasiz);
   - `ADMIN_API_URL` va `ADMIN_API_KEY`: admin sayt manzili va admin bergan kalit.
     - Bo'sh qolsa, sinov uchun ichki **mock** admin API ishlaydi.
     - Admin sayt shu kompyuterda `localhost:8080` da ishlasa: `ADMIN_API_URL=http://host.containers.internal:8080`.
   - `ADMIN_LINK_ID` ixtiyoriy: `/link` ga avval 12 xonali talaba ID si yuboriladi, admin sayt topmasa HEMIS ichki ID si sinaladi.
3. Ishga tushiring:
   ```bash
   ./run.sh
   ```

### Ixtiyoriy sozlamalar

Bu sozlamalar `.env` ga yozilmasa, standart qiymat ishlatiladi. O'zgartirish kerak bo'lsa, `.env` ga qo'shing:

| Sozlama | Standart | Nima |
|---|---|---|
| `ADMIN_LINK_ID` | `student_id_number` | `/link` ga avval qaysi ID yuboriladi: `student_id_number` (12 xonali, HEMIS login) yoki `id` (HEMIS ichki ID). 404 bo'lsa ikkinchisi sinaladi |
| `ADMIN_API_SEND_HEMIS_PHOTO` | `false` | HEMIS rasmini `/checkin` ga ham yuborish |
| `ADMIN_API_TIMEOUT` | `30` | admin API javobini kutish (soniya) |
| `CHECK_COOLDOWN` | `30` | ikki davomat orasidagi kutish (soniya) |
| `TG_OFFICIAL_APPS` | `org.telegram.messenger,org.telegram.messenger.web,org.telegram.messenger.beta,org.thunderdog.challegram` | ruxsat etilgan Telegram ilovalari (paket nomlari). Telegram X ni taqiqlash uchun ro'yxatdan olib tashlang |
| `TG_CLIENT_STRICT` | `false` | `true`: Android da ilova nomi (`X-Requested-With`) kelmasa ham bloklash |
| `FACE_MODE` | `block` | yuz tekshiruvi: `block` (mos kelmasa qayta suratga olish), `log` (faqat logga), `off` |
| `FACE_THRESHOLD` | `0.363` | yuz o'xshashligi chegarasi: pastroq — yumshoqroq, balandroq — qattiqroq |
| `FACE_TIMEOUT` | `20` | face servisi javobini kutish (soniya). Javob bo'lmasa davomat tekshiruvsiz yuboriladi |
| `MOCK_LAT`, `MOCK_LNG`, `MOCK_RADIUS_M` | `40.13`, `67.836`, `300` | mock rejimdagi amaliyot joyi |
| `LOG_RETENTION_DAYS` | `90` | loglar necha kun saqlanadi |
| `WEBAPP_URL` | bo'sh (tunnel) | doimiy domen |
| `JWT_SECRET` | `BOT_TOKEN` dan hosil qilinadi | production'da: `openssl rand -hex 32` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `student` / `student` / `studentcontrol_v2` | baza |
| `POSTGRES_PORT`, `GATEWAY_PORT`, `FRONTEND_PORT` | `5434`, `3001`, `8082` | kompyuterdagi portlar |
| `HEMIS_URL` | `https://student.jizpi.uz/rest/v1` | HEMIS API |

### run.sh buyruqlari

| Buyruq | Nima qiladi |
|---|---|
| `./run.sh` yoki `./run.sh up` | build qiladi, ishga tushiradi va manzillarni ko'rsatadi |
| `./run.sh down` | to'xtatadi (loglar saqlanib qoladi) |
| `./run.sh restart` | qayta build qilib ishga tushiradi |
| `./run.sh logs gateway` | gateway loglarini ko'rsatadi |
| `./run.sh url` | Mini App (tunnel) manzilini ko'rsatadi |
| `./run.sh psql` | bazaga kiradi |
| `./run.sh schema` | `db/schema.sql` ni bazaga qayta qo'llaydi (yangilaydi) |
| `./run.sh backup` | bazani `backups/` ga saqlaydi |
| `./run.sh reset` | loglar bazasini butunlay o'chiradi (tasdiq so'raydi) |

### Yuklama testi (`loadtest.sh`)

Admin API ga ko'p so'rov yuboradi. Har bir javob alohida qatorda chiqadi: raqam, HTTP kod, vaqt va javob matni. Oxirida jami vaqt, tezlik va natijalar soni chiqadi.

| Buyruq | Nima qiladi |
|---|---|
| `./loadtest.sh` | soni so'raladi, keyin `POST /api/bot/checkin` (kelish) yuboriladi |
| `./loadtest.sh 100` | 100 ta checkin |
| `./loadtest.sh 100 -c 10` | 100 ta, bir vaqtda 10 tadan (parallel) |
| `./loadtest.sh 20 --out` | ketish (`CHECK_OUT`) |
| `./loadtest.sh 100 --today` | `GET /api/bot/today`: faqat o'qiydi, hech narsa yozmaydi |
| `./loadtest.sh 10 --link` | `POST /api/bot/link` |

**Standart qiymatlar.** Telegram ID ilovaga oxirgi kirgan talabaniki olinadi, joylashuv esa oxirgi belgilangan joy. O'zgartirish uchun: `--tg ID`, `--lat X --lng Y`, `--acc M`, `--hemis ID`.

**Diqqat:** checkin haqiqiy so'rov. Talaba bugun hali belgilanmagan bo'lsa, birinchi so'rov admin saytda haqiqiy davomat bo'lib yoziladi.

Har test oxirida loglarga bitta yakuniy yozuv qo'shiladi (`system/load_test`).

Portlar:

| Xizmat | Manzil |
|---|---|
| frontend | `localhost:8082` |
| gateway | `localhost:3001/api/health` |
| postgres | `localhost:5434`, baza `studentcontrol_v2` |

### Mock admin API

`ADMIN_API_URL` bo'sh bo'lsa ishlaydi. Hujjatdagi 3 ta so'rovni xotirada taqlid qiladi:

| Holat | Mock javobi |
|---|---|
| `hemisId` `000` bilan tugasa | `404` (amaliyot guruhida yo'q) |
| Nuqta `MOCK_LAT`/`MOCK_LNG` dan `MOCK_RADIUS_M` ichida | `PRESENT` |
| Nuqta radiusdan tashqarida | `OUT_OF_RANGE` va "Joydan N m uzoqdasiz" |
| `sentAt` 120 soniyadan eski yoki aniqlik 100 m dan yomon | `SUSPICIOUS` |
| Bir kunda ikkinchi `CHECK_IN` (yoki `CHECK_OUT`) | `409` |

Mock tashqaridan ochiq emas, gateway qayta ishga tushsa ma'lumotlari tozalanadi.

## Developer

Telegram ID si `DEVELOPER_IDS` da bo'lgan odam ilovani ochsa, **Loglar** sahifasi chiqadi. Kompyuterdagi Telegramdan ham ishlaydi. Developer faqat ko'radi, hech narsani o'zgartirmaydi.

Sahifada:
- **hamma statuslar**, har biri bo'yicha oxirgi 24 soatdagi soni;
- status, daraja va qidiruv (HEMIS ID / login / ism / xabar) bo'yicha filtr;
- har 10 soniyada avtomatik yangilanish.

Log tafsilotida ko'rinadi:
- talaba va uning admin saytga bog'langanmi;
- koordinatalar;
- `CHECK_IN` yoki `CHECK_OUT`;
- API statusi, masofa, izohlar, `sentAt`;
- admin saytdagi ID;
- HTTP kodi va xom javob;
- to'liq tafsilotlar (JSON).

| Tur | Statuslar |
|---|---|
| `check` | `present`, `late`, `out_of_range`, `suspicious`, `rejected`, `refused` (API rad etdi: 404/409/400), `api_error`, `unknown`, `bad_request`, `not_linked`, `no_hemis_photo`, `too_often`, `no_face` (selfida yuz yo'q), `face_mismatch` (yuz HEMIS rasmiga mos emas) |
| `face` | `face_down` (face servisi yoki HEMIS rasmi ishlamadi, davomat tekshiruvsiz yuborildi) |
| `link` | `ok`, `already`, `not_found`, `conflict`, `api_error` |
| `today` | `api_error` |
| `login` | `ok`, `wrong_password`, `device_taken`, `hemis_down`, `not_mobile`, `hemis_sync_failed` |
| `auth` | `not_telegram`, `unofficial_client` (norasmiy Telegram ilovasi) |
| `system` | `started`, `error` |

Kalit noto'g'ri bo'lsa (API `401` qaytarsa), logda "ADMIN_API_KEY ni tekshiring" deb chiqadi.

## Baza (`db/schema.sql`)

Bitta jadval: **`logs`**. Unda hamma voqea yoziladi: vaqt, daraja, tur, status, xabar, talaba (HEMIS ID, ism), Telegram ID, IP va tafsilotlar (koordinatalar, API statusi, masofa, izohlar, HTTP javob).

Talabaning "Bugun" ro'yxati ham shu loglardan olinadi. Boshqa hech narsa saqlanmaydi.

Fayl takroriy ishga tushirishga xavfsiz va eski v2 jadvallarini (`students`, `checks`) o'chiradi. Ishlatiladigan joylar:
- yangi bazada Docker uni o'zi bajaradi;
- gateway har ishga tushganda yana bajaradi;
- qo'lda: `./run.sh schema`.

Eski loglar `LOG_RETENTION_DAYS` kundan keyin (standart 90) o'chiriladi.
