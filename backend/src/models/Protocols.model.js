import pool from '../database/connection.js';

/**
 * Model: protocols
 * Aggregate Root do Módulo Desk (Seção 9.2 do SAD).
 *
 * RF16 — dados fixos são imutáveis após abertura; RF17 — dados dinâmicos são editáveis.
 */

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
        error.code = "RN08_TOPOLOGY_IMMUTABLE"; throw error;
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
        `UPDATE protocols SET ${setClauses.join(`,`)} WHERE id = $1 RETURNING *`,
        [id, ...values]
    );
    return rows[0] ?? null;
}