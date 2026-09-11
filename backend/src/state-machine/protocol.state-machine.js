/**
 * State Machine do Protocolo B2B (Módulo Desk)
 *
 * Formaliza o ciclo de vida do protocolo como uma FSM (Seção 15 do SAD).
 * Função pura: não toca banco, não conhece checklist — só sabe se o salto
 * de um estado para outro é estruturalmente permitido.
 */

export const PROTOCOL_STATES = [
    'RECEBIDO',
    'EM_ANALISE',
    'EM_CONFIGURACAO',
    'SOLICITADO_IP_VLAN',
    'EM_CONTATO_CLIENTE',
    'AGENDADO',
    'EM_INSTALACAO',
    'EM_VALIDACAO',
    'CONCLUIDO',
    'SUSPENSO',
    'CANCELADO',
    'PROBLEMA_INFRA',
];

/**
 * Mapa de transições válidas. Chave = estado atual, valor = estados de destino permitidos.
 * Estados terminais (CONCLUIDO, CANCELADO) têm array vazio.
 */
const TRANSITIONS = {
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

/**
 * Estados que compõem a "fase técnica" (sub-máquina de trânsito livre — Seção 15.2 do SAD).
 * Usado pela regra de checklist: só exige checklist completo ao sair da fase técnica para AGENDADO.
 */
export const TECHNICAL_PHASE_STATES = ['EM_CONFIGURACAO', 'SOLICITADO_IP_VLAN', 'EM_CONTATO_CLIENTE'];

/**
 * Verifica se um estado é válido (existe na FSM).
 * @param {string} state
 * @returns {boolean}
 */
export function isValidState(state) {
    return PROTOCOL_STATES.includes(state);
}

/**
 * Verifica se a transição de `from` para `to` é permitida pela FSM.
 * @param {string} from - Estado atual do protocolo.
 * @param {string} to - Estado de destino pretendido.
 * @returns {boolean}
 */
export function canTransition(from, to) {
    if (!isValidState(from) || !isValidState(to)) {
        return false;
    }
    return TRANSITIONS[from].includes(to);
}

/**
 * Retorna a lista de destinos válidos a partir de um estado.
 * Útil para expor no futuro em GET /protocols/:id (ex: "próximos passos possíveis").
 * @param {string} from
 * @returns {string[]}
 */
export function getValidTransitions(from) {
    return isValidState(from) ? TRANSITIONS[from] : [];
}