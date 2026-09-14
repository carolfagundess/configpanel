import {
  PROTOCOL_STATES,
  TECHNICAL_PHASE_STATES,
  canTransition,
  isValidState,
  getValidTransitions,
} from '../src/state-machine/protocol.state-machine.js';

describe('protocol.state-machine — isValidState', () => {
  it('reconhece todos os 12 estados válidos', () => {
    expect(PROTOCOL_STATES).toHaveLength(12);
    PROTOCOL_STATES.forEach((state) => {
      expect(isValidState(state)).toBe(true);
    });
  });

  it('rejeita estados inexistentes', () => {
    expect(isValidState('FINALIZADO')).toBe(false);
    expect(isValidState('')).toBe(false);
    expect(isValidState(undefined)).toBe(false);
  });
});

describe('protocol.state-machine — canTransition (matriz completa)', () => {
  // Mapa espelhado aqui só para comparação no teste — se o mapa real mudar
  // sem atualizar este espelho, o teste quebra (proteção contra drift silencioso).
  const EXPECTED_TRANSITIONS = {
    RECEBIDO: ['EM_ANALISE', 'CANCELADO'],
    EM_ANALISE: ['EM_CONFIGURACAO', 'SOLICITADO_IP_VLAN', 'EM_CONTATO_CLIENTE', 'PROBLEMA_INFRA', 'CANCELADO'],
    EM_CONFIGURACAO: ['SOLICITADO_IP_VLAN', 'EM_CONTATO_CLIENTE', 'AGENDADO', 'SUSPENSO', 'PROBLEMA_INFRA', 'CANCELADO'],
    SOLICITADO_IP_VLAN: ['EM_CONFIGURACAO', 'EM_CONTATO_CLIENTE', 'AGENDADO', 'SUSPENSO', 'PROBLEMA_INFRA', 'CANCELADO'],
    EM_CONTATO_CLIENTE: ['EM_CONFIGURACAO', 'SOLICITADO_IP_VLAN', 'AGENDADO', 'SUSPENSO', 'PROBLEMA_INFRA', 'CANCELADO'],
    AGENDADO: ['EM_INSTALACAO', 'SUSPENSO', 'PROBLEMA_INFRA', 'CANCELADO'],
    EM_INSTALACAO: ['EM_VALIDACAO', 'PROBLEMA_INFRA', 'CANCELADO'],
    EM_VALIDACAO: ['CONCLUIDO', 'EM_INSTALACAO', 'PROBLEMA_INFRA', 'CANCELADO'],
    SUSPENSO: ['EM_ANALISE', 'CANCELADO'],
    PROBLEMA_INFRA: [
      'EM_ANALISE', 'EM_CONFIGURACAO', 'SOLICITADO_IP_VLAN', 'EM_CONTATO_CLIENTE',
      'AGENDADO', 'EM_INSTALACAO', 'EM_VALIDACAO', 'CANCELADO',
    ],
    CONCLUIDO: [],
    CANCELADO: [],
  };

  PROTOCOL_STATES.forEach((from) => {
    PROTOCOL_STATES.forEach((to) => {
      const shouldBeValid = EXPECTED_TRANSITIONS[from].includes(to);
      const label = shouldBeValid ? 'PERMITE' : 'REJEITA';

      it(`${label}: ${from} → ${to}`, () => {
        expect(canTransition(from, to)).toBe(shouldBeValid);
      });
    });
  });

  it('rejeita quando origem ou destino não existem na FSM', () => {
    expect(canTransition('RECEBIDO', 'INEXISTENTE')).toBe(false);
    expect(canTransition('INEXISTENTE', 'RECEBIDO')).toBe(false);
    expect(canTransition(undefined, 'RECEBIDO')).toBe(false);
  });
});

describe('protocol.state-machine — estados terminais', () => {
  it('CONCLUIDO não tem nenhuma transição de saída', () => {
    expect(getValidTransitions('CONCLUIDO')).toEqual([]);
  });

  it('CANCELADO não tem nenhuma transição de saída (RN07)', () => {
    expect(getValidTransitions('CANCELADO')).toEqual([]);
  });
});

describe('protocol.state-machine — fase técnica', () => {
  it('contém exatamente os 3 estados esperados', () => {
    expect(TECHNICAL_PHASE_STATES).toEqual([
      'EM_CONFIGURACAO', 'SOLICITADO_IP_VLAN', 'EM_CONTATO_CLIENTE',
    ]);
  });

  it('os 3 estados da fase técnica transitam livremente entre si', () => {
    TECHNICAL_PHASE_STATES.forEach((from) => {
      TECHNICAL_PHASE_STATES.forEach((to) => {
        if (from !== to) {
          expect(canTransition(from, to)).toBe(true);
        }
      });
    });
  });
});