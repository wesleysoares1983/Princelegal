-- Auditoria e so de insercao: alterar ou apagar o registro de quem fez o que
-- tiraria o valor da trilha. O gatilho vale para qualquer usuario do banco;
-- uma correcao excepcional exige desligar o gatilho explicitamente
-- (ALTER TABLE auditoria DISABLE TRIGGER ...), o que fica visivel no proprio SQL.
CREATE OR REPLACE FUNCTION auditoria_somente_insercao()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'auditoria é somente inserção: % não permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE TRIGGER auditoria_sem_alteracao
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_somente_insercao();
--> statement-breakpoint
CREATE TRIGGER auditoria_sem_truncate
  BEFORE TRUNCATE ON auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_somente_insercao();
--> statement-breakpoint

-- Opcoes de cadastro iniciais: os valores que o prototipo trazia fixos no
-- codigo (lib/config/opcoesCadastro.ts, PADRAO), para o formulario nao nascer
-- vazio. Daqui em diante quem mantem e o administrador, pela tela.
INSERT INTO opcoes_cadastro (campo, valor, ordem)
SELECT campo::campo_opcao, valor, ordem
FROM (VALUES
  ('categoria', 'Aluguel', 1),
  ('categoria', 'Água', 2),
  ('categoria', 'Energia', 3),
  ('categoria', 'Condomínio', 4),
  ('categoria', 'Telecom', 5),
  ('categoria', 'Licença', 6),
  ('categoria', 'Seguro', 7),
  ('categoria', 'Prestação de Serviço', 8),
  ('categoria', 'Jurídico', 9),
  ('categoria', 'Outros', 10),
  ('segmento', 'Passagens e Encomendas', 1),
  ('segmento', 'Prinex', 2),
  ('empresa', 'Princesa dos Campos', 1),
  ('empresa', 'Paraná', 2),
  ('filial', 'Matriz', 1),
  ('filial', 'Curitiba', 2),
  ('centro-custo', 'CC-1002', 1),
  ('centro-custo', 'CC-2001', 2),
  ('centro-custo', 'CC-3005', 3),
  ('area-responsavel', 'Administrativo', 1),
  ('area-responsavel', 'TI', 2),
  ('area-responsavel', 'Operações', 3),
  ('area-responsavel', 'RH', 4),
  ('area-responsavel', 'Financeiro', 5),
  ('area-responsavel', 'Jurídico', 6)
) AS iniciais(campo, valor, ordem)
ON CONFLICT DO NOTHING;
