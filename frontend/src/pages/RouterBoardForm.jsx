import { useState } from 'react';
import { gerar, gerarSoRadius, gerarSoNtp } from '../tools/gerarRouterboard.js';

export default function RouterBoardForm() {
  // Cada campo do formulário original vira um state.
  // Isso substitui document.getElementById('novo-cidade').value, etc.
  const [modelo, setModelo] = useState('banda-larga');
  const [tipo, setTipo] = useState('GPON');
  const [local, setLocal] = useState('FL');
  const [cidade, setCidade] = useState('');
  const [cliente, setCliente] = useState('');
  const [circuito, setCircuito] = useState('');
  const [nome, setNome] = useState('');
  const [mac, setMac] = useState('');
  const [sn, setSn] = useState('');
  const [swLocal, setSwLocal] = useState('');
  const [ipPtpDedicado, setIpPtpDedicado] = useState('');
  const [ipRedeDedicado, setIpRedeDedicado] = useState('');
  const [ipFixado, setIpFixado] = useState('');
  const [includeRadius, setIncludeRadius] = useState(true);
  const [includeNtp, setIncludeNtp] = useState(true);
  const [ntpVersao, setNtpVersao] = useState('v6');

  // Isso substitui a escrita direta em resultBox.textContent
  const [resultado, setResultado] = useState(null);
  const [copiado, setCopiado] = useState(false);

  function montarInputs() {
    return {
      modelo,
      tipo,
      local,
      cidade,
      cliente,
      circuito,
      nome,
      mac,
      sn,
      swLocal,
      ipPtpDedicado,
      ipRedeDedicado,
      ipFixado,
      includeRadius,
      includeNtp,
      ntpVersao,
    };
  }

  function handleGerar() {
    setResultado(gerar(montarInputs()));
  }

  function handleSoRadius() {
    setResultado(gerarSoRadius());
  }

  function handleSoNtp() {
    setResultado(gerarSoNtp(ntpVersao));
  }

  function handleLimpar() {
    setCidade('');
    setCliente('');
    setCircuito('');
    setNome('');
    setMac('');
    setSn('');
    setSwLocal('');
    setIpPtpDedicado('');
    setIpRedeDedicado('');
    setIpFixado('');
    setResultado(null);
  }

  function handleCopiar() {
    if (!resultado?.script) return;
    const texto = resultado.observacao
      ? `${resultado.script}\n\n--- OBSERVACAO ---\n${resultado.observacao}`
      : resultado.script;
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const temErros = resultado && resultado.erros && resultado.erros.length > 0;

  return (
    <div className="page active">
      <div className="tool-page-header">
        <div>
          <h2>Novo Acesso</h2>
          <p>Ferramenta unificada para provisionamento de equipamentos.</p>
        </div>
      </div>

      <div className="form-full">
        <div className="layout-duas-colunas">
          {/* COLUNA ESQUERDA (Dados do Cliente) */}
          <div>
            <div className="form-card">
              <div className="form-card-title">Configuração Básica</div>
              <div className="grid-2">
                <div className="campo">
                  <label>Plano</label>
                  <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
                    <option value="banda-larga">Banda Larga</option>
                    <option value="dedicado">Dedicado</option>
                    <option value="interconexao">Interconexão</option>
                  </select>
                </div>
                <div className="campo">
                  <label>Tipo de Acesso</label>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    <option value="GPON">GPON</option>
                    <option value="PTP">PTP</option>
                  </select>
                </div>
              </div>
              {modelo === 'interconexao' && (
                <div className="campo" style={{ marginTop: 16 }}>
                  <label>Local</label>
                  <select value={local} onChange={(e) => setLocal(e.target.value)}>
                    <option value="FL">Filial</option>
                    <option value="CONC">Concentrador</option>
                  </select>
                </div>
              )}
            </div>

            <div className="form-card">
              <div className="form-card-title">Identificador do equipamento</div>
              <div className="grid-3-7" style={{ marginBottom: 16 }}>
                <div className="campo">
                  <label>Sigla</label>
                  <input
                    type="text"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder="Ex: BCU"
                  />
                </div>
                <div className="campo">
                  <label>Código Cliente</label>
                  <input
                    type="text"
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    placeholder="Ex: 309983"
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="campo">
                  <label>Circuito</label>
                  <input
                    type="text"
                    value={circuito}
                    onChange={(e) => setCircuito(e.target.value)}
                    placeholder="Ex: 03581917001"
                  />
                </div>
                <div className="campo">
                  <label>Nome do Cliente</label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: INPLAC"
                  />
                </div>
              </div>
            </div>

            <div className="form-card">
              <div className="form-card-title">Observação do Novo Cadastro</div>

              <div className="campo" style={{ marginBottom: 16 }}>
                <label>MAC Address</label>
                <input
                  type="text"
                  value={mac}
                  onChange={(e) => setMac(e.target.value)}
                  placeholder="Ex: 78:9A:18:F4:93:F5"
                />
              </div>

              {tipo === 'GPON' && (
                <div className="campo" style={{ marginBottom: 16 }}>
                  <label>SN ONU</label>
                  <input
                    type="text"
                    value={sn}
                    onChange={(e) => setSn(e.target.value)}
                    placeholder="Ex: ZTEGCCE7FF93"
                  />
                </div>
              )}

              {tipo === 'PTP' && (
                <div style={{ marginBottom: 16 }}>
                  <div className="campo">
                    <label>Switch Local + Porta</label>
                    <input
                      type="text"
                      value={swLocal}
                      onChange={(e) => setSwLocal(e.target.value)}
                      placeholder="Ex: SW-BKB-GPR-C XGE0/0/41"
                    />
                  </div>
                </div>
              )}

              {modelo === 'dedicado' && (
                <div style={{ marginBottom: 16 }}>
                  <div className="grid-2">
                    <div className="campo">
                      <label>IP PTP (/31)</label>
                      <input
                        type="text"
                        value={ipPtpDedicado}
                        onChange={(e) => setIpPtpDedicado(e.target.value)}
                        placeholder="Ex: 172.30.150.72/31"
                      />
                    </div>
                    <div className="campo">
                      <label>IP da Rede (/30)</label>
                      <input
                        type="text"
                        value={ipRedeDedicado}
                        onChange={(e) => setIpRedeDedicado(e.target.value)}
                        placeholder="Ex: 189.90.50.12/30"
                      />
                    </div>
                  </div>
                </div>
              )}

              {modelo === 'banda-larga' && (
                <div className="campo" style={{ marginBottom: 16 }}>
                  <label>IP Fixado (Se houver)</label>
                  <input
                    type="text"
                    value={ipFixado}
                    onChange={(e) => setIpFixado(e.target.value)}
                    placeholder="Ex: 189.90.50.10"
                  />
                </div>
              )}
            </div>
          </div>

          {/* COLUNA DIREITA (Ações e Resultados) */}
          <div>
            <div className="form-card" style={{ padding: 16, marginBottom: 16 }}>
              <div className="form-card-title" style={{ marginBottom: 12, paddingBottom: 8 }}>
                Opções de Provisionamento
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 24,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text2)',
                    textTransform: 'uppercase',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeRadius}
                    onChange={(e) => setIncludeRadius(e.target.checked)}
                    style={{ width: 'auto', accentColor: 'var(--accent)', margin: 0 }}
                  />
                  Incluir RADIUS / DNS
                </label>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text2)',
                      textTransform: 'uppercase',
                      marginBottom: 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={includeNtp}
                      onChange={(e) => setIncludeNtp(e.target.checked)}
                      style={{ width: 'auto', accentColor: 'var(--accent)', margin: 0 }}
                    />
                    Incluir NTP
                  </label>
                  <select
                    value={ntpVersao}
                    onChange={(e) => setNtpVersao(e.target.value)}
                    style={{
                      padding: '4px 8px',
                      fontSize: 12,
                      width: 'auto',
                      minWidth: 110,
                      background: 'var(--bg3)',
                      color: 'var(--text)',
                      border: '1px solid var(--border2)',
                      borderRadius: 'var(--radius-sm)',
                      outline: 'none',
                    }}
                  >
                    <option value="v6">RouterOS v6</option>
                    <option value="v7">RouterOS v7</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={handleGerar}
                >
                  Gerar Tudo
                </button>
                <button
                  className="btn btn-success"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={handleCopiar}
                >
                  Copiar Tudo
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={handleSoRadius}
                >
                  Só RADIUS
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={handleSoNtp}
                >
                  Só NTP
                </button>
                <button
                  className="btn btn-danger"
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: 'var(--red)',
                    marginLeft: 'auto',
                  }}
                  onClick={handleLimpar}
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="form-card">
              <div className="form-card-title">Resultados</div>

              {temErros ? (
                <div className="resultado-box" style={{ marginTop: 0, color: 'var(--red)' }}>
                  {resultado.erros.map((erro) => (
                    <div key={erro}>{erro}</div>
                  ))}
                </div>
              ) : (
                <>
                  <div
                    className="resultado-box"
                    style={{ marginTop: 0, display: resultado?.script ? 'block' : 'none' }}
                  >
                    {resultado?.script || '—'}
                  </div>
                  <div
                    className="resultado-box"
                    style={{
                      display: resultado?.observacao ? 'block' : 'none',
                      minHeight: 40,
                      fontWeight: 'bold',
                    }}
                  >
                    {resultado?.observacao || '—'}
                  </div>
                </>
              )}

              <div className={`copiado-msg${copiado ? ' visible' : ''}`}>
                ✓ Copiado para a área de transferência!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
