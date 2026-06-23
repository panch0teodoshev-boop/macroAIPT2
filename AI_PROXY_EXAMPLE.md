# AI прокси (по избор)

AI функциите (чат асистент и разпознаване на хранене) извикват Anthropic API.
В **claude.ai артефакта** това става без ключ. На **реален сайт** ключ не бива да стои
в клиента — затова заявките минават през малък прокси, който добавя ключа.

Задаваш адреса му в `.env` → `VITE_AI_PROXY_URL`, или като GitHub secret със
същото име (workflow-ът вече го подава при билда).

## Пример: Cloudflare Worker

```js
export default {
  async fetch(request, env) {
    // CORS
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const body = await request.text();
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,   // зададен в Worker secrets
        "anthropic-version": "2023-06-01",
      },
      body,
    });
    const text = await resp.text();
    return new Response(text, { status: resp.status, headers: { ...cors, "content-type": "application/json" } });
  },
};
```

1. Създай Worker, сложи `ANTHROPIC_API_KEY` в Settings → Variables (Secret).
2. Деплойни и вземи URL-а (напр. `https://macroai-proxy.<акаунт>.workers.dev`).
3. Сложи го в `VITE_AI_PROXY_URL` (локално в `.env` или като GitHub secret).

> Алтернативи: Vercel/Netlify function, Express сървър — важното е да приема същото
> JSON тяло, да добавя `x-api-key` и `anthropic-version` и да връща отговора.

## Без прокси
Ако оставиш `VITE_AI_PROXY_URL` празно, приложението работи напълно — само AI частите
ще дават „грешка при анализа", защото браузърът няма ключ. Всичко останало (калкулатор,
дневник, рецепти, микронутриенти, тегло, профил) работи офлайн.
