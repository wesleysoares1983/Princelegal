CREATE TYPE "public"."origem_cancelamento_obrigacao" AS ENUM('manual', 'encerramento', 'renovacao', 'reducao_vigencia');--> statement-breakpoint
CREATE TYPE "public"."recorrencia_obrigacao" AS ENUM('Única', 'Mensal', 'Anual', 'Por evento');--> statement-breakpoint
CREATE TYPE "public"."situacao_obrigacao" AS ENUM('pendente', 'cumprida', 'cancelada');--> statement-breakpoint
CREATE TABLE "obrigacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contrato_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"responsavel" text NOT NULL,
	"data" date NOT NULL,
	"recorrencia" "recorrencia_obrigacao" NOT NULL,
	"dia_ancora" smallint,
	"situacao" "situacao_obrigacao" DEFAULT 'pendente' NOT NULL,
	"cumprida_em" date,
	"cumprida_por_matricula" text,
	"cumprida_por_nome" text,
	"observacao_cumprimento" text,
	"cancelada_em" timestamp with time zone,
	"motivo_cancelamento" text,
	"origem_cancelamento" "origem_cancelamento_obrigacao",
	"anterior_id" uuid,
	"editada_em" timestamp with time zone,
	"criado_por_matricula" text,
	"criado_por_nome" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obrigacoes_cumprida_completa" CHECK (("obrigacoes"."situacao" = 'cumprida') = ("obrigacoes"."cumprida_em" is not null)),
	CONSTRAINT "obrigacoes_cancelada_completa" CHECK (("obrigacoes"."situacao" = 'cancelada') = ("obrigacoes"."cancelada_em" is not null)),
	CONSTRAINT "obrigacoes_ancora" CHECK ("obrigacoes"."dia_ancora" is null or "obrigacoes"."dia_ancora" between 1 and 31)
);
--> statement-breakpoint
ALTER TABLE "obrigacoes" ADD CONSTRAINT "obrigacoes_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obrigacoes" ADD CONSTRAINT "obrigacoes_anterior_id_obrigacoes_id_fk" FOREIGN KEY ("anterior_id") REFERENCES "public"."obrigacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "obrigacoes_situacao_data" ON "obrigacoes" USING btree ("situacao","data");--> statement-breakpoint
CREATE INDEX "obrigacoes_contrato" ON "obrigacoes" USING btree ("contrato_id");--> statement-breakpoint
CREATE INDEX "obrigacoes_anterior" ON "obrigacoes" USING btree ("anterior_id");