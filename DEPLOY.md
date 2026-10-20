# Implantação — Contratos Jurídicos

Passo a passo para colocar e manter o sistema no ar num servidor Linux com
Docker, dentro da rede corporativa.

O que roda no servidor (`docker-compose.yml`), todos com a mesma imagem:

| Serviço | O que faz |
|---|---|
| `migrate` | aplica as migrações do banco e termina; os outros só sobem depois dele |
| `app` | o sistema (Next.js), na porta `APP_PORTA` deste host |
| `worker` | e-mails de alerta (todo dia às 07:00) e limpeza semanal de arquivos órfãos |

O que **não** está no compose:

- **Banco:** o PostgreSQL corporativo.
- **Proxy reverso:** o proxy que já atende a rede interna encaminha para `APP_PORTA`.
- **Backup:** do banco cuida o DBA; da pasta de documentos, a ferramenta da TI.

---

## 1. Pré-requisitos

- Linux com Docker Engine 24+ e o plugin `docker compose` (v2).
- Este host precisa alcançar:
  - o PostgreSQL (`POSTGRES_HOST:POSTGRES_PORT`); pedir a regra de firewall à TI;
  - os Apps Princesa (`APPS_PRINCESA_URL`);
  - o SMTP (`smtp.office365.com:587`);
  - na hora do build, o registro do npm (`registry.npmjs.org`) e um registro de imagens (ver 1.1).
- **Banco** criado pelo DBA (PostgreSQL 14 ou superior):
  - com um usuário dono dele (o mesmo das variáveis `POSTGRES_*`);
  - a primeira migração cria as extensões `unaccent` e `pg_trgm`. Ambas são
    "trusted" a partir do PostgreSQL 13, então basta o usuário ser dono do banco;
  - se a política do DBA não permitir, ele cria as duas antes:
    `CREATE EXTENSION unaccent; CREATE EXTENSION pg_trgm;`.

### 1.1 Docker Hub e o certificado corporativo

O firewall da rede inspeciona o TLS do Docker Hub e de outros registros de
imagens: o certificado apresentado é o da própria empresa, `EXPRESSO PRINCESA
DOS CAMPOS SA`. Sem tratar isso, o build para em
`x509: certificate signed by unknown authority` ao baixar `node:24-alpine`.

Escolha uma das três saídas:

1. **O Docker do servidor confia na CA corporativa (recomendado).** Salve o
   certificado raiz da empresa (`.crt`, PEM) e execute:
   ```sh
   sudo cp ca-princesa.crt /usr/local/share/ca-certificates/
   sudo update-ca-certificates
   sudo systemctl restart docker
   ```
2. **A TI libera da inspeção** os domínios do Docker Hub (`registry-1.docker.io`,
   `auth.docker.io`, `production.cloudfront.docker.com`).
3. **Imagem base num registro já liberado.** O `ghcr.io` não é inspecionado.
   Copie `node:24-alpine` para o registro da organização (por exemplo, num job
   do GitHub Actions) e defina no `.env`:
   `NODE_IMAGE=ghcr.io/princesa-dos-campos/node:24-alpine`.

O `npm ci` dentro do build usa `registry.npmjs.org`, que hoje não é inspecionado.

---

## 2. Primeira instalação

```sh
git clone <repositório> /opt/contratos-juridicos
cd /opt/contratos-juridicos

cp .env.example .env
chmod 600 .env          # tem senhas: só o dono lê
nano .env               # preencha (ver 2.1)

# Pasta dos documentos: o container roda como o usuário 1001
sudo mkdir -p dados/arquivos
sudo chown -R 1001:1001 dados/arquivos

docker compose up -d --build
docker compose ps              # migrate "exited (0)", app "healthy", worker "running"
docker compose logs migrate    # "migrações em dia: N aplicadas (N novas)"
curl -s http://127.0.0.1:3400/api/health   # {"ok":true}
```

Se a pasta de documentos estiver com o dono errado, `app` e `worker` não sobem.
O log mostra: `ARMAZENAMENTO_DIR sem permissão de escrita … o dono da pasta
montada deve ser o uid 1001`.

### 2.1 `.env` de produção

