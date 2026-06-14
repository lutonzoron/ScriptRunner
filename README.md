# Script Runner

Plataforma interna para submissão, validação, aprovação e execução controlada de scripts T-SQL no SQL Server.

## Funcionalidades

- **3 papéis**: administrador, coordenador e usuário comum
- **Validação automática** em duas camadas (regras estáticas + SQL Server PARSEONLY/NOEXEC)
- **Aprovação manual** com checklist obrigatório
- **Execução fiel** ao script submetido (sem alterações)
- **Auditoria completa** de todas as ações
- **Connection strings criptografadas** — nunca exibidas na API

## Stack

| Camada | Tecnologia |
|--------|------------|
| API | Python 3.12 + FastAPI |
| Frontend | React 18 + TypeScript + Vite + Tailwind |
| Banco de metadados | MongoDB |
| Execução | SQL Server via pyodbc |

## Início rápido (desenvolvimento)

### Pré-requisitos

- Python 3.12+
- Node.js 20+
- MongoDB (local ou Docker)
- SQL Server (para validação camada 2 e execução)

### 1. Configurar ambiente

```bash
cp .env.example .env
# Edite .env com seus valores
```

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Acesse: http://localhost:5173

### 4. Login inicial

| Campo | Valor padrão |
|-------|--------------|
| E-mail | `admin@empresa.com` |
| Senha | `Admin@123` |

Altere `ADMIN_PASSWORD` no `.env` antes do primeiro deploy em produção.

## Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:8000/api/health

## Fluxo do sistema

1. Usuário submete T-SQL e seleciona a base de dados
2. Validação automática (estática + SQL Server)
3. Se reprovado → status `auto_rejected` com erros detalhados
4. Se aprovado → status `pending_approval`
5. Coordenador/Admin aprova com checklist
6. Script é executado automaticamente na base indicada
7. Resultado registrado na auditoria

## Papéis e permissões

| Recurso | Admin | Coordenador | Usuário |
|---------|-------|-------------|---------|
| Configurar servidores/bases | Sim | Não | Não |
| Cadastrar usuários | Todos os papéis | Só comum | Não |
| Submeter scripts | Sim | Sim | Sim |
| Aprovar scripts | Sim (inclusive próprio) | Sim (exceto próprio) | Não |
| Auditoria | Completa | Parcial | Próprias ações |

## Configuração de servidores SQL

Ao cadastrar um servidor, informe **duas connection strings**:

1. **Validação** — conta read-only para PARSEONLY/NOEXEC
2. **Execução** — conta com least-privilege (nunca `sa` ou sysadmin)

Exemplo:
```
Driver={ODBC Driver 17 for SQL Server};Server=meu-servidor;Database=master;UID=validador;PWD=***;Encrypt=yes;TrustServerCertificate=no
```

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `MONGO_URI` | URI de conexão MongoDB |
| `JWT_SECRET` | Segredo para tokens JWT |
| `ENCRYPTION_KEY` | Chave para criptografar connection strings (opcional em dev) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credenciais do admin inicial |
| `CORS_ORIGINS` | Origens permitidas (separadas por vírgula) |
| `COOKIE_SECURE` | `true` em produção com HTTPS |

## Segurança

- Validação automática é **pré-filtro**, não garantia absoluta
- Aprovador humano é o filtro final
- Re-validação no SQL Server imediatamente antes da execução
- Coordenador não pode aprovar o próprio script
- Rate limiting em login e submissões
- Tokens revogados ao desativar usuário ou trocar senha

## Estrutura do projeto

```
ScriptRunner/
├── backend/          # API FastAPI
├── frontend/         # React + Vite
├── docker-compose.yml
├── .env.example
└── README.md
```
