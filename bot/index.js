// StudentControl — bot: faqat Mini App ni ochish tugmasi (boshqa ish qilmaydi)
// Talabaga ko'rinadigan matnlarda versiya (v2) yozilmaydi
import { Bot, InlineKeyboard } from "grammy";

try {
  process.loadEnvFile();
} catch {
  // Docker muhit o'zgaruvchilari
}

const { BOT_TOKEN, TUNNEL_METRICS } = process.env;
let WEBAPP_URL = process.env.WEBAPP_URL;

// Docker'da: cloudflared konteyneridan joriy tunnel manzilini olish
async function urlFromTunnel() {
  try {
    const res = await fetch(`http://${TUNNEL_METRICS}/quicktunnel`);
    const { hostname } = await res.json();
    return hostname ? `https://${hostname}` : null;
  } catch {
    return null;
  }
}

if (!WEBAPP_URL && TUNNEL_METRICS) {
  console.log("Tunnel manzili kutilmoqda...");
  for (let i = 0; i < 60 && !WEBAPP_URL; i++) {
    WEBAPP_URL = await urlFromTunnel();
    if (!WEBAPP_URL) await new Promise((r) => setTimeout(r, 2000));
  }
}
if (!BOT_TOKEN || !WEBAPP_URL) {
  console.error("BOT_TOKEN va WEBAPP_URL (yoki TUNNEL_METRICS) kerak");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);
const openBtn = () => new InlineKeyboard().webApp("Ilovani ochish", WEBAPP_URL);
const setMenuButton = () =>
  bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "Ilova", web_app: { url: WEBAPP_URL } } });

bot.command("start", (ctx) =>
  ctx.reply(`Assalomu alaykum, ${ctx.from.first_name}!\nAmaliyot nazorati. Ilovani telefoningizdan oching:`, {
    reply_markup: openBtn(),
  }),
);
bot.command("app", (ctx) => ctx.reply("Ilovani ochish:", { reply_markup: openBtn() }));
// Developer o'z ID sini bilib, v2/.env dagi DEVELOPER_IDS ga yozadi
bot.command("id", (ctx) => ctx.reply(`Sizning Telegram ID: ${ctx.from.id}`));
bot.command("help", (ctx) => ctx.reply("/start — boshlash\n/app — ilovani ochish\n/id — Telegram ID\n\nIlova faqat telefonda ishlaydi."));
bot.catch((err) => console.error("Bot xatosi:", err.error));

await setMenuButton();
console.log(`WEBAPP_URL=${WEBAPP_URL}`);

// Tunnel manzili o'zgarsa (cloudflared qayta ishga tushsa) — menyu tugmasini yangilash
if (!process.env.WEBAPP_URL && TUNNEL_METRICS) {
  setInterval(async () => {
    const url = await urlFromTunnel();
    if (url && url !== WEBAPP_URL) {
      WEBAPP_URL = url;
      console.log(`Yangi WEBAPP_URL=${WEBAPP_URL}`);
      await setMenuButton().catch((e) => console.error(e.message));
    }
  }, 30_000).unref();
}

process.once("SIGTERM", () => bot.stop());
process.once("SIGINT", () => bot.stop());
bot.start({ onStart: (me) => console.log(`Bot ishga tushdi: @${me.username}`) });
