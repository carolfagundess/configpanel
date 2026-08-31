import * as ProtocolsModel from '../models/Protocols.model.js';

const VALID_TOPOLOGIES_UNIFIQUE = ['GPON', 'PTP'];
const VALID_DELIVERY_METHODS = ['trunk', 'ip_publico', 'equipamento'];

/**
 * Determina se a topologia será Unifique ou LastMile,
 * Lógica generated column 
 */
function resolveNetwork(topology) {
    return VALID_TOPOLOGIES_UNIFIQUE.includes(topology) ? "unifique" : "last_mile";
}

/**
 * POST /protocols
 *
 */
export async function createProtocol(req, res) {
    const {
        protocol_number,
        circuit_number,
        client_name,
        topology,
        service_id,
        delivery_method,
        trunk_id,
        address,
        assignee_id,
    } = req.body;

    // Campos obrigatórios básicos
    if (!protocol_number || !circuit_number || !client_name || !topology || !address) {
        return res.status(400).json({
            error: 'Campos obrigatórios ausentes: protocol_number, circuit_number, client_name, topology, address.',
        });
    }

    // RN10 — Last Mile exige delivery_method válido (trunk / ip_publico / equipamento)
    const network = resolveNetwork(topology);
    if (network === 'last_mile') {
        if (!delivery_method) {
            return res.status(400).json({
                error: 'delivery_method é obrigatório para protocolos Last Mile (RN10).',
            });
        }
        if (!VALID_DELIVERY_METHODS.includes(delivery_method)) {
            return res.status(400).json({
                error: `delivery_method inválido. Valores aceitos: ${VALID_DELIVERY_METHODS.join(', ')}.`,
            });
        }
    }

    // Verifica duplicidade do número de protocolo (já existente no sistema comercial)
    const existing = await ProtocolsModel.findByProtocolNumber(protocol_number);
    if (existing) {
        return res.status(409).json({
            error: `Já existe um protocolo cadastrado com o número ${protocol_number}.`,
        });
    }

    try {
        const protocol = await ProtocolsModel.create({
            protocol_number,
            circuit_number,
            client_name,
            topology,
            service_id: service_id ?? null,
            delivery_method: delivery_method ?? null,
            trunk_id: trunk_id ?? null,
            address,
            status: 'RECEBIDO',
            assignee_id: assignee_id ?? null,
        });
        return res.status(201).json(protocol);
    } catch (err) {
        // Defesa em profundidade: constraint UNIQUE do banco pega race conditions
        if (err.code === '23505') {
            return res.status(409).json({
                error: `Já existe um protocolo cadastrado com o número ${protocol_number}.`,
            });
        }
        // Constraint chk_delivery_method_last_mile (RN10), caso escape da validação acima
        if (err.code === '23514') {
            return res.status(400).json({
                error: 'Violação de regra de negócio: delivery_method é obrigatório para protocolos Last Mile (RN10).',
            });
        }
        console.error('Erro ao criar protocolo:', err);
        return res.status(500).json({ error: 'Erro interno ao criar protocolo.' });
    }
}



