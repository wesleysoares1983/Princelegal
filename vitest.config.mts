import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Dois projetos:
 * - `unidade`: sem banco e sem rede (`*.test.ts`). Roda em qualquer maquina.
 * - `banco`: contra o Postgres descartavel do docker-compose.dev.yml
 *   (`*.banco.test.ts`). O globalSetup recria o esquema e aplica as migracoes.
 *
 * Nenhum dos dois le o .env: os testes nunca tocam o banco nem os Apps
 * Princesa de verdade. As variaveis abaixo sao ficticias.
 */

const raiz = fileURLToPath(new URL('.', import.meta.url))

const ambienteFicticio = {
  APPS_PRINCESA_URL: 'http://apps-princesa.teste',
  APPS_INTERNAL_KEY: 'chave-de-teste',
  APP_ID: '10',
  SESSION_SECRET: 'segredo-de-teste-com-pelo-menos-32-caracteres!',
  // Erros esperados nos testes (ex.: o 500 de proposito) nao poluem a saida.
  LOG_LEVEL: 'silent',
}

/** Pasta descartavel dos arquivos enviados nos testes (zerada pelo globalSetup). */
const ARMAZENAMENTO_TESTE = join(tmpdir(), 'princelegal-arquivos-teste')

const bancoDeTeste = {
  ARMAZENAMENTO_DIR: ARMAZENAMENTO_TESTE,
  UPLOAD_MAX_MB: '2',
  POSTGRES_HOST: process.env.POSTGRES_TEST_HOST ?? 'localhost',
  POSTGRES_PORT: process.env.POSTGRES_TEST_PORT ?? '54329',
  POSTGRES_DATABASE: process.env.POSTGRES_TEST_DATABASE ?? 'princelegal_teste',
  POSTGRES_USERNAME: process.env.POSTGRES_TEST_USERNAME ?? 'teste',
  POSTGRES_PASSWORD: process.env.POSTGRES_TEST_PASSWORD ?? 'teste',
}

const comum = {
  resolve: {
    alias: {
      '@': raiz,
      // `server-only` lanca erro fora do ambiente de servidor do Next; nos testes nao ha cliente.
      'server-only': fileURLToPath(new URL('./testes/vazio.ts', import.meta.url)),
    },
  },
}

export default defineConfig({
  test: {
    projects: [
      {
        ...comum,
        test: {
          name: 'unidade',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: ['**/*.banco.test.ts', 'node_modules/**', '.next/**'],
          env: { ...ambienteFicticio, POSTGRES_HOST: 'banco-nao-disponivel-em-teste-de-unidade', POSTGRES_PORT: '1', POSTGRES_DATABASE: 'x', POSTGRES_USERNAME: 'x', POSTGRES_PASSWORD: 'x' },
        },
      },
      {
        ...comum,
        test: {
          name: 'banco',
          environment: 'node',
          include: ['**/*.banco.test.ts'],
          exclude: ['node_modules/**', '.next/**'],
          env: { ...ambienteFicticio, ...bancoDeTeste },
          globalSetup: ['./testes/preparar-banco.ts'],
          // Um arquivo por vez: todos dividem o mesmo banco.
          fileParallelism: false,
        },
      },
    ],
  },
})
