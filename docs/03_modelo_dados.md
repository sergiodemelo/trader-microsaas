6.1 Tabelas (V1)
1) profiles

Extensão do usuário autenticado (Supabase Auth).

id uuid (PK, FK -> auth.users.id)

full_name text (opcional)

created_at timestamptz default now()

Observação: auth.users já existe; aqui é só perfil.

2) plans

Configuração do plano mensal do trader (base do método).

id uuid PK default gen_random_uuid()

user_id uuid not null (FK -> auth.users.id)

name text not null (ex: “Plano Março/2026”)

month date not null (usar sempre o 1º dia do mês, ex: 2026-03-01)

Metas:

objective_amount numeric(14,2) not null

minimum_amount numeric(14,2) not null

extra_amount numeric(14,2) not null

Pesos semanais (%):

w1_pct numeric(5,2) not null default 35

w2_pct numeric(5,2) not null default 30

w3_pct numeric(5,2) not null default 20

w4_pct numeric(5,2) not null default 15

Parâmetros de cálculo (V1, para lotes/capital):

hit_rate_pct numeric(5,2) not null default 70

avg_gain_points numeric(10,2) not null default 5

loss_scenario1_pct numeric(5,2) not null default 60

loss_scenario1_points numeric(10,2) not null default 5

loss_scenario2_pct numeric(5,2) not null default 40

loss_scenario2_points numeric(10,2) not null default 8

ops_per_day int not null default 3

trading_days_per_week int not null default 5

Perfil/margem:

risk_profile text not null default 'moderado' -- ('agressivo','moderado','conservador','ultra')

margin_multiplier numeric(6,2) not null default 2.2

Controle:

is_active boolean not null default true

created_at timestamptz default now()

Restrições:

w1_pct + w2_pct + w3_pct + w4_pct = 100 (check)

minimum_amount <= objective_amount <= extra_amount (check)

3) assets

Cadastro de ativos (mini dólar, mini índice etc).

id uuid PK default gen_random_uuid()

symbol text not null (ex: “WDO”, “WIN”)

description text

point_value_brl numeric(14,4) (valor do ponto em R$ se aplicável)

created_at timestamptz default now()

Obs: no MVP você pode cadastrar manualmente poucos ativos.

4) trades

Diário de trade (baseado na planilha).

id uuid PK default gen_random_uuid()

user_id uuid not null (FK -> auth.users.id)

plan_id uuid not null (FK -> plans.id)

trade_date date not null

week_number int not null -- 1..4 (derivado do calendário do plano)

asset_id uuid (FK -> assets.id)

Execução:

side text not null -- ('buy','sell')

entry_price numeric(18,4)

exit_price numeric(18,4)

had_partial boolean not null default false

was_stop boolean not null default false

Resultado:

result_brl numeric(14,2) not null

result_points numeric(14,4)

Contexto:

contracts_qty int not null default 1

account_type text not null default 'real' -- ('simulador','real')

method_tag text -- ('indicador','fora_metodo') (ou livre)

notes text

Import:

source text not null default 'manual' -- ('manual','profit_csv')

source_file_id uuid (FK -> import_files.id) nullable

Auditoria:

created_at timestamptz default now()

Restrições:

week_number between 1 and 4

5) import_files

Controle de importação do CSV (para rastrear e permitir reprocessar).

id uuid PK default gen_random_uuid()

user_id uuid not null (FK -> auth.users.id)

plan_id uuid not null (FK -> plans.id)

filename text not null

file_hash text not null -- para evitar duplicidade

imported_at timestamptz default now()

status text not null default 'processed' -- ('processed','failed')

error_message text

6.2 Views (para dashboard sem “código” no início)
View: vw_weekly_summary

Agrupa trades por user_id + plan_id + week_number

Soma result_brl

Calcula % vs mínimo/objetivo/extra usando pesos do plans

View: vw_monthly_summary

Soma por plan_id

Calcula % vs mínimo/objetivo/extra

Essas views facilitam a UI.

6.3 RLS (Row Level Security) obrigatório

Política padrão para todas as tabelas com user_id:

SELECT/INSERT/UPDATE/DELETE: auth.uid() = user_id

Para plans: idem.
Para trades: idem.
Para import_files: idem.