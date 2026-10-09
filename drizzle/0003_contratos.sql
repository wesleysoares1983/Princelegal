CREATE TYPE "public"."acao_vencimento" AS ENUM('Renovar', 'Renegociar', 'Encerrar', 'Em análise');--> statement-breakpoint
CREATE TYPE "public"."indice_reajuste" AS ENUM('IPCA', 'IGP-M', 'INPC', 'Fixo', 'Outro');--> statement-breakpoint
CREATE TYPE "public"."motivo_encerramento" AS ENUM('manual', 'renovado');--> statement-breakpoint
CREATE TYPE "public"."status_acao" AS ENUM('Pendente', 'Em andamento', 'Concluída');--> statement-breakpoint
CREATE TYPE "public"."tipo_vigencia" AS ENUM('Original', 'Aditivo', 'Renovação');--> statement-breakpoint
CREATE SEQUENCE "public"."contrato_codigo_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "contrato_vigencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contrato_id" uuid NOT NULL,
	"tipo" "tipo_vigencia" NOT NULL,
	"numero" integer,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"valor_mensal" numeric(14, 2) NOT NULL,
	"observacao" text,
	"documento_id" uuid,
	"anulado_em" timestamp with time zone,
	"anulado_por_matricula" text,
	"anulado_por_nome" text,
	"justificativa_anulacao" text,
	"criado_por_matricula" text NOT NULL,
	"criado_por_nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vigencias_ordenada" CHECK ("contrato_vigencias"."data_fim" >= "contrato_vigencias"."data_inicio"),
	CONSTRAINT "vigencias_so_aditivo_anula" CHECK ("contrato_vigencias"."anulado_em" is null or "contrato_vigencias"."tipo" = 'Aditivo')
);
--> statement-breakpoint
CREATE TABLE "contratos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"segmento_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"filial_id" uuid NOT NULL,
	"area_responsavel_id" uuid NOT NULL,
	"centro_custo_id" uuid NOT NULL,
	"fornecedor_nome" text NOT NULL,
	"fornecedor_documento" text NOT NULL,
	"fornecedor_contato" text,
	"objeto" text NOT NULL,
	"observacoes" text,
	"gestor_nome" text NOT NULL,
	"gestor_email" text NOT NULL,
	"responsavel_juridico_nome" text NOT NULL,
	"responsavel_juridico_email" text NOT NULL,
	"acesso_restrito" boolean DEFAULT false NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"renovacao_automatica" boolean NOT NULL,
	"prazo_aviso_cancelamento_dias" integer NOT NULL,
	"valor_mensal" numeric(14, 2) NOT NULL,
	"forma_pagamento" text NOT NULL,
	"indice_reajuste" "indice_reajuste" NOT NULL,
	"data_base_reajuste" date NOT NULL,
	"multa_rescisao" numeric(14, 2),
	"acao_vencimento" "acao_vencimento",
	"responsavel_acao" text,
	"prazo_acao" date,
	"status_acao" "status_acao",
	"encerrado_em" date,
	"motivo_encerramento" "motivo_encerramento",
	"justificativa_encerramento" text,
	"encerrado_por_matricula" text,
	"encerrado_por_nome" text,
	"renova_contrato_id" uuid,
	"renovado_por_contrato_id" uuid,
	"criado_por_matricula" text NOT NULL,
	"criado_por_nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "contratos_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "contratos_vigencia_ordenada" CHECK ("contratos"."data_fim" >= "contratos"."data_inicio"),
	CONSTRAINT "contratos_prazo_aviso" CHECK ("contratos"."prazo_aviso_cancelamento_dias" between 0 and 3650),
	CONSTRAINT "contratos_valores_positivos" CHECK ("contratos"."valor_mensal" >= 0 and ("contratos"."multa_rescisao" is null or "contratos"."multa_rescisao" >= 0)),
	CONSTRAINT "contratos_encerramento_completo" CHECK (("contratos"."encerrado_em" is null) = ("contratos"."motivo_encerramento" is null)),
	CONSTRAINT "contratos_renovado_tem_sucessor" CHECK (("contratos"."motivo_encerramento" = 'renovado') = ("contratos"."renovado_por_contrato_id" is not null)),
	CONSTRAINT "contratos_acao_completa" CHECK ("contratos"."acao_vencimento" is null or ("contratos"."responsavel_acao" is not null and "contratos"."prazo_acao" is not null and "contratos"."status_acao" is not null))
);
--> statement-breakpoint
ALTER TABLE "contrato_vigencias" ADD CONSTRAINT "contrato_vigencias_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_categoria_id_opcoes_cadastro_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."opcoes_cadastro"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_segmento_id_opcoes_cadastro_id_fk" FOREIGN KEY ("segmento_id") REFERENCES "public"."opcoes_cadastro"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_empresa_id_opcoes_cadastro_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."opcoes_cadastro"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_filial_id_opcoes_cadastro_id_fk" FOREIGN KEY ("filial_id") REFERENCES "public"."opcoes_cadastro"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_area_responsavel_id_opcoes_cadastro_id_fk" FOREIGN KEY ("area_responsavel_id") REFERENCES "public"."opcoes_cadastro"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_centro_custo_id_opcoes_cadastro_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."opcoes_cadastro"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_renova_contrato_id_contratos_id_fk" FOREIGN KEY ("renova_contrato_id") REFERENCES "public"."contratos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_renovado_por_contrato_id_contratos_id_fk" FOREIGN KEY ("renovado_por_contrato_id") REFERENCES "public"."contratos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vigencias_contrato" ON "contrato_vigencias" USING btree ("contrato_id","criado_em");--> statement-breakpoint
CREATE INDEX "contratos_data_fim" ON "contratos" USING btree ("data_fim");--> statement-breakpoint
CREATE INDEX "contratos_gestor_email" ON "contratos" USING btree ("gestor_email");--> statement-breakpoint
CREATE INDEX "contratos_juridico_email" ON "contratos" USING btree ("responsavel_juridico_email");--> statement-breakpoint
CREATE INDEX "contratos_fornecedor_documento" ON "contratos" USING btree ("fornecedor_documento");--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE restrict ON UPDATE no action;