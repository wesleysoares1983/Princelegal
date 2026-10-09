/**
 * Empacota o worker (worker/index.ts) num arquivo só: dist/worker.cjs.
 * O mesmo arquivo roda em desenvolvimento e na imagem Docker.
 *
 * - `@/...` aponta para a raiz do projeto (igual ao tsconfig);
 * - `server-only` vira um módulo vazio (ele só faz sentido dentro do Next);
 * - `import.meta.url` de dependências ESM vira a URL do próprio bundle.
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))

await build({
  entryPoints: [`${raiz}/worker/index.ts`],
  outfile: `${raiz}/dist/worker.cjs`,
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
console.log('dist/worker.cjs pronto')
