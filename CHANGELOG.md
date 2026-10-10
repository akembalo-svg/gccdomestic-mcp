# Changelog

All notable changes to the GCC Domestic MCP server (`https://www.gccdomestic.com/mcp`, registry name `com.gccdomestic/gccdomestic`).
Versions follow [Semantic Versioning](https://semver.org).

## [1.1.1] - 2026-10-10
### Changed
- Counts match the live database: 1,600+ listed agencies (1,300+ of them government-verified) and 1,500+ worker profiles (was 1,700+ / 1,400+ / 1,900+). Registry description updated to match.
- No "largest" claim, and no claim that every listed agency is government-registered: each agency now carries `licence.government_verified`, and search results put government-verified agencies first.
- Saudi verification wording: the 800+ agencies Musaned lists link to their Musaned record; the others are listed without the badge.

## [1.1.0] - 2026-10-05
### Added
- Public source repository (this one), MIT licence, `repository` field in the MCP Registry entry.

## [1.0.3] - 2026-09-28
### Changed
- Registry description: "Verify 1,700+ GCC domestic-worker agencies (1,400+ gov-verified); search 900+ EN/AR guides" (listed vs government-verified counts stated separately).

## [1.0.2] - 2026-09-05
### Changed
- Registry description now covers the guide search: "search 900+ EN/AR guides".

## [1.0.1] - 2026-09-03
### Changed
- Corrected registry description.
- Tools registered with titles and annotations (`readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`).
- `GET /mcp` with `Accept: text/event-stream` answers 405 instead of re-serving the docs page.

## [1.0.0] - 2026-08-26
### Added
- First public release on the MCP Registry: `search_agencies`, `verify_agency_licence`, `search_workers`, `get_salary_benchmarks`, `search_knowledge`, `get_platform_guide`. All read-only.

[1.1.0]: https://github.com/akembalo-svg/gccdomestic-mcp/releases/tag/v1.1.0
