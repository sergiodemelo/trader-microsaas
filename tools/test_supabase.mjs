import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Faltou SUPABASE_URL ou SUPABASE_ANON_KEY no arquivo .env (pasta tools).");
  process.exit(1);
}
if (!email || !password) {
  console.error("Faltou TEST_USER_EMAIL ou TEST_USER_PASSWORD no arquivo .env (pasta tools).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function monthStartISO(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return d.toISOString().slice(0, 10);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

async function ensureProfile(userId, fullName) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, full_name: fullName });

  if (error) throw error;
}

async function getOrCreatePlan(userId, planMonth) {
  // tenta achar plano do mês
  const { data: existing, error: findError } = await supabase
    .from('plans')
    .select('id, month, name')
    .eq('user_id', userId)
    .eq('month', planMonth)
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;
  if (existing?.id) return existing;

  // se não existir, cria
  const planPayload = {
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
    risk_profile: 'moderado',
    margin_multiplier: 2.2,
    is_active: true
  };

  const { data: created, error: createError } = await supabase
    .from('plans')
    .insert(planPayload)
    .select('id, month, name')
    .single();

  if (createError) throw createError;
  return created;
}

async function getAssetId(symbol) {
  const { data, error } = await supabase
    .from('assets')
    .select('id, symbol')
    .eq('symbol', symbol)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error(`Asset ${symbol} não encontrado. Verifique seed/policy em public.assets.`);
  }
  return data.id;
}

(async () => {
  // 1) Login
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (signInError) throw signInError;

  const userId = signInData.user.id;
  console.log("Logado. user_id =", userId);

  // 2) Profile
  await ensureProfile(userId, email);
  console.log("Profile ok");

  // 3) Plano (reutiliza se existir)
  const planMonth = monthStartISO(new Date());
  const plan = await getOrCreatePlan(userId, planMonth);
  console.log("Plano:", plan);

  const planId = plan.id;

  // 4) Asset
  const wdoId = await getAssetId('WDO');

  // 5) Trades
  const today = new Date();
  const trade1Date = new Date(today.getFullYear(), today.getMonth(), 3);  // semana 1
  const trade2Date = new Date(today.getFullYear(), today.getMonth(), 10); // semana 2

  const tradesPayload = [
    {
      user_id: userId,
      plan_id: planId,
      trade_date: isoDate(trade1Date),
      week_number: null,
      asset_id: wdoId,
      side: 'buy',
      entry_price: 5000,
      exit_price: 5005,
      had_partial: false,
      was_stop: false,
      result_brl: 250,
      result_points: 5,
      contracts_qty: 1,
      account_type: 'real',
      source: 'manual'
    },
    {
      user_id: userId,
      plan_id: planId,
      trade_date: isoDate(trade2Date),
      week_number: null,
      asset_id: wdoId,
      side: 'sell',
      entry_price: 5100,
      exit_price: 5097,
      had_partial: false,
      was_stop: false,
      result_brl: 150,
      result_points: 3,
      contracts_qty: 1,
      account_type: 'real',
      source: 'manual'
    }
  ];

  // Limpa trades anteriores deste plano (somente para teste local)
  const { error: delErr } = await supabase
    .from('trades')
    .delete()
    .eq('plan_id', planId);

  if (delErr) throw delErr;

  const { data: tradesInserted, error: tradesError } = await supabase
    .from('trades')
    .insert(tradesPayload)
    .select('id, trade_date, week_number, result_brl');

  if (tradesError) throw tradesError;
  console.log("Trades inseridos:", tradesInserted);

  // 6) Views
  const { data: weekly, error: weeklyError } = await supabase
    .from('vw_weekly_summary')
    .select('*')
    .eq('plan_id', planId)
    .order('week_number', { ascending: true });

  if (weeklyError) throw weeklyError;
  console.log("Weekly summary:", weekly);

  const { data: monthly, error: monthlyError } = await supabase
    .from('vw_monthly_summary')
    .select('*')
    .eq('plan_id', planId)
    .maybeSingle();

  if (monthlyError) throw monthlyError;
  console.log("Monthly summary:", monthly);

  console.log("OK: RLS + inserts + views funcionando.");
})().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});