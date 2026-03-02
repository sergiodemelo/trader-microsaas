import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// shared importer (reexport TS -> shared mjs)
import {
  sha256,
  parseProfitCsv,
  buildTradesFromProfit,
  monthStartISO,
  // ✅ usados no preview
  baseSymbolFromAtivo,
  parseDateTimeBR,
  parseBrNumber,
  isoDate,
} from "@/lib/importers/profitImporter";

export const runtime = "nodejs"; // necessário por causa de crypto/buffer

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Cria client Supabase com ANON key e repassa o JWT do usuário (RLS).
 * Espera que o frontend envie Authorization: Bearer <access_token>
 */
function supabaseFromAuthHeader(req: Request) {
  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const accessToken = m[1].trim();

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  return { supabase, accessToken };
}

async function getUserIdFromToken(
  supabase: any,
  accessToken: string
): Promise<string> {
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) throw error;
  if (!data?.user?.id) throw new Error("Unauthorized");
  return data.user.id;
}

async function getOrCreateAssetId(supabase: any, symbolBase: string) {
  const { data: existing, error: e1 } = await supabase
    .from("assets")
    .select("id,symbol")
    .eq("symbol", symbolBase)
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;
  if (existing?.id) return existing.id;

  const { data: created, error: e2 } = await supabase
    .from("assets")
    .insert({ symbol: symbolBase, description: symbolBase })
    .select("id")
    .single();
  if (e2) throw e2;
  return created.id;
}

async function getOrCreatePlan(supabase: any, userId: string, planMonth: string) {
  const { data: existing, error: e1 } = await supabase
    .from("plans")
    .select("id,month,name")
    .eq("user_id", userId)
    .eq("month", planMonth)
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;
  if (existing?.id) return existing.id;

  // defaults (igual CLI)
  const payload = {
    user_id: userId,
    name: `Plano ${planMonth}`,
    month: planMonth,
    objective_amount: 2000,
    minimum_amount: 1200,
    extra_amount: 3000,
    w1_pct: 35,
    w2_pct: 30,
    w3_pct: 20,
    w4_pct: 15,
    hit_rate_pct: 70,
    avg_gain_points: 5,
    loss_scenario1_pct: 60,
    loss_scenario1_points: 5,
    loss_scenario2_pct: 40,
    loss_scenario2_points: 8,
    ops_per_day: 3,
    trading_days_per_week: 5,
    risk_profile: "moderado",
    margin_multiplier: 2.2,
    is_active: true,
  };

  const { data: created, error: e2 } = await supabase
    .from("plans")
    .insert(payload)
    .select("id")
    .single();
  if (e2) throw e2;
  return created.id;
}

async function ensureNotImportedYet(supabase: any, userId: string, fileHash: string) {
  const { data: existing, error } = await supabase
    .from("import_files")
    .select("id,file_hash")
    .eq("user_id", userId)
    .eq("file_hash", fileHash)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return existing?.id ?? null;
}

async function createImportFileRow(
  supabase: any,
  params: {
    userId: string;
    planId: string;
    filename: string;
    fileHash: string;
  }
) {
  const { data, error } = await supabase
    .from("import_files")
    .insert({
      user_id: params.userId,
      plan_id: params.planId,
      filename: params.filename,
      file_hash: params.fileHash,
      status: "processed",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function POST(req: Request) {
  try {
    const ctx = supabaseFromAuthHeader(req);
    if (!ctx) {
      return NextResponse.json(
        { ok: false, error: "Missing Authorization Bearer token" },
        { status: 401 }
      );
    }

    const { supabase, accessToken } = ctx;
    const userId = await getUserIdFromToken(supabase, accessToken);

    const form = await req.formData();
    const file = form.get("file");
    const mode = (form.get("mode")?.toString() || "import").toLowerCase(); // ✅ preview | import

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'Expected multipart/form-data with field "file"' },
        { status: 400 }
      );
    }

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);

    const fileHash = sha256(buf);

    // Profit CSV costuma vir latin1; fazemos decode latin1
    const csvText = buf.toString("latin1");
    const parsed = parseProfitCsv(csvText);

    // ✅ PREVIEW: não grava nada no banco e NÃO aplica dedupe (dedupe é do import)
    if (mode === "preview") {
      const previewRows = parsed.rows.slice(0, 10).map((r: any) => {
        const ativoRaw = r["Ativo"];
        const symbolBase = baseSymbolFromAtivo(ativoRaw);

        const abertura = parseDateTimeBR(r["Abertura"]);
        const lado = String(r["Lado"]).trim().toUpperCase(); // C/V

        const qtdCompra = parseInt(String(r["Qtd Compra"]).trim(), 10) || 0;
        const qtdVenda = parseInt(String(r["Qtd Venda"]).trim(), 10) || 0;
        const qty = Math.max(qtdCompra, qtdVenda, 1);

        const entry = parseBrNumber(r["Preço Compra"]);
        const exit = parseBrNumber(r["Preço Venda"]);
        const resultBrl = parseBrNumber(r["Res. Operação"]) ?? 0;

        return {
          trade_date: isoDate(abertura),
          asset: symbolBase,
          side: lado === "C" ? "buy" : "sell",
          qty,
          entry_price: entry,
          exit_price: exit,
          result_brl: resultBrl,
        };
      });

      return NextResponse.json({
        ok: true,
        mode: "preview",
        filename: file.name || "profit.csv",
        file_hash: fileHash,
        report_date: parsed.reportDate.toISOString().slice(0, 10),
        total_rows: parsed.rows.length,
        preview: previewRows,
      });
    }

    // ✅ IMPORT: aplica dedupe e grava no banco
    const existingImportId = await ensureNotImportedYet(supabase, userId, fileHash);
    if (existingImportId) {
      return NextResponse.json({
        ok: true,
        status: "duplicate",
        import_file_id: existingImportId,
      });
    }

    const planMonth = monthStartISO(parsed.reportDate);
    const planId = await getOrCreatePlan(supabase, userId, planMonth);

    const sourceFileId = await createImportFileRow(supabase, {
      userId,
      planId,
      filename: file.name || "profit.csv",
      fileHash,
    });

    async function assetIdResolver(symbolBase: string) {
      return await getOrCreateAssetId(supabase, symbolBase);
    }

    const tradesPayload = await buildTradesFromProfit({
      userId,
      planId,
      sourceFileId,
      parsed,
      assetIdResolver,
    });

    const { data: inserted, error } = await supabase
      .from("trades")
      .insert(tradesPayload)
      .select("id, trade_date, week_number, result_brl");

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      status: "imported",
      import_file_id: sourceFileId,
      trades_inserted: inserted?.length ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}