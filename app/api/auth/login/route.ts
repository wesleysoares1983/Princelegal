import { NextResponse, type NextRequest } from 'next/server'
import { autenticar, urlRedefinirSenha } from '@/lib/server/appsPrincesa'
import {
  CAMINHO_RETORNO_SENHA,
  destinoSeguro,
  ehHttps,
  gravarSessao,
  gravarTrocaSenha,
  origemConfere,
  origemPublica,
} from '@/lib/server/sessao'
import { nivelDoCargo } from '@/lib/usuario'

/**
 * POST /api/auth/login  { usuario, senha, lembrar?, destino? }
 *
 * Repassa matricula/e-mail + senha aos Apps Princesa e, se der certo, abre a
 * sessao deste app. Respostas:
 * - 200 { ok: true, destino }                      -> sessao criada
 * - 200 { ok: false, acao: 'trocar_senha', url }  -> senha temporaria: o navegador vai para `url`
 * - 4xx/503 { ok: false, erro, mensagem }          -> mensagem pronta para a tela
 */

const MENSAGENS = {
  requisicao_invalida: 'Requisição inválida.',
  campos_obrigatorios: 'Informe matrícula ou e-mail e a senha para continuar.',
  credenciais_invalidas: 'Matrícula/e-mail ou senha incorretos.',
  usuario_inativo: 'Seu usuário está desativado. Procure o administrador do sistema.',
  sem_acesso_app: 'Seu usuário não tem acesso a este sistema. Solicite a liberação ao administrador.',
  indisponivel: 'Não foi possível validar o acesso agora. Tente novamente em alguns minutos.',
} as const

type CodigoErro = keyof typeof MENSAGENS

function erro(status: number, codigo: CodigoErro) {
  return NextResponse.json({ ok: false, erro: codigo, mensagem: MENSAGENS[codigo] }, { status })
}

export async function POST(req: NextRequest) {
  if (!origemConfere(req)) return erro(403, 'requisicao_invalida')

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return erro(400, 'requisicao_invalida')
  }

  const usuario = typeof corpo?.usuario === 'string' ? corpo.usuario.trim() : ''
  // A senha nao e aparada: espaco no comeco/fim pode ser parte dela.
  const senha = typeof corpo?.senha === 'string' ? corpo.senha : ''
  const lembrar = corpo?.lembrar === true
  const destino = destinoSeguro(corpo?.destino)

  if (!usuario || !senha) return erro(400, 'campos_obrigatorios')

  const resultado = await autenticar(usuario, senha)

  switch (resultado.tipo) {
    case 'ok': {
      const res = NextResponse.json({ ok: true, destino })
      gravarSessao(res, { ...resultado.usuario, nivel: nivelDoCargo(resultado.usuario.cargo) }, lembrar, ehHttps(req))
      return res
    }
    case 'senha_temporaria': {
      // O token dos Apps Princesa vale 5 minutos: e so para atravessar este
      // redirecionamento. "Lembrar" e o destino ficam num cookie nosso, porque
      // a URL de retorno volta so com `token_confirmacao`.
      const retorno = `${origemPublica(req)}${CAMINHO_RETORNO_SENHA}`
      const res = NextResponse.json({ ok: false, acao: 'trocar_senha', url: urlRedefinirSenha(resultado.token, retorno) })
      gravarTrocaSenha(res, lembrar, destino, ehHttps(req))
      return res
    }
    case 'credenciais_invalidas':
      return erro(401, 'credenciais_invalidas')
    case 'usuario_inativo':
      return erro(403, 'usuario_inativo')
    case 'sem_acesso_app':
      return erro(403, 'sem_acesso_app')
    case 'indisponivel':
      return erro(503, 'indisponivel')
  }
}
