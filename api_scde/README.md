# API SCDE - Importador

API em Node.js/Express que importa planilhas (xlsx/csv) em base64, processa duas abas principais (`jul25` e `SCDE`) e persiste os dados em tr�s tabelas: `ImportBatch`, `EnergyBalance` e `Scde`.

## Requisitos

- Node.js 18+
- PostgreSQL acess�vel via `DATABASE_URL`

## Configura��o

1. Instale as depend�ncias:
   ```bash
   npm install
   ```
2. Crie `api_scde/.env` com as vari�veis:
   ```env
   DATABASE_URL="postgresql://usuario:senha@host:5432/base?schema=public"
   PORT=3000
   LOG_LEVEL=info
   MAX_IMPORT_PAYLOAD_BYTES=52428800
   TRUST_PROXY="loopback"
   ```
3. Gere o client Prisma (pare o `npm run dev` antes de rodar o comando):
   ```bash
   npx prisma generate
   ```
   Ajuste o schema/tabelas no banco conforme necess�rio (as defini��es est�o em `prisma/schema.prisma`).

## Estrutura de Dados

- **ImportBatch**: metadados do lote (arquivo, estrat�gia, contagem de inser��es/atualiza��es por tabela, erros e timestamps).
- **EnergyBalance**: linhas importadas da aba `jul25` com colunas `clients`, `price`, `reference_date`, `consumption`, `to_bill`, entre outras.
- **Scde**: linhas importadas da aba `SCDE` com colunas `agent`, `group_point`, `reference_month`, `active_c_kwh`, `quality`, `source`.

## Fluxo do POST `/api/v1/balanco/import`

1. Envie JSON com `fileName`, `mimeType`, `base64`, `origin`, `overwriteStrategy` (`upsert` ou `insertOnly`) e `idempotencyKey` opcional.
2. A API valida o payload, decodifica o arquivo, localiza as abas `jul25` (ou padr�o `mmmYY`) e `SCDE`.
3. Cada aba � normalizada: datas s�o convertidas, valores num�ricos transformados em `Decimal`, JSON de encargos parseado quando poss�vel.
4. Os dados s�o upsertados respeitando a estrat�gia escolhida. Contagens s�o armazenadas em `ImportBatch` e o response retorna o resumo.

### Exemplo de chamada

```bash
curl -X POST http://localhost:3000/api/v1/balanco/import \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "balanco-jul-25.xlsx",
    "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "origin": "scde",
    "overwriteStrategy": "upsert",
    "base64": "<BASE64_DO_ARQUIVO>",
    "idempotencyKey": "balanco-jul-2025"
  }'
```

A resposta 201 inclui `counts.energyBalance` e `counts.scde`, al�m dos erros normalizados por aba/linha.

## Demais Endpoints

- `GET /api/v1/balanco/import/:batchId` � resumo do lote (mesma estrutura do retorno do POST).
- `GET /api/v1/balanco/mes/:yyyyMM` � pagina a tabela `EnergyBalance` para o m�s informado e agrega `consumption` e `toBill`.
- `GET /health` � verifica��o b�sica.

## Observa��es

- Limite padr�o de upload: 50 MB (`MAX_IMPORT_PAYLOAD_BYTES`).
- Defina `TRUST_PROXY` apenas quando houver proxy reverso confi�vel.
- Ao reformular o banco, lembre-se de limpar as tabelas (`TRUNCATE ... CASCADE`) se precisar reiniciar os dados.

## Testes

Ainda n�o h� testes automatizados. Adicione specs em `test/*.spec.ts` conforme a API evoluir.
