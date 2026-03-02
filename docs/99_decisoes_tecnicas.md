## Normalização de Ativos

Decisão: remover campo `symbol` da tabela trades.

Motivo:
- Evitar redundância
- Garantir integridade via FK asset_id
- Preparar arquitetura para multiusuário e múltiplos ativos por usuário

Dashboard ajustado para não depender de symbol direto.