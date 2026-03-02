# Changelog

## [0.1.0] - MVP Base

### Added
- Supabase project with RLS
- Core tables: assets, trades, profiles, plans, import_files
- Views: vw_weekly_summary, vw_monthly_summary
- CSV importer via tools/import_profit_csv.mjs
- Frontend dashboard with KPIs and weekly chart
- Authentication (Supabase Auth)

### Fixed
- Removed symbol from dashboard select (normalized via asset_id)

## [0.1.0] - MVP Base Estável
### Refactor
- Normalização completa via asset_id (remoção de symbol direto em trades)