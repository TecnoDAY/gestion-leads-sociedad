# Fase 3: opciones de catalogos

## Objetivo
Extraer la logica de opciones de catalogo del monolito sin alterar filtros ni formularios.

## Problema y por que
Las opciones mezclan estado global y calculo. Mover DOM y estado al mismo tiempo
complicaria las pruebas y arriesgaria regresiones en filtros y sesiones.

## Alcance
- Extraer calculos de valores activos y opciones a un modulo JS con estado explicito.
- Mantener wrappers delgados en index.html, sin cambiar sus firmas ni llamadores.
- Caracterizar valores desactivados, duplicados, orden y meses.
- Ampliacion aprobada: resolver las alertas ZAP locales Medium/Low; retirar
  SQL incrustado del modal RLS y configurar cabeceras locales sin romper Vite.

## Restricciones
- Misma rama phase-0-baseline; sin React, dependencias, cambios de interfaz ni Supabase.
- No hacer commit, push ni despliegue sin nueva peticion explicita.

## No romper
- Firma y resultado de activeCatalogValues(kind) y catalogOptions(kind, dataValues).
- Los tests existentes y los flujos de filtros, citas y usuarios.
- Los cambios ajenos sin rastrear (opencode.json.bak) y el ODD de fase 1 modificado.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test.
- Tests de caracterizacion obligatorios antes de cerrar.

## Tareas
- [x] T1: Caracterizar la logica de valores activos, extras y ordenacion.
- [x] T2: Extraer calculo y conservar wrappers con el estado del script clasico.
- [ ] T3: Ejecutar tests, lint, build, smoke local y ZAP pasivo no autenticado.
- [x] T4: Retirar SQL del HTML publico y limpiar la accion Copiar SQL.
- [ ] T5: Configurar cabeceras locales, comprobar recursos externos y repetir
  escaneo pasivo hasta cola vacia o dejar bloqueo documentado.

## Criterios de aceptacion
- [x] Salidas iguales con catalogos activos/inactivos y valores repetidos.
- [x] Tests, lint y build verdes.
- [ ] No alertas nuevas atribuibles al cambio en ZAP local (cola pasiva pendiente).

## Decisiones aceptadas
- La extraccion solo afecta calculos; el DOM y carga de catalogos permanecen
  en el monolito porque los sandboxes VM no comparten su estado con modulos ESM.

## Reutilizacion investigada
- src/legacy/leads.js: sortMonthCatalog; src/legacy/helpers.js: sortAlphaEs.
- scripts/tests/t5-frontend-edge.test.mjs ya comprueba catalogOptions en VM.
- Se descarta mover loadCatalogs y refreshCatalogs (estado de sesion/red).

## Evidencia
- T1: `node --test scripts/tests/catalogos-helpers.test.mjs` fallo RED al
  faltar el modulo. Cuatro casos: activos, desactivados/duplicados, meses y
  no mutacion.
- T2: `src/legacy/catalogos.js` recibe `rows` explicito, reutiliza
  sortMonthCatalog/sortAlphaEs; dos wrappers originales mantienen firmas,
  llamadas y estado `catalogRows`. El sandbox VM recibe `catalogosApi`.
- T3 (parcial): tests especificos+t5 139/139; pnpm test 412/412 Node y
  11/11 Python; pnpm run lint OK; pnpm run build OK; servidor local de prueba
  en 127.0.0.1:3001 (raiz 200, modulo 200). ZAP spider y AJAX spider 100%;
  informe preliminar: High 0, Medium 3, Low 5, Informational 10 (incluye
  `Tech Detected - Open Graph` frente a 9 informativas previas). Las 3
  Medium son las preexistentes (SQL, CSP y clickjacking del servidor dev),
  sin nuevas alertas Medium visibles. Informe preliminar:
  `/tmp/opencode/zap-phase-3-localhost-3001.html`. Cola pasiva aun en
  `running`, 12 registros pendientes: no declarar gate ZAP cerrado.
- Ampliacion T4/T5: modal RLS sin SQL ni copia (index.html y dist/index.html);
  vercel.json declara X-Frame-Options, CSP, X-Content-Type-Options,
  Permissions-Policy, COOP, CORP y COEP. Vite reutiliza las cabeceras de
  vercel.json con excepcion WebSocket local para HMR. `curl -I` en 3001
  confirma las siete cabeceras; Chromium headless renderiza el titulo y los
  iconos de Lucide bajo COEP credentialless. Suite final: 414 Node + 11
  Python, lint y build OK. Nuevos tests de regresion de modal/cabeceras.
  **No verificado:** ZAP conserva 12 entradas en cola pasiva tras re-spider
  100%; las alertas del informe anterior pueden ser historicas (ZAP acumula
  hallazgos de la misma sesion). No confundir configuracion observada con
  confirmacion de cero alertas en un escaneo fresco.
- Intento de sesion aislada (13/10): Docker instalado sin daemon; ZAP 2.17.0
  local. Se probaron dos arranques en directorio temporal: la CLI rechazo
  `-host` y `-port` por fallo al inicializar extensiones. Con la instalacion
  habitual y `-newsession /tmp/opencode/zap-fase3-aislado.session`, el archivo
  de sesion se creo, pero la API no estuvo disponible tras 60 segundos.
  En ambos casos el log registro `ExtensionPscanAutomation` NullPointerException
  (complemento pscan). Se detuvieron solamente los procesos iniciados para
  estas pruebas. No se borro ni reinicio la sesion anterior; no se puede
  declarar que los 12 registros sean vulnerabilidades de la app.

## Progreso
- Estado: en curso; T1, T2 y T4 completadas; T3 y T5 pendientes de ZAP
- Ultima tarea: comprobacion de cabeceras locales y suite en verde
- Siguiente paso: diagnosticar el arranque/complemento ZAP en flujo separado
  y repetir escaneo con sesion fresca; prueba visual por el humano
- Bloqueos: ZAP aislado no inicia con API util; cola anterior de 12 registros;
  sin prueba visual autenticada ni verificacion de cabeceras en Vercel
