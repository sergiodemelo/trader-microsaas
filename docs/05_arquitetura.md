# Architecture

## Overview

## Backend
- Supabase (DB + Auth + RLS)

## CLI Layer
- tools/import_profit_csv.mjs
- tools/test_supabase.mjs

## Frontend
- Next.js (App Router)
- Tailwind
- Recharts

## Data Flow
CSV → CLI importer → Supabase → Views → Dashboard