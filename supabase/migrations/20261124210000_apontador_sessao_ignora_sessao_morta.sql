-- A trava de "um aparelho por login" não deve valer para sessões que já não existem no Auth
-- (aba antiga esquecida aberta com token ainda válido, logout feito em outro lugar etc.).
DO $mig$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.apontador_sessao_iniciar(text)'::regprocedure);
  v_old := $o$IF v_a.sessao_id IS NOT NULL AND v_a.sessao_id <> v_sid AND v_a.sessao_visto > now() - interval '3 minutes' THEN$o$;
  v_new := $n$IF v_a.sessao_id IS NOT NULL AND v_a.sessao_id <> v_sid AND v_a.sessao_visto > now() - interval '3 minutes'
     AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id::text = v_a.sessao_id) THEN$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho não encontrado em apontador_sessao_iniciar'; END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;

CREATE OR REPLACE FUNCTION public.apontador_sessao_ping()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.apontador_acessos SET sessao_visto = now()
   WHERE email = lower((SELECT auth.jwt()->>'email')) AND ativo AND sessao_id = (SELECT auth.jwt()->>'session_id')
     AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id::text = (SELECT auth.jwt()->>'session_id'));
  RETURN FOUND;
END $function$;
