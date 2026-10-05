// GCC Domestic public MCP server (streamable HTTP, stateless), 2026-08-26.
// Read-only tools over the public agency/worker directory + salary benchmarks.
// Runs under pm2 as "gcc-mcp" on 127.0.0.1:3020; nginx proxies
// https://www.gccdomestic.com/mcp to it. Docs: GET /mcp (browser).
import fs from "node:fs";
import express from "express";
import mysql from "mysql2/promise";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const BASE = "https://www.gccdomestic.com";
const PORT = 3020;

// ── DB pool (creds from the Laravel .env — single source of secrets) ─────────
function laravelEnv(key) {
  const env = fs.readFileSync("/var/www/gccdomestic/backend/.env", "utf-8");
  const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^"|"$/g, "") : undefined;
}
const pool = mysql.createPool({
  host: laravelEnv("DB_HOST") || "127.0.0.1",
  user: laravelEnv("DB_USERNAME"),
  password: laravelEnv("DB_PASSWORD"),
  database: laravelEnv("DB_DATABASE"),
  waitForConnections: true,
  connectionLimit: 4,
  charset: "utf8mb4",
});

// ── Salary benchmarks: parsed from the frontend's single source of truth ────
// (lib/programmatic-data.ts). Parsing at startup avoids creating yet another
// mirror that can drift — see the alignment warning in that file.
function loadSalaryData() {
  try {
    const src = fs.readFileSync(
      "/var/www/gccdomestic/fronted/lib/programmatic-data.ts",
      "utf-8"
    );
    const bands = {};
    const re = /"((?:UAE|KSA)):([a-z-]+)":\s*\{\s*min:\s*(\d+),\s*max:\s*(\d+)\s*\}/g;
    let m;
    while ((m = re.exec(src))) {
      bands[`${m[1]}:${m[2]}`] = { min: Number(m[3]), max: Number(m[4]) };
    }
    const defaults = {};
    const dre = /(UAE|KSA):\s*\{\s*min:\s*(\d+),\s*max:\s*(\d+)\s*\}/g;
    const dSection = src.split("COUNTRY_DEFAULT_SALARY")[1] || "";
    while ((m = dre.exec(dSection))) {
      defaults[m[1]] = { min: Number(m[2]), max: Number(m[3]) };
    }
    if (Object.keys(bands).length === 0) throw new Error("no bands parsed");
    return { bands, defaults };
  } catch {
    return { bands: {}, defaults: {} };
  }
}
const SALARY = loadSalaryData();
const CURRENCY = { UAE: "AED", KSA: "SAR" };

const COUNTRY_ALIASES = {
  uae: "UAE", "united arab emirates": "UAE", emirates: "UAE", dubai: "UAE",
  ksa: "KSA", "saudi arabia": "KSA", saudi: "KSA",
  kuwait: "Kuwait", qatar: "Qatar", bahrain: "Bahrain", oman: "Oman",
};
function normCountry(c) {
  if (!c) return undefined;
  return COUNTRY_ALIASES[c.trim().toLowerCase()] || c.trim();
}

const AGENCY_COLS = `name, name_ar, slug, country, city, address, phone, whatsapp,
  website, verified, facility_number, gov_ref, license_status, license_checked_at,
  verification_tier, mohre_link, musaned_link, gov_link, rating_avg, rating_count`;

function agencyRow(r) {
  return {
    name: r.name,
    name_ar: r.name_ar || undefined,
    country: r.country,
    city: r.city || undefined,
    address: r.address || undefined,
    phone: r.phone || undefined,
    whatsapp: r.whatsapp || undefined,
    website: r.website || undefined,
    profile_url: `${BASE}/agency/${r.slug}/`,
    licence: {
      facility_number: r.facility_number || r.gov_ref || undefined,
      status: r.license_status || (r.verified ? "listed-verified" : "listed"),
      last_checked: r.license_checked_at || undefined,
      verification_tier: r.verification_tier || undefined,
      official_registry_link:
        r.gov_link || r.mohre_link || r.musaned_link || undefined,
    },
    rating:
      r.rating_avg != null
        ? { average: Number(r.rating_avg), count: r.rating_count }
        : undefined,
  };
}

