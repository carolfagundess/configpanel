import net from 'node:net';
import * as ProtocolsModel from '../models/Protocols.model.js';

const VALID_TOPOLOGIES_UNIFIQUE = ['GPON', 'PTP'];
const VALID_DELIVERY_METHODS = ['trunk', 'ip_publico', 'equipamento'];
const VALID_IP_CATEGORIES = ['gerencia', 'bloco', 'ptp'];
const VALID_IP_OWNERSHIPS = ['unifique', 'last_mile'];
const VALID_EQUIPMENT_OWNERSHIPS = ['unifique', 'last_mile'];

/**
 * Aceita IPv4, IPv6 ou CIDR (ip/prefixo), com no máximo 100 caracteres (limite da coluna ips.address).
 */
function isValidIpOrCidr(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 100) return false;
    const [ip, prefix, ...rest] = value.split('/');
    if (rest.length > 0) return false;
    const version = net.isIP(ip);
    if (!version) return false;
    if (prefix === undefined) return true;
    return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (version === 4 ? 32 : 128);
}

/**
 * Normaliza um MAC para AA:BB:CC:DD:EE:FF. Aceita separadores ':', '-' e '.' (ou nenhum),
 * em maiúsculas ou minúsculas. Devolve null se não sobrarem exatamente 12 dígitos hexadecimais.
 */
function normalizeMac(value) {
    if (typeof value !== 'string') return null;
    const hex = value.trim().replace(/[:\-.]/g, '');
    if (!/^[0-9a-fA-F]{12}$/.test(hex)) return null;
    return hex.toUpperCase().match(/.{2}/g).join(':');
}

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

/**
 * GET /protocols
 * Lista protocolos com paginação e filtro opcional por status (RF14).
 * Query params: ?limit=50&offset=0&status=RECEBIDO
 */
export async function listProtocols(req, res) {
    const { limit, offset, status } = req.query;

    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;

    if (limit && (isNaN(parsedLimit) || parsedLimit <= 0)) {
        return res.status(400).json({ error: 'limit deve ser um número positivo.' });
    }
    if (offset && (isNaN(parsedOffset) || parsedOffset < 0)) {
        return res.status(400).json({ error: 'offset deve ser um número não negativo.' });
    }

    try {
        const result = await ProtocolsModel.list({
            limit: parsedLimit,
            offset: parsedOffset,
            status,
        });
        return res.status(200).json(result);
    } catch (err) {
        console.error('Erro ao listar protocolos:', err);
        return res.status(500).json({ error: 'Erro interno ao listar protocolos.' });
    }
}

/**
 * GET /protocols/:id
 * Busca um protocolo específico por ID.
 */
export async function getProtocolById(req, res) {
    const { id } = req.params;

    try {
        const protocol = await ProtocolsModel.findById(id);
        if (!protocol) {
            return res.status(404).json({ error: `Protocolo com id ${id} não encontrado.` });
        }
        return res.status(200).json(protocol);
    } catch (err) {
        if (err.code === '22P02') {
            return res.status(400).json({ error: `Formato de id inválido: ${id}.` });
        }
        console.error('Erro ao buscar protocolo:', err);
        return res.status(500).json({ error: 'Erro interno ao buscar protocolo.' });
    }
}

export async function updateProtocol(req, res) {
    const { id } = req.params;
    const changes = req.body;

    if (!changes || Object.keys(changes).length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar foi fornecido.' });
    }

    try {
        const updatedProtocol = await ProtocolsModel.update(id, changes);
        if (!updatedProtocol) {
            return res.status(404).json({ error: `Protocolo com id ${id} não encontrado.` });
        }
        return res.status(200).json(updatedProtocol);
    } catch (err) {
        // RN08-09 — tentativa de alterar campo fixo (topology)
        if (err.code === 'RN08_TOPOLOGY_IMMUTABLE') {
            return res.status(400).json({ error: err.message });
        }
        // Status inexistente na FSM (nem chegou a tentar transição)
        if (err.code === 'INVALID_STATUS') {
            return res.status(400).json({ error: err.message });
        }
        // Status válido, mas transição não permitida a partir do estado atual (RN06 / FSM)
        if (err.code === 'INVALID_TRANSITION') {
            return res.status(400).json({ error: err.message });
        }
        // UUID malformado
        if (err.code === '22P02') {
            return res.status(400).json({ error: `Formato de id inválido: ${id}.` });
        }
        // Constraint chk_delivery_method_last_mile (RN10), se a atualização violar a regra
        if (err.code === '23514') {
            return res.status(400).json({
                error: 'Violação de regra de negócio: delivery_method é obrigatório para protocolos Last Mile (RN10).',
            });
        }
        console.error('Erro ao atualizar protocolo:', err);
        return res.status(500).json({ error: 'Erro interno ao atualizar protocolo.' });
    }
}