| Variável | Valor |
|---|---|
| `APPS_PRINCESA_URL`, `APPS_INTERNAL_KEY`, `APP_ID` | cadastro central de usuários |
| `SESSION_SECRET` | **novo, só deste ambiente**, com 32+ caracteres: `openssl rand -base64 48` |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DATABASE`, `POSTGRES_USERNAME`, `POSTGRES_PASSWORD` | o banco de produção |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | conta de envio (Office 365) |
| `SMTP_FROM` | opcional; só se a conta tiver "Enviar como" nesse endereço |
| `APP_URL` | **obrigatório na prática**: o endereço que as pessoas usam, por exemplo `http://contratos.intranet`. Sem ele, os links dos e-mails apontam para `localhost` |
| `APP_PORTA` | porta deste host para o proxy reverso (padrão `3400`) |
| `ARQUIVOS_DIR` | pasta dos documentos no host (padrão `./dados/arquivos`) |
| `UPLOAD_MAX_MB` | tamanho máximo de documento (padrão `25`); mudar exige `--build` |
| `PROTHEUS_CONTRACTS_TOKEN` | token da API de contratos do Protheus. Sem ele, a tela Contratos Protheus mostra "integração não configurada" |
| `PROTHEUS_CONTRACTS_URL` | opcional; o padrão é `https://api.princesadoscampos.com.br/api/protheus/contracts` |
| `PROTHEUS_CRON` | opcional; horário da sincronização diária com o Protheus (padrão `0 9 * * *`, horário de Brasília) |

Não defina `ARMAZENAMENTO_DIR`, `EMAIL_ARQUIVOS_DIR` nem `PROTHEUS_CACHE_DIR`:
dentro do container eles são fixos (`/data/...`). O cache do Protheus fica no
volume nomeado `protheus` (não precisa de pasta no host nem de backup).

### 2.2 Proxy reverso existente

Encaminhe o nome do sistema (por exemplo, `contratos.intranet`) para
`http://<este-host>:APP_PORTA`, com os cuidados abaixo:

- **Cabeçalhos:** repasse `Host`, `X-Forwarded-For`, `X-Forwarded-Proto` e
  `X-Forwarded-Host`. O endereço de retorno da troca de senha e o IP gravado
  na auditoria saem deles.
- **Tamanho do corpo:** pelo menos `UPLOAD_MAX_MB + 5` MB, ou seja, `30m` com
  o padrão. Sem isso, o upload de documentos falha no proxy.
- **Tempo limite:** de 60 s ou mais, para exportações grandes.
- **Porta:** se possível, libere `APP_PORTA` no firewall só para o proxy.

Exemplo para nginx:

```nginx
server {
    listen 80;
    server_name contratos.intranet;
    client_max_body_size 30m;
    location / {
        proxy_pass http://<este-host>:3400;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_read_timeout 120s;
    }
}
```

Em HTTP, o cookie de sessão perde a flag `Secure` sozinho. Se o proxy servir
HTTPS, ele volta a ter.

### 2.3 Conferir o e-mail

```sh
docker compose exec worker node dist/worker.cjs verificar-email               # conecta e autentica, não envia
docker compose exec worker node dist/worker.cjs teste-email voce@empresa.com  # um e-mail de teste
docker compose exec worker node dist/worker.cjs alertas --simular             # o que sairia hoje, sem enviar
```

### 2.4 Conferir a integração com o Protheus

A tela Contratos Protheus não consulta o Protheus: ela lê uma cópia que o
`worker` atualiza uma vez por dia (`PROTHEUS_CRON`). O `worker` também
sincroniza ao subir, se ainda não houver cópia ou se a última tentativa falhou.
Para sincronizar na hora (por exemplo, depois de trocar o token):

```sh
docker compose exec worker node dist/worker.cjs protheus   # sai com código 0 se deu certo
```

O resultado aparece em `docker compose logs worker`
(`protheus: sincronização concluída` ou `protheus: sincronização falhou`, com o
motivo). Se o Protheus estiver fora, a tela continua mostrando os dados da
última sincronização que deu certo, com um aviso do erro.

Mudar `PROTHEUS_CONTRACTS_TOKEN` ou `PROTHEUS_CRON` no `.env` exige recriar o
worker: `docker compose up -d worker`.

---

## 3. Atualizar

```sh
cd /opt/contratos-juridicos
git pull
docker compose up -d --build
docker compose ps && docker compose logs --tail 20 migrate
```

O `migrate` roda antes de `app` e `worker` subirem. Se uma migração falhar, o
`up` termina com erro, as versões novas de `app` e `worker` não sobem, e o
motivo aparece em `docker compose logs migrate`. Confira o
`docker compose ps` antes de liberar o uso.

