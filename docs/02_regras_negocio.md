1. Estrutura de Meta Mensal

O usuário define:

objetivo_mensal

meta_minima

meta_extraordinaria

percentual_semana_1

percentual_semana_2

percentual_semana_3

percentual_semana_4

Regra:

Soma dos percentuais deve ser 100%.

Cálculo:

meta_semana_n = objetivo_mensal * percentual_semana_n
meta_minima_semana_n = meta_minima * percentual_semana_n
meta_extra_semana_n = meta_extraordinaria * percentual_semana_n


2. Lógica de Alavancagem Semanal

Semana 1 → 100% contratos
Semana 2 → 80%
Semana 3 → 50%
Semana 4 → 30% ou pausa

Regra:

Se resultado_acumulado >= objetivo_mensal * 0.9
→ Redução automática de contratos.



3. Estrutura de Operações (Trade)

Cada operação deve conter:

data

ativo

tipo (compra/venda)

entrada

saida

parcial (bool)

stop (bool)

resultado_reais

resultado_pontos

quantidade_contratos

simulador_ou_real

observacao_tecnica



4. Consolidação Semanal

Para cada semana:

resultado_semana = soma(resultado_reais)
percentual_objetivo = resultado_semana / meta_semana
percentual_minimo = resultado_semana / meta_minima_semana
percentual_extra = resultado_semana / meta_extra_semana



5. Consolidação Mensal
resultado_mensal = soma(resultado_reais_mes)

Indicadores:

% sobre objetivo

% sobre mínimo

% sobre extraordinário



6. Importação CSV (Profit)

O sistema deve:

Aceitar upload de CSV

Mapear colunas automaticamente

Normalizar dados

Converter pontos para reais (se necessário)

Inserir na tabela trades



7. Regras Comportamentais

Se semana_4 e resultado_mensal >= meta_minima
→ Alertar: "Reduzir exposição"

Se semana_4 e resultado_mensal < meta_minima
→ Alertar: "Encerrar mês e preservar capital"