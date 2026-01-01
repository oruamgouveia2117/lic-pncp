/**
 * Netlify Function: PNCP proxy (bypasses browser CORS)
 *
 * Use in the browser:
 *   /api/consulta/v1/<endpoint>?<query>
 * Redirect (netlify.toml):
 *   /api/consulta/v1/*  ->  /.netlify/functions/pncp/:splat
 */
exports.handler = async (event) => {
  const upstreamBase = "https://pncp.gov.br/api/consulta/v1";

  // Netlify Functions path can be:
  //   /.netlify/functions/pncp/<splat>
  // or (sometimes) /pncp/<splat> depending on runtime
  const fullPath = String(event.path || "");
  const prefixA = "/.netlify/functions/pncp";
  const prefixB = "/pncp";

  let splat = "";
  if (fullPath.startsWith(prefixA)) splat = fullPath.slice(prefixA.length);
  else if (fullPath.startsWith(prefixB)) splat = fullPath.slice(prefixB.length);
  else splat = fullPath;

  if (splat.startsWith("/")) splat = splat.slice(1);

  // Basic hardening
  if (!splat || splat.includes("..")) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Invalid path" }),
    };
  }

  // Build upstream URL + query params
  const url = new URL(`${upstreamBase}/${splat}`);

  // Netlify may or may not provide rawQueryString. Prefer explicit params objects.
  const mv = event.multiValueQueryStringParameters;
  const qs = event.queryStringParameters;

  if (mv && typeof mv === "object") {
    for (const [k, arr] of Object.entries(mv)) {
      if (!Array.isArray(arr)) continue;
      for (const v of arr) {
        if (v === undefined || v === null || v === "") continue;
        url.searchParams.append(k, String(v));
      }
    }
  } else if (qs && typeof qs === "object") {
    for (const [k, v] of Object.entries(qs)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  } else if (event.rawQueryString) {
    // Fallback: raw query string (may be empty on some runtimes)
    url.search = String(event.rawQueryString);
  }

  try {
    const resp = await fetch(url.toString(), {
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
