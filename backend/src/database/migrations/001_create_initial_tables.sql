-- Migration 001 — Tabelas iniciais do ConfigPanel
-- Baseado no ERD (Seção 15 do SAD)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Usuários do sistema
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tipos de serviço/plano (customizável pela interface)
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Trunks (pontos de entrega Last Mile)
CREATE TABLE IF NOT EXISTS trunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Protocolos B2B (núcleo do Módulo Desk)
CREATE TABLE IF NOT EXISTS protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_number VARCHAR(100) NOT NULL UNIQUE,
  circuit_number VARCHAR(100) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  topology VARCHAR(50) NOT NULL,
  network VARCHAR(20) NOT NULL CHECK (network IN ('unifique', 'last_mile')),
  service_id UUID REFERENCES services(id),
  delivery_method VARCHAR(50),
  trunk_id UUID REFERENCES trunks(id),
  address TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'RECEBIDO',
  assignee_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_delivery_method_last_mile CHECK (
    network <> 'last_mile' OR delivery_method IS NOT NULL
  )
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protocols_updated_at
BEFORE UPDATE ON protocols
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Histórico de movimentações (imutável — nunca atualizado ou deletado)
CREATE TABLE IF NOT EXISTS protocol_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES protocols(id),
  status VARCHAR(50) NOT NULL,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT NOW(),
  note TEXT
);

-- IPs vinculados ao protocolo
CREATE TABLE IF NOT EXISTS ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES protocols(id),
  address VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('gerencia', 'bloco', 'ptp')),
  ownership VARCHAR(20) NOT NULL DEFAULT 'unifique' CHECK (ownership IN ('unifique', 'last_mile')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Equipamentos configurados
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES protocols(id),
  model VARCHAR(255) NOT NULL,
  serial_number VARCHAR(100),
  mac_address VARCHAR(17),
  ownership VARCHAR(20) NOT NULL DEFAULT 'unifique' CHECK (ownership IN ('unifique', 'last_mile')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Comunicações com o cliente
CREATE TABLE IF NOT EXISTS client_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES protocols(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Checklist de controle da fase técnica
CREATE TABLE IF NOT EXISTS checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES protocols(id),
  item_type VARCHAR(50) NOT NULL CHECK (item_type IN ('equipment', 'ip_vlan', 'client_contact')),
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_done BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP,
  completed_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para otimizar buscas frequentes
CREATE INDEX IF NOT EXISTS idx_protocols_status ON protocols(status);
CREATE INDEX IF NOT EXISTS idx_protocols_protocol_number ON protocols(protocol_number);
CREATE INDEX IF NOT EXISTS idx_protocol_history_protocol_id ON protocol_history(protocol_id);
CREATE INDEX IF NOT EXISTS idx_ips_protocol_id ON ips(protocol_id);
CREATE INDEX IF NOT EXISTS idx_equipment_protocol_id ON equipment(protocol_id);

-- Dados iniciais de serviços
INSERT INTO services (name) VALUES
  ('Banda Larga'),
  ('Dedicado'),
  ('Interconexão'),
  ('BGP'),
  ('Wifi Business')
ON CONFLICT DO NOTHING;