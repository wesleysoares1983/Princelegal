'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { entrar } from '@/lib/auth'

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
 */
export default function Login() {
  const router = useRouter()
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [lembrar, setLembrar] = useState(false)
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)

  const [recuperarAberto, setRecuperarAberto] = useState(false)
  const [emailRecuperar, setEmailRecuperar] = useState('')
  const [erroRecuperar, setErroRecuperar] = useState('')
  const [recuperarEnviado, setRecuperarEnviado] = useState(false)

  function abrirRecuperar() {
    setEmailRecuperar('')
    setErroRecuperar('')
    setRecuperarEnviado(false)
    setRecuperarAberto(true)
  }

  function enviarRecuperacao() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRecuperar.trim())) {
      setErroRecuperar('Informe o e-mail cadastrado para receber o link.')
      return
    }
    setErroRecuperar('')
    // Sem backend nesta versão: o envio real de e-mail entra quando o
    // projeto ganhar uma API. A mensagem nao confirma se o e-mail existe --
    // dizer "nao encontrado" daria a quem tenta adivinhar login uma forma de
    // descobrir quais e-mails estao cadastrados.
    setRecuperarEnviado(true)
  }

  function aoEntrar() {
    if (!login.trim() || !senha.trim()) {
      setErro('Informe login e senha para continuar.')
      return
    }
    setErro('')
    setEntrando(true)
    // Sem backend nesta versão: qualquer login/senha preenchidos autenticam.
    entrar(login.trim(), lembrar)
    router.push('/')
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
          placeholder="Login"
          aria-label="Login"
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
        <button
          type="button"
          onClick={abrirRecuperar}
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
            className="absolute rounded-md bg-white px-2 py-1 text-[12px] font-medium text-[#c4302b] shadow"
            style={{ left: '61.3%', top: '50%' }}
          >
            {erro}
          </p>
        )}
      </div>

      {recuperarAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setRecuperarAberto(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border-2 border-[#2ecc55]/60 bg-white p-6 text-[#14202e] shadow-2xl"
          >
            {recuperarEnviado ? (
              <>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e3f5e8] text-[#0a7c2a]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16v16H4z" />
                    <path d="M4 6l8 7 8-7" />
                  </svg>
                </div>
                <h2 className="mt-3 text-[16px] font-semibold">E-mail enviado</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#5c6b7f]">
                  Se <span className="font-medium text-[#14202e]">{emailRecuperar}</span> for o e-mail de cadastro dessa
                  conta, um link para redefinir a senha chega em instantes. Confira também a caixa de spam.
                </p>
                <button
                  type="button"
                  onClick={() => setRecuperarAberto(false)}
                  className="mt-5 w-full rounded-lg bg-[#0a7c2a] py-2.5 text-[14px] font-semibold text-white hover:opacity-90"
                >
                  Fechar
                </button>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <h2 className="text-[16px] font-semibold">Esqueceu sua senha?</h2>
                  <button type="button" onClick={() => setRecuperarAberto(false)} aria-label="Fechar" className="text-[#8894a5] hover:text-[#14202e]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
                <p className="mt-1.5 text-[13px] text-[#5c6b7f]">
                  Informe o e-mail cadastrado. Vamos enviar um link para você criar uma nova senha.
                </p>

                <label className="mt-4 flex items-center gap-2 rounded-lg border border-[#dfe5ec] px-3 py-2.5 focus-within:border-[#0a7c2a]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5c6b7f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3 7l9 6 9-6" />
                  </svg>
                  <input
                    type="email"
                    value={emailRecuperar}
                    onChange={(e) => setEmailRecuperar(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && enviarRecuperacao()}
                    placeholder="seu.email@princesadoscampos.com.br"
                    autoFocus
                    className="w-full text-[14px] text-[#14202e] placeholder:text-[#8894a5] focus:outline-none"
                  />
                </label>
                {erroRecuperar && <p className="mt-2 text-[12px] text-[#c4302b]">{erroRecuperar}</p>}

                <button
                  type="button"
                  onClick={enviarRecuperacao}
                  className="mt-4 w-full rounded-lg bg-[#0a7c2a] py-2.5 text-[14px] font-semibold text-white hover:opacity-90"
                >
                  Enviar link de recuperação
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
