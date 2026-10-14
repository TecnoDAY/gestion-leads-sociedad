# Fase 23: CSP estricta en las paginas estaticas (privacidad/404)

## Objetivo
Que public/privacidad.html y public/404.html tambien sirvan con CSP estricta
(meta con hash de su unico <style>), eliminando las alertas Medium de ZAP
detectadas en el re-escaneo de las fases 15-21.

## Problema y por que
El endurecimiento de la fase 15 solo cubre dist/index.html; las otras dos
paginas publicas se sirven con la cabecera reducida y su <style> inline sin
autorizar. ZAP reporto en /privacidad.html: 'CSP: script-src unsafe-inline',
'CSP: style-src unsafe-inline' y 'CSP: Wildcard Directive' (1 instancia cada
una). Es el mismo problema ya resuelto para el panel, con otra pagina.

## Alcance
- csp-utils.mjs: politica para paginas estaticas (default-src 'self';
  script-src 'none'; style-src 'self' + hashes del <style>; img-src
  'self' data:; base-uri 'self'; form-action 'none') y las funciones
  insertar/validar parametrizadas por politica.
- inline-dist.mjs: procesa tambien dist/privacidad.html y dist/404.html
  si existen, inserta el meta (antes del contenido) y falla el build si
  queda on*=, unsafe-inline o el meta no coincide.
- Tests: casos nuevos en csp.test.mjs (hash del style, script-src 'none',
  insercion y guardia); la cabecera HTTP no cambia.

## Restricciones
- No alterar el contenido visible de las paginas; el artefacto sigue
  autocontenido por pagina.
- Sin cambios de cabeceras de vercel.json; sin deploy.

## No romper
- index.html: mismo meta de siempre (politica completa con CDN/Supabase).
- Suite, lint, build y smoke verdes.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test

## Tareas
- [ ] T1: politica estatica + funciones parametrizadas con tests (RED).
- [ ] T2: inline-dist procesa las dos paginas y valida.
- [ ] T3: suite, lint, build, smoke y re-escaneo ZAP del preview.

## Criterios de aceptacion
- [ ] dist/privacidad.html y dist/404.html llevan meta estricta con hash.
- [ ] Re-escaneo sin las 3 alertas Medium de /privacidad.html.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- El falso positivo 'Source Code Disclosure - Java' x16 (heuristica de ZAP
  sobre el JS minificado inline propio, servido como fallback de rutas con
  parametros) se documenta con evidencia y NO se suprime la regla global.

## Reutilizacion investigada
- El mecanismo de meta con hashes de la fase 15 se reutiliza tal cual,
  parametrizando la politica.

## Evidencia
- T1: csp-utils con cspPaginaEstatica (default-src 'self'; script-src
  'none'; style-src 'self' + hash; img-src 'self' data:; base-uri 'self';
  form-action 'none'), insertarMetaCsp y problemasCsp parametrizados por
  politica; 2 tests nuevos en csp.test.mjs (politica y hash; insercion +
  guardia con hash desincronizado al alterar el <style>) 7/7.
- T2: inline-dist procesa dist/privacidad.html y dist/404.html (meta con
  hash y guardia); build 943 kB con los tres "CSP estricta en meta".
- T3: suite completa verde, lint, build, smoke con curl a
  /privacidad.html (meta script-src 'none' y hash del style) y /404.html.
- Re-escaneo ZAP (sesion limpia con deleteAllAlerts; evidencia
  `/tmp/opencode/zap-fase23-limpio.log`): 0 High, 0 Low, Medium 16 y
  NINGUNA alerta CSP (desaparecieron las 3 de /privacidad.html); las 16
  son 'Source Code Disclosure - Java' (plugin 10099, confianza Media,
  CWE-540) con evidencia 'class e{constructor(e,t,n){this._context=...'
  = el bundle Zod minificado del propio index.html, servido como fallback
  de rutas con parametros; falso positivo heuristico documentado, regla
  NO suprimida. Informativas 244.
- Nota de metodo: ZAP acumula alertas por sesion; para medir una fase hay
  que limpiar con deleteAllAlerts (el primer intento dio 35 al sumar las
  de la fase anterior).

## Progreso
- Estado: implementada y verificada localmente con ZAP de confirmacion
  (sin alertas CSP); sin commit
- Ultima tarea: T3
- Siguiente paso: commit atomico con orden
- Bloqueos: falso positivo Java x16 documentado (heuristica ZAP sobre el
  bundle inline propio), no se suprime la regla
