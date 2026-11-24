-- Dono da plataforma (FACSIM) pode "entrar" numa empresa cliente para conferir e ajudar,
-- com acesso completo, e voltar para a própria empresa.

ALTER TABLE public.apontador_acessos
  ADD COLUMN IF NOT EXISTS empresa_visitando bigint REFERENCES public.empresas(id) ON DELETE SET NULL;

-- Empresa atual: a visitada (só para o dono da plataforma) ou a própria
CREATE OR REPLACE FUNCTION public.apontador_empresa_atual()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN a.empresa_visitando IS NOT NULL
               AND (a.dono_plataforma OR (e.plataforma AND a.perfil = 'admin'))
              THEN a.empresa_visitando ELSE a.empresa_id END
    FROM public.apontador_acessos a JOIN public.empresas e ON e.id=a.empresa_id AND e.ativo
   WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email'))
     AND (SELECT auth.uid()) IS NOT NULL AND coalesce((SELECT auth.jwt()->>'is_anonymous'),'false') <> 'true'
     AND a.sessao_id IS NOT DISTINCT FROM (SELECT auth.jwt()->>'session_id')
   LIMIT 1
$function$;

-- Entrar numa empresa (p_empresa) ou voltar para a própria (p_empresa NULL)
CREATE OR REPLACE FUNCTION public.apontador_visitar_empresa(p_empresa bigint DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_email text := lower((SELECT auth.jwt()->>'email')); v_propria bigint; v_nome text;
BEGIN
  IF NOT public.apontador_dono_plataforma() THEN
    RAISE EXCEPTION 'Somente a FACSIM pode acessar outras empresas.' USING ERRCODE='42501';
  END IF;
  SELECT a.empresa_id INTO v_propria FROM public.apontador_acessos a WHERE a.email = v_email AND a.ativo;
  IF p_empresa IS NULL OR p_empresa = v_propria THEN
    UPDATE public.apontador_acessos SET empresa_visitando = NULL WHERE email = v_email;
    SELECT nome INTO v_nome FROM public.empresas WHERE id = v_propria;
    RETURN jsonb_build_object('ok', true, 'visitando', false, 'empresa', v_nome);
  END IF;
  SELECT nome INTO v_nome FROM public.empresas WHERE id = p_empresa;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
  UPDATE public.apontador_acessos SET empresa_visitando = p_empresa WHERE email = v_email;
  RETURN jsonb_build_object('ok', true, 'visitando', true, 'empresa', v_nome);
END $function$;
REVOKE ALL ON FUNCTION public.apontador_visitar_empresa(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apontador_visitar_empresa(bigint) TO authenticated;

-- Carga: avisa o app que está visitando e qual é a empresa própria
DO $mig$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.apontador_carregar()'::regprocedure);
  IF position('''visitando''' IN v_def) > 0 THEN RETURN; END IF;
  v_old := $o$'donoPlataforma', coalesce((SELECT a.dono_plataforma FROM public.apontador_acessos a WHERE a.email = lower((select auth.jwt()->>'email')) AND a.ativo LIMIT 1), false),$o$;
  v_new := v_old || $n$
    'visitando', coalesce((SELECT a.empresa_id <> public.apontador_empresa_atual() FROM public.apontador_acessos a WHERE a.email = lower((select auth.jwt()->>'email')) AND a.ativo LIMIT 1), false),
    'empresaPropria', (SELECT jsonb_build_object('id',e.id::text,'nome',e.nome) FROM public.apontador_acessos a JOIN public.empresas e ON e.id=a.empresa_id WHERE a.email = lower((select auth.jwt()->>'email')) AND a.ativo LIMIT 1),$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho donoPlataforma não encontrado em apontador_carregar'; END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;

-- Editar/excluir cadastros: o dono da plataforma também pode na empresa visitada
DO $mig$
DECLARE v_def text; v_old text;
BEGIN
  v_def := pg_get_functiondef('public.apontador_cadastro_gerenciar(text,text,jsonb)'::regprocedure);
  v_old := $o$AND a.ativo AND a.perfil IN ('admin','editor') AND a.empresa_id=v_empresa$o$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho de permissão não encontrado em apontador_cadastro_gerenciar'; END IF;
  EXECUTE replace(v_def, v_old, $n$AND a.ativo AND a.perfil IN ('admin','editor') AND (a.empresa_id=v_empresa OR public.apontador_dono_plataforma())$n$);
END
$mig$;
