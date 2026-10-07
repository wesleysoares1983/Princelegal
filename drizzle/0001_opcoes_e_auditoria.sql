CREATE TYPE "public"."categoria_auditoria" AS ENUM('contrato', 'documento', 'obrigacao', 'acesso', 'configuracao', 'exportacao', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."campo_opcao" AS ENUM('categoria', 'segmento', 'empresa', 'filial', 'centro-custo', 'area-responsavel');--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_matricula" text,
	"usuario_nome" text,
	"contrato_id" uuid,
	"categoria" "categoria_auditoria" NOT NULL,
	"acao" text NOT NULL,
	"descricao" text NOT NULL,
	"dados" jsonb,
	"ip" "inet",
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "opcoes_cadastro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campo" "campo_opcao" NOT NULL,
	"valor" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auditoria_contrato_ocorrido" ON "auditoria" USING btree ("contrato_id","ocorrido_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auditoria_ocorrido" ON "auditoria" USING btree ("ocorrido_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auditoria_usuario" ON "auditoria" USING btree ("usuario_matricula");--> statement-breakpoint
CREATE UNIQUE INDEX "opcoes_cadastro_campo_valor_unico" ON "opcoes_cadastro" USING btree ("campo",lower(f_unaccent("valor")));