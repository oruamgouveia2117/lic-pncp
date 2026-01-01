/**
 * Netlify Function: PNCP proxy (bypasses browser CORS)
 *
 * Supports both:
 *  - Direct call: /.netlify/functions/pncp/<splat>
 *  - Rewrite call: /api/consulta/v1/<splat>
 *
 * netlify.toml example:
 * [build]
 *   publish = "."
 *   functions = "functions"
 *
 * [[redirects]]
 *   from = "/api/consulta/v1/*"
 *   to = "/.netlify/functions/pncp/:splat"
 *   status = 200
 */
exports.handler = async (event) => {
  const upstreamBase = "https://pncp.gov.br/api/consulta/v1/";

  // --------- 1) Resolve path (supports rewrite and direct function path) ----------
  const reqPath = (event.path || event.rawPath || "").toString();
  const apiPrefix = "/api/consulta/v1/";
  const fnPrefix = "/.netlify/functions/pncp/";

  let upstreamPath = "";

  // A) Direct call: /.netlify/functions/pncp/<splat>
  if (reqPath.startsWith(fnPrefix)) {
    upstreamPath = reqPath.slice(fnPrefix.length);
  }

  // B) Rewrite call: /api/consulta/v1/<splat>
  if (!upstreamPath && reqPath.startsWith(apiPrefix)) {
    upstreamPath = reqPath.slice(apiPrefix.length);
  }

  // C) Some setups keep original path in headers (rare, but helpful)
  const headers = event.headers || {};
  const origPath =
    headers["x-nf-original-path"] ||
    headers["x-original-url"] ||
    headers["x-original-uri"] ||
    "";

  if (!upstreamPath && typeof origPath === "string" && origPath.startsWith(apiPrefix)) {
    upstreamPath = origPath.slice(apiPrefix.length);
  }

  // Normalize: remove leading slashes
  upstreamPath = (upstreamPath || "").replace(/^\/+/, "");

  // --------- 2) Build query string robustly ----------
  let query = "";
  if (event.rawQueryString) {
    query = event.rawQueryString;
  } else if (event.rawQuery) {
    query = event.rawQuery;
  } else if (event.multiValueQueryStringParameters) {
    const p = new URLSearchParams();
    for (const [k, arr] of Object.entries(event.multiValueQueryStringParameters)) {
      for (const v of (arr || [])) p.append(k, v);
    }
    query = p.toString();
  } else if (event.queryStringParameters) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(event.queryStringParameters)) {
      if (v !== undefined && v !== null) p.append(k, String(v));
    }
    query = p.toString();
  }

  const qs = query ? `?${query}` : "";

  // --------- 3) Safety / validation ----------
  if (!upstreamPath || upstreamPath.includes("..")) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: "Invalid path",
        got: { reqPath, origPath, upstreamPath, query },
      }),
    };
  }

  const url = `${upstreamBase}${upstreamPath}${qs}`;

  // Handle preflight (optional, usually not needed since same-origin, but harmless)
  if ((event.httpMethod || "GET").toUpperCase() === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,OPTIONS",
        "access-control-allow-headers": "content-type",
      },
      body: "",
    };
  }

  // --------- 4) Proxy request ----------
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
        url,
      }),
    };
  }
};
