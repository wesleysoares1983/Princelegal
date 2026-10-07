-- Extensoes usadas na busca sem acento e por trecho de texto.
-- As duas sao "trusted" desde o PostgreSQL 13: o dono do banco cria, sem superusuario.
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- unaccent() e STABLE (depende do dicionario configurado), e indice so aceita
-- funcao IMMUTABLE. Este invólucro fixa o dicionario `public.unaccent`, o que
-- torna o resultado deterministico e permite usa-lo em indices (ex.: opcao
-- unica sem diferenciar "Água" de "agua").
CREATE OR REPLACE FUNCTION f_unaccent(texto text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, texto) $$;
