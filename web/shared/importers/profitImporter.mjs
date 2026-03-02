// shared/importers/profitImporter.mjs
import crypto from "node:crypto";

export function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function parseBrNumber(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t || t === "-" || t === " - " || t === " -") return null;
  return Number(t.replace(/\./g, "").replace(",", "."));
}

export function parseDateTimeBR(s) {
  const m = String(s).match(
    /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/
  );
  if (!m) throw new Error(`Data/hora inválida: ${s}`);
  const [, d, mo, y, hh, mm, ss] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss));
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function monthStartISO(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), 1);
  return isoDate(m);
}

export function baseSymbolFromAtivo(ativoRaw) {
  const m = String(ativoRaw).trim().match(/^([A-Z]+)\w*$/);
  if (!m) return String(ativoRaw).trim();
  const letters = m[1];
  if (letters.startsWith("WDO")) return "WDO";
  if (letters.startsWith("WIN")) return "WIN";
  return letters;
}

export function parseProfitCsv(content) {
  const lines = content.split(/\r?\n/).filter((l) => l !== undefined);
  const headerIdx = lines.findIndex((l) => l.startsWith("Ativo;"));
  if (headerIdx === -1) throw new Error('Cabeçalho "Ativo;" não encontrado no CSV.');

  const reportDateLine = lines.find((l) => l.startsWith("Data:"));
  if (!reportDateLine) throw new Error('Linha "Data:" não encontrada no CSV.');
  const reportDateStr = reportDateLine.replace("Data:", "").trim(); // dd/mm/yyyy
  const [dd, mm, yyyy] = reportDateStr.split("/").map(Number);
  const reportDate = new Date(yyyy, mm - 1, dd);

  const headers = lines[headerIdx].split(";").map((h) => h.trim());
  const rows = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = String(lines[i] ?? "").trim();
    if (!line) continue;
    const parts = line.split(";");
    if (parts.length !== headers.length) continue;

    const obj = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = parts[c];
    rows.push(obj);
  }

  return { reportDate, headers, rows };
}

/**
 * Monta payloads de trades (sem falar com Supabase).
 * assetIdResolver: função async que recebe symbolBase e retorna asset_id (pode criar se não existir).
 */
export async function buildTradesFromProfit(params) {
  const {
    userId,
    planId,
    sourceFileId,
    parsed,
    assetIdResolver,
  } = params;

  const trades = [];
  for (const r of parsed.rows) {
    const ativoRaw = r["Ativo"];
    const symbolBase = baseSymbolFromAtivo(ativoRaw);
    const assetId = await assetIdResolver(symbolBase);

    const abertura = parseDateTimeBR(r["Abertura"]);
    const lado = String(r["Lado"]).trim().toUpperCase(); // C/V

    const qtdCompra = parseInt(String(r["Qtd Compra"]).trim(), 10) || 0;
    const qtdVenda = parseInt(String(r["Qtd Venda"]).trim(), 10) || 0;
    const qty = Math.max(qtdCompra, qtdVenda, 1);

    const entry = parseBrNumber(r["Preço Compra"]);
    const exit = parseBrNumber(r["Preço Venda"]);

    const resultBrl = parseBrNumber(r["Res. Operação"]);
    const resultPts = parseBrNumber(r["Res. Operação (%)"]);

    const hadPartial = String(r["Médio"]).trim().toLowerCase() === "sim";

    trades.push({
      user_id: userId,
      plan_id: planId,
      trade_date: isoDate(abertura),
      week_number: null, // trigger calcula
      asset_id: assetId,
      side: lado === "C" ? "buy" : "sell",
      entry_price: entry,
      exit_price: exit,
      had_partial: hadPartial,
      was_stop: false,
      result_brl: resultBrl ?? 0,
      result_points: resultPts,
      contracts_qty: qty,
      account_type: "real",
      method_tag: null,
      notes: `ativo_raw=${ativoRaw}; abertura=${r["Abertura"]}; fechamento=${r["Fechamento"]}; tempo=${r["Tempo Operação"]}`,
      source: "profit_csv",
      source_file_id: sourceFileId,
    });
  }

  return trades;
}