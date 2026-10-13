/**
 * Empacota os processos fora do Next em arquivos únicos em dist/:
 * - dist/worker.cjs  (worker/index.ts): alertas e limpeza agendados;
 * - dist/migrar.cjs  (worker/migrar.ts): aplica as migrações e sai;
 * - dist/semear.cjs  (worker/semear.ts): dados fictícios (só desenvolvimento).
 * Os mesmos arquivos rodam em desenvolvimento e na imagem Docker.
 *
 * - `@/...` aponta para a raiz do projeto (igual ao tsconfig);
 * - `server-only` vira um módulo vazio (ele só faz sentido dentro do Next);
 * - `import.meta.url` de dependências ESM vira a URL do próprio bundle.
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))

await build({
  entryPoints: { worker: `${raiz}/worker/index.ts`, migrar: `${raiz}/worker/migrar.ts`, semear: `${raiz}/worker/semear.ts` },
  outdir: `${raiz}/dist`,
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  sourcemap: 'linked',
  alias: { '@': raiz, 'server-only': `${raiz}/testes/vazio.ts` },
  // Pacotes ESM (ex.: node-cron) usam import.meta.url, que nao existe num
  // bundle CommonJS: aponta para o proprio arquivo empacotado.
  banner: { js: "const __import_meta_url = require('node:url').pathToFileURL(__filename).href;" },
  define: { 'import.meta.url': '__import_meta_url' },
  logLevel: 'warning',
})
console.log('dist/worker.cjs, dist/migrar.cjs e dist/semear.cjs prontos')
