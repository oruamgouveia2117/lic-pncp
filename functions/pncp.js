/**
 * Netlify Function: PNCP proxy (bypasses browser CORS)
 * Rewrites: /api/consulta/v1/*  ->  /.netlify/functions/pncp/:splat
 */
exports.handler = async (event) => {
  const upstreamBase = "https://pncp.gov.br/api/consulta/v1/";

  const prefixes = [
    "/.netlify/functions/pncp/",
    "/api/consulta/v1/",
  ];
  const path = (event.path || "");
  let splat = "";
  for (const pre of prefixes) {
    if (path.startsWith(pre)) {
      splat = path.slice(pre.length);
      break;
    }
  }
if (!splat || splat.includes("..")) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Invalid path" }),
    };
  }
  const rawQS = (event.rawQueryString && String(event.rawQueryString).trim()) ? String(event.rawQueryString) : "";
  let builtQS = rawQS;

  if (!builtQS) {
    const mv = event.multiValueQueryStringParameters;
    if (mv && typeof mv === "object") {
      const usp = new URLSearchParams();
      for (const [k, vv] of Object.entries(mv)) {
        const arr = Array.isArray(vv) ? vv : [vv];
        for (const v of arr) usp.append(k, v);
      }
      builtQS = usp.toString();
    } else {
      builtQS = new URLSearchParams(event.queryStringParameters || {}).toString();
    }
  }

  const qs = builtQS ? `?${builtQS}` : "";
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
