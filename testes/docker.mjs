/**
 * Sobe/para o banco de teste (docker-compose.dev.yml).
 *
 * Usa `docker` se existir no PATH; senao, o Docker do WSL (`wsl docker`) --
 * o caso das maquinas Windows sem Docker Desktop.
 *
 *   node testes/docker.mjs subir | parar
 */
import { spawnSync } from 'node:child_process'

const acao = process.argv[2]
const args = {
  subir: ['compose', '-f', 'docker-compose.dev.yml', 'up', '-d', '--wait'],
  parar: ['compose', '-f', 'docker-compose.dev.yml', 'down'],
}[acao]
if (!args) {
  console.error('uso: node testes/docker.mjs subir|parar')
  process.exit(2)
}

const temDocker = spawnSync('docker', ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0
const [cmd, ...resto] = temDocker ? ['docker', ...args] : ['wsl', 'docker', ...args]
const r = spawnSync(cmd, resto, { stdio: 'inherit' })
process.exit(r.status ?? 1)