**Voltar uma versão:** `git checkout <versão anterior>` e
`docker compose up -d --build`. As migrações só acrescentam (expandir →
migrar → contrair), então a versão anterior roda no banco novo.

---

## 4. Backup e restauração

### 4.1 O que copiar

| O quê | Quem | Observação |
|---|---|---|
| Banco (`POSTGRES_DATABASE`) | rotina do DBA | confirmar que o banco deste sistema está incluído e qual é a retenção |
| Pasta `ARQUIVOS_DIR` | ferramenta de backup da TI | diária, fora deste host. Sugestão: 30 diárias + 12 mensais |

**Ordem:** a cópia da pasta deve ser feita **depois** do backup do banco.
Documentos nunca são apagados pelo sistema, então uma cópia de arquivos mais
nova sempre contém tudo o que o banco referencia. Ao restaurar, nenhum registro
fica apontando para um arquivo que não existe.

A subpasta `.tmp/` da pasta de documentos pode ficar fora do backup: são
uploads em andamento.

### 4.2 Restaurar

1. Pare tudo: `docker compose down`.
2. O DBA restaura o banco.
3. Restaure a pasta `ARQUIVOS_DIR` da mesma noite ou de depois, e acerte o
   dono: `sudo chown -R 1001:1001 dados/arquivos`.
4. Suba de novo: `docker compose up -d`.
5. Confira: entre no sistema, abra um contrato com documento e baixe o arquivo.

### 4.3 Teste de restauração (antes de entrar em produção, e depois a cada trimestre)

Faça o teste sem tocar na produção, com uma cópia em outro diretório:

1. O DBA restaura o backup mais recente num banco separado, por exemplo
   `contratos_restauracao`.
2. Restaure a pasta de documentos numa pasta separada, por exemplo
   `/srv/restauracao/arquivos`, com dono 1001.
3. Faça um checkout separado (por exemplo `/opt/contratos-restauracao`) e copie
   o `.env` de produção, alterando:
   - `POSTGRES_DATABASE=contratos_restauracao`;
   - `ARQUIVOS_DIR=/srv/restauracao/arquivos`;
   - `APP_PORTA=3401`;
   - `ALERTAS_ATIVOS=false`, para **não mandar e-mail a ninguém**.
4. Rode `docker compose -p contratos-restauracao up -d --build`.
5. Confira em `http://<host>:3401`:
   - a quantidade de contratos bate;
   - abra 3 contratos com documentos e baixe os arquivos;
   - a Auditoria mostra os eventos do dia do backup.
6. Desmonte: `docker compose -p contratos-restauracao down`. Depois, apague o
   banco e a pasta de teste.
7. Anote a data, o resultado e quanto tempo levou.

---

## 5. Logs e diagnóstico

- `docker compose logs -f app` (ou `worker`): os logs são uma linha JSON por
  evento. A rotação é automática (10 MB × 5 arquivos por serviço).
- Os logs não trazem corpo de requisição, arquivo nem CPF/CNPJ.
- Todo erro 500 da API devolve um `idRastreio`; procure por ele no log do `app`.
- `GET /api/health` confere só o banco. Se os Apps Princesa caírem, o app não
  reinicia: quem já tem sessão continua usando o sistema.

---

## 6. Segurança (o que já vem configurado)

- O container roda sem root. O código da imagem é somente leitura; só `/data`
  aceita escrita.
- O `.env` nunca entra na imagem (`.dockerignore`).
- **Content-Security-Policy com nonce por requisição:** script injetado na
  página não executa. Também impede o sistema de ser aberto dentro de iframes.
- **Limite de envio de documentos por usuário:** 60 arquivos ou 1 GB por hora.
  Acima disso, a resposta é 429 com o tempo de espera.
- **CI:**
  - `npm audit` barra dependências com falha alta ou crítica;
  - o Trivy varre a imagem;
  - o Dependabot abre atualizações semanais.

## 7. LGPD

- **Trilha de acesso a contratos restritos:**
  - quem abriu cada um (no máximo um registro por pessoa, contrato e hora);
  - quem baixou cada documento;
  - quais restritos saíram em cada exportação.
  Ver em Auditoria → categoria Acesso/Exportação.
- **Retenção:** por enquanto **nada é apagado automaticamente** (documentos e
  auditoria). O prazo após o encerramento do contrato e quem pode pedir
  exclusão estão pendentes de decisão do Jurídico. Quando definidos, entra
  uma rotina de descarte.
