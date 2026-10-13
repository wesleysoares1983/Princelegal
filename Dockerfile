# Imagem única para os três serviços do docker-compose.yml:
#   app     -> node server.js           (Next.js standalone, porta 3400)
#   worker  -> node dist/worker.cjs     (alertas e limpeza agendados)
#   migrate -> node dist/migrar.cjs     (aplica as migrações e sai)
#
# O .env NUNCA entra na imagem (.dockerignore): as variáveis chegam pelo
# env_file do compose na hora de rodar.
#
# NODE_IMAGE: imagem base. Na rede corporativa o firewall inspeciona o TLS
# do Docker Hub (certificado da própria empresa): ou o Docker do servidor
# confia na CA corporativa, ou NODE_IMAGE aponta para uma cópia num registro
# liberado (ex.: ghcr.io da organização). Ver DEPLOY.md.

ARG NODE_IMAGE=node:24-alpine
FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- dependências (camada reaproveitada enquanto o package-lock não muda)
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

# ---- build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Limite de upload: entra no build (corpo máximo que o proxy.ts repassa).
ARG UPLOAD_MAX_MB=25
ENV UPLOAD_MAX_MB=${UPLOAD_MAX_MB}
# O rastreio do Next copia o fonte de lib/ (desnecessário: já vai compilado
# em .next/server) e um .env se houver -- nenhum dos dois vai para a imagem.
RUN npm run build && npm run worker:build  && rm -rf .next/standalone/lib .next/standalone/.env*

# ---- execução
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3400 \
    HOSTNAME=0.0.0.0 \
    TZ=America/Sao_Paulo \
    ARMAZENAMENTO_DIR=/data/arquivos \
    EMAIL_ARQUIVOS_DIR=/data/emails
# npm, npx, corepack e yarn vêm na imagem base mas não são usados em execução
# (só `node`): saem, junto com as dependências deles, que o Trivy acusava
# (tar, undici, ip-address, brace-expansion do npm embutido). O build usa npm
# no estágio anterior, que não entra na imagem final.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* \
 && apk add --no-cache tzdata \
 && addgroup -S -g 1001 app && adduser -S -u 1001 -G app app \
 && mkdir -p /data/arquivos /data/emails && chown app:app /data/arquivos /data/emails

# Código é do root (somente leitura para o app); só /data é gravável.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

USER app
EXPOSE 3400
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3400/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
