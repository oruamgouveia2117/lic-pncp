/**
 * Netlify Function: PNCP proxy (bypasses browser CORS)
 * Works both when called directly:
 *   /.netlify/functions/pncp/<splat>
 * and when called via rewrite:
 *   /api/consulta/v1/<splat>
 */
exports.handler = async (event) => {
  const upstreamBase = "https://pncp.gov.br/api/consulta/v1/";

  const reqPath = (event.path || event.rawPath || "").toString();
  const apiPrefix = "/api/consulta/v1/";
  const fnPrefix = "/.netlify/functions/pncp/";

  let upstreamPath = "";

  // Case A: called directly as /.netlify/functions/pncp/<splat>
  if (reqPath.startsWith(fnPrefix)) {
    upstreamPath = reqPath.slice(fnPrefix.length);
  }

  // Case B: called via rewrite as /api/consulta/v1/<splat>
  if (!upstreamPath && reqPath.startsWith(apiPrefix)) {
    upstreamPath = reqPath.slice(apiPrefix.length);
  }

  // Case C: some Netlify setups keep original path in headers
  const headers = event.headers || {};
  const origPath =
    headers["x-nf-original-path"] ||
    headers["x-original-url"] ||
    headers["x-original-uri"] ||
    "";

  if (!upstreamPath && origPath.startsWith(apiPrefix)) {
    upstreamPath = origPath.slice(apiPrefix.length);
  }

  // Normalize
  upstreamPath = upstreamPath.replace(/^\/+/, "");

  // Safety / validation
  if (!upstreamPath || upstreamPath.includes("..")) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: "Invalid path",
        got: { reqPath, origPath },
      }),
    };
  }

  const qs = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const url = `${upstreamBase}${upstreamPath}${qs}`;

  try {
    const resp = await fetch(url, {
      method: event.httpMethod || "GET",
      headers: {
        accept: "application/json",
        "user-agent": "netlify-function-pncp-proxy",
      },
    });

    const bodyText = await resp.text();
    const contentType =
      resp.headers.get("content-type") || "application/json; charset=utf-8";

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
      body: JSON.stringify({
        error: "Upstream fetch failed",
        details: String(err),
      }),
    };
  }
};
