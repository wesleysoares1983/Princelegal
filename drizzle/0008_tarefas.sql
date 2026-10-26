CREATE TYPE "public"."coluna_tarefa" AS ENUM('A fazer', 'Em andamento', 'Concluída');--> statement-breakpoint
ALTER TYPE "public"."categoria_auditoria" ADD VALUE 'tarefa';--> statement-breakpoint
CREATE TABLE "tarefas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"responsavel" text,
	"prazo" date,
	"coluna" "coluna_tarefa" NOT NULL,
	"coluna_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"contrato_id" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_por_matricula" text NOT NULL,
	"criado_por_nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"removida_em" timestamp with time zone,
	"removida_por_matricula" text,
	"removida_por_nome" text,
	"motivo_remocao" text,
	CONSTRAINT "tarefas_removida_completa" CHECK (("tarefas"."removida_em" is null) = ("tarefas"."motivo_remocao" is null)),
	CONSTRAINT "tarefas_titulo" CHECK (length("tarefas"."titulo") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tarefas_ativas_coluna" ON "tarefas" USING btree ("coluna","criado_em") WHERE "tarefas"."removida_em" is null;--> statement-breakpoint
CREATE INDEX "tarefas_contrato" ON "tarefas" USING btree ("contrato_id");