/**
 * POST /protocols/:id/ips
 * Registra um IP no protocolo (RF07). Corpo: { address, category, ownership? }.
 */
export async function createProtocolIp(req, res) {
    const { id } = req.params;
    const { address, category, ownership } = req.body ?? {};

    if (!address || !category) {
        return res.status(400).json({ error: 'Campos obrigatórios ausentes: address, category.' });
    }
    if (!isValidIpOrCidr(address)) {
        return res.status(400).json({ error: 'address inválido. Informe um IPv4, IPv6 ou CIDR.' });
    }
    if (!VALID_IP_CATEGORIES.includes(category)) {
        return res.status(400).json({
            error: `category inválida. Valores aceitos: ${VALID_IP_CATEGORIES.join(', ')}.`,
        });
    }
    if (ownership !== undefined && !VALID_IP_OWNERSHIPS.includes(ownership)) {
        return res.status(400).json({
            error: `ownership inválido. Valores aceitos: ${VALID_IP_OWNERSHIPS.join(', ')}.`,
        });
    }

    try {
        const ip = await ProtocolsModel.createIp(id, { address, category, ownership });
        if (!ip) {
            return res.status(404).json({ error: `Protocolo com id ${id} não encontrado.` });
        }
        return res.status(201).json(ip);
    } catch (err) {
        if (err.code === '22P02') {
            return res.status(400).json({ error: `Formato de id inválido: ${id}.` });
        }
        console.error('Erro ao registrar IP do protocolo:', err);
        return res.status(500).json({ error: 'Erro interno ao registrar IP do protocolo.' });
    }
}

/**
 * GET /protocols/:id/ips
 * Lista os IPs registrados no protocolo (RF07).
 */
export async function listProtocolIps(req, res) {
    const { id } = req.params;

    try {
        const result = await ProtocolsModel.listIps(id);
        if (!result) {
            return res.status(404).json({ error: `Protocolo com id ${id} não encontrado.` });
        }
        return res.status(200).json(result);
    } catch (err) {
        if (err.code === '22P02') {
            return res.status(400).json({ error: `Formato de id inválido: ${id}.` });
        }
        console.error('Erro ao listar IPs do protocolo:', err);
        return res.status(500).json({ error: 'Erro interno ao listar IPs do protocolo.' });
    }
}

/**
 * GET /protocols/:id/equipamentos
 * Lista os equipamentos registrados no protocolo.
 */
export async function listProtocolEquipment(req, res) {
    const { id } = req.params;

    try {
        const result = await ProtocolsModel.listEquipment(id);
        if (!result) {
            return res.status(404).json({ error: `Protocolo com id ${id} não encontrado.` });
        }
        return res.status(200).json(result);
    } catch (err) {
        if (err.code === '22P02') {
            return res.status(400).json({ error: `Formato de id inválido: ${id}.` });
        }
        console.error('Erro ao listar equipamentos do protocolo:', err);
        return res.status(500).json({ error: 'Erro interno ao listar equipamentos do protocolo.' });
    }
}

/**
 * POST /protocols/:id/equipamentos
 * Registra um equipamento no protocolo. Corpo: { model, serial_number, mac_address, ownership? }.
 * O mac_address é normalizado para AA:BB:CC:DD:EE:FF.
 */
