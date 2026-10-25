import pool from '../database/connection.js';
import { canTransition, isValidState } from '../state-machine/protocol.state-machine.js';

const FIXED_FIELDS = ['topology'];

const UPDATABLE_FIELDS = [
    'protocol_number',
    'circuit_number',
    'client_name',
    'service_id',
    'delivery_method',
    'trunk_id',
    'address',
    'status',
    'assignee_id',
];


/**
 * Finds a protocol by its ID.
 * @param {string} id 
 * @returns {Promise<import('./Protocols.model').Protocol | null>}
 */
export async function findById(id) {
    const { rows } = await pool.query(
        'SELECT * FROM protocols WHERE id = $1', [id]);
    return rows[0] ?? null;
}

/**
 * Finds a protocol by its protocol number.
 * @param {string} protocol_number 
 * @returns {Promise<import('./Protocols.model').Protocol | null>}
 */
export async function findByProtocolNumber(protocol_number) {
    const { rows } = await pool.query(
        'SELECT * FROM protocols WHERE protocol_number = $1', [protocol_number]);
    return rows[0] ?? null;
}


/**
 * 
 * Lists protocols with optional filtering and pagination.
 * @param {object} options
 * @params {number} options.limit - Maximum number of protocols to return.
 * @params {number} options.offset - Number of protocols to skip before starting to collect the result set.
 * @params {string} options.status - Filter protocols by status.
 * @returns Promise<{ rows: import('./Protocols.model').Protocol[], total: number }>
 */
