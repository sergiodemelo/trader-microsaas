import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Faltou SUPABASE_URL/SUPABASE_ANON_KEY no tools/.env");
if (!email || !password) throw new Error("Faltou TEST_USER_EMAIL/TEST_USER_PASSWORD no tools/.env");

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function parseBrNumber(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t || t === '-' || t === ' - ' || t === ' -') return null;
  // 5.222,00 -> 5222.00
  return Number(t.replace(/\./g, '').replace(',', '.'));
}

function parseDateTimeBR(s) {
  // "02/03/2026 09:24:12"
  const [d, m, y, hh, mm, ss] = s.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/).slice(1);
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function monthStartISO(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), 1);
  return isoDate(m);
}

function baseSymbolFromAtivo(ativoRaw) {
  // WDOJ26 -> WDO, WINJ26 -> WIN
  const m = String(ativoRaw).trim().match(/^([A-Z]+)\w*$/);
  if (!m) return String(ativoRaw).trim();
  const letters = m[1];
  // heurística: WDO/WIN são os principais; se vier outros, mantém o prefixo
  if (letters.startsWith('WDO')) return 'WDO';
  if (letters.startsWith('WIN')) return 'WIN';
  return letters;
}

function parseProfitCsv(content) {
  // arquivo tem cabeçalhos humanos, e a tabela começa em linha que inicia com "Ativo;"
  const lines = content.split(/\r?\n/).filter(l => l !== undefined);
  const headerIdx = lines.findIndex(l => l.startsWith('Ativo;'));
  if (headerIdx === -1) throw new Error('Cabeçalho "Ativo;" não encontrado no CSV.');

  // data do relatório (linha: "Data: 02/03/2026")
  const reportDateLine = lines.find(l => l.startsWith('Data:'));
  if (!reportDateLine) throw new Error('Linha "Data:" não encontrada no CSV.');
  const reportDateStr = reportDateLine.replace('Data:', '').trim(); // 02/03/2026
  const [dd, mm, yyyy] = reportDateStr.split('/').map(Number);
  const reportDate = new Date(yyyy, mm - 1, dd);

  const headers = lines[headerIdx].split(';').map(h => h.trim());
  const rows = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(';');
    if (parts.length !== headers.length) continue;

    const obj = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = parts[c];

    rows.push(obj);
  }

  return { reportDate, headers, rows };
}

async function getOrCreateAssetId(symbolBase) {
  const { data: existing, error: e1 } = await supabase
    .from('assets')
    .select('id,symbol')
    .eq('symbol', symbolBase)
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;
  if (existing?.id) return existing.id;

  const { data: created, error: e2 } = await supabase
    .from('assets')
    .insert({ symbol: symbolBase, description: symbolBase })
    .select('id')
    .single();
  if (e2) throw e2;
  return created.id;
}

async function getOrCreatePlan(userId, planMonth) {
  const { data: existing, error: e1 } = await supabase
    .from('plans')
    .select('id,month,name')
    .eq('user_id', userId)
    .eq('month', planMonth)
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;
  if (existing?.id) return existing.id;

  // valores default (você depois ajusta na UI)
  const payload = {
    user_id: userId,
    name: `Plano ${planMonth}`,
    month: planMonth,
    objective_amount: 2000,
    minimum_amount: 1200,
    extra_amount: 3000,
    w1_pct: 35, w2_pct: 30, w3_pct: 20, w4_pct: 15,
    hit_rate_pct: 70,
    avg_gain_points: 5,
    loss_scenario1_pct: 60, loss_scenario1_points: 5,
    loss_scenario2_pct: 40, loss_scenario2_points: 8,
    ops_per_day: 3,
    trading_days_per_week: 5,
    risk_profile: 'moderado',
    margin_multiplier: 2.2,
    is_active: true
  };

  const { data: created, error: e2 } = await supabase
    .from('plans')
    .insert(payload)
    .select('id')
    .single();
  if (e2) throw e2;
  return created.id;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error('Uso: node .\\import_profit_csv.mjs <caminho_do_csv>');

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const userId = signInData.user.id;

  // ler arquivo (latin1)
  const buf = fs.readFileSync(filePath);
  const fileHash = sha256(buf);
  const content = buf.toString('latin1');

  const parsed = parseProfitCsv(content);
  const planMonth = monthStartISO(parsed.reportDate);
  const planId = await getOrCreatePlan(userId, planMonth);

  // registrar import (se já existe, não reimporta)
  const { data: existingImport, error: eFind } = await supabase
    .from('import_files')
    .select('id,file_hash')
    .eq('user_id', userId)
    .eq('file_hash', fileHash)
    .limit(1)
    .maybeSingle();

  if (eFind) throw eFind;
  if (existingImport?.id) {
    console.log('Arquivo já importado (mesmo hash). import_files.id =', existingImport.id);
    return;
  }

  const filename = filePath.split(/[\\/]/).pop();
  const { data: importRow, error: eIns } = await supabase
    .from('import_files')
    .insert({
      user_id: userId,
      plan_id: planId,
      filename,
      file_hash: fileHash,
      status: 'processed'
    })
    .select('id')
    .single();

  if (eIns) throw eIns;

  const sourceFileId = importRow.id;

  const trades = [];
  for (const r of parsed.rows) {
    const ativoRaw = r['Ativo'];
    const symbolBase = baseSymbolFromAtivo(ativoRaw);
    const assetId = await getOrCreateAssetId(symbolBase);

    const abertura = parseDateTimeBR(r['Abertura']);
    const lado = String(r['Lado']).trim().toUpperCase(); // C/V

    const qtdCompra = parseInt(String(r['Qtd Compra']).trim(), 10) || 0;
    const qtdVenda = parseInt(String(r['Qtd Venda']).trim(), 10) || 0;
    const qty = Math.max(qtdCompra, qtdVenda, 1);

    const entry = parseBrNumber(r['Preço Compra']);
    const exit = parseBrNumber(r['Preço Venda']);

    const resultBrl = parseBrNumber(r['Res. Operação']);
    const resultPts = parseBrNumber(r['Res. Operação (%)']);

    const hadPartial = String(r['Médio']).trim().toLowerCase() === 'sim';

    trades.push({
      user_id: userId,
      plan_id: planId,
      trade_date: isoDate(abertura),
      week_number: null, // trigger calcula
      asset_id: assetId,
      side: lado === 'C' ? 'buy' : 'sell',
      entry_price: entry,
      exit_price: exit,
      had_partial: hadPartial,
      was_stop: false,
      result_brl: resultBrl ?? 0,
      result_points: resultPts,
      contracts_qty: qty,
      account_type: 'real',
      method_tag: null,
      notes: `ativo_raw=${ativoRaw}; abertura=${r['Abertura']}; fechamento=${r['Fechamento']}; tempo=${r['Tempo Operação']}`,
      source: 'profit_csv',
      source_file_id: sourceFileId
    });
  }

  const { data: inserted, error: eTrades } = await supabase
    .from('trades')
    .insert(trades)
    .select('id, trade_date, week_number, result_brl');

  if (eTrades) throw eTrades;

  console.log('Import OK. import_files.id =', sourceFileId);
  console.log('Trades inseridos:', inserted.length);
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});