## STATUS ATUAL (MVP 0.1.0)

### ✅ Concluído

- Projeto Supabase criado
- Tabelas: assets, trades, profiles, plans, import_files
- RLS ativa e validada
- Views:
  - vw_weekly_summary
  - vw_monthly_summary
- Script tools/test_supabase.mjs validando:
  - Auth
  - Inserts
  - RLS
  - Views
- Script tools/import_profit_csv.mjs:
  - Importação CSV Profit
  - Anti-duplicidade por hash
  - Registro em import_files
- Frontend Next.js:
  - Login funcional
  - Dashboard:
    - Mini-cards mensais
    - Cards % meta / mínimo
    - Tabela semanal
    - Gráfico semanal (Recharts)
  - Ajuste de normalização (symbol removido → uso de asset_id)

---

### 🔄 Próxima Feature

- Rota `/import`
- Upload CSV via frontend
- Preview antes de importar
- Endpoint `/api/import/profit`
- Reuso da lógica do importer (refatorar para lib compartilhada)