-- Migration 003 — ConfigPanel / Módulo Desk
-- Implementa RN06 (histórico de movimentações é imutável — nunca editado
-- ou excluído) como defesa em profundidade no nível de banco de dados.
--
CREATE OR REPLACE FUNCTION protocol_history_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'protocol_history é imutável (RN06): % não é permitido nesta tabela', TG_OP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_protocol_history_no_update
BEFORE UPDATE ON protocol_history
FOR EACH ROW EXECUTE FUNCTION protocol_history_immutable();

CREATE OR REPLACE TRIGGER trg_protocol_history_no_delete
BEFORE DELETE ON protocol_history
FOR EACH ROW EXECUTE FUNCTION protocol_history_immutable();