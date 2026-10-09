CREATE TYPE "public"."situacao_alerta" AS ENUM('enviado', 'ignorado', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."tipo_alerta" AS ENUM('vencimento', 'prazo_aviso', 'vencido');--> statement-breakpoint
CREATE TABLE "alertas_enviados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contrato_id" uuid NOT NULL,
	"tipo" "tipo_alerta" NOT NULL,
	"limiar_dias" integer NOT NULL,
	"data_referencia" date NOT NULL,
	"situacao" "situacao_alerta" NOT NULL,
	"destinatarios" text[] DEFAULT '{}'::text[] NOT NULL,
	"erro" text,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alertas_enviados" ADD CONSTRAINT "alertas_enviados_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alertas_enviados_unico" ON "alertas_enviados" USING btree ("contrato_id","tipo","limiar_dias","data_referencia") WHERE "alertas_enviados"."situacao" in ('enviado', 'ignorado');--> statement-breakpoint
CREATE INDEX "alertas_enviados_contrato" ON "alertas_enviados" USING btree ("contrato_id","enviado_em" DESC NULLS LAST);