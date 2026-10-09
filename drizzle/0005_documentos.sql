CREATE TYPE "public"."tipo_documento" AS ENUM('Contrato', 'Aditivo', 'Renovação', 'Anexo', 'Comprovante', 'Parecer jurídico');--> statement-breakpoint
CREATE TABLE "documento_versoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documento_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"nome_arquivo" text NOT NULL,
	"mime" text NOT NULL,
	"tamanho_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"chave_armazenamento" text NOT NULL,
	"enviado_por_matricula" text NOT NULL,
	"enviado_por_nome" text NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documento_versoes_chaveArmazenamento_unique" UNIQUE("chave_armazenamento"),
	CONSTRAINT "documento_versoes_numero" UNIQUE("documento_id","versao"),
	CONSTRAINT "documento_versoes_tamanho" CHECK ("documento_versoes"."tamanho_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contrato_id" uuid NOT NULL,
	"tipo" "tipo_documento" NOT NULL,
	"nome" text NOT NULL,
	"versao_atual" integer DEFAULT 1 NOT NULL,
	"removido_em" timestamp with time zone,
	"removido_por_matricula" text,
	"removido_por_nome" text,
	"motivo_remocao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documento_versoes" ADD CONSTRAINT "documento_versoes_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documentos_contrato" ON "documentos" USING btree ("contrato_id","criado_em");--> statement-breakpoint
ALTER TABLE "contrato_vigencias" ADD CONSTRAINT "contrato_vigencias_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;