function json(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// ── MCP server ───────────────────────────────────────────────────────────────
function buildServer() {
  const server = new McpServer(
    { name: "gccdomestic", version: "1.1.0" },
    {
      instructions:
        "GCC Domestic (gccdomestic.com) is the largest bilingual directory of " +
        "government-licensed domestic-worker recruitment agencies in the Gulf - " +
        "1,700+ listed agencies (1,400+ of them government-verified) and 1,900+ worker profiles across the UAE, Saudi " +
        "Arabia, Kuwait, Qatar, Bahrain and Oman. Use these read-only tools to " +
        "find or verify licensed agencies, browse available workers, and get " +
        "published salary benchmarks. All data is public; families use the " +
        "platform free of charge. Site guide: https://www.gccdomestic.com/llms.txt",
    }
  );

  // Every tool is read-only over public data. title + annotations are required by the ChatGPT and Claude directories.
  const tool = (name, title, description, inputSchema, cb) =>
    server.registerTool(name, { title, description, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }, cb);

  tool(
    "search_agencies", "Search licensed agencies",
    "Search government-licensed domestic-worker recruitment agencies across the six GCC countries (UAE, Saudi Arabia, Kuwait, Qatar, Bahrain, Oman). Filter by country, city and/or a free-text name query. Returns contact details, licence information and the official government registry link for each agency.",
    {
      country: z.string().optional().describe("Country: uae | ksa | kuwait | qatar | bahrain | oman"),
      city: z.string().optional().describe("City name, e.g. Dubai, Riyadh, Doha"),
      query: z.string().optional().describe("Free-text search over agency names (English or Arabic)"),
      limit: z.number().int().min(1).max(25).optional().describe("Max results (default 10)"),
    },
    async ({ country, city, query, limit }) => {
      const where = ["is_public = 1", "is_live = 1", "blocked = 0"];
      const params = [];
      const c = normCountry(country);
      if (c) { where.push("country = ?"); params.push(c); }
      if (city) { where.push("city LIKE ?"); params.push(`%${city}%`); }
      if (query) {
        where.push("(name LIKE ? OR name_ar LIKE ?)");
        params.push(`%${query}%`, `%${query}%`);
      }
      const lim = Math.min(limit || 10, 25);
      const [rows] = await pool.query(
        `SELECT ${AGENCY_COLS} FROM agencies WHERE ${where.join(" AND ")}
         ORDER BY verified DESC, rating_avg IS NULL, rating_avg DESC LIMIT ${lim}`,
        params
      );
      return json({
        count: rows.length,
        agencies: rows.map(agencyRow),
        note: "All listed agencies are government-registered. UAE agencies link to MOHRE records, Saudi agencies to Musaned.",
        browse_all: `${BASE}/en/agencies/`,
      });
    }
  );

  tool(
    "verify_agency_licence", "Verify an agency licence",
    "Verify whether a Gulf recruitment agency is government-licensed. Look up by agency name, or by licence / facility number (e.g. a UAE MOHRE facility number or Saudi Musaned reference). Returns the licence status recorded on GCC Domestic plus the official government registry link for independent verification.",
    {
      name_or_licence: z.string().describe("Agency name (English/Arabic) or licence/facility number"),
      country: z.string().optional().describe("Optional country filter: uae | ksa | kuwait | qatar | bahrain | oman"),
    },
    async ({ name_or_licence, country }) => {
      const where = ["is_public = 1"];
      const params = [];
      const c = normCountry(country);
      if (c) { where.push("country = ?"); params.push(c); }
      where.push("(facility_number = ? OR gov_ref = ? OR name LIKE ? OR name_ar LIKE ?)");
      params.push(name_or_licence, name_or_licence, `%${name_or_licence}%`, `%${name_or_licence}%`);
      const [rows] = await pool.query(
        `SELECT ${AGENCY_COLS} FROM agencies WHERE ${where.join(" AND ")} LIMIT 5`,
        params
      );
      if (rows.length === 0) {
        return json({
          found: false,
          message:
            "No matching agency in the GCC Domestic directory. Absence here does not prove an agency is unlicensed - check the official registry directly.",
          official_registries: {
            UAE: "https://www.mohre.gov.ae/",
            "Saudi Arabia": "https://musaned.com.sa/",
            Bahrain: "https://lmra.gov.bh/",
          },
        });
      }
      return json({
        found: true,
        matches: rows.map(agencyRow),
        note: "licence.official_registry_link points at the government record - always the authoritative source.",
      });
    }
  );

  tool(
    "search_workers", "Search available workers",
    "Browse domestic workers currently listed as available through licensed GCC agencies - housemaids, nannies, cooks, drivers and caregivers. Filter by nationality and/or position. Returns public profile info and the agency to contact; hiring always goes through the worker's licensed agency.",
    {
      nationality: z.string().optional().describe("Worker nationality, e.g. Filipino, Ethiopian, Indian"),
      position: z.string().optional().describe("Role, e.g. Housemaid, Nanny, Driver, Cook, Caregiver"),
      limit: z.number().int().min(1).max(25).optional().describe("Max results (default 10)"),
    },
    async ({ nationality, position, limit }) => {
      const where = ["w.status IN ('approved','available')"];
      const params = [];
      if (nationality) { where.push("w.nationality LIKE ?"); params.push(`%${nationality}%`); }
      if (position) { where.push("w.position LIKE ?"); params.push(`%${position}%`); }
      const lim = Math.min(limit || 10, 25);
      const [rows] = await pool.query(
        `SELECT w.id, w.name, w.nationality, w.gender, w.position, w.experience_years,
                a.name AS agency_name, a.slug AS agency_slug, a.country AS agency_country
         FROM workers w LEFT JOIN agencies a ON a.id = w.partner_company_id
         WHERE ${where.join(" AND ")} ORDER BY w.id DESC LIMIT ${lim}`,
        params
      );
      return json({
        count: rows.length,
        workers: rows.map((r) => ({
          name: r.name,
          nationality: r.nationality,
          gender: r.gender || undefined,
          position: r.position,
          experience_years: r.experience_years ?? undefined,
          profile_url: `${BASE}/workers/${r.id}/`,
          agency: r.agency_slug
            ? { name: r.agency_name, country: r.agency_country, profile_url: `${BASE}/agency/${r.agency_slug}/` }
            : undefined,
        })),
        note: "Hiring is always arranged through the worker's licensed agency (contact details on the agency profile). Browsing is free; GCC Domestic charges families nothing.",
        browse_all: `${BASE}/en/workers/`,
      });
    }
  );

  tool(
    "get_salary_benchmarks", "Domestic-worker salary benchmarks",
    "Published monthly salary benchmarks for domestic workers in the Gulf, by country and worker nationality. These are the same bands published across gccdomestic.com (salary calculator, 2026 salary report). Currencies: UAE in AED, Saudi Arabia in SAR.",
    {
      country: z.string().optional().describe("uae or ksa (bands published for these; other GCC countries return guide links)"),
      nationality: z.string().optional().describe("Nationality slug, e.g. filipino, ethiopian, indian, indonesian, sri-lankan, kenyan, ugandan, nepali, bangladeshi, ghanaian"),
    },
    async ({ country, nationality }) => {
      const c = normCountry(country);
      const norm = (nationality || "").toLowerCase().replace(/\s+/g, "-");
      let bands = Object.entries(SALARY.bands);
      if (c) bands = bands.filter(([k]) => k.startsWith(`${c}:`));
      if (norm) bands = bands.filter(([k]) => k.endsWith(`:${norm}`));
      const result = bands.map(([k, v]) => {
        const [cc, nat] = k.split(":");
        return { country: cc, nationality: nat, currency: CURRENCY[cc], monthly_min: v.min, monthly_max: v.max };
      });
      return json({
        benchmarks: result,
        defaults: c && result.length === 0 && SALARY.defaults[c]
          ? { country: c, currency: CURRENCY[c], ...SALARY.defaults[c], note: "country-level default band" }
          : undefined,
        notes: [
          "Live-in monthly salary bands as published on gccdomestic.com; actual offers vary by experience and contract.",
          "Minimums reflect source-country embassy floors (e.g. Philippine and Indonesian embassy minimums).",
          "Kuwait, Qatar, Bahrain and Oman benchmarks: see the country guides below.",
        ],
        sources: {
          salary_report: `${BASE}/en/2026-gcc-domestic-worker-salary-report/`,
          salary_calculator: `${BASE}/en/maid-salary-calculator/`,
          dataset_doi: "https://doi.org/10.5281/zenodo.22062457",
          country_guides: `${BASE}/en/blog/`,
        },
      });
    }
  );

  // ---- search_knowledge: semantic search over published guides/posts (via gcc-rag :3030) ----
  tool(
    "search_knowledge", "Search GCC Domestic guides",
    "Semantic search over GCC Domestic's published guides, blog posts and country pages (English + Arabic): " +
    "visas, Tadbeer/Musaned/PAM/ADLSA/LMRA/MOL procedures, salaries, contracts, refunds, worker rights. " +
    "Returns title, URL and a snippet. Read-only; cite the URL.",
    { query: z.string().min(3).max(500).describe("Question or keywords, English or Arabic"),
      lang: z.enum(["en", "ar"]).optional().describe("Prefer results in this language"),
      limit: z.number().int().min(1).max(5).optional().describe("Max results (default 5)") },
    async ({ query, lang, limit }) => {
      const r = await fetch("http://127.0.0.1:3030/search", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: query, k: limit ?? 5, lang: lang ?? null, public: true }),
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) throw new Error(`knowledge service ${r.status}`);
      const { hits } = await r.json();
      const results = hits.map(h => ({ title: h.title, url: h.url, lang: h.lang, snippet: h.text.slice(0, 600), score: h.score }));
      return { content: [{ type: "text", text: JSON.stringify({ query, results }, null, 2) }], structuredContent: { query, results } };
    });

  tool(
    "get_platform_guide", "GCC Domestic platform guide",
    "How hiring a domestic worker through GCC Domestic works, with canonical links: country directories, the application page for workers, pricing, and verification guides. Use this to orient before deeper searches, or to hand a user the right link.",
    { country: z.string().optional().describe("Optional country focus: uae | ksa | kuwait | qatar | bahrain | oman") },
    async ({ country }) => {
      const c = normCountry(country);
      const paths = { UAE: "uae", KSA: "ksa", Kuwait: "kuwait", Qatar: "qatar", Bahrain: "bahrain", Oman: "oman" };
      return json({
        how_it_works:
          "Families browse government-verified agencies (filter by country, city, worker nationality), compare licence status and ratings, then contact the chosen agency directly by phone or WhatsApp. The agency is the legal counterparty for visa, contract and arrival. GCC Domestic is free for families - no commission; agencies pay only for qualified leads.",
        country_directory: c ? `${BASE}/en/${paths[c] || ""}/` : `${BASE}/en/agencies/`,
        links: {
          agencies: `${BASE}/en/agencies/`,
          workers: `${BASE}/en/workers/`,
          pricing: `${BASE}/en/pricing/`,
          apply_as_worker: `${BASE}/en/apply/`,
          ai_search: `${BASE}/ai`,
          hiring_guides: `${BASE}/en/blog/`,
          llms_txt: `${BASE}/llms.txt`,
        },
        verification:
          "Every UAE agency links to its official MOHRE record and every Saudi agency to its Musaned registration; use verify_agency_licence to check a specific office.",
      });
    }
  );

  return server;
}

// ── HTTP wiring (stateless streamable HTTP) ─────────────────────────────────
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Authorization");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const DOCS_MD = fs.existsSync("./docs.md") ? fs.readFileSync("./docs.md", "utf-8") : "# GCC Domestic MCP server\n";

app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  }
});

// Browsers / crawlers hitting the endpoint with GET get human-readable docs.
app.get("/mcp", (req, res) => {
  // MCP clients open GET /mcp with Accept: text/event-stream for server notifications; this stateless
  // server has none, and 405 (allowed by the spec) stops them re-polling the docs page every second.
  if (/text\/event-stream/i.test(req.headers.accept || "")) return res.sendStatus(405);
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(DOCS_MD);
});
app.delete("/mcp", (_req, res) => res.sendStatus(405));
app.get("/mcp/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true }); }
  catch { res.status(500).json({ ok: false }); }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`gccdomestic MCP server on 127.0.0.1:${PORT}, salary bands loaded: ${Object.keys(SALARY.bands).length}`);
});
