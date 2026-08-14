/**
 * RF02 — Gerador de configuração de RouterBoards (Identity, RADIUS, NTP)
 *
 * Contrato: gerar(inputs) → resultado
 * Nenhuma referência a `document` aqui dentro — função pura, testável isoladamente.
 */

// --- Scripts fixos (não mudam por cliente) ---

const RADIUS_SCRIPT = `/ip service set [find ] address=187.85.161.248/29,189.45.192.0/26,177.54.10.0/29,189.90.48.131/32 disabled=no
/ip service set ftp,telnet,api,api-ssl disabled=yes
/radius remove [find ]
/radius add address=187.85.161.130 secret=99hxSGKae service=login
/radius incoming set accept=no
/user aaa
set default-group=read use-radius=yes
/user group add name=N1-Suporte policy=[/user group get value-name=policy number=[find name=full ]]
/system logging
set 0,1,2,3 action=disk
/system logging action set 3 remote=187.85.161.130 remote-port=8514
/system logging remove [find default=no]
/system logging add action=remote topics=critical
/system logging add action=remote topics=error,!ipsec
/system logging add action=remote topics=info,!dhcp,!firewall
/system logging add action=remote topics=warning,!dhcp
/ip dns
set servers=189.45.192.3,177.200.200.20`;

function gerarScriptNtp(versao) {
  if (versao === 'v6') {
    return `/system clock
set time-zone-name=America/Sao_Paulo
/system ntp client
set enabled=yes primary-ntp=189.45.192.3`;
  }
  return `/system clock
set time-zone-name=America/Sao_Paulo
/system ntp client
set enabled=yes
/system ntp client servers
add address=189.45.192.3
add address=177.200.200.20`;
}

// --- Normalização de texto (igual ao original) ---

function normalizarNome(nomeRaw) {
  const upper = nomeRaw.trim().toUpperCase();
  const semAcento = upper.normalize ? upper.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : upper;
  return semAcento.replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, '_');
}

// --- Validação ---

function validar(inputs) {
  const erros = [];
  if (!inputs.cidade?.trim()) erros.push('Cidade é obrigatória');
  if (!inputs.cliente?.trim()) erros.push('Código do cliente é obrigatório');
  if (!inputs.circuito?.trim()) erros.push('Circuito é obrigatório');
  if (!inputs.nome?.trim()) erros.push('Nome é obrigatório');
  return erros;
}

// --- Montagem da Identity ---

function montarIdentity(inputs) {
  const cidade = inputs.cidade.trim().toUpperCase();
  const cliente = inputs.cliente.trim();
  const circuito = inputs.circuito.trim();
  const nomeClean = normalizarNome(inputs.nome);

  if (inputs.modelo === 'interconexao') {
    return `CUST-RB-${inputs.tipo}-${inputs.local}-${cidade}-${cliente}-${circuito}-${nomeClean}`;
  }
  return `CUST-RB-${inputs.tipo}-${cidade}-${cliente}-${circuito}-${nomeClean}`;
}

// --- Montagem da observação ---

function montarObservacao(inputs) {
  const partes = [];

  if (inputs.mac) partes.push(`MAC: ${inputs.mac.trim().toUpperCase()}`);

  if (inputs.tipo === 'GPON' && inputs.sn) {
    partes.push(`SN: ${inputs.sn.trim().toUpperCase()}`);
  }
  if (inputs.tipo === 'PTP') {
    if (inputs.swLocal) partes.push(`SW: ${inputs.swLocal.trim().toUpperCase()}`);
    if (inputs.swRemoto) partes.push(`SW Remoto: ${inputs.swRemoto.trim().toUpperCase()}`);
  }

  if (inputs.modelo === 'dedicado') {
    if (inputs.ipPtpDedicado) partes.push(`PTP: ${inputs.ipPtpDedicado.trim()}`);
    if (inputs.ipRedeDedicado) partes.push(`Rede: ${inputs.ipRedeDedicado.trim()}`);
  }
  if (inputs.modelo === 'banda-larga' && inputs.ipFixado) {
    partes.push(`IP Fixado: ${inputs.ipFixado.trim()}`);
  }

  return partes.join(' | ');
}

/**
 * Função principal — contrato gerar(inputs) → resultado
 *
 * inputs esperado:
 * {
 *   modelo: 'dedicado' | 'banda-larga' | 'interconexao',
 *   tipo: 'GPON' | 'PTP',
 *   cidade, cliente, circuito, nome: string,
 *   local?: string,              // só se modelo === 'interconexao'
 *   mac?, sn?: string,            // GPON
 *   swLocal?, swRemoto?: string,  // PTP
 *   ipPtpDedicado?, ipRedeDedicado?: string,  // dedicado
 *   ipFixado?: string,            // banda-larga
 *   includeRadius: boolean,
 *   includeNtp: boolean,
 *   ntpVersao: 'v6' | 'v7',
 * }
 *
 * resultado:
 * {
 *   sucesso: boolean,
 *   erros: string[],
 *   identity: string,
 *   script: string,       // texto combinado (Identity + RADIUS + NTP conforme flags)
 *   observacao: string,   // string vazia se não houver nada a observar
 * }
 */
export function gerar(inputs) {
  const erros = validar(inputs);
  if (erros.length > 0) {
    return { sucesso: false, erros, identity: '', script: '', observacao: '' };
  }

  const identity = montarIdentity(inputs);
  const observacao = montarObservacao(inputs);

  let script = `--- IDENTITY ---\n/system identity set name="${identity}"\n\n`;

  if (inputs.includeRadius) {
    script += `--- RADIUS E SERVICOS ---\n${RADIUS_SCRIPT}\n\n`;
  }

  if (inputs.includeNtp) {
    script += `--- NTP (${inputs.ntpVersao}) ---\n${gerarScriptNtp(inputs.ntpVersao)}\n\n`;
  }

  return {
    sucesso: true,
    erros: [],
    identity,
    script: script.trim(),
    observacao,
  };
}

/**
 * Variante: gerar só o bloco RADIUS (equivalente a novoGerarSoRadius do MVP)
 */
export function gerarSoRadius() {
  return {
    sucesso: true,
    erros: [],
    script: `--- RADIUS E SERVICOS ---\n${RADIUS_SCRIPT}`,
  };
}

/**
 * Variante: gerar só o bloco NTP (equivalente a novoGerarSoNtp do MVP)
 */
export function gerarSoNtp(ntpVersao) {
  return {
    sucesso: true,
    erros: [],
    script: `--- NTP (${ntpVersao}) ---\n${gerarScriptNtp(ntpVersao)}`,
  };
}