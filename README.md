# BankFlow

API REST bancária construída com NestJS para criação de contas e processamento de transferências entre elas, com suporte a agendamento e autorização externa.

## Sobre o projeto

O BankFlow foi desenvolvido como um sistema financeiro simples com foco em consistência transacional e confiabilidade no processamento de transferências. A aplicação expõe endpoints para cadastro de contas e movimentação de fundos, processa transferências agendadas diariamente via cron job e consulta um serviço externo de autorização antes de efetivar qualquer débito.

O stack utilizado é NestJS + TypeORM + MySQL, com toda a infraestrutura orquestrada via Docker Compose.

---

## Como rodar

**Pré-requisito:** Docker e Docker Compose instalados.

```bash
# Clone o repositório
git clone <url-do-repositorio>
cd bankflow

# Configure as variáveis de ambiente
cp .env.example .env

# Suba a aplicação
docker compose up --build
```

A API estará disponível em `http://localhost:4001/api`.

O banco de dados sobe automaticamente e as migrations são aplicadas na inicialização. O app só inicia depois que o MySQL estiver saudável.

### Rodar os testes

```bash
npm install
npm run test
```

---

## Endpoints

### Contas

`POST /api/accounts` — cria uma conta com saldo inicial zerado.
```json
{ "name": "Alice" }
```

`GET /api/accounts` — lista todas as contas.

### Transferências

`POST /api/transfers` — cria uma transferência imediata ou agendada.
```json
{
  "sender_id": 1,
  "receiver_id": 2,
  "amount": 150.00,
  "scheduled_at": "2026-05-01"
}
```
`scheduled_at` é opcional. Se omitido, a transferência é processada imediatamente.

`GET /api/transfers` — lista todas as transferências.

---

## Decisões técnicas — módulo de transferências

### Autorização externa
Antes de qualquer movimentação no banco, o serviço consulta um autorizador externo. Se o autorizador negar (`authorized: false`), a transferência é marcada como `UNAUTHORIZED` e nenhuma transação é aberta. Em caso de indisponibilidade do serviço externo, o sistema faz fallback com `{ success: true, authorized: true }` conforme especificado nos requisitos.

### Transação atômica com QueryRunner
O débito da conta remetente, o crédito da conta destinatária e a atualização do status da transferência acontecem dentro de uma única transação explícita via `QueryRunner` do TypeORM. Ou tudo é commitado junto ou tudo é revertido — nunca um estado parcial.

### Pessimistic locking com ordenação de IDs
As contas são bloqueadas com `pessimistic_write` antes de qualquer leitura de saldo. Para evitar deadlock em transferências simultâneas entre as mesmas contas, o lock é sempre adquirido na ordem do menor ID para o maior, independentemente de quem é remetente ou destinatário.

### Idempotência
A API aceita uma `idempotency_key` opcional. Requisições repetidas com a mesma chave retornam a transferência original sem criar duplicata — útil para retries de cliente em caso de falha de rede.

### Guard de duplo processamento
`processTransfer` verifica se o status é `PENDING` antes de qualquer ação. Se não for, retorna imediatamente sem efeito colateral — protege contra chamadas concorrentes do cron ou retries internos.

### Transferências agendadas com `Promise.allSettled`
O cron job que roda diariamente às `05:00` processa todas as transferências agendadas para o dia com `Promise.allSettled`. A falha de uma transferência não interrompe as demais.

### Status possíveis de uma transferência

```
PENDING → PROCESSING → COMPLETED
                     → FAILED        (saldo insuficiente ou erro de banco)
                     → UNAUTHORIZED  (autorizador negou)
```

---

## Variáveis de ambiente

Copie `.env.example` e preencha conforme necessário.

| Variável | Descrição |
|---|---|
| `DB_HOST` | Host do MySQL |
| `DB_PORT` | Porta do MySQL |
| `DB_USER` | Usuário do banco |
| `DB_PASS` | Senha do banco |
| `DB_NAME` | Nome do banco |
| `AUTHORIZER_URL` | URL do serviço autorizador externo |
| `EMAIL_BASE64` | Email usado como Bearer token no autorizador |
| `APP_PORT` | Porta da aplicação (padrão: 4001) |