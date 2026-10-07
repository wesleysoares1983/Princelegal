'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

/** Mensagens para quem volta ao login vindo de um redirecionamento (`/login?erro=`). */
const ERROS_URL: Record<string, string> = {
  troca_senha: 'Não foi possível concluir a entrada após a troca de senha. Entre com a sua nova senha.',
  indisponivel: 'Não foi possível validar o acesso agora. Tente novamente em alguns minutos.',
  acesso_revogado: 'Seu acesso a este sistema foi removido ou desativado. Procure o administrador.',
}

export default function Login() {
  // useSearchParams pede um limite de Suspense para a pagina poder ser pre-renderizada.
  return (
    <Suspense>
      <TelaLogin />
    </Suspense>
  )
}

/**
 * Login sobre a imagem de referencia.
 *
 * A imagem (`public/login-referencia.png`) ja e a tela inteira desenhada --
 * marca, textos, caixas dos campos, botoes. Refazer esse texto em JSX por
 * cima dela duplicava tudo (via visivel no proprio pedido: "nao fazer isso").
 * Em vez disso, os campos reais ficam transparentes, encaixados exatamente
 * sobre as caixas que a imagem ja desenhou -- so capturam clique e digitacao.
 *
 * As posicoes sao em porcentagem da imagem (1536x1024), medidas nela.
 * Funciona em qualquer largura porque a `<img>` mantem a proporcao e os
 * campos absolutos seguem o mesmo retangulo.
 *
 * Quem valida a senha sao os Apps Princesa (cadastro central), atraves de
 * POST /api/auth/login; a senha nunca e guardada neste app.
 */
function TelaLogin() {
  const params = useSearchParams()
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [lembrar, setLembrar] = useState(false)
  const [erro, setErro] = useState(() => ERROS_URL[params.get('erro') ?? ''] ?? '')
  const [entrando, setEntrando] = useState(false)

  async function aoEntrar() {
    if (entrando) return
    if (!login.trim() || !senha) {
      setErro('Informe matrícula ou e-mail e a senha para continuar.')
      return
    }
    setErro('')
    setEntrando(true)
    try {
      const resposta = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: login.trim(), senha, lembrar, destino: params.get('destino') ?? '/' }),
      })
      const dados = await resposta.json().catch(() => null)

      if (dados?.ok) {
        // Recarga completa: o layout le o cookie novo no servidor.
        window.location.assign(dados.destino ?? '/')
        return
      }
      if (dados?.acao === 'trocar_senha' && dados.url) {
        // Senha temporaria: a troca acontece na pagina dos Apps Princesa, que
        // devolve o navegador para /api/auth/retorno-senha ja com a sessao aberta.
        window.location.assign(dados.url)
        return
      }
      setErro(dados?.mensagem ?? 'Não foi possível entrar. Tente novamente.')
      setEntrando(false)
    } catch {
      setErro('Sem conexão com o servidor. Verifique a rede e tente novamente.')
      setEntrando(false)
    }
  }

  const classeCampo = 'absolute bg-transparent text-[13px] text-[#14202e] placeholder:text-[#8894a5] focus:outline-none'

  return (
    <div className="login-fundo flex min-h-screen items-center justify-center p-4">
      <div className="relative mx-auto w-full max-w-[760px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/login-referencia.png" alt="Princelegal" className="w-full select-none rounded-2xl" draggable={false} />

        {/* Cobre so o texto "Seu e-mail" desenhado (mantem o icone de pessoa a esquerda). */}
        <div className="absolute bg-white" style={{ left: '65%', top: '37.2%', width: '26.3%', height: '5.4%' }} />

        {/* Campo de login: sobre a caixa, com "Login" como marca-texto de verdade. */}
        <input
          type="text"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          placeholder="Matrícula ou e-mail"
          aria-label="Matrícula ou e-mail"
          onKeyDown={(e) => e.key === 'Enter' && aoEntrar()}
          className={classeCampo}
          style={{ left: '65.3%', top: '37.2%', width: '25.7%', height: '5.4%' }}
        />

        {/* Cobre so o texto "Sua senha" desenhado (mantem o icone de cadeado a esquerda). */}
        <div className="absolute bg-white" style={{ left: '65%', top: '44.2%', width: '25%', height: '5.4%' }} />

        {/* Campo de senha: com "Senha" como marca-texto de verdade, espaco a direita para o olho. */}
        <input
          type={mostrarSenha ? 'text' : 'password'}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="current-password"
          placeholder="Senha"
          aria-label="Senha"
          onKeyDown={(e) => e.key === 'Enter' && aoEntrar()}
          className={classeCampo}
          style={{ left: '65.3%', top: '44.2%', width: '24.7%', height: '5.4%' }}
        />
        <button
          type="button"
          onClick={() => setMostrarSenha((v) => !v)}
          aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute"
          style={{ left: '90.5%', top: '44.2%', width: '3.5%', height: '5.4%' }}
        />

        {/* Checkbox "Lembrar de mim": clique alterna, marcacao propria desenhada por cima. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={lembrar}
          aria-label="Lembrar de mim"
          onClick={() => setLembrar((v) => !v)}
          className="absolute flex items-center justify-center"
          style={{ left: '61.05%', top: '52.9%', width: '1.7%', height: '2.3%' }}
        >
          {lembrar && (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0a7c2a"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[65%] w-[65%]"
              style={{ margin: 'auto' }}
            >
              <path d="M4.5 12.5l5 5L19.5 7" />
            </svg>
          )}
        </button>

        {/* "Esqueceu sua senha?": area clicavel sobre o texto. */}
        <a
          href="/api/auth/esqueci-senha"
          aria-label="Esqueceu sua senha?"
          className="absolute"
          style={{ left: '81.4%', top: '53%', width: '12.5%', height: '2.3%' }}
        />

        {/* Botao "Entrar": cobre toda a caixa verde desenhada. */}
        <button
          type="button"
          onClick={aoEntrar}
          disabled={entrando}
          aria-label="Entrar"
          className="absolute disabled:cursor-wait"
          style={{ left: '61.3%', top: '58.9%', width: '32.6%', height: '5.9%' }}
        />

        {/*
          A imagem traz "ou" + "Entrar com Microsoft" desenhados -- sem editor
          de imagem para apagar da arte, cobrimos a area com um retangulo
          branco (a mesma cor do painel) para a opcao sumir de vista.
        */}
        <div className="absolute bg-white" style={{ left: '61%', top: '64%', width: '33.5%', height: '14%' }} />

        {entrando && (
          <div
            className="absolute flex items-center justify-center rounded-lg bg-[#0a7c2a] text-[14px] font-semibold text-white"
            style={{ left: '61.3%', top: '58.9%', width: '32.6%', height: '5.9%' }}
          >
            Entrando…
          </div>
        )}

        {erro && (
          <p
            role="alert"
            className="absolute rounded-md bg-white px-2 py-1 text-[12px] font-medium text-[#c4302b] shadow"
            style={{ left: '61.3%', top: '50%', maxWidth: '32.6%' }}
          >
            {erro}
          </p>
        )}
      </div>
    </div>
  )
}
