import { connection } from 'next/server'
import { obterUsuariosDoApp } from '@/lib/server/usuariosApp'
import { ListaUsuarios } from './ListaUsuarios'

/**
 * Usuarios com acesso ao sistema -- somente leitura.
 *
 * Quem cadastra, libera acesso e define o cargo (ADMIN/USUARIO) e o cadastro
 * central dos Apps Princesa; aqui so se consulta. A lista vem da mesma copia
 * usada para revalidar sessoes, renovada se tiver mais de 1 minuto, para o
 * administrador ver o estado atual logo depois de mexer la.
 */
export default async function Usuarios() {
  // Dado de agora, por requisicao: nunca pre-renderizar no build (o que
  // tambem chamaria a API dos Apps Princesa durante o `next build`).
  await connection()
  const listagem = await obterUsuariosDoApp(60_000)

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Configurações</h1>
        <p className="text-[13px] text-tinta-fraca">
          Usuários com acesso ao sistema. Cadastro, senha, liberação de acesso e cargo são gerenciados nos Apps Princesa.
        </p>
      </div>

      {!listagem ? (
        <section className="rounded-xl border border-borda bg-painel p-5 text-[13px] text-tinta-fraca">
          Não foi possível consultar os usuários nos Apps Princesa agora. Tente novamente em alguns minutos.
        </section>
      ) : (
        <>
          {!listagem.app.ativo && (
            <section className="rounded-xl border border-status-vencido/40 bg-painel p-4 text-[13px] text-status-vencido">
              Este sistema está inativo no catálogo dos Apps Princesa — ninguém consegue entrar até ele ser reativado.
            </section>
          )}
          <ListaUsuarios usuarios={listagem.usuarios} cargos={listagem.cargos.map((c) => c.nome)} />
        </>
      )}
    </div>
  )
}