export async function list({ limit = 50, offset = 0, status } = {}) {
    const conditions = [];
    const parameters = [];

    if (status) {
        parameters.push(status);
        conditions.push(`status = $${parameters.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    parameters.push(limit);
    const limitIndex = parameters.length;

    parameters.push(offset);
    const offsetIndex = parameters.length;

    const { rows } = await pool.query(
        `SELECT * FROM protocols ${whereClause} ORDER BY created_at DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        parameters
    );

    const countParameters = parameters.slice(0, conditions.length);
    const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM protocols ${whereClause}`,
        countParameters
    );

    return { rows, total: countRows[0].total };
}

/**
 * Create a new protocolo with params especially
 * 
 * @param {object} protocol 
 * @param {string} protocol.protocol_number
 * @param {string} protocol.circuit_number
 * @param {string} protocol.client_name
 * @param {string} protocol.topology
 * @param {string} protocol.service_id
 * @param {string} protocol.delivery_method
 * @param {string} protocol.trunk_id
 * @param {string} protocol.address
 * @param {string} protocol.status
 * @param {string} protocol.assignee_id
 * @returns Promise<import('./Protocols.model').Protocol>       
 */
export async function create(protocol) {
    const { protocol_number, circuit_number, client_name, topology, service_id, delivery_method, trunk_id, address, status, assignee_id } = protocol;

    const { rows } = await pool.query(
        `INSERT INTO protocols (protocol_number, circuit_number, client_name, topology, service_id, delivery_method, trunk_id, address, status, assignee_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [protocol_number, circuit_number, client_name, topology, service_id, delivery_method, trunk_id, address, status, assignee_id]
    );
    return rows[0];
}



export async function update(id, changes) {
    const attemptedFixedFields = Object.keys(changes).filter((key) => FIXED_FIELDS.includes(key));

    if (attemptedFixedFields.length > 0) {
        const error = new Error(
            `Campo(s) imutável(is) após a abertura (RN08–RN09): ${attemptedFixedFields.join(', ')}. ` +
            'Mudança de topologia exige a abertura de um novo protocolo.'
        );
        error.code = 'RN08_TOPOLOGY_IMMUTABLE';
        throw error;
    }

    let current = null;

    // RN06 / FSM — valida transição de status, se houver mudança de status no PATCH
    if (changes.status) {
        current = await findById(id);
        if (!current) {
            return null; // deixa o controller tratar como 404
        }

        if (!isValidState(changes.status)) {
            const error = new Error(`Status inválido: ${changes.status}.`);
            error.code = 'INVALID_STATUS';
            throw error;
        }

        if (!canTransition(current.status, changes.status)) {
            const error = new Error(
                `Transição inválida: ${current.status} → ${changes.status} não é permitida pela máquina de estados.`
            );
            error.code = 'INVALID_TRANSITION';
            throw error;
        }

        // TODO: checklist obrigatório ao SAIR da fase técnica em direção a AGENDADO — checklist é dinâmico, ainda não modelado
    }

    const validChanges = Object.entries(changes).filter(([key]) =>
        UPDATABLE_FIELDS.includes(key)
    );

    if (validChanges.length === 0) {
        return findById(id);
    }

    const setClauses = validChanges.map(([key], idx) => `${key} = $${idx + 2}`);
    const values = validChanges.map(([, value]) => value);

    const { rows } = await pool.query(
        `UPDATE protocols SET ${setClauses.join(',')} WHERE id = $1 RETURNING *`,
        [id, ...values]
    );

    const updated = rows[0] ?? null;

    // RN06 — histórico automático e imutável a cada mudança de status aceita
    if (updated && changes.status) {
        await pool.query(
            `INSERT INTO protocol_history (protocol_id, status, note)
         VALUES ($1, $2, $3)`,
            [id, changes.status, `Transição: ${current.status} → ${changes.status}`]
        );
    } 

    return updated;
}

/**
 * Registra um IP (gerência, bloco ou PTP) em um protocolo (RF07).
 *
 * @param {string} protocolId
 * @param {object} ip
 * @param {string} ip.address
 * @param {string} ip.category - 'gerencia' | 'bloco' | 'ptp'
 * @param {string} [ip.ownership] - 'unifique' (padrão) | 'last_mile'
 * @returns Promise<object | null> - o IP criado, ou null se o protocolo não existe
 */
export async function createIp(protocolId, { address, category, ownership }) {
    const protocol = await findById(protocolId);
    if (!protocol) {
        return null; // deixa o controller tratar como 404
    }

    const { rows } = await pool.query(
        `INSERT INTO ips (protocol_id, address, category, ownership)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [protocolId, address, category, ownership ?? 'unifique']
    );
    return rows[0];
}

/**
 * Lista os IPs de um protocolo (RF07), do mais recente para o mais antigo.
 *
 * @param {string} protocolId
 * @returns Promise<{ rows: object[], total: number } | null> - null se o protocolo não existe
 */
export async function listIps(protocolId) {
    const protocol = await findById(protocolId);
    if (!protocol) {
        return null; // deixa o controller tratar como 404
    }

    const { rows } = await pool.query(
        'SELECT * FROM ips WHERE protocol_id = $1 ORDER BY created_at DESC',
        [protocolId]
    );
    return { rows, total: rows.length };
}

/**
 * Lista os equipamentos de um protocolo, do mais recente para o mais antigo.
 *
 * @param {string} protocolId
 * @returns Promise<{ rows: object[], total: number } | null> - null se o protocolo não existe
 */
export async function listEquipment(protocolId) {
    const protocol = await findById(protocolId);
    if (!protocol) {
        return null; // deixa o controller tratar como 404
    }

    const { rows } = await pool.query(
        'SELECT * FROM equipment WHERE protocol_id = $1 ORDER BY created_at DESC',
        [protocolId]
    );
    return { rows, total: rows.length };
}

/**
 * Registra um equipamento em um protocolo.
 *
 * @param {string} protocolId
 * @param {object} equipment
 * @param {string} equipment.model
 * @param {string} equipment.serial_number
 * @param {string} equipment.mac_address - já normalizado (AA:BB:CC:DD:EE:FF)
 * @param {string} [equipment.ownership] - 'unifique' (padrão) | 'last_mile'
 * @returns Promise<object | null> - o equipamento criado, ou null se o protocolo não existe
 */
export async function createEquipment(protocolId, { model, serial_number, mac_address, ownership }) {
    const protocol = await findById(protocolId);
    if (!protocol) {
        return null; // deixa o controller tratar como 404
    }

    const { rows } = await pool.query(
        `INSERT INTO equipment (protocol_id, model, serial_number, mac_address, ownership)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [protocolId, model, serial_number, mac_address, ownership ?? 'unifique']
    );
    return rows[0];
}

/**
 * Registra uma comunicação com o cliente em um protocolo (RF09).
 *
 * @param {string} protocolId
 * @param {object} communication
 * @param {string} communication.content
 * @returns Promise<object | null> - a comunicação criada, ou null se o protocolo não existe
 */
export async function createCommunication(protocolId, { content }) {
    const protocol = await findById(protocolId);
    if (!protocol) {
        return null; // deixa o controller tratar como 404
    }

    const { rows } = await pool.query(
        `INSERT INTO client_communications (protocol_id, content)
         VALUES ($1, $2) RETURNING *`,
        [protocolId, content]
    );
    return rows[0];
}

/**
 * Lista as comunicações com o cliente de um protocolo, da mais recente para a mais antiga.
 *
 * @param {string} protocolId
 * @returns Promise<{ rows: object[], total: number } | null> - null se o protocolo não existe
 */
export async function listCommunications(protocolId) {
    const protocol = await findById(protocolId);
    if (!protocol) {
        return null; // deixa o controller tratar como 404
    }

    const { rows } = await pool.query(
        'SELECT * FROM client_communications WHERE protocol_id = $1 ORDER BY created_at DESC',
        [protocolId]
    );
    return { rows, total: rows.length };
}

/**
 * Lista os itens do checklist de um protocolo, do mais recente para o mais antigo (RF10).
 *
 * @param {string} protocolId
 * @returns Promise<{ rows: object[], total: number } | null> - null se o protocolo não existe
 */
export async function listChecklistItems(protocolId) {
    const protocol = await findById(protocolId);
    if (!protocol) {
        return null; // deixa o controller tratar como 404
    }

    const { rows } = await pool.query(
        'SELECT * FROM checklist_items WHERE protocol_id = $1 ORDER BY created_at DESC',
        [protocolId]
    );
    return { rows, total: rows.length };
}

/**
 * Registra um item no checklist de um protocolo (RF10).
 *
 * @param {string} protocolId
 * @param {object} item
 * @param {string} item.item_type - 'equipment', 'ip_vlan' ou 'client_contact'
 * @param {boolean} [item.is_required] - se omitido, vale o default do banco (true)
 * @returns Promise<object | null> - o item criado, ou null se o protocolo não existe
 */
export async function createChecklistItem(protocolId, { item_type, is_required }) {
    const protocol = await findById(protocolId);
    if (!protocol) {
        return null; // deixa o controller tratar como 404
    }

    const { rows } = await pool.query(
        `INSERT INTO checklist_items (protocol_id, item_type, is_required)
         VALUES ($1, $2, COALESCE($3, true)) RETURNING *`,
        [protocolId, item_type, is_required]
    );
    return rows[0];
}

/**
 * Atualiza o estado de um item do checklist de um protocolo (RF10).
 * Com is_done=true grava completed_at=NOW() e completed_by=userId; com false zera os dois.
 * Marcar true de novo regrava completed_at e completed_by.
 *
 * @param {string} protocolId
 * @param {string} itemId
 * @param {object} data
 * @param {boolean} data.is_done
 * @param {string} data.userId - id (UUID) do usuário autenticado
 * @returns Promise<object | null> - o item atualizado, ou null se o protocolo ou o item não existe, ou se o item é de outro protocolo
 */
export async function updateChecklistItem(protocolId, itemId, { is_done, userId }) {
    const { rows } = await pool.query(
        `UPDATE checklist_items
         SET is_done = $3::boolean,
             completed_at = CASE WHEN $3::boolean THEN NOW() ELSE NULL END,
             completed_by = CASE WHEN $3::boolean THEN $4::uuid ELSE NULL END
         WHERE id = $1 AND protocol_id = $2
         RETURNING *`,
        [itemId, protocolId, is_done, userId]
    );
    return rows[0] ?? null; // deixa o controller tratar como 404
}
