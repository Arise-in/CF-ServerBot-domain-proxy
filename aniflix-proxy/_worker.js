export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 👇 change this to your real Koyeb app hostname
    const targetHost = "aniflix.koyeb.app";
    const targetUrl = `https://${targetHost}${url.pathname}${url.search}`;
    const cache = caches.default;

    // Only cache GET requests (safe)
    const isCacheable = request.method === "GET";

    if (isCacheable) {
      const cached = await cache.match(request);
      if (cached) {
        // Return cached instantly while refreshing in background
        ctx.waitUntil(updateCache(targetUrl, request, cache));
        return cached;
      }
    }

    // Otherwise fetch from Koyeb
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "manual",
    });

    // Clean & optimize headers
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.delete("content-security-policy");
    newHeaders.delete("x-frame-options");
    newHeaders.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");

    const finalResponse = new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });

    // Save response to edge cache
    if (isCacheable && response.ok) {
      ctx.waitUntil(cache.put(request, finalResponse.clone()));
    }

    return finalResponse;
  },
};

// Background revalidation function
async function updateCache(targetUrl, originalRequest, cache) {
  try {
    const response = await fetch(targetUrl, { headers: originalRequest.headers });
    if (response.ok) {
      await cache.put(originalRequest, response.clone());
    }
  } catch (err) {
    console.warn("Cache revalidation failed:", err);
  }
}
