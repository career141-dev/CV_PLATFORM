// V8 runtime — HTTP Actions (OAuth callback + WhatsApp webhook)
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Microsoft OAuth callback — just redirects to the frontend with code+state
// The frontend then calls the exchangeCode action directly
http.route({
  path: "/m365/callback",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:5173";

    // Return an HTML page that posts the result back to the opener window (popup flow)
    const payload = error
      ? JSON.stringify({ error: errorDescription ?? error })
      : (!code || !state)
        ? JSON.stringify({ error: "missing_params" })
        : JSON.stringify({ code, state });

    const html = `<!DOCTYPE html><html><body><script>
      try {
        if (window.opener) {
          window.opener.postMessage({ type: "ms_oauth_callback", payload: ${payload} }, "*");
        }
      } catch(e) {}
      window.close();
    </script><p>Connecting... you can close this window.</p></body></html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }),
});

// ─── WhatsApp webhook ─────────────────────────────────────────────────────────

// GET: Meta verification challenge
http.route({
  path: "/whatsapp/webhook",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? "";

    if (mode === "subscribe" && token === verifyToken) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }),
});

// POST: Incoming messages
http.route({
  path: "/whatsapp/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json() as Record<string, unknown>;

    try {
      const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
      const change = (entry?.changes as Array<Record<string, unknown>>)?.[0];
      const value = change?.value as Record<string, unknown> | undefined;
      const messages = value?.messages as Array<Record<string, unknown>> | undefined;

      if (!messages || messages.length === 0) {
        return new Response("ok", { status: 200 });
      }

      for (const msg of messages) {
        const waId = msg.id as string;
        const from = msg.from as string;
        const msgType = msg.type as string;
        const textBody = (msg.text as Record<string, unknown> | undefined)?.body as string | undefined;

        let mediaId: string | undefined;
        let fileName: string | undefined;
        let mimeType: string | undefined;

        if (msgType === "document") {
          const doc = msg.document as Record<string, unknown>;
          mediaId = doc?.id as string;
          fileName = doc?.filename as string | undefined;
          mimeType = doc?.mime_type as string | undefined;
        } else if (msgType === "image") {
          const img = msg.image as Record<string, unknown>;
          mediaId = img?.id as string;
          mimeType = img?.mime_type as string | undefined;
        }

        // Only process if there's a document or we can still try (text-only prompts handled inside)
        await ctx.runAction(internal.whatsapp.process.processIncomingMessage, {
          waId,
          from,
          messageText: textBody ?? "",
          mediaId,
          fileName,
          mimeType,
        });
      }
    } catch { /* silently ignore malformed payloads */ }

    // Always return 200 so Meta doesn't retry
    return new Response("ok", { status: 200 });
  }),
});

// ─── ZIP proxy — streams a remote ZIP URL back to the browser to bypass CORS ──

http.route({
  path: "/zip-proxy",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const url = new URL(request.url);
    const target = url.searchParams.get("url");

    if (!target) {
      return new Response("Missing url parameter", { status: 400 });
    }

    // Only allow S3 / known storage hosts to prevent open-redirect abuse
    let targetUrl: URL;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response("Invalid url", { status: 400 });
    }

    const allowedHosts = [
      "s3.amazonaws.com",
      "s3.eu-west-1.amazonaws.com",
      "s3.us-east-1.amazonaws.com",
      "workable-export.s3.amazonaws.com",
      "storage.googleapis.com",
    ];
    const hostAllowed = allowedHosts.some(
      (h) => targetUrl.hostname === h || targetUrl.hostname.endsWith("." + h) || targetUrl.hostname.endsWith(".amazonaws.com")
    );
    if (!hostAllowed) {
      return new Response("Host not allowed", { status: 403 });
    }

    try {
      const upstream = await fetch(target);
      if (!upstream.ok) {
        return new Response(`Upstream error: ${upstream.status}`, { status: upstream.status });
      }
      const data = await upstream.arrayBuffer();
      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Access-Control-Allow-Origin": "*",
          "Content-Length": String(data.byteLength),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(`Proxy error: ${msg}`, { status: 502 });
    }
  }),
});

export default http;
