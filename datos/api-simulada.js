/* Kairos · Informes de servicio · API SIMULADA
   ---------------------------------------------------------------------------
   La app NUNCA lee datos directo: todo pasa por window.KisAPI. En producción este
   archivo se reemplaza por un cliente HTTP con la misma firma (mismas funciones,
   mismas formas de datos) que llama al backend de Kairos (Node + SQL) y este a Odoo.

   Contrato (v0.1, propuesta):
     GET  /me                                     -> Persona (de Microsoft Entra ID)
     GET  /servicios?asignado=me                  -> Servicio[] (resumen)
     GET  /servicios/{ceco}                       -> Servicio (caracterización completa)
     GET  /servicios/{ceco}/informes              -> Informe[]
     POST /servicios/{ceco}/informes              -> Informe  (emite; consecutivo lo asigna el servidor)
     POST /servicios/{ceco}/informes/{n}/envios   -> Envio    (registra el envío; el correo lo manda el servidor)
     POST /fotos                                  -> { id }   (en producción: blob storage; aquí IndexedDB)
     POST /servicios/{ceco}/notas-voz/interpretar -> { transcripcion, sugerencias }  (IA; aquí simulada)

   Servicio = {
     ceco, nombre, tipo:'servicio', sub:'mantenimiento'|'suministro'|'bolsa'|'puntual', urgencia:bool,
     odoo:   { cliente, nit, cluster, regional, moneda, cotizacion, inicio, fin, estado },   <- maestro de Odoo
     lider, equipo:[nombre],                                                              <- Kairos
     sitios: [{ planta, ciudad, direccion }],
     contactos: [{ id, nombre, cargo, correo, planta, recibeInformes }],
     sistema: { prog:[{n,v}], eq:[{n,v}] }   <- se hereda del último informe emitido
   }
   Datos 100 % ficticios. Fecha del prototipo: la del dispositivo. */
