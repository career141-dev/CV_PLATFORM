// V8 runtime — HTTP Actions (OAuth callback)
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

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

export default http;
