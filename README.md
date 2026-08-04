cat > README.md << 'EOF'
# ConfigPanel

Sistema web interno para padronização de processos operacionais e gestão
do ciclo de vida de contratos B2B (setor de Configuração).

## Módulos
- **Módulo de Ferramentas** — utilitários operacionais (client-side, stateless)
- **Módulo Desk** — gestão de protocolos B2B (stateful, com FSM de status)

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Banco: PostgreSQL
- Deploy: Docker + Docker Compose

## Documentação
Ver `docs/adr/` para decisões arquiteturais, `docs/erd.md` para o modelo
de dados e `docs/api.md` para o contrato de API.

## Como rodar localmente
\`\`\`bash
docker-compose up
\`\`\`
EOF