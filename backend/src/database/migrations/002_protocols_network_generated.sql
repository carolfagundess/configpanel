-- Migration 002 — ConfigPanel / Módulo Desk
-- Converte protocols.network de coluna comum (com CHECK) para generated column,
-- derivada de topology. Implementa RN08–RN09 em nível de schema:
--   topology IN ('GPON', 'PTP') → network = 'unifique'
--   qualquer outra topology     → network = 'last_mile'
--
-- O DROP COLUMN remove automaticamente as constraints CHECK que referenciam
-- network: protocols_network_check (redundante após a mudança — a expressão
-- CASE já garante só 'unifique'/'last_mile') e chk_delivery_method_last_mile
-- (RN10 — precisa ser recriada, pois continua sendo regra de negócio válida).

ALTER TABLE protocols DROP COLUMN network;

ALTER TABLE protocols ADD COLUMN network VARCHAR(20) GENERATED ALWAYS AS (
  CASE WHEN topology IN ('GPON', 'PTP') THEN 'unifique' ELSE 'last_mile' END
) STORED;

ALTER TABLE protocols ADD CONSTRAINT chk_delivery_method_last_mile
  CHECK (network <> 'last_mile' OR delivery_method IS NOT NULL);