(function () {
  'use strict';
  var KEY = 'kis.api.v1', LAT = 260;

  var SERVICIOS = [
    { ceco: '30401007200', nombre: 'Contrato de mantenimiento plataforma Rockwell 2026', sub: 'mantenimiento', urgencia: false,
      odoo: { cliente: 'Alimentos Andinos S.A.', nit: '900.412.553-1', cluster: 'LATAM', regional: 'Col_West', moneda: 'COP', cotizacion: 'S03977', inicio: '2026-03-02', fin: '2027-02-26', estado: 'Activo' },
      lider: 'Ernesto Osorio', equipo: ['Brayan Castro', 'Juan Quintero', 'Néstor Mazabuel', 'Juan Menco'],
      sitios: [{ planta: 'Planta Yumbo', ciudad: 'Yumbo', direccion: 'Km 2 vía Cali - Yumbo' }, { planta: 'Planta Palmira', ciudad: 'Palmira', direccion: 'Autopista Sur # 30-45' }],
      contactos: [
        { id: 'c1', nombre: 'Andrés Felipe Ruiz', cargo: 'Jefe de mantenimiento', correo: 'aruiz@alimentosandinos.co', planta: 'Planta Yumbo', recibeInformes: true },
        { id: 'c2', nombre: 'Marcela Gómez', cargo: 'Coordinadora de automatización', correo: 'mgomez@alimentosandinos.co', planta: 'Planta Palmira', recibeInformes: true },
        { id: 'c3', nombre: 'Jorge Iván Cano', cargo: 'Gerente de planta', correo: 'jcano@alimentosandinos.co', planta: '', recibeInformes: false }],
      sistema: { prog: [{ n: 'FactoryTalk View SE', v: '13.0' }, { n: 'Studio 5000 Logix Designer', v: '33.01' }], eq: [{ n: 'ControlLogix 1756-L83E', v: '33.011' }, { n: 'Stratix 5700', v: '15.2' }] } },
    { ceco: '30301053200', nombre: 'Bolsa de horas de ingeniería 2026 · 40 días', sub: 'bolsa', urgencia: false,
      odoo: { cliente: 'Bebidas del Pacífico S.A.', nit: '890.301.778-4', cluster: 'LATAM', regional: 'Col_West', moneda: 'COP', cotizacion: 'S03902', inicio: '2026-01-12', fin: '2026-12-18', estado: 'Activo' },
      lider: 'Miguel Quintero', equipo: ['Laura Posso', 'Brayan Castro'],
      sitios: [{ planta: 'Planta Cali', ciudad: 'Cali', direccion: 'Calle 50 # 8-25' }],
      contactos: [
        { id: 'c1', nombre: 'Ana Lucía Vélez', cargo: 'Jefe de ingeniería', correo: 'avelez@bebidaspacifico.co', planta: 'Planta Cali', recibeInformes: true },
        { id: 'c2', nombre: 'Héctor Salazar', cargo: 'Supervisor de envasado', correo: 'hsalazar@bebidaspacifico.co', planta: 'Planta Cali', recibeInformes: true }],
      sistema: { prog: [{ n: 'TIA Portal', v: 'V18' }, { n: 'WinCC Unified', v: 'V18' }], eq: [{ n: 'S7-1515-2 PN', v: '3.0' }, { n: 'SINAMICS G120', v: '4.7 SP14' }] } },
    { ceco: '30311054100', nombre: 'Contrato de mantenimiento enero a diciembre 2026', sub: 'mantenimiento', urgencia: false,
      odoo: { cliente: 'Química Industrial del Caribe S.A.', nit: '800.215.990-7', cluster: 'LATAM', regional: 'Col_North', moneda: 'COP', cotizacion: 'S04011', inicio: '2026-04-06', fin: '2027-03-31', estado: 'Activo' },
      lider: 'Kevin Peña', equipo: ['Brayan Castro', 'Diego López'],
      sitios: [{ planta: 'Planta Mamonal', ciudad: 'Cartagena', direccion: 'Zona Industrial Mamonal, Cra. 56 # 4-110' }],
      contactos: [{ id: 'c1', nombre: 'Rosa Elena Díaz', cargo: 'Jefe de confiabilidad', correo: 'rdiaz@quimicacaribe.co', planta: 'Planta Mamonal', recibeInformes: true }],
      sistema: { prog: [{ n: 'DeltaV', v: '14.3' }], eq: [{ n: 'Controlador MQ', v: '14.3.1' }] } },
    { ceco: '30701006500', nombre: 'Anexo 194 · soporte base Manizales 2026', sub: 'puntual', urgencia: false,
      odoo: { cliente: 'Papeles de Caldas S.A.', nit: '890.802.114-2', cluster: 'LATAM', regional: 'Col_Center', moneda: 'COP', cotizacion: 'S04340', inicio: '2026-10-05', fin: '2026-12-04', estado: 'Activo' },
      lider: 'Juan Dueñas', equipo: ['Diego López', 'George Moreno', 'César Bolívar', 'Laura Posso'],
      sitios: [{ planta: 'Planta Manizales', ciudad: 'Manizales', direccion: 'Parque Industrial Juanchito, Bodega 4' }],
      contactos: [{ id: 'c1', nombre: 'Felipe Arango', cargo: 'Ingeniero de procesos', correo: 'farango@papelescaldas.co', planta: 'Planta Manizales', recibeInformes: true }],
      sistema: { prog: [], eq: [] } },
    { ceco: '30313002700', nombre: 'Atención de urgencia · línea de llenado 3', sub: 'puntual', urgencia: true,
      odoo: { cliente: 'Envases del Bajío S.A. de C.V.', nit: 'EBA-990312-KX1', cluster: 'LATAM', regional: 'Mx_Queretaro', moneda: 'USD', cotizacion: 'S04388', inicio: '2026-11-10', fin: '2026-11-30', estado: 'Activo' },
      lider: 'Natalie Ramírez', equipo: ['Laura Posso', 'Carlos Rodríguez'],
      sitios: [{ planta: 'Planta El Marqués', ciudad: 'Querétaro', direccion: 'Parque Industrial Bernardo Quintana, Nave 7' }],
      contactos: [{ id: 'c1', nombre: 'Verónica Treviño', cargo: 'Gerente de producción', correo: 'vtrevino@envasesbajio.mx', planta: 'Planta El Marqués', recibeInformes: true }],
      sistema: { prog: [{ n: 'Studio 5000 Logix Designer', v: '32.00' }], eq: [{ n: 'CompactLogix 5380', v: '32.011' }] } },
    { ceco: '30901001400', nombre: 'Suministro y puesta en marcha de variadores', sub: 'suministro', urgencia: false,
      odoo: { cliente: 'Energía del Valle S.A. E.S.P.', nit: '805.004.321-9', cluster: 'LATAM', regional: 'Col_West', moneda: 'COP', cotizacion: 'S04122', inicio: '2026-09-15', fin: '2026-12-15', estado: 'Activo' },
      lider: 'Brayan Castro', equipo: ['Néstor Mazabuel'],
      sitios: [{ planta: 'Central Térmica', ciudad: 'Yumbo', direccion: 'Vía Yumbo - Aeropuerto Km 1' }],
      contactos: [{ id: 'c1', nombre: 'Gloria Patricia Ríos', cargo: 'Jefe eléctrica', correo: 'gprios@energiavalle.co', planta: 'Central Térmica', recibeInformes: true }],
      sistema: { prog: [{ n: 'Connected Components Workbench', v: '22.00' }], eq: [{ n: 'PowerFlex 755', v: '14.002' }] } }
  ];

  var PERSONAS = [
    { id: 'brayan-castro', nombre: 'Brayan Castro', cargo: 'Ingeniero', correo: 'brayan.castro@omnicon.com.co' },
    { id: 'laura-posso', nombre: 'Laura Posso', cargo: 'Ingeniera líder', correo: 'laura.posso@omnicon.com.co' },
    { id: 'miguel-quintero', nombre: 'Miguel Quintero', cargo: 'Ingeniero líder', correo: 'miguel.quintero@omnicon.com.co' },
    { id: 'diego-lopez', nombre: 'Diego López', cargo: 'Ingeniero', correo: 'diego.lopez@omnicon.com.co' },
    { id: 'ernesto-osorio', nombre: 'Ernesto Osorio', cargo: 'Ingeniero líder', correo: 'ernesto.osorio@omnicon.com.co' }
  ];

  /* Informes ya emitidos (semilla) */
  function seed() {
    return { informes: {
      '30401007200': [{ n: 1, at: '2026-10-08', by: 'Brayan Castro', cargo: 'Ingeniero',
        f: { subj: 'Informe del servicio de ingeniería', req: 'Andrés Felipe Ruiz', d1: '2026-10-07', h1: '08:00', d2: '2026-10-07', h2: '16:30', plant: 'Planta Yumbo', city: 'Yumbo',
          bg: 'Mantenimiento preventivo trimestral de la plataforma de control.\nEl cliente reportó alarmas intermitentes de comunicación en el anillo de la línea 1.',
          sysd: 'Arquitectura ControlLogix con anillo DLR y estación de supervisión FactoryTalk View SE.',
          acts: 'Respaldo de programas del controlador y de la aplicación HMI.\nRevisión de diagnósticos del anillo DLR y del switch Stratix.\nReapriete de conectores RJ45 en el tablero TC-01.',
          tests: 'Prueba de redundancia del anillo abriendo un segmento: recuperación en menos de 3 ms.',
          diag: 'Conector deteriorado en el puerto 4 del switch del tablero TC-01.', sol: 'Reemplazo del conector y certificación del cable.',
          obs: 'El sistema queda operando sin alarmas de comunicación.\nSe recomienda programar la actualización de firmware del switch.', imp: '' },
        prog: [{ n: 'FactoryTalk View SE', v: '13.0' }, { n: 'Studio 5000 Logix Designer', v: '33.01' }], eq: [{ n: 'ControlLogix 1756-L83E', v: '33.011' }, { n: 'Stratix 5700', v: '15.2' }],
        photos: [], sent: [{ at: '2026-10-08', tm: '17:05', by: 'Brayan Castro', to: [{ n: 'Andrés Felipe Ruiz', r: 'Jefe de mantenimiento', em: 'aruiz@alimentosandinos.co' }] }] }],
      '30301053200': [{ n: 1, at: '2026-10-22', by: 'Laura Posso', cargo: 'Ingeniera líder',
        f: { subj: 'Informe del servicio de ingeniería · paradas en la línea de envasado 2', req: 'Ana Lucía Vélez', d1: '2026-10-20', h1: '07:30', d2: '2026-10-21', h2: '17:00', plant: 'Planta Cali', city: 'Cali',
          bg: 'La línea de envasado 2 presentaba paradas no programadas (8 a 10 por turno) desde la última ampliación.\nEl cliente reportó fallas en el transportador de salida y alarmas del variador.',
          sysd: 'Controlador S7-1500 con periferia ET 200SP y variadores SINAMICS G120 en PROFINET.',
          acts: 'Levantamiento del tablero de control de la línea 2 y de sus alarmas históricas.\nMontaje y cableado del tablero de reemplazo en taller.\nAjuste de rampas y del lazo de velocidad del transportador de salida.\nRevisión de la llenadora y de las partes de cambio de formato.',
          tests: 'Prueba en vacío y con producto durante dos turnos completos.\nVerificación de la sincronía llenadora-transportador.',
          diag: 'Rampas de aceleración demasiado cortas para la nueva carga del transportador, que disparaban el variador por sobrecorriente.',
          sol: 'Ajuste de rampas y del límite de corriente; actualización del bloque de control de velocidad.',
          obs: 'La línea completó dos turnos sin paradas por esta causa.\nQueda pendiente el reemplazo del sensor de presencia de la estación 3 (repuesto en camino).',
          imp: 'Instalar monitoreo de corriente del variador en el HMI para anticipar sobrecargas.' },
        prog: [{ n: 'TIA Portal', v: 'V18' }, { n: 'WinCC Unified', v: 'V18' }], eq: [{ n: 'S7-1515-2 PN', v: '3.0' }, { n: 'SINAMICS G120', v: '4.7 SP14' }],
        photos: [{ id: 'demo1', src: 'assets/demo/isr-1.jpg', w: 595, h: 336, cap: 'Tablero de control de la línea 2 antes de la intervención' }, { id: 'demo2', src: 'assets/demo/isr-2.jpg', w: 947, h: 560, cap: 'Montaje y cableado del tablero de reemplazo en taller' }, { id: 'demo3', src: 'assets/demo/isr-3.jpg', w: 1400, h: 735, cap: 'Transportador de salida verificado tras el ajuste' }, { id: 'demo4', src: 'assets/demo/isr-4.jpg', w: 947, h: 560, cap: 'Llenadora y partes de cambio de formato revisadas' }],
        sent: [{ at: '2026-10-22', tm: '18:10', by: 'Laura Posso', to: [{ n: 'Ana Lucía Vélez', r: 'Jefe de ingeniería', em: 'avelez@bebidaspacifico.co' }, { n: 'Héctor Salazar', r: 'Supervisor de envasado', em: 'hsalazar@bebidaspacifico.co' }] }] }]
    } };
  }
  function load() { try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.informes) return s; } catch (e) {} return seed(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {} }
  var DB = load();

  var LOG = [];
  function call(method, path, fn) {
    return new Promise(function (ok, ko) {
      var t0 = Date.now();
      setTimeout(function () {
        try { var r = JSON.parse(JSON.stringify(fn())); LOG.unshift({ m: method, p: path, ms: Date.now() - t0, ok: true, at: new Date() }); ok(r); }
        catch (e) { LOG.unshift({ m: method, p: path, ms: Date.now() - t0, ok: false, err: e.message, at: new Date() }); ko(e); }
        if (LOG.length > 30) LOG.length = 30;
        if (window.KisAPI.onCall) window.KisAPI.onCall();
      }, LAT);
    });
  }
  function svc(ceco) { var s = SERVICIOS.filter(function (x) { return x.ceco === ceco; })[0]; if (!s) throw new Error('404 · CECO no encontrado'); return s; }
  function list(ceco) { return DB.informes[ceco] || (DB.informes[ceco] = []); }
  function withSys(s) {
    var L = list(s.ceco), last = L[L.length - 1], o = JSON.parse(JSON.stringify(s));
    o.tipo = 'servicio';
    if (last) o.sistema = { prog: last.prog, eq: last.eq };
    o.informes = { total: L.length, ultimo: last ? { n: last.n, at: last.at, by: last.by } : null };
    return o;
  }

  /* ---- IA simulada: reparte frases por palabras clave. Solo propone campos con contenido dicho; nunca inventa ---- */
  function nrm(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  var CLAVES = [
    ['imp', ['recomiendo', 'recomendamos', 'recomendacion', 'mejora', 'sugerimos', 'sugiero', 'seria bueno', 'convendria', 'a futuro', 'deberian']],
    ['diag', ['causa', 'diagnostico', 'encontramos que', 'el problema era', 'la falla era', 'se debia', 'debido a', 'origen']],
    ['sol', ['solucion', 'solucionamos', 'se soluciono', 'reemplazamos', 'cambiamos', 'se cambio', 'se reemplazo', 'corregimos', 'se corrigio']],
    ['tests', ['prueba', 'probamos', 'verificamos', 'se verifico', 'comprobamos', 'ensayo', 'validamos']],
    ['obs', ['queda ', 'quedo', 'pendiente', 'conclusion', 'observacion', 'operando', 'funcionando normal', 'en servicio']],
    ['bg', ['reporto', 'reportaron', 'nos llamaron', 'solicitud', 'antecedente', 'presentaba', 'venia', 'desde hace', 'el cliente']]
  ];
  function frase(t) { t = t.trim().replace(/\s+/g, ' '); if (!t) return ''; t = t.charAt(0).toUpperCase() + t.slice(1); return /[.!?]$/.test(t) ? t : t + '.'; }
  function trozos(t) { return String(t).split(/(?<=[.;!?])\s+|\n+|\s+(?:y luego|luego|despues|después|ademas|además)\s+/i).map(function (x) { return x.replace(/^[,\s]+|[,\s]+$/g, ''); }).filter(function (x) { return x.length > 3; }); }
  function interpretar(s, nota) {
    var campo = nota.campo || null, texto = String(nota.texto || '').trim(), out = {};
    /* En producción el backend transcribe el audio. Aquí, si el navegador no pudo transcribir pero hay audio,
       el backend simulado devuelve una transcripción de demostración. Sin audio ni texto no se inventa nada. */
    var demo = false;
    if (!texto && nota.audio) { texto = transcripcionDemo(s, campo); demo = true; }
    if (!texto) return { transcripcion: '', sugerencias: {}, simulada: true };
    var partes = trozos(texto);
    if (campo) { out[campo] = campo === 'acts' ? partes.map(frase).join('\n') : partes.map(frase).join(' '); return { transcripcion: texto, sugerencias: out, simulada: true, demo: demo }; }
    partes.forEach(function (p) {
      var n = nrm(p), k = 'acts';
      for (var i = 0; i < CLAVES.length; i++) { if (CLAVES[i][1].some(function (w) { return n.indexOf(w) >= 0; })) { k = CLAVES[i][0]; break; } }
      (out[k] = out[k] || []).push(frase(p));
    });
    Object.keys(out).forEach(function (k) { out[k] = out[k].join(k === 'acts' ? '\n' : ' '); });
    return { transcripcion: texto, sugerencias: out, simulada: true, demo: demo };
  }
  /* Transcripciones de demostración (como si el ingeniero hubiera hablado). La del informe completo
     no menciona todo a propósito: los campos no dichos quedan sin sugerencia. */
  var DEMO_N = {};
  function transcripcionDemo(s, campo) {
    var eq = s.sistema.eq[0] ? s.sistema.eq[0].n : 'el controlador', pr = s.sistema.prog[0] ? s.sistema.prog[0].n : 'el software de programación';
    var pl = s.sitios[0] ? s.sitios[0].planta.toLowerCase() : 'la planta', ct = s.contactos[0] ? s.contactos[0].nombre : 'el jefe de mantenimiento';
    var B = {
      _: ['El cliente reportó que la línea se venía parando en el turno de la noche con alarmas de comunicación. Revisamos el histórico de alarmas en el HMI y luego sacamos respaldo de los programas de ' + eq + '. Revisamos el cableado del tablero principal. La causa era un conector de red deteriorado que hacía perder la comunicación. Cambiamos el conector y certificamos el cable. Probamos con producto durante todo el turno y no volvió a fallar. Queda operando normal',
          'Revisamos el tablero de control de ' + pl + ' y luego medimos tensiones en la fuente de 24 voltios. Encontramos que la fuente estaba trabajando al límite y por eso se reiniciaba el controlador. Reemplazamos la fuente por una de mayor capacidad. Verificamos el arranque en frío tres veces seguidas. Queda funcionando normal, pendiente cambiar el ventilador del tablero'],
      bg: ['Nos llamó ' + ct + ' porque desde la semana pasada la línea presentaba paradas intermitentes en el turno de la noche, con alarmas de comunicación en ' + eq + '.', 'El cliente reportó que después de la última ampliación el variador del transportador se dispara por sobrecorriente varias veces por turno.'],
      acts: ['Revisamos el histórico de alarmas. Sacamos respaldo del programa en ' + pr + '. Reapretamos borneras en el tablero principal', 'Actualizamos el firmware de ' + eq + '. Ajustamos las rampas del variador. Documentamos los cambios en el programa'],
      tests: ['Probamos con producto durante un turno completo y no se presentaron alarmas.', 'Hicimos prueba de redundancia abriendo el anillo y la red se recuperó en menos de tres milisegundos.'],
      diag: ['La causa era un conector de red dañado en el puerto cuatro del switch del tablero principal.', 'El problema era que las rampas de aceleración estaban muy cortas para la nueva carga del transportador.'],
      sol: ['Cambiamos el conector y certificamos el cable de red.', 'Ajustamos las rampas y el límite de corriente del variador y actualizamos el bloque de control.'],
      obs: ['El sistema queda operando normal. Queda pendiente programar la actualización de firmware del switch.', 'Queda funcionando sin paradas. Pendiente el cambio del sensor de la estación tres, el repuesto está en camino.'],
      imp: ['Recomiendo poner el diagnóstico de la red en el HMI para ver las fallas antes de que pare la línea.', 'Sería bueno instalar monitoreo de corriente del variador para anticipar sobrecargas.']
    };
    var k = campo || '_', L = B[k] || B._, i = (DEMO_N[k] = (DEMO_N[k] || 0) + 1) - 1;
    return L[i % L.length];
  }
  window.KisAPI = {
    version: '0.1 · simulada',
    log: LOG,
    personas: function () { return call('GET', '/personas', function () { return PERSONAS; }); },
    me: function (id) { return call('GET', '/me', function () { var p = PERSONAS.filter(function (x) { return x.id === id; })[0]; if (!p) throw new Error('401'); return p; }); },
    listServicios: function (nombre) {
      return call('GET', '/servicios?asignado=me', function () {
        return SERVICIOS.filter(function (s) { return s.lider === nombre || s.equipo.indexOf(nombre) >= 0; }).map(withSys);
      });
    },
    getServicio: function (ceco) { return call('GET', '/servicios/' + ceco, function () { return withSys(svc(ceco)); }); },
    listInformes: function (ceco) { return call('GET', '/servicios/' + ceco + '/informes', function () { svc(ceco); return list(ceco); }); },
    emitirInforme: function (ceco, inf) {
      return call('POST', '/servicios/' + ceco + '/informes', function () {
        svc(ceco); var L = list(ceco); inf.n = (L.length ? L[L.length - 1].n : 0) + 1; inf.sent = inf.sent || []; L.push(inf); save(); return inf;
      });
    },
    enviarInforme: function (ceco, n, envio) {
      return call('POST', '/servicios/' + ceco + '/informes/' + n + '/envios', function () {
        var i = list(ceco).filter(function (x) { return x.n === n; })[0]; if (!i) throw new Error('404 · informe no encontrado');
        i.sent.push(envio); save(); return envio;
      });
    },
    /* POST /servicios/{ceco}/notas-voz/interpretar  { campo|null, texto, duracion } -> { transcripcion, sugerencias:{bg,acts,tests,diag,sol,obs,imp}, simulada }
       En producción: el backend transcribe el audio (p. ej. Azure Speech) y un modelo de IA ordena el texto en los campos del informe. */
    interpretarNota: function (ceco, nota) {
      return new Promise(function (ok, ko) {
        setTimeout(function () {
          call('POST', '/servicios/' + ceco + '/notas-voz/interpretar', function () { var s = svc(ceco); return interpretar(s, nota || {}); }).then(ok, ko);
        }, 900);
      });
    },
    reset: function () { DB = seed(); save(); return Promise.resolve(true); }
  };
})();
