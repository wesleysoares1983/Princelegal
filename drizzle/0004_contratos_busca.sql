-- Busca de contratos por trecho, sem diferenciar acento nem maiuscula
-- ("locacao curit" acha "Locação – Unidade Curitiba"). A expressao precisa ser
-- a mesma de lib/server/db/consultas/contratos.ts (textoBusca) para o indice
-- ser usado.
CREATE INDEX contratos_busca_trgm ON contratos USING gin (
  lower(f_unaccent(nome || ' ' || codigo || ' ' || fornecedor_nome || ' ' || gestor_nome || ' ' || responsavel_juridico_nome)) gin_trgm_ops
);
