# GCC Domestic MCP server

The public [Model Context Protocol](https://modelcontextprotocol.io) server for **GCC Domestic** ([gccdomestic.com](https://www.gccdomestic.com)), the domestic-worker platform for the six Gulf states. Any MCP-capable assistant can use it to:

- `search_agencies`: find licensed domestic-worker agencies by country, city or name
- `verify_agency_licence`: check an agency by name or licence/facility number, with a link to its official government record (MOHRE / Tadbeer for the UAE, Musaned for Saudi Arabia)
- `search_workers`: search available worker profiles by nationality and position
- `get_salary_benchmarks`: typical monthly salary bands by country and nationality
- `search_knowledge`: search GCC Domestic's English and Arabic guides
- `get_platform_guide`: what GCC Domestic offers and how to use it

All tools are **read-only** (`readOnlyHint: true`). Nothing can be booked, changed or sent through this server.

**Endpoint:** `https://www.gccdomestic.com/mcp` (Streamable HTTP, stateless, no sign-in needed)
**Registry:** `com.gccdomestic/gccdomestic` on the [MCP Registry](https://registry.modelcontextprotocol.io)
**Docs:** `GET https://www.gccdomestic.com/mcp`

## Connect

In any client that accepts a remote MCP server, add the URL `https://www.gccdomestic.com/mcp`.

## How it is built

`server.mjs` (Express + `@modelcontextprotocol/sdk`) answers MCP requests from the GCC Domestic database (MySQL, read-only queries). Salary bands are read at startup from the website's own salary data, so the server and the site show the same figures.

The server runs next to the private GCC Domestic application and reads its database settings from that application's `.env` file at runtime. **No credentials are in this repository.** So this code documents exactly what the public endpoint does, but on its own it will not run against GCC Domestic data.

Contact: support@gccdomestic.com

## Licence

MIT. See [LICENSE](LICENSE). © 2026 GCC Domestic (Ibrahim Kedir).
