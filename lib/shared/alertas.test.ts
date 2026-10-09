import { describe, expect, it } from 'vitest'
import { somarDias } from './datas'
import { descreverItem, maisUrgente, planejarAlertas, type RegistroAlerta } from './alertas'

const HOJE = '2026-10-09'
const fimEm = (d: number) => somarDias(HOJE, d)

describe('planejarAlertas', () => {
  it('nada antes de 120 dias', () => {
    expect(planejarAlertas({ dataFim: fimEm(200), prazoAvisoCancelamentoDias: 0 }, [], HOJE)).toEqual({ enviar: [], ignorar: [] })
  })

  it('cadastrado a 20 dias do fim: envia só o "30", ignora 120/90/60', () => {
    const p = planejarAlertas({ dataFim: fimEm(20), prazoAvisoCancelamentoDias: 0 }, [], HOJE)
    expect(p.enviar).toEqual([{ tipo: 'vencimento', limiarDias: 30, dataReferencia: fimEm(20), dias: 20 }])
    expect(p.ignorar.map((i) => i.limiarDias)).toEqual([60, 90, 120])
  })

  it('limiar já processado não repete; o próximo entra quando alcançado', () => {
    const ref = fimEm(15)
    const processados: RegistroAlerta[] = [30, 60, 90, 120].map((l) => ({ tipo: 'vencimento', limiarDias: l, dataReferencia: ref }))
    expect(planejarAlertas({ dataFim: ref, prazoAvisoCancelamentoDias: 0 }, processados, HOJE).enviar).toEqual([
      { tipo: 'vencimento', limiarDias: 15, dataReferencia: ref, dias: 15 },
    ])
    processados.push({ tipo: 'vencimento', limiarDias: 15, dataReferencia: ref })
    expect(planejarAlertas({ dataFim: ref, prazoAvisoCancelamentoDias: 0 }, processados, HOJE).enviar).toEqual([])
  })

  it('aditivo que muda o término recomeça o ciclo (outra data de referência)', () => {
    const processados: RegistroAlerta[] = [{ tipo: 'vencimento', limiarDias: 30, dataReferencia: fimEm(25) }]
    const p = planejarAlertas({ dataFim: fimEm(28), prazoAvisoCancelamentoDias: 0 }, processados, HOJE)
    expect(p.enviar[0]).toMatchObject({ limiarDias: 30, dataReferencia: fimEm(28) })
  })

  it('prazo de aviso conta até a data-limite; sem prazo (0), não há esse alerta', () => {
    const p = planejarAlertas({ dataFim: fimEm(100), prazoAvisoCancelamentoDias: 90 }, [], HOJE)
    expect(p.enviar).toEqual([
      { tipo: 'vencimento', limiarDias: 120, dataReferencia: fimEm(100), dias: 100 },
      { tipo: 'prazo_aviso', limiarDias: 15, dataReferencia: fimEm(10), dias: 10 },
    ])
  })

  it('vencido: uma vez, no primeiro dia fora; nada de limiares negativos', () => {
    const ref = fimEm(-1)
    expect(planejarAlertas({ dataFim: ref, prazoAvisoCancelamentoDias: 30 }, [], HOJE).enviar).toEqual([
      { tipo: 'vencido', limiarDias: 0, dataReferencia: ref, dias: -1 },
    ])
    expect(planejarAlertas({ dataFim: ref, prazoAvisoCancelamentoDias: 30 }, [{ tipo: 'vencido', limiarDias: 0, dataReferencia: ref }], HOJE).enviar).toEqual([])
  })

  it('vence hoje cai no limiar de 7', () => {
    expect(planejarAlertas({ dataFim: HOJE, prazoAvisoCancelamentoDias: 0 }, [], HOJE).enviar[0]).toMatchObject({ limiarDias: 7, dias: 0 })
  })
})

describe('descrição e urgência', () => {
  it('frases e item do assunto', () => {
    const itens = [
      { tipo: 'vencimento' as const, limiarDias: 30, dataReferencia: 'x', dias: 20 },
      { tipo: 'prazo_aviso' as const, limiarDias: 7, dataReferencia: 'x', dias: 1 },
    ]
    expect(itens.map(descreverItem)).toEqual(['vence em 20 dias', 'prazo de aviso em 1 dia'])
    expect(maisUrgente(itens).tipo).toBe('prazo_aviso')
    expect(descreverItem({ tipo: 'vencido', limiarDias: 0, dataReferencia: 'x', dias: -3 })).toBe('fora da vigência há 3 dias')
  })
})
