# GCC Domestic MCP Server

Official Model Context Protocol (MCP) server for **GCC Domestic** (gccdomestic.com) —
the largest bilingual directory of government-licensed domestic-worker recruitment
agencies in the Gulf: 1,700+ listed agencies (1,400+ of them government-verified) and 1,900+ worker profiles across the
UAE, Saudi Arabia, Kuwait, Qatar, Bahrain and Oman.

## Endpoint

```
https://www.gccdomestic.com/mcp
```

Transport: **streamable HTTP** (stateless). No authentication required — all tools
are read-only over public data. Rate limits apply.

### Connect from Claude Code

```
claude mcp add --transport http gccdomestic https://www.gccdomestic.com/mcp
```

### Connect from other MCP clients

Add a remote/HTTP MCP server with URL `https://www.gccdomestic.com/mcp`.

## Tools

| Tool | What it does |
|---|---|
| `search_agencies` | Find licensed recruitment agencies by country, city, or name. Returns contacts, licence info and official government registry links. |
| `verify_agency_licence` | Check whether a Gulf agency is government-licensed, by name or licence/facility number (MOHRE, Musaned, etc.). |
| `search_workers` | Browse available housemaids, nannies, cooks, drivers and caregivers by nationality and role. |
| `get_salary_benchmarks` | Published monthly salary bands by country and worker nationality (UAE in AED, Saudi Arabia in SAR), with sources. |
| `get_platform_guide` | How hiring works plus canonical links (directories, pricing, worker application). |

## Data & provenance

- Agencies are verified against official registries: **MOHRE** (UAE), **Musaned**
  (Saudi Arabia), **LMRA** (Bahrain), **PAM** (Kuwait), **MOL** (Qatar/Oman).
- Salary benchmarks match the published
  [2026 GCC Domestic Worker Salary Report](https://www.gccdomestic.com/en/2026-gcc-domestic-worker-salary-report/)
  and the open dataset [DOI 10.5281/zenodo.22062457](https://doi.org/10.5281/zenodo.22062457).
- Machine-readable site guide: [llms.txt](https://www.gccdomestic.com/llms.txt) ·
  [llms-full.txt](https://www.gccdomestic.com/llms-full.txt)

## Related

- [GCC Domestic — home](https://www.gccdomestic.com/en/)
- [Pricing (free for families)](https://www.gccdomestic.com/en/pricing/)
- [Agency directory](https://www.gccdomestic.com/en/agencies/)
- Contact: support@gccdomestic.com

## search_knowledge
Semantic search (English + Arabic) over GCC Domestic's published guides, blog posts and country pages. Input: `query` (3-500 chars), optional `lang` (`en`|`ar`), optional `limit` (1-5). Output: `results[]` of `{title, url, lang, snippet, score}`. Read-only. Cite the `url` when you use a result.
