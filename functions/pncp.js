/**
 * Netlify Function: PNCP proxy (bypasses browser CORS)
 * Rewrites: /api/consulta/v1/*  ->  /.netlify/functions/pncp/:splat
 */
exports.handler = async (event) => {
  const upstreamBase = "https://pncp.gov.br/api/consulta/v1/";

  const prefix = "/.netlify/functions/pncp/";
  const path = (event.path || "");
  const splat = path.startsWith(prefix) ? path.slice(prefix.length) : "";

  if (!splat || splat.includes("..")) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Invalid path" }),
    };
  }

  const qs = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const url = `${upstreamBase}${splat}${qs}`;

  try {
    const resp = await fetch(url, {
      method: event.httpMethod || "GET",
      headers: {
        "accept": "application/json",
        "user-agent": "netlify-function-pncp-proxy",
      },
    });

    const bodyText = await resp.text();
    const contentType = resp.headers.get("content-type") || "application/json; charset=utf-8";

    return {
      statusCode: resp.status,
      headers: {
        "content-type": contentType,
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
      body: bodyText,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Upstream fetch failed", details: String(err) }),
    };
  }
};
