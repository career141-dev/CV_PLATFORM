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

    if (error) {
      const msg = encodeURIComponent(errorDescription ?? error);
      return Response.redirect(`${appOrigin}/email-import?error=${msg}`, 302);
    }

    if (!code || !state) {
      return Response.redirect(`${appOrigin}/email-import?error=missing_params`, 302);
    }

    // Pass code + state to frontend — frontend will call exchangeCode action
    return Response.redirect(
      `${appOrigin}/email-import?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      302
    );
  }),
});

export default http;
