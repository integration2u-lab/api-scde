# API Reference

DocumentaÃ§Ã£o das rotas expostas pelo serviÃ§o `api_scde_05.10`. Todas as URLs abaixo assumem como base `http://<host>:<port>` (por padrÃ£o `PORT=4000`, conforme `.env`). As respostas seguem o padrÃ£o JSON; erros retornam payload `{"message": "..."}.

## Rotas de SaÃºde

### `GET /health`
Retorna status de disponibilidade da API.

**Resposta 200**
```json
{ "status": "ok" }
```

## Contratos (`/contracts`)

### `POST /contracts`
Cria um contrato.

**Corpo JSON**
| Campo | Tipo | ObrigatÃ³rio | ObservaÃ§Ãµes |
| --- | --- | --- | --- |
| `client_name` | string | âœ” | Nome do cliente. |
| `groupName` | string | âœ” | Grupo (meter) associado. |
| `start_date` | string (ISO) | âœ” | Data de inÃ­cio. |
| `end_date` | string (ISO) | âœ” | Data de tÃ©rmino. |
| `email` | string | âœ– | E-mail de contato. |
| `contracted_volume_mwh` | string/number | âœ– | Volume contratado. |
| `status`, `energy_source`, `contracted_modality`, `billing_cycle`, `cnpj`, `segment`, `supplier`, `contact_responsible`, `proinfa_contribution`, `average_price_mwh`, `price`, `reajuted_price`, `spot_price_ref_mwh`, `upper_limit_percent`, `lower_limit_percent`, `flexibility_percent`, `compliance_*`, `created_at`, `updated_at` | diversos | âœ– | Campos adicionais aceitos pelo schema Zod. Strings numÃ©ricas podem usar vÃ­rgula ou ponto. |

**Resposta 201**
Contrato criado (inclui `id`, `created_at`, `updated_at`, `minDemand`, `maxDemand` calculados).

### `GET /contracts`
Lista todos os contratos ordenados por `id` ascendente.

**Resposta 200**
Array de contratos.

### `GET /contracts/:id`
Recupera um contrato especÃ­fico.

**ParÃ¢metros**
| Nome | Tipo | ObrigatÃ³rio |
| --- | --- | --- |
| `id` | inteiro (path) | âœ” |

**Resposta 200**
Contrato encontrado ou `404` se inexistente.

### `PUT /contracts/:id`
Atualiza campos de um contrato. Aceita qualquer subconjunto dos campos do `POST`. Zod valida os tipos; strings numÃ©ricas sÃ£o normalizadas. Se nenhum campo vÃ¡lido for enviado, retorna `400`.

### `DELETE /contracts/:id`
Remove o contrato. Retorna `204` em caso de sucesso, `404` se jÃ¡ inexistente.

## BalanÃ§o EnergÃ©tico (`/energy-balance`)

Todas as operaÃ§Ãµes passam pelo `updateEnergyBalance`, que enriquece os dados com o contrato correspondente (com base em `meter` e/ou `clientId`).

### `GET /energy-balance`
  Lista registros ordenados por `id` desc. Os itens agora retornam tambÃ©m os campos calculados `loss`, `requirement`, `net`, `billable`, `minDemand`, `maxDemand` e `cpCode`, sempre como string ou `null`.

### `GET /energy-balance/:id`
Retorna um registro pelo identificador. `404` se nÃ£o encontrado.

### `POST /energy-balance`
Cria/atualiza um registro com base no `meter`. Caso o `meter` jÃ¡ exista, os valores serÃ£o atualizados.

**Corpo JSON mÃ­nimo**
| Campo | Tipo | ObrigatÃ³rio | ObservaÃ§Ãµes |
| --- | --- | --- | --- |
| `meter` | string | âœ” | Deve corresponder ao `groupName` de contrato para enriquecimento. |
| `clientName` | string | âœ” |
| `referenceBase` | string (ISO) | âœ” |
| `ativaCKwh` | string/number | âœ” | Consumo ativo (kWh). |
| `clientId` | string (UUID) | âœ” | No `POST` padrÃ£o o router gera automaticamente um UUID se inexistente. |
| `price`, `supplier`, `email`, `statusMeasurement`, `proinfaContribution`, `contract`, `adjusted`, `contactActive`, `contractId`, `sentOk`, `sendDate`, `billsDate`, `createdAt`, `updatedAt` | diversos | âœ– | Campos opcionais. `statusMeasurement` replica o valor recebido do SCDE quando presente. `sentOk` aceita booleano ou valores equivalentes (`"1"`, `"true"`, etc.). |
| `loss`, `requirement`, `net`, `billable`, `minDemand`, `maxDemand`, `cpCode` | string/null | nao | Campos derivados recalculados pelo backend e devolvidos em todas as respostas do CRUD. Valores enviados no corpo sao ignorados.

### `PUT /energy-balance/:id`
Atualiza o registro preservando o `meter`. O corpo aceita as mesmas chaves do `POST`; o router faz _merge_ dos valores existentes e aplica parsing de booleanos/data.

### `DELETE /energy-balance/:id`
Remove o registro. Retorna `204` ou `404` se ausente.

## MÃ©tricas e AnÃ¡lises

### `GET /api/contacts/active-count`
Retorna contagem de contratos por status (â€œAtivoâ€, â€œInativoâ€, demais) e diferenÃ§a percentual entre ativos e inativos.

### `GET /api/contratos/oportunidades`
Lista oportunidades de contrato com base no consumo/limites.

**Query Params**
| Nome | Tipo | PadrÃ£o | ObservaÃ§Ãµes |
| --- | --- | --- | --- |
| `mes` | string (`YYYY-MM`) | mÃªs atual | PerÃ­odo de referÃªncia. |
| `flex` | nÃºmero (0â€“0.5) | `0.06` | Percentual de tolerÃ¢ncia. |
| `n` | inteiro (1â€“50) | `5` | Quantidade de itens a retornar. |
| `deltaPct` | boolean | `false` | Indica se a resposta deve apresentar delta em % calculado sob medida. |

### `GET /api/contratos/fechamento-potencial`
Calcula potenciais contratos prÃ³ximos do fechamento.

**Query Params**
| Nome | Tipo | PadrÃ£o | ObservaÃ§Ãµes |
| --- | --- | --- | --- |
| `mes` | string (`YYYY-MM`) | mÃªs atual |
| `limit` | inteiro (1â€“20) | `5` |
| `statusAberto` | lista de strings | `["Em negociaÃ§Ã£o","Em negociacao","Proposta enviada","Aguardando assinatura"]` | Pode ser enviado como `statusAberto=valor1,valor2`. |

### `GET /api/contratos/top-volume`
Retorna os 10 contratos com maior volume contratado.

### `GET /api/conformidade-resumo`
Resumo da conformidade de consumo por cliente.

**Query Params**
| Nome | Tipo | PadrÃ£o |
| --- | --- | --- |
| `mes` | string (`YYYY-MM`) | mÃªs atual |
| `flex` | nÃºmero (0â€“0.5) | `0.1` |

**Resposta 200**
```json
{
  "compliance": {
    "total": 42,
    "details": {
      "conforme": 30,
      "excedente": 5,
      "subutilizado": 4,
      "indefinido": 3
    }
  }
}
```

### `GET /api/conformidade-detalhes`
Retorna a lista completa usada no cÃ¡lculo da conformidade (mesmos parÃ¢metros do resumo).

## ImportaÃ§Ã£o de Dados

### `POST /api/upload-base64`
Processa um arquivo CSV (codificado em base64) contendo registros SCDE/energia.

**Corpo JSON**
```json
{ "data": "<CSV em base64>" }
```

**Resposta 200**
Retorna logs por linha indicando sucesso ou motivos de rejeiÃ§Ã£o para SCDE e energy balance.

### `POST /api/scde`
Recebe um array ou objeto com registros SCDE em JSON (mesmo layout do CSV) e executa o mesmo pipeline de importaÃ§Ã£o/atualizaÃ§Ã£o.

**Corpo**
- Array de objetos SCDE, ou
- Objeto `{ records: [...] }`, ou
- Objeto Ãºnico representando um registro.

**Resposta 200**
Retorna os logs de processamento (`scde` e `energyBalance`), informando sucesso ou erros por registro.

## ConvenÃ§Ãµes e ConsideraÃ§Ãµes

- Todos os endpoints aceitam e retornam JSON.
- Datas devem ser fornecidas em formato ISO (`YYYY-MM-DD` ou `YYYY-MM-DDTHH:mm:ss.sssZ`). A maioria dos campos Ã© normalizada no backend (ex.: nÃºmeros em string com vÃ­rgula).
- Identificadores BigInt sÃ£o convertidos para string ao serializar (`toJSON` customizado para `BigInt`). Ajuste o cliente para tratar IDs como string. 
- Em caso de erro nÃ£o tratado especificamente, a API responde com `500` e `{"message": "..."}`.
