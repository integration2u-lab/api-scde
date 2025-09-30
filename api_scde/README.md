# API SCDE - Balanco Energetico

API em Node.js/Express com Prisma conectando ao Postgres (Supabase), capaz de importar planilhas (xlsx/csv) em base64, processa-las e realizar upsert em lote com controle de idempotencia.

## Requisitos

- Node.js 18+
- PostgreSQL acessivel via `DATABASE_URL`

## Configuracao

1. Instale as dependencias:
   ```bash
   npm install
   ```
2. Configure o arquivo `.env` com a variavel `DATABASE_URL` (e opcionalmente `PORT`, `LOG_LEVEL`, `MAX_IMPORT_PAYLOAD_BYTES`).
3. Gere o client Prisma e execute migracoes conforme necessario:
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

## Scripts uteis

- `npm run dev` ? inicia a API com `ts-node` e `nodemon`.
- `npm run build` ? compila TypeScript para `dist/`.
- `npm start` ? executa a versao compilada.
- `npm run prisma:pull` ? `prisma db pull && prisma generate`.
- `npm run prisma:migrate` ? executa `prisma migrate dev`.

## Endpoints principais

- `POST /api/v1/balanco/import` ? recebe JSON com planilha em base64 e executa importacao/upsert.
- `GET /api/v1/balanco/import/:batchId` ? retorna resumo de um lote de importacao.
- `GET /api/v1/balanco/mes/:yyyyMM` ? agrega dados por mes e lista registros paginados.
- `GET /health` ? verificacao basica de saude.

## Fluxo de importacao

1. Envie o JSON com `fileName`, `mimeType`, `base64`, `origin`, `overwriteStrategy` (opcional) e `idempotencyKey` (opcional).
2. A API decodifica o arquivo, detecta a aba relevante, normaliza cabecalhos e converte metricas (MWh -> kWh).
3. Cria um `importBatchId` e realiza upsert conforme a estrategia (`upsert` ou `insertOnly`).
4. Retorna os totais de linhas inseridas/atualizadas/puladas e erros encontrados.

## Observacoes

- O limite padrao de upload e 50 MB (configuravel via `MAX_IMPORT_PAYLOAD_BYTES`).
- Logs estruturados sao emitidos via `pino`, com `importBatchId` para correlacao.
- Idempotencia e garantida por `idempotencyKey`; se omitido, e gerado a partir do SHA256 do arquivo base64.

## Testes

Ainda nao ha testes automatizados incluidos; recomenda-se adicionar specs em `test/*.spec.ts` conforme novas regras de negocio forem implementadas.