export async function createProtocolEquipment(req, res) {
    const { id } = req.params;
    const { model, serial_number, mac_address, ownership } = req.body ?? {};

    const isFilled = (value) => typeof value === 'string' && value.trim().length > 0;
    if (!isFilled(model) || !isFilled(serial_number) || !isFilled(mac_address)) {
        return res.status(400).json({
            error: 'Campos obrigatórios ausentes ou inválidos: model, serial_number, mac_address (texto não vazio).',
        });
    }
    if (model.trim().length > 255) {
        return res.status(400).json({ error: 'model inválido. Máximo de 255 caracteres.' });
    }
    if (serial_number.trim().length > 100) {
        return res.status(400).json({ error: 'serial_number inválido. Máximo de 100 caracteres.' });
    }
    const mac = normalizeMac(mac_address);
    if (!mac) {
        return res.status(400).json({ error: 'mac_address inválido. Informe 12 dígitos hexadecimais.' });
    }
    if (ownership !== undefined && !VALID_EQUIPMENT_OWNERSHIPS.includes(ownership)) {
        return res.status(400).json({
            error: `ownership inválido. Valores aceitos: ${VALID_EQUIPMENT_OWNERSHIPS.join(', ')}.`,
        });
    }

    try {
        const equipment = await ProtocolsModel.createEquipment(id, {
            model: model.trim(),
            serial_number: serial_number.trim(),
            mac_address: mac,
            ownership,
        });
        if (!equipment) {
            return res.status(404).json({ error: `Protocolo com id ${id} não encontrado.` });
        }
        return res.status(201).json(equipment);
    } catch (err) {
        if (err.code === '22P02') {
            return res.status(400).json({ error: `Formato de id inválido: ${id}.` });
        }
        console.error('Erro ao registrar equipamento do protocolo:', err);
        return res.status(500).json({ error: 'Erro interno ao registrar equipamento do protocolo.' });
    }
}

/**
 * POST /protocols/:id/comunicacoes
 * Registra uma comunicação com o cliente no protocolo (RF09). Corpo: { content }.
 */
export async function createProtocolCommunication(req, res) {
    const { id } = req.params;
    const { content } = req.body ?? {};

    if (typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({
            error: 'Campo obrigatório ausente ou inválido: content (texto não vazio).',
        });
    }

    try {
        const communication = await ProtocolsModel.createCommunication(id, { content: content.trim() });
        if (!communication) {
            return res.status(404).json({ error: `Protocolo com id ${id} não encontrado.` });
        }
        return res.status(201).json(communication);
    } catch (err) {
        if (err.code === '22P02') {
            return res.status(400).json({ error: `Formato de id inválido: ${id}.` });
        }
        console.error('Erro ao registrar comunicação do protocolo:', err);
        return res.status(500).json({ error: 'Erro interno ao registrar comunicação do protocolo.' });
    }
}

/**
 * GET /protocols/:id/comunicacoes
 * Lista as comunicações com o cliente registradas no protocolo.
 */
export async function listProtocolCommunications(req, res) {
    const { id } = req.params;

    try {
        const result = await ProtocolsModel.listCommunications(id);
        if (!result) {
            return res.status(404).json({ error: `Protocolo com id ${id} não encontrado.` });
        }
        return res.status(200).json(result);
    } catch (err) {
        if (err.code === '22P02') {
            return res.status(400).json({ error: `Formato de id inválido: ${id}.` });
        }
        console.error('Erro ao listar comunicações do protocolo:', err);
        return res.status(500).json({ error: 'Erro interno ao listar comunicações do protocolo.' });
    }
}

/**
 * GET /protocols/:id/checklist
 * Lista os itens do checklist registrados no protocolo (RF10).
 */
export async function listProtocolChecklist(req, res) {
    const { id } = req.params;

    try {
        const result = await ProtocolsModel.listChecklistItems(id);
        if (!result) {
            return res.status(404).json({ error: `Protocolo com id ${id} não encontrado.` });
        }
        return res.status(200).json(result);
    } catch (err) {
        if (err.code === '22P02') {
            return res.status(400).json({ error: `Formato de id inválido: ${id}.` });
        }
        console.error('Erro ao listar checklist do protocolo:', err);
        return res.status(500).json({ error: 'Erro interno ao listar checklist do protocolo.' });
    }
}
