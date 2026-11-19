/* Kairos · Informes de servicio (IN-D100.F01) · app independiente
   Mismo informe que el módulo Proyectos › Informes del Ecosistema Kairos [ACORDADO 27-oct]:
   lo emite el ingeniero que prestó el servicio, firma solo Omnicon, fotos solo en Actividades.
   Datos: solo a través de window.KisAPI (simulada; en producción, el backend de Kairos). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var API = window.KisAPI, FOTOS = window.KIS_FOTOS || {}, LOGO = window.KIS_LOGO, KT = window.KairosTipos;
  var MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MONL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  var TODAY = iso(new Date());
  function hm() { var t = new Date(); return ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fd(s) { if (!s) return '—'; var a = s.split('-'); return +a[2] + ' ' + MON[+a[1] - 1] + ' ' + a[0].slice(2); }
  function pdfDate(s) { if (!s) return '-'; var a = s.split('-'); return +a[2] + ' de ' + MONL[+a[1] - 1] + ' de ' + a[0]; }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function slug(n) { return norm(n).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function initials(n) { return String(n || '?').split(' ').filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join(''); }
  function ic(id, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '"><use href="#' + id + '"></use></svg>'; }
  function av(name, cls) { var p = FOTOS[slug(name)]; return '<span class="av' + (cls ? ' ' + cls : '') + '">' + (p ? '<img src="' + p + '" alt="">' : esc(initials(name))) + '</span>'; }
  var tt; function toast(t) { var el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(function () { el.hidden = true; }, 2800); }
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------- Estado ---------- */
  var S = { me: null, svcs: [], cur: null, infs: [], view: 'login', tab: 'inf', filter: 'todos', q: '', loading: false, savedAt: null };
  var SUBL = { mantenimiento: 'Mantenimiento', bolsa: 'Bolsa de horas', puntual: 'Puntual', suministro: 'Suministro' };

  /* ---------- Descargas (capacidad de la plataforma) ---------- */
  var DL = null, DLst = 'pending';
  try {
    if (window.claude && window.claude.use) window.claude.use('downloads').then(function (d) { DL = d; DLst = d ? 'ok' : 'none'; rerenderLayer(); render(); }, function () { DLst = 'none'; render(); });
    else { DL = browserDL(); DLst = 'ok'; }
  } catch (e) { DL = browserDL(); DLst = 'ok'; }
  /* Fuera de claude.ai (p. ej. GitHub Pages): descarga normal del navegador */
  function browserDL() {
    return { save: function (o) {
      var u = URL.createObjectURL(o.data), a = document.createElement('a');
      a.href = u; a.download = o.filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
      return Promise.resolve();
    } };
  }
  function savePdf(doc, name) {
    if (!DL) { toast(DLst === 'pending' ? 'Preparando la descarga; intenta en un momento.' : 'La descarga no está disponible en esta vista.'); return; }
    DL.save({ filename: name, data: new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }) }).then(function () { toast('PDF guardado: ' + name); }, function (er) { toast(er && er.code === 'declined' ? 'Descarga cancelada' : 'No se pudo guardar el PDF'); });
  }

  /* ---------- Fotos: se comprimen al subir y se guardan en IndexedDB (en producción, almacenamiento del servidor) ---------- */
  var ISR_MAX = 40, PHOTO = { mem: {}, db: null, tried: false };
  function idb(cb) {
    if (PHOTO.db || PHOTO.tried) return cb(PHOTO.db);
    try { var r = indexedDB.open('kis-fotos', 1); r.onupgradeneeded = function () { r.result.createObjectStore('f'); }; r.onsuccess = function () { PHOTO.tried = true; PHOTO.db = r.result; cb(PHOTO.db); }; r.onerror = function () { PHOTO.tried = true; cb(null); }; } catch (e) { PHOTO.tried = true; cb(null); }
  }
  function photoPut(id, data) { PHOTO.mem[id] = data; idb(function (db) { if (!db) return; try { db.transaction('f', 'readwrite').objectStore('f').put(data, id); } catch (e) {} }); }
  function photoGet(ids, cb) {
    var out = {}, left = ids.filter(function (id) { if (PHOTO.mem[id]) { out[id] = PHOTO.mem[id]; return false; } return true; });
    if (!left.length) return cb(out);
    idb(function (db) {
      if (!db) return cb(out);
      try { var st = db.transaction('f').objectStore('f'), n = left.length; left.forEach(function (id) { var q = st.get(id); q.onsuccess = function () { if (q.result) { PHOTO.mem[id] = q.result; out[id] = q.result; } if (!--n) cb(out); }; q.onerror = function () { if (!--n) cb(out); }; }); } catch (e) { cb(out); }
    });
  }
  function compress(file, cb) {
    var fr = new FileReader();
    fr.onload = function () { var im = new Image(); im.onload = function () { var M = 1400, s = Math.min(1, M / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); cb(c.toDataURL('image/jpeg', .78), c.width, c.height); }; im.onerror = function () { cb(null); }; im.src = fr.result; };
    fr.onerror = function () { cb(null); }; fr.readAsDataURL(file);
  }
  function phImg(ph, alt) { var s = ph.src || PHOTO.mem[ph.id]; return '<img ' + (s ? 'src="' + s + '"' : 'data-ph="' + ph.id + '"') + ' alt="' + esc(alt) + '" loading="lazy">'; }
  function paintPhotos() {
    var els = document.querySelectorAll('img[data-ph]'); if (!els.length) return;
    photoGet(Array.prototype.map.call(els, function (e) { return e.dataset.ph; }), function (m) {
      Array.prototype.forEach.call(document.querySelectorAll('img[data-ph]'), function (e) { if (m[e.dataset.ph]) { e.src = m[e.dataset.ph]; e.removeAttribute('data-ph'); } });
    });
  }
  function photoData(list, cb) {
    var out = {}, ids = list.filter(function (x) { return !x.src; }).map(function (x) { return x.id; }), srcs = list.filter(function (x) { return x.src; }), n = srcs.length + 1;
    function done() { if (!--n) cb(out); }
    photoGet(ids, function (m) { for (var k in m) out[k] = m[k]; done(); });
    srcs.forEach(function (ph) {
      if (PHOTO.mem[ph.src]) { out[ph.src] = PHOTO.mem[ph.src]; return done(); }
      try { fetch(ph.src).then(function (r) { return r.blob(); }).then(function (b) { var fr = new FileReader(); fr.onload = function () { PHOTO.mem[ph.src] = fr.result; out[ph.src] = fr.result; done(); }; fr.onerror = done; fr.readAsDataURL(b); }, done); } catch (e) { done(); }
    });
  }
  var BRAND = { id: 'brand', src: 'assets/portada.jpg', w: 1600, h: 1067 };

  /* ---------- Borrador (uno por persona y servicio; vive en el dispositivo hasta emitir) ---------- */
  var ISF = [['bg', 'Antecedentes y descripción de la situación', 'Servicios anteriores asociados y su fecha, la falla según quien la reportó y el proceso intervenido con su arquitectura'],
    ['sysd', 'Descripción del sistema', 'Elementos de hardware y software, modelos y versiones'],
    ['acts', 'Actividades, ajustes o programación realizados', 'Qué se hizo durante el servicio. Una actividad por línea.'],
    ['tests', 'Pruebas realizadas', 'Pruebas para asegurar el funcionamiento. Si usas un formato aparte (IN-F22 Pruebas de aceptación), indícalo y adjúntalo'],
    ['diag', 'Diagnóstico', 'Qué causa la situación descrita en los antecedentes'],
    ['sol', 'Solución', 'Solución final al problema reportado'],
    ['obs', 'Observaciones y conclusiones', 'En qué estado queda el sistema y qué queda pendiente'],
    ['imp', 'Oportunidades de mejora identificadas', 'Opcional']];
  function dKey(ceco) { return 'kis.draft.' + S.me.id + '.' + ceco; }
  function draftOf(svc) { return store.get(dKey(svc.ceco)); }
  function draftNew(svc) {
    var last = S.infs.length ? S.infs[S.infs.length - 1] : null, one = svc.sitios.length === 1 ? svc.sitios[0] : null;
    var d = { f: { subj: 'Informe del servicio de ingeniería', req: '', d1: TODAY, h1: '', d2: TODAY, h2: '', plant: last ? last.f.plant : one ? one.planta : '', city: last ? last.f.city : one ? one.ciudad : '' },
      prog: JSON.parse(JSON.stringify(svc.sistema.prog)), eq: JSON.parse(JSON.stringify(svc.sistema.eq)), photos: [], step: 0, at: new Date().toISOString() };
    ISF.forEach(function (x) { d.f[x[0]] = ''; });
    if (last) d.f.sysd = last.f.sysd || '';
    return d;
  }
  var D = null, saveT;
  function saveDraft(now) { clearTimeout(saveT); var go = function () { if (!D || !S.cur) return; D.at = new Date().toISOString(); store.set(dKey(S.cur.ceco), D); S.savedAt = hm(); var n = $('savedAt'); if (n) n.textContent = 'Borrador guardado en este dispositivo · ' + S.savedAt; }; if (now) go(); else saveT = setTimeout(go, 350); }
  function asInforme(d) { return { n: S.infs.length ? S.infs[S.infs.length - 1].n + 1 : 1, at: TODAY, by: S.me.nombre, role: S.me.cargo, f: JSON.parse(JSON.stringify(d.f)), prog: d.prog.filter(function (r) { return r.n; }), eq: d.eq.filter(function (r) { return r.n; }), photos: JSON.parse(JSON.stringify(d.photos)), sent: [] }; }
  function P(svc) { return { name: svc.nombre, code: svc.ceco, clientName: svc.odoo.cliente }; }

  /* ---------- Notas de voz + interpretación (IA simulada en KisAPI.interpretarNota) ----------
     Audio: MediaRecorder (se guarda en el dispositivo, IndexedDB). Texto: dictado de claude.ai
     dentro del artefacto, o Web Speech API del navegador (Chrome/Android) fuera de él. */
  var VOZ_CAMPOS = { bg: 'Antecedentes', acts: 'Actividades', tests: 'Pruebas realizadas', diag: 'Diagnóstico', sol: 'Solución', obs: 'Observaciones y conclusiones', imp: 'Oportunidades de mejora' };
  var VOZ_PASO = { bg: 1, acts: 2, tests: 3, diag: 3, sol: 3, obs: 3, imp: 3 };
  var VOZ_MAX = 180;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var DICT = null;
  var VOZ = { ok: function () { return !!(DICT || SR || (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)); } };
  var REC = { on: false, campo: null, t0: 0, tick: null, finals: '', partial: '', mr: null, chunks: [], stream: null, rec: null, via: null };
  try {
    if (window.claude && window.claude.use) window.claude.use('dictation').then(function (d) {
      if (!d) return; DICT = d;
      d.onPartial(function (e) { if (REC.on && REC.via === 'dict') { REC.partial = e.text; recPaint(); } });
      d.onFinal(function (e) { if (REC.on || REC.via === 'dict') { REC.finals += REC.finals ? e.text : e.text.replace(/^\s+/, ''); REC.partial = ''; recPaint(); } });
      if (S.view === 'edit') render();
    }, function () {});
  } catch (e) {}
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function recBar() {
    return '<div class="recbar" role="status"><span class="dot" aria-hidden="true"></span><b id="recT">' + mmss((Date.now() - REC.t0) / 1000) + '</b>' +
      '<span class="rec-live" id="recP">' + (esc(REC.finals + (REC.partial ? ' ' + REC.partial : '')) || 'Escuchando… habla con naturalidad') + '</span>' +
      '<div class="rec-acts"><button type="button" class="btn sm" data-act="reccancel">Cancelar</button><button type="button" class="btn sm primary" data-act="recstop">' + ic('i-stop') + 'Detener</button></div></div>';
  }
  /* Pantalla completa mientras se dicta el informe: el celular no se usa, solo guía qué contar */
  var GUIA = [['Generalidades', '¿Qué reportó el cliente, desde cuándo y en qué equipo o proceso?'],
    ['Actividades', '¿Qué hiciste, paso a paso? Respaldos, ajustes, cambios de programa.'],
    ['Pruebas', '¿Cómo verificaste que quedó funcionando?'],
    ['Diagnóstico', '¿Cuál era la causa del problema?'],
    ['Solución', '¿Qué cambiaste, reemplazaste o ajustaste para resolverlo?'],
    ['Observaciones', '¿En qué estado queda el sistema? ¿Qué queda pendiente?'],
    ['Mejoras', '¿Qué le recomiendas al cliente a futuro?']];
  function dictOverlay() {
    return '<div class="dictov" role="dialog" aria-modal="true" aria-label="Dictando el informe"><div class="dictov-in">' +
      '<div class="dictov-top"><span class="dictov-mic">' + ic('i-mic') + '</span><div><small>Dictando el informe</small><b id="recT">' + mmss((Date.now() - REC.t0) / 1000) + ' / ' + mmss(VOZ_MAX) + '</b></div></div>' +
      '<div class="dictov-scroll"><p class="dictov-lead">Habla con naturalidad; no necesitas tocar el celular. Si te sirve, sigue esta guía:</p>' +
      '<ol class="dictov-guia">' + GUIA.map(function (g) { return '<li><b>' + g[0] + '</b><span>' + g[1] + '</span></li>'; }).join('') + '</ol>' +
      '<p class="dictov-note">Si no hablas de alguna sección, se queda vacía: no se inventa nada.</p></div>' +
      '<p class="dictov-live" id="recP">' + (esc(REC.finals + (REC.partial ? ' ' + REC.partial : '')) || 'Escuchando…') + '</p>' +
      '<div class="dictov-acts"><button type="button" class="btn" data-act="reccancel">Cancelar</button><button type="button" class="btn cyan" data-act="recstop">' + ic('i-stop') + 'Terminar</button></div></div></div>';
  }
  var WL = null;
  function wake(on) { try { if (on && navigator.wakeLock && !WL) navigator.wakeLock.request('screen').then(function (w) { WL = w; }, function () {}); else if (!on && WL) { WL.release(); WL = null; } } catch (e) {} }
  function recPaint() {
    var t = $('recT'), p = $('recP'); if (!REC.on) return;
    var sec = (Date.now() - REC.t0) / 1000;
    if (t) t.textContent = mmss(sec) + ' / ' + mmss(VOZ_MAX);
    if (p) p.textContent = (REC.finals + (REC.partial ? ' ' + REC.partial : '')) || (REC.campo ? 'Escuchando… habla con naturalidad' : 'Escuchando…');
    if (sec >= VOZ_MAX) { recStop(false); toast('Se alcanzó el máximo de 3 minutos por nota'); }
  }
  function recStart(campo) {
    if (REC.on) { toast('Ya hay una grabación en curso'); return; }
    REC = { on: true, campo: campo, t0: Date.now(), tick: null, finals: '', partial: '', mr: null, chunks: [], stream: null, rec: null, via: null };
    /* El dictado debe arrancar en el mismo clic, antes de cualquier await */
    if (DICT) {
      REC.via = 'dict';
      DICT.start().catch(function (er) {
        REC.via = null;
        if (er && er.code === 'not_granted') toast('Sin permiso para dictar: la nota se guarda solo como audio');
      });
    } else if (SR) {
      try {
        var r = new SR(); r.lang = 'es-CO'; r.continuous = true; r.interimResults = true;
        r.onresult = function (e) { var part = ''; for (var i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) REC.finals += (REC.finals ? ' ' : '') + e.results[i][0].transcript.trim(); else part += e.results[i][0].transcript; } REC.partial = part; recPaint(); };
        r.onerror = function () {}; r.onend = function () { if (REC.on && REC.rec === r) { try { r.start(); } catch (x) {} } };
        r.start(); REC.rec = r; REC.via = 'web';
      } catch (e) { REC.rec = null; }
    }
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder) {
      var mine = REC;
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
        if (REC !== mine || !REC.on) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
        REC.stream = st;
        try { var mr = new MediaRecorder(st); mr.ondataavailable = function (e) { if (e.data && e.data.size) mine.chunks.push(e.data); }; mr.start(); REC.mr = mr; } catch (e) {}
      }, function () { if (REC === mine && !REC.via) { toast('No hay acceso al micrófono en esta vista'); recStop(true); } });
    } else if (!REC.via) { REC.on = false; toast('Este navegador no permite grabar notas de voz'); return; }
    REC.tick = setInterval(recPaint, 500);
    if (!campo) { wake(true); window.scrollTo(0, 0); }
    render();
  }
  function recStop(cancel) {
    if (!REC.on) return;
    var r = REC; r.on = false; clearInterval(r.tick); wake(false);
    var dur = Math.round((Date.now() - r.t0) / 1000);
    var waits = [];
    if (r.via === 'dict' && DICT) waits.push(DICT.stop().catch(function () {}));
    if (r.rec) { var rr = r.rec; r.rec = null; waits.push(new Promise(function (ok) { rr.onend = ok; try { rr.stop(); } catch (e) { ok(); } setTimeout(ok, 1500); })); }
    if (r.mr && r.mr.state !== 'inactive') waits.push(new Promise(function (ok) { r.mr.onstop = ok; try { r.mr.stop(); } catch (e) { ok(); } }));
    Promise.all(waits).then(function () {
      if (r.stream) r.stream.getTracks().forEach(function (t) { t.stop(); });
      r.via = null;
      if (cancel) { render(); toast('Grabación cancelada'); return; }
      var text = tx(r.finals + (r.partial ? ' ' + r.partial : ''));
      var id = 'aud-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var note = { id: id, campo: r.campo, at: new Date().toISOString(), dur: dur, text: text, audio: false, st: 'pend' };
      var finish = function () {
        if (!D) return; (D.notes = D.notes || []).push(note); saveDraft(true);
        if (navigator.onLine !== false) interpretar(id); else { render(); toast('Nota guardada en el celular. Se interpreta cuando vuelva la conexión.'); }
      };
      if (r.chunks.length) {
        var fr = new FileReader(); fr.onload = function () { photoPut(id, fr.result); note.audio = true; finish(); }; fr.onerror = finish;
        fr.readAsDataURL(new Blob(r.chunks, { type: r.chunks[0].type || 'audio/webm' }));
      } else finish();
    });
    render();
  }
  function interpretar(id) {
    var n = (D && D.notes || []).filter(function (x) { return x.id === id; })[0]; if (!n || n.st === 'run') return;
    if (navigator.onLine === false) { toast('Sin conexión: la nota queda guardada para interpretarla después'); return; }
    n.st = 'run'; render();
    var ceco = S.cur.ceco;
    API.interpretarNota(ceco, { campo: n.campo, texto: n.text, duracion: n.dur, audio: !!n.audio }).then(function (r) {
      if (!D || !S.cur || S.cur.ceco !== ceco) return;
      n.st = 'ok'; n.sim = !!r.simulada; if (!n.text && r.transcripcion) { n.text = r.transcripcion; n.textSim = true; }
      D.sug = D.sug || {}; var ks = [];
      Object.keys(r.sugerencias || {}).forEach(function (k) {
        var t = tx(r.sugerencias[k]); if (!t || !VOZ_CAMPOS[k]) return;
        var L = sugsOf(k).filter(function (x) { return x.nota !== id; });
        L.push({ id: 'sg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text: t, nota: id, campo: n.campo || null }); D.sug[k] = L; ks.push(k);
      });
      if (!ks.length) n.st = n.text ? 'ok' : 'vacia';
      saveDraft(true); render();
      toast(!ks.length ? (n.text ? 'La nota no trae contenido para estos campos' : 'La nota no tiene transcripción: quedó guardada como audio') : n.campo ? 'Sugerencia lista debajo del campo' : 'Sugerencias listas en ' + ks.length + ' campos · los pasos con punto verde tienen sugerencias');
    }, function () { n.st = 'pend'; saveDraft(true); render(); toast('No se pudo interpretar la nota; queda guardada'); });
  }
  function sugsOf(k) { var v = D.sug && D.sug[k]; if (!v) return []; if (!Array.isArray(v)) { v = [v]; D.sug[k] = v; } return v; }
  function sugCount(k) { return sugsOf(k).length; }
  function sugCard(k) {
    var L = sugsOf(k); if (!L.length) return '';
    var full = !!tx(D.f[k]);
    return L.map(function (sg, i) {
      var v = k + '|' + sg.id, src = sg.campo ? 'De tu nota de voz en este campo' : 'Del dictado del informe completo';
      return '<div class="sug" role="region" aria-label="Sugerencia para ' + esc(VOZ_CAMPOS[k]) + '"><div class="sug-h">' + ic('i-spark') + '<b>' + (L.length > 1 ? 'Sugerencia ' + (i + 1) + ' · ' : 'Sugerencia · ') + src + '</b><span class="sim">IA simulada</span></div>' +
        '<p>' + esc(sg.text) + '</p><div class="sug-a"><button type="button" class="btn sm" data-act="sugno" data-v="' + v + '">Descartar</button>' +
        (full ? '<button type="button" class="btn sm" data-act="sugadd" data-v="' + v + '">Agregar al final</button><button type="button" class="btn sm primary" data-act="sugusar" data-v="' + v + '">Reemplazar</button>' : '<button type="button" class="btn sm primary" data-act="sugusar" data-v="' + v + '">' + ic('i-check') + 'Usar</button>') + '</div></div>';
    }).join('');
  }
  function notaRow(n) {
    var st = n.st === 'run' ? '<span class="chip run">Interpretando…</span>' : n.st === 'ok' ? '<span class="chip ok">Interpretada</span>' : n.st === 'vacia' ? '<span class="chip">Sin transcripción</span>' : '<span class="chip pend">Pendiente</span>';
    var d = new Date(n.at);
    return '<div class="nota"><div class="nota-h">' + ic('i-mic') + '<b>' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + '</b><span class="hint">' + mmss(n.dur) + '</span>' + st + '</div>' +
      (n.audio ? '<audio controls preload="none" data-aud="' + n.id + '"></audio>' : '') +
      (n.text ? '<details><summary>Transcripción' + (n.textSim ? ' (simulada para la demostración)' : '') + '</summary><p>' + esc(n.text) + '</p></details>' : '') +
      '<div class="nota-a">' + (n.st === 'pend' ? '<button type="button" class="btn sm" data-act="notaint" data-v="' + n.id + '">' + ic('i-spark') + 'Interpretar</button>' : '') +
      '<button type="button" class="btn sm ghost" data-act="notadel" data-v="' + n.id + '" aria-label="Eliminar nota">' + ic('i-trash') + 'Eliminar</button></div></div>';
  }
  function notasDe(campo) { return (D.notes || []).filter(function (n) { return (n.campo || null) === campo; }); }
  function notasList(L, label) {
    if (!L.length) return '';
    return '<details class="notas"><summary>' + ic('i-mic') + L.length + ' ' + label + (L.length === 1 ? '' : 's') + (L.some(function (n) { return n.st === 'pend'; }) ? ' · <span class="pendtx">pendiente por interpretar</span>' : '') + '</summary>' + L.slice().reverse().map(notaRow).join('') + '</details>';
  }
  /* Dictado completo: una sola vez, al inicio del contenido (paso 2) */
  function vozCard() {
    if (D.step !== 1) return '';
    var L = notasDe(null); if (!VOZ.ok() && !L.length) return '';
    var body =
      '<div class="voz-row">' + ic('i-mic') + '<div><b>¿Prefieres dictar?</b><span class="hint">Cuenta todo el servicio en una sola nota y la IA lo reparte en los pasos 2 a 4. Si no, llena campo por campo.</span></div>' +
      (VOZ.ok() ? '<button type="button" class="btn sm" data-act="dictar"' + (REC.on ? ' disabled' : '') + '>Dictar</button>' : '') + '</div>';
    return '<div class="voz">' + body + notasList(L, 'nota del informe completo') + '</div>';
  }
  function paintAudio() {
    var els = document.querySelectorAll('audio[data-aud]'); if (!els.length) return;
    photoGet(Array.prototype.map.call(els, function (e) { return e.dataset.aud; }), function (m) {
      Array.prototype.forEach.call(document.querySelectorAll('audio[data-aud]'), function (e) { if (m[e.dataset.aud]) { e.src = m[e.dataset.aud]; e.removeAttribute('data-aud'); } else e.hidden = true; });
    });
  }
  window.addEventListener('online', function () {
    if (!D || !D.notes) return; D.notes.filter(function (n) { return n.st === 'pend'; }).forEach(function (n) { interpretar(n.id); });
  });

  /* ---------- Rutas (hash): #inicio · #s-CECO · #c-CECO · #e-CECO ---------- */
  function route() {
    if (!S.me) { S.view = 'login'; render(); return; }
    var h = (location.hash || '').slice(1), m = /^([sce])-(\d+)$/.exec(h);
    if (!m) { S.view = 'home'; S.cur = null; loadHome(); return; }
    var ceco = m[2], kind = m[1];
    var after = function () {
      if (kind === 'e') { S.view = 'edit'; D = draftOf(S.cur) || draftNew(S.cur); if (D.step == null) D.step = 0; }
      else { S.view = 'svc'; S.tab = kind === 'c' ? 'car' : 'inf'; }
      render(); window.scrollTo(0, 0);
    };
    if (S.cur && S.cur.ceco === ceco && S.view !== 'home') return after();
    S.loading = true; S.view = 'svc'; render();
    Promise.all([API.getServicio(ceco), API.listInformes(ceco), API.getCatalogo(ceco)]).then(function (r) { S.cur = r[0]; S.infs = r[1].map(fixInf); S.cat = r[2]; S.loading = false; after(); }, function (e) { S.loading = false; toast('No se pudo abrir el servicio (' + e.message + ')'); location.hash = 'inicio'; });
  }
  function fixInf(i) { if (!i.role) i.role = i.cargo || 'Ingeniero'; return i; }
  function loadHome() {
    S.loading = !S.svcs.length; render();
    API.listServicios(S.me.nombre).then(function (L) { S.svcs = L; S.loading = false; if (S.view === 'home') render(); }, function () { S.loading = false; toast('Sin respuesta de Kairos'); render(); });
  }
  window.addEventListener('hashchange', route);
  function go(h) { if (location.hash === '#' + h) route(); else location.hash = h; }

  /* ---------- Render ---------- */
  function top(title, sub, back) {
    var on = navigator.onLine !== false;
    return '<header class="top">' + (back ? '<button class="back" data-act="back" aria-label="Volver">' + ic('i-back') + '</button>' : '<img class="logo" src="' + LOGO + '" alt="Omnicon">') +
      '<div class="ttl"><small>' + esc(sub) + '</small><b>' + esc(title) + '</b></div>' +
      '<span class="net off" id="net"' + (on ? ' hidden' : '') + '><i></i>Sin conexión</span>' +
      '<button class="me" data-act="menu" aria-label="Menú de ' + esc(S.me.nombre) + '">' + (FOTOS[slug(S.me.nombre)] ? '<img src="' + FOTOS[slug(S.me.nombre)] + '" alt="">' : esc(initials(S.me.nombre))) + '</button></header>';
  }
  function render() {
    var app = $('app'), h = '';
    if (S.view === 'login') h = loginView();
    else if (S.view === 'home') h = top('Mis servicios', 'Kairos · Informes', false) + '<main>' + homeView() + '</main>';
    else if (S.view === 'svc') h = top(S.cur ? S.cur.nombre : 'Servicio', S.cur ? S.cur.ceco : 'Cargando…', true) + '<main>' + (S.loading || !S.cur ? '<div class="spin" role="status" aria-label="Cargando"></div>' : svcView()) + '</main>';
    else if (S.view === 'edit') h = top('Informe de servicio #' + (S.infs.length ? S.infs[S.infs.length - 1].n + 1 : 1), S.cur.ceco + ' · borrador', true) + editView();
    app.innerHTML = h + (REC.on && !REC.campo && S.view === 'edit' ? dictOverlay() : ''); paintPhotos(); paintAudio();
    document.body.classList.toggle('dict-on', !!(REC.on && !REC.campo));
  }

  /* Entrada: simula el inicio de sesión con Microsoft Entra ID */
  var PEOPLE = null;
  function loginView() {
    if (!PEOPLE) { API.personas().then(function (L) { PEOPLE = L; render(); }); }
    return '<section class="login"><div class="login-in"><img class="logo" src="' + LOGO + '" alt="Omnicon">' +
      '<h1>Informes de servicio<br><span>en campo, desde el celular</span></h1>' +
      '<p>Emite el informe IN-D100.F01 donde prestaste el servicio: fotos, actividades, diagnóstico y PDF listo para el cliente. Los servicios y su caracterización llegan de Kairos.</p>' +
      '<div class="ms"><div class="ms-h"><svg viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>Microsoft · simulado</div><h2>Elige una cuenta</h2>' +
      (PEOPLE ? PEOPLE.map(function (p) { return '<button class="acct" data-act="login" data-v="' + p.id + '">' + av(p.nombre) + '<span><b>' + esc(p.nombre) + '</b><small>' + esc(p.cargo) + ' · ' + esc(p.correo) + '</small></span></button>'; }).join('') : '<div class="spin"></div>') +
      '<span class="hint" style="color:#6b6b6b">En producción se entra con la cuenta corporativa (Entra ID). Aquí eliges a quién simular.</span></div></div></section>';
  }

  function hasDraft(s) { return !!store.get(dKey(s.ceco)); }
  function homeView() {
    if (S.loading) return '<div class="spin" role="status" aria-label="Cargando"></div>';
    var L = S.svcs, q = norm(S.q), f = S.filter;
    var tot = 0; L.forEach(function (s) { tot += s.informes.total; });
    var drafts = L.filter(hasDraft).length;
    var shown = L.filter(function (s) {
      if (f === 'borrador' && !hasDraft(s)) return false;
      if (f !== 'todos' && f !== 'borrador' && s.sub !== f) return false;
      return !q || norm(s.nombre + ' ' + s.ceco + ' ' + s.odoo.cliente + ' ' + s.sitios.map(function (x) { return x.planta + ' ' + x.ciudad; }).join(' ')).indexOf(q) >= 0;
    });
    var subs = ['mantenimiento', 'bolsa', 'puntual', 'suministro'].filter(function (k) { return L.some(function (s) { return s.sub === k; }); });
    var chips = [['todos', 'Todos']].concat(subs.map(function (k) { return [k, SUBL[k]]; })).concat(drafts ? [['borrador', 'Con borrador']] : []);
    return '<div class="hello"><small>Hola, ' + esc(S.me.nombre.split(' ')[0]) + '</small><h2>¿Dónde prestaste el servicio hoy?</h2></div>' +
      '<div class="kpis"><div class="kpi"><small>Servicios asignados</small><b>' + L.length + '</b></div><div class="kpi"><small>Borradores</small><b>' + drafts + '</b></div><div class="kpi"><small>Informes emitidos</small><b>' + tot + '</b></div></div>' +
      '<div class="search">' + ic('i-search') + '<input class="f" id="q" type="search" placeholder="Buscar servicio, cliente, planta o CECO" value="' + esc(S.q) + '" aria-label="Buscar"></div>' +
      '<div class="chips" role="group" aria-label="Filtrar">' + chips.map(function (c) { return '<button class="chip" data-act="filter" data-v="' + c[0] + '" aria-pressed="' + (f === c[0]) + '">' + (c[0] !== 'todos' && c[0] !== 'borrador' ? KT.tile('servicio', c[0], 'sm') : '') + esc(c[1]) + '</button>'; }).join('') + '</div>' +
      (shown.length ? shown.map(svcCard).join('') : '<div class="empty">' + (L.length ? 'Ningún servicio coincide con la búsqueda.' : 'No tienes servicios asignados. Tu líder te agrega al equipo del servicio en Kairos.') + '</div>');
  }
  function svcCard(s) {
    var u = s.informes.ultimo, dr = hasDraft(s);
    return '<button class="svc" data-act="open" data-v="' + s.ceco + '">' + KT.tile('servicio', s.urgencia ? 'urgencia' : s.sub, 'lg') +
      '<span class="svc-c"><b>' + esc(s.nombre) + '</b><span class="meta">' + esc(s.odoo.cliente) + ' · ' + esc(s.sitios.map(function (x) { return x.planta; }).join(', ')) + '</span>' +
      '<span class="row"><span class="mono meta">' + s.ceco + '</span>' + (dr ? '<span class="pill warn">Borrador pendiente</span>' : '') + '<span class="pill">' + s.informes.total + (s.informes.total === 1 ? ' informe' : ' informes') + '</span>' +
      (u ? '<span class="meta">Último #' + u.n + ' · ' + fd(u.at) + '</span>' : '') + '</span></span>' + ic('i-chev', 'chev') + '</button>';
  }

  function svcView() {
    var s = S.cur, o = s.odoo, dr = draftOf(s);
    var hero = '<section class="hero"><div class="top-r">' + KT.tile('servicio', s.urgencia ? 'urgencia' : s.sub, 'lg') + '<div><h2>' + esc(s.nombre) + '</h2><p>' + esc(o.cliente) + ' · ' + KT.label('servicio', s.urgencia ? 'urgencia' : s.sub) + '</p></div></div>' +
      '<div class="facts"><div><small>Centro de costos</small><b class="mono">' + s.ceco + '</b></div><div><small>Líder</small><b>' + esc(s.lider) + '</b></div><div><small>Regional</small><b>' + esc(o.cluster + ' · ' + o.regional) + '</b></div><div><small>Vigencia</small><b>' + fd(o.inicio) + ' → ' + fd(o.fin) + '</b></div></div></section>';
    var tabs = '<div class="tabs" role="tablist"><button role="tab" data-act="tab" data-v="inf" aria-selected="' + (S.tab === 'inf') + '">Informes (' + S.infs.length + ')</button><button role="tab" data-act="tab" data-v="car" aria-selected="' + (S.tab === 'car') + '">Caracterización</button></div>';
    return hero + tabs + (S.tab === 'inf' ? infTab(s, dr) : carTab(s));
  }
  function canWrite(s) { return s.lider === S.me.nombre || s.equipo.indexOf(S.me.nombre) >= 0; }
  function infTab(s, dr) {
    var h = '';
    if (dr) h += '<section class="card draft-card"><div class="card-b"><div style="display:flex;gap:10px;align-items:center">' + ic('i-edit') + '<div style="flex:1;min-width:0"><b>Tienes un borrador del informe #' + (S.infs.length ? S.infs[S.infs.length - 1].n + 1 : 1) + '</b><div class="hint">' + esc(dr.f.plant || 'Sin planta') + ' · ' + fd(dr.f.d1) + ' · ' + dr.photos.length + (dr.photos.length === 1 ? ' foto' : ' fotos') + ' · guardado en este dispositivo</div></div></div><a class="btn primary block" href="#e-' + s.ceco + '">Continuar borrador</a></div></section>';
    var L = S.infs.slice().reverse();
    h += '<section class="card"><div class="card-h"><h3>Histórico de informes</h3><span class="pill">IN-D100.F01</span></div><div class="card-b">' +
      (L.length ? '<div class="hist">' + L.map(function (i) {
        var to = []; i.sent.forEach(function (x) { x.to.forEach(function (t) { if (to.indexOf(t.n || t.em) < 0) to.push(t.n || t.em); }); });
        return '<div class="hi"><span class="n">#' + i.n + '</span><div class="c"><b>' + esc(i.f.plant || '—') + ' · ' + fd(i.f.d1) + (i.f.d2 && i.f.d2 !== i.f.d1 ? ' a ' + fd(i.f.d2) : '') + '</b><span>' + esc(i.by) + ' · emitido ' + fd(i.at) + ' · ' + i.photos.length + (i.photos.length === 1 ? ' foto' : ' fotos') + '</span><span>' + (i.sent.length ? 'Enviado a ' + esc(to.join(', ')) : 'Emitido sin envío') + '</span>' +
          '<div class="acts"><button class="btn sm" data-act="view" data-v="' + i.n + '">' + ic('i-eye') + 'Ver</button>' + (DLst !== 'none' ? '<button class="btn sm" data-act="pdf" data-v="' + i.n + '">' + ic('i-pdf') + 'PDF</button>' : '') + (canWrite(s) ? '<button class="btn sm" data-act="resend" data-v="' + i.n + '">' + ic('i-send') + 'Reenviar</button>' : '') + '</div></div></div>';
      }).join('') + '</div>' : '<div class="empty">Aún no hay informes de este servicio.</div>') + '</div></section>';
    if (canWrite(s) && !dr) h += '<a class="btn primary fab" href="#e-' + s.ceco + '">' + ic('i-plus') + 'Nuevo informe</a>';
    return h;
  }
  function carTab(s) {
    var o = s.odoo;
    var kv = function (rows) { return '<dl class="kv">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="mono"' : '') + '>' + esc(r[1] || '—') + '</dd></div>'; }).join('') + '</dl>'; };
    var box = function (t, src, body, note) { return '<section class="card"><div class="card-h"><h3>' + t + '</h3>' + src + '</div><div class="card-b">' + body + (note ? '<span class="hint">' + note + '</span>' : '') + '</div></section>'; };
    var odoo = '<span class="pill odoo">Odoo</span>', kai = '<span class="pill kairos">Kairos</span>';
    var tb = function (R, a, b) { return '<table class="st"><thead><tr><th>' + a + '</th><th>' + b + '</th></tr></thead><tbody>' + (R.length ? R.map(function (r) { return '<tr><td>' + esc(r.n) + '</td><td>' + esc(r.v) + '</td></tr>'; }).join('') : '<tr><td colspan="2" class="hint">Sin registros</td></tr>') + '</tbody></table>'; };
    return '<div class="banner">' + ic('i-plug') + '<div>Esta información la define Kairos al crear el servicio y llega por la API. Aquí es de solo lectura: si algo no cuadra, pídele el cambio a tu líder.</div></div>' +
      box('Datos base', odoo, kv([['CECO (cuenta analítica)', s.ceco, 1], ['Cliente', o.cliente], ['NIT / Tax ID', o.nit, 1], ['Cluster', o.cluster], ['Regional', o.regional], ['Moneda', o.moneda], ['Cotización', o.cotizacion, 1], ['Vigencia', fd(o.inicio) + ' → ' + fd(o.fin)], ['Estado', o.estado]])) +
      box('Tipo de servicio', kai, '<div class="pp">' + KT.tile('servicio', s.urgencia ? 'urgencia' : s.sub, 'lg') + '<div><b>' + esc(KT.label('servicio', s.urgencia ? 'urgencia' : s.sub)) + '</b><span>El subtipo es un atributo del CECO en Kairos (Odoo no lo trae).</span></div></div>') +
      box('Equipo asignado', kai, '<div class="ppl">' + [s.lider].concat(s.equipo.filter(function (n) { return n !== s.lider; })).map(function (n, k) { return '<div class="pp">' + av(n) + '<div><b>' + esc(n) + '</b><span>' + (k === 0 ? 'Líder del servicio' : 'Integrante') + '</span></div></div>'; }).join('') + '</div>', 'Pueden emitir informes el líder y los integrantes del equipo.') +
      box('Sitios', odoo, '<div class="ppl">' + s.sitios.map(function (x) { return '<div class="pp"><span class="av" style="background:var(--primary-soft);color:var(--primary)">' + ic('i-doc') + '</span><div><b>' + esc(x.planta) + '</b><span>' + esc(x.direccion) + ' · ' + esc(x.ciudad) + '</span></div></div>'; }).join('') + '</div>') +
      box('Contactos del cliente', kai, '<div class="ppl">' + s.contactos.map(function (c) { return '<div class="pp"><span class="av">' + esc(initials(c.nombre)) + '</span><div><b>' + esc(c.nombre) + (c.recibeInformes ? ' <span class="pill ok">Recibe informes</span>' : '') + '</b><span>' + esc(c.cargo) + (c.planta ? ' · ' + esc(c.planta) : ' · General') + '</span><span>' + esc(c.correo) + '</span></div></div>'; }).join('') + '</div>', 'Al enviar, se proponen los que reciben informes de la planta del servicio y los generales.') +
      box('Sistema instalado', kai, tb(s.sistema.prog, 'Programa', 'Versión') + tb(s.sistema.eq, 'Equipo', 'Firmware'), 'Se actualiza con cada informe emitido y se precarga en el siguiente.');
  }

  /* ---------- Editor por pasos ---------- */
  var STEPS = [['Servicio', 'Información del servicio'], ['Sistema', 'Situación y sistema'], ['Actividades', 'Actividades y fotos'], ['Resultados', 'Pruebas, diagnóstico y cierre'], ['Emitir', 'Revisar y emitir']];
  function tx(s) { return String(s || '').trim(); }
  function missReq() { return !D.f.d1 ? 0 : !tx(D.f.plant) ? 0 : !tx(D.f.acts) ? 2 : !tx(D.f.obs) ? 3 : -1; }
  function stepDone(k) { var f = D.f; return k === 0 ? !!(f.d1 && tx(f.plant)) : k === 1 ? !!(tx(f.bg) || D.prog.length || D.eq.length) : k === 2 ? !!tx(f.acts) : k === 3 ? !!tx(f.obs) : false; }
  function fcls(k, req) { return ' class="field ' + (tx(D.f[k]) ? 'f-ok' : 'f-empty') + (req ? ' rq' : '') + '"'; }
  /* Hora con dos listas (hora y minutos) en lugar del reloj nativo de Android, que se corta en algunos teléfonos */
  function hora(k) {
    var v = String(D.f[k] || ''), h = v.slice(0, 2), m = v.slice(3, 5), H = [], M = [];
    for (var i = 0; i < 24; i++) H.push(('0' + i).slice(-2));
    for (var j = 0; j < 60; j += 5) M.push(('0' + j).slice(-2));
    if (m && M.indexOf(m) < 0) { M.push(m); M.sort(); }
    var opt = function (L, cur, ph) { return '<option value="">' + ph + '</option>' + L.map(function (x) { return '<option' + (x === cur ? ' selected' : '') + '>' + x + '</option>'; }).join(''); };
    return '<div' + fcls(k) + '><div class="lbl-row"><label for="f-' + k + '-h">Hora</label><button type="button" class="lnk" data-act="ahora" data-v="' + k + '">Ahora</button></div>' +
      '<div class="hm"><select class="f" id="f-' + k + '-h" data-hora="' + k + ':h" aria-label="Hora">' + opt(H, h, '--') + '</select><span aria-hidden="true">:</span>' +
      '<select class="f" data-hora="' + k + ':m" aria-label="Minutos">' + opt(M, m, '--') + '</select></div></div>';
  }
  function inp(k, label, type, extra, req) { return '<div' + fcls(k, req) + '><label for="f-' + k + '">' + label + (req ? ' <span class="req">*</span>' : '') + '</label><input class="f" id="f-' + k + '" data-f="' + k + '" type="' + (type || 'text') + '" value="' + esc(D.f[k]) + '"' + (extra || '') + '></div>'; }
  function txa(x, rows, req, hideLabel) {
    var k = x[0], mic = VOZ_CAMPOS[k] && VOZ.ok();
    return '<div' + fcls(k, req) + ' data-fw="' + k + '"><label for="f-' + k + '"' + (hideLabel ? ' class="sr"' : '') + '>' + x[1] + (req ? ' <span class="req">*</span>' : '') + '</label>' +
      '<div class="fw' + (mic ? ' has-mic' : '') + '"><textarea class="f" id="f-' + k + '" data-f="' + k + '" rows="' + (rows || 4) + '" placeholder="' + esc(x[2]) + '">' + esc(D.f[k]) + '</textarea>' +
      (mic ? '<button type="button" class="mic' + (REC.on && REC.campo === k ? ' on' : '') + '" data-act="mic" data-v="' + k + '" title="Grabar nota de voz para este campo" aria-label="Grabar nota de voz: ' + esc(VOZ_CAMPOS[k]) + '">' + ic('i-mic') + '</button>' : '') + '</div>' +
      (REC.on && REC.campo === k ? recBar() : '') + sugCard(k) + (VOZ_CAMPOS[k] ? notasList(notasDe(k), 'nota de voz') : '') + '</div>';
  }
  function editView() {
    var s = S.cur, k = D.step;
    var steps = '<nav class="steps" aria-label="Pasos">' + STEPS.map(function (x, i) { var hasSug = Object.keys(D.sug || {}).some(function (q) { return VOZ_PASO[q] === i && sugCount(q); }); return '<button class="step' + (stepDone(i) ? ' done' : '') + (hasSug ? ' has-sug' : '') + '" data-act="step" data-v="' + i + '"' + (i === k ? ' aria-current="step"' : '') + '><i>' + (stepDone(i) && i !== k ? '✓' : i + 1) + '</i><span>' + x[0] + '</span></button>'; }).join('') + '</nav>';
    var body = '';
    if (k === 0) {
      var sites = s.sitios.map(function (x) { return x.planta; }); if (D.f.plant && sites.indexOf(D.f.plant) < 0) sites.push(D.f.plant);
      body = '<div class="field"><span class="lb">Servicio</span><b>' + esc(s.nombre) + '</b><span class="hint">' + esc(s.odoo.cliente) + ' · <span class="mono">' + s.ceco + '</span></span></div>' +
        '<div' + fcls('plant', true) + '><label for="f-plant">Planta <span class="req">*</span></label><select class="f" id="f-plant" data-f="plant"><option value="">Elige la planta</option>' + sites.map(function (p) { return '<option' + (p === D.f.plant ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select></div>' +
        inp('city', 'Ciudad') +
        inp('req', 'Solicitado por', 'text', ' list="dl-req" autocomplete="off"') + '<datalist id="dl-req">' + s.contactos.map(function (c) { return '<option value="' + esc(c.nombre) + '">' + esc(c.cargo) + '</option>'; }).join('') + '</datalist>' +
        '<div class="g2">' + inp('d1', 'Inicio', 'date', ' max="' + TODAY + '"', true) + hora('h1') + inp('d2', 'Finalización', 'date', ' max="' + TODAY + '"') + hora('h2') + '</div>' +
        inp('subj', 'Asunto');
    } else if (k === 1) {
      var sys = function (key, a, b) {
        return '<div class="field"><span class="lb">' + a + 's</span><div class="sysl">' + (D[key].length ? D[key].map(function (r, i) {
          return '<div class="sysi"><button type="button" class="sysi-m" data-act="sysedit" data-v="' + key + ':' + i + '" aria-label="Cambiar ' + esc(r.n) + '"><b>' + esc(r.n || 'Sin nombre') + '</b><span class="ver">' + (r.v ? b + ' ' + esc(r.v) : 'Sin ' + b.toLowerCase()) + '</span>' + ic('i-edit') + '</button>' +
            '<button type="button" class="x" data-act="sysrm" data-v="' + key + ':' + i + '" aria-label="Quitar ' + esc(r.n) + '">' + ic('i-x') + '</button></div>';
        }).join('') : '<span class="hint">Sin ' + a.toLowerCase() + 's registrados.</span>') +
          '<button type="button" class="btn sm" data-act="sysadd" data-v="' + key + '" style="align-self:flex-start">' + ic('i-plus') + 'Agregar ' + a.toLowerCase() + '</button></div></div>';
      };
      body = vozCard() + '<h3 class="sec-t">Generalidades</h3>' + txa(ISF[0], 5) +
        '<h3 class="sec-t">Descripción del sistema</h3><span class="hint">Viene del último informe de este servicio. Ajusta lo que haya cambiado.</span>' + sys('prog', 'Programa', 'Versión') + sys('eq', 'Equipo', 'Firmware') + txa(ISF[1], 3);
    } else if (k === 2) {
      body = vozCard() + '<h3 class="sec-t">Actividades</h3>' + txa(ISF[2], 7, true) +
        '<h3 class="sec-t">Registro fotográfico</h3><div class="ph-grid">' + D.photos.map(function (ph, i) { return '<figure class="ph">' + phImg(ph, 'Foto ' + (i + 1)) + '<span class="num">' + (i + 1) + '</span><input class="f" data-cap="' + ph.id + '" value="' + esc(ph.cap) + '" placeholder="Pie de foto" aria-label="Pie de foto ' + (i + 1) + '"><button class="x" data-act="phrm" data-v="' + ph.id + '" aria-label="Quitar foto ' + (i + 1) + '">' + ic('i-x') + '</button></figure>'; }).join('') + '</div>' +
        (D.photos.length < ISR_MAX ? '<div class="photo-acts"><label class="btn primary">' + ic('i-cam') + 'Tomar foto<input type="file" accept="image/*" capture="environment" data-photo="1" hidden></label><label class="btn">' + ic('i-image') + 'Subir fotos<input type="file" accept="image/*" multiple data-photo="1" hidden></label></div>' : '') +
        '<span class="hint">' + D.photos.length + ' de ' + ISR_MAX + ' figuras · fotos o pantallazos; se comprimen al subirlas y salen completas en el PDF.</span>';
    } else if (k === 3) {
      body = vozCard() + '<h3 class="sec-t">Pruebas realizadas</h3>' + txa(ISF[3], 4, false, true) + '<h3 class="sec-t">Diagnóstico</h3>' + txa(ISF[4], 3, false, true) + '<h3 class="sec-t">Solución</h3>' + txa(ISF[5], 3, false, true) +
        '<h3 class="sec-t">Observaciones y conclusiones <span class="req">*</span></h3>' + txa(ISF[6], 4, true, true) + '<h3 class="sec-t">Oportunidades de mejora</h3>' + txa(ISF[7], 3, false, true);
    } else {
      var f = D.f, C = [[!!f.d1, 'Fecha de inicio', 0, 1], [!!tx(f.plant), 'Planta', 0, 1], [!!tx(f.acts), 'Actividades realizadas', 2, 1], [!!tx(f.obs), 'Observaciones y conclusiones', 3, 1],
        [!!tx(f.req), 'Quién solicitó el servicio', 0], [!!tx(f.bg), 'Antecedentes', 1], [D.photos.length > 0, 'Al menos una foto', 2], [!!(tx(f.diag) && tx(f.sol)), 'Diagnóstico y solución', 3]];
      var miss = C.filter(function (c) { return c[3] && !c[0]; }).length;
      body = '<div class="banner' + (miss ? ' warn' : ' ok') + '">' + ic(miss ? 'i-alert' : 'i-check') + '<div>' + (miss ? 'Faltan ' + miss + (miss === 1 ? ' dato obligatorio' : ' datos obligatorios') + ' para emitir.' : 'Listo para emitir. Al emitir, el informe queda en el histórico a tu nombre y no se puede cambiar.') + '</div></div>' +
        '<div class="checks">' + C.map(function (c) { return '<div class="chk' + (c[0] ? '' : ' no') + '">' + ic(c[0] ? 'i-check' : 'i-alert') + '<span>' + c[1] + (c[3] ? '' : ' <span class="hint">· recomendado</span>') + '</span>' + (c[0] ? '' : '<button class="btn sm" data-act="step" data-v="' + c[2] + '">Completar</button>') + '</div>'; }).join('') + '</div>' +
        '<div class="field"><span class="lb">Firma</span><div class="pp">' + av(S.me.nombre) + '<div><b>' + esc(S.me.nombre) + '</b><span>' + esc(S.me.cargo) + ' · Omnicon S.A.S. El cliente no firma; el envío queda registrado.</span></div></div></div>' +
        '<div class="g2"><button class="btn" data-act="preview">' + ic('i-eye') + 'Vista previa</button>' + (DLst !== 'none' ? '<button class="btn" data-act="pdfdraft"' + (miss ? ' disabled title="Completa los datos obligatorios para descargar el PDF"' : '') + '>' + ic('i-pdf') + 'PDF borrador</button>' : '<span></span>') + '</div>' +
        (miss && DLst !== 'none' ? '<span class="hint">El PDF se habilita cuando estén completos los datos obligatorios.</span>' : '') +
        '<button class="btn" data-act="discard" style="color:var(--err-ink)">Descartar borrador</button>';
    }
    var bar = '<div class="bar"><div class="bar-in">' + (k > 0 ? '<button class="btn" data-act="step" data-v="' + (k - 1) + '">' + ic('i-back') + 'Atrás</button>' : '<button class="btn" data-act="back">Salir</button>') +
      (k < STEPS.length - 1 ? '<button class="btn primary" data-act="step" data-v="' + (k + 1) + '">Siguiente · ' + STEPS[k + 1][0] + '</button>' : '<button class="btn primary" data-act="emit">' + ic('i-send') + 'Emitir y enviar</button>') + '</div></div>';
    return '<main>' + steps + '<section class="card"><div class="card-h"><h3>' + (k + 1) + '. ' + STEPS[k][1] + '</h3></div><div class="card-b">' + body + '</div></section>' +
      '<span class="save-note"><i></i><span id="savedAt">' + (S.savedAt ? 'Borrador guardado en este dispositivo · ' + S.savedAt : 'Se guarda mientras escribes, también sin conexión') + '</span></span></main>' + bar;
  }

  /* ---------- Vista del informe (igual a la del Ecosistema) ---------- */
  function lines(s) { return String(s || '').split('\n').map(function (x) { return x.replace(/^[-•*]\s*/, '').trim(); }).filter(Boolean); }
  function rvText(s) { var L = lines(s); if (!L.length) return '<p class="rv-none">Sin información.</p>'; return L.length > 1 ? '<ul class="rv-ul">' + L.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p>' + esc(L[0]) + '</p>'; }
  function recips(p, i) {
    var out = [], seen = {}, emp = p.clientName;
    (i.sent || []).forEach(function (s) { s.to.forEach(function (t) {
      var k = (t.em || t.n || '').toLowerCase(); if (seen[k]) return; seen[k] = 1;
      out.push(t.n ? { n: t.n, r: t.r || '', e: emp } : { n: '', r: '', e: t.em });
    }); });
    return out;
  }
  function sigPhoto(n) { return FOTOS[slug(n)] || null; }
  function isrDoc(p, i, draft) {
    var f = i.f, num = 0, nx = function () { num++; return (num < 10 ? '0' : '') + num; };
    var sec = function (t, body, cls) { return '<section class="rv-s' + (cls ? ' ' + cls : '') + '"><div class="rv-n">' + nx() + '</div><div class="rv-c"><h3>' + t + '</h3>' + body + '</div></section>'; };
    var kard = function (t, body, cls) { return '<section class="rv-k ' + cls + '"><h3><span>' + nx() + '</span>' + t + '</h3><div>' + body + '</div></section>'; };
    var fact = function (l, v) { return '<div class="rv-f"><small>' + l + '</small><b>' + esc(v || '—') + '</b></div>'; };
    var tb = function (R, a, b) { return '<table class="rv-t"><thead><tr><th>' + a + '</th><th>' + b + '</th></tr></thead><tbody>' + (R.length ? R.map(function (r) { return '<tr><td>' + esc(r.n) + '</td><td>' + esc(r.v) + '</td></tr>'; }).join('') : '<tr><td colspan="2" class="rv-none">Sin registros</td></tr>') + '</tbody></table>'; };
    var ph = i.photos, gal = ph.length ? '<div class="rv-gal">' + ph.map(function (x, k) { return '<figure class="' + (k === 0 && ph.length % 2 === 1 ? 'hero' : '') + '">' + phImg(x, 'Foto ' + (k + 1)) + '<figcaption><span>' + (k + 1) + '</span>Figura ' + (k + 1) + (x.cap ? '. ' + esc(x.cap) : '.') + '</figcaption></figure>'; }).join('') + '</div>' : '';
    var when = fd(f.d1) + (f.h1 ? ' · ' + f.h1 : '') + (f.d2 ? ' → ' + fd(f.d2) + (f.h2 ? ' · ' + f.h2 : '') : '');
    var R = recips(p, i), ls = (i.sent || [])[(i.sent || []).length - 1];
    var sent = R.length ? '<div class="rv-sent"><small>Enviado al cliente</small>' + R.slice(0, 3).map(function (r) { return '<div class="rv-rc"><b>' + esc(r.n || r.e) + '</b>' + (r.n ? '<span>' + esc(r.r ? r.r + ' · ' + r.e : r.e) + '</span>' : '') + '</div>'; }).join('') + (R.length > 3 ? '<span class="rv-more">y ' + (R.length - 3) + ' más</span>' : '') + '<em>' + fd(ls.at) + ' ' + esc(ls.tm || '') + ' · por ' + esc(ls.by) + '</em></div>' : '';
    return '<article class="rv">' +
      '<header class="rv-hero" style="--hero:url(\'' + BRAND.src + '\')"><div class="rv-hero-in"><div class="rv-top"><img class="rv-logo" src="' + LOGO + '" alt="Omnicon"><span class="rv-code">IN-D100.F01 · #' + i.n + (draft ? ' · borrador' : '') + '</span></div>' +
      '<div class="rv-title"><small>Informe de servicio</small><h2>' + esc(p.name) + '</h2><p>' + esc(p.clientName) + ' · ' + esc(f.plant || 'Sin planta') + (f.city ? ', ' + esc(f.city) : '') + '</p></div></div></header>' +
      '<div class="rv-facts">' + fact('Centro de costos', p.code) + fact('Fecha del servicio', when) + fact('Solicitado por', f.req) + fact('Ingeniero', i.by) + '</div>' +
      '<div class="rv-body"><p class="rv-subj"><b>Asunto:</b> ' + esc(f.subj) + ' · ' + esc(f.city || 'Santiago de Cali') + ', ' + pdfDate(i.at) + '</p>' +
      sec('Antecedentes y descripción de la situación', rvText(f.bg)) +
      sec('Descripción del sistema', '<div class="rv-2">' + tb(i.prog, 'Programa', 'Versión') + tb(i.eq, 'Equipo', 'Firmware') + '</div>' + (f.sysd ? rvText(f.sysd) : '')) +
      sec('Actividades realizadas', rvText(f.acts) + gal) +
      sec('Pruebas realizadas', rvText(f.tests)) +
      '<div class="rv-pair">' + kard('Diagnóstico', rvText(f.diag), 'diag') + kard('Solución', rvText(f.sol), 'sol') + '</div>' +
      kard('Observaciones y conclusiones', rvText(f.obs), 'obs') +
      (f.imp ? kard('Oportunidades de mejora', rvText(f.imp), 'imp') : '') +
      '<footer class="rv-sign"><div class="rv-who"><small>Cordialmente,</small><div class="rv-card">' + (sigPhoto(i.by) ? '<img src="' + sigPhoto(i.by) + '" alt="">' : '<span class="rv-ini">' + esc(initials(i.by)) + '</span>') + '<div><b>' + esc(i.by) + '</b><span>' + esc(i.role) + '</span><span class="co">Omnicon S.A.S.</span><em>' + fd(i.at) + '</em></div></div></div>' + sent + '</footer></div></article>';
  }

  /* ---------- PDF (mismo diseño del Ecosistema): portada, resumen, secciones numeradas y registro fotográfico ---------- */
  function buildIsrPdf(p, i, draft, imgs) {
    var JS = window.jspdf.jsPDF, doc = new JS({ unit: 'mm', format: 'a4' }), f = i.f;
    var W = 210, H = 297, M = 16, CW = W - 2 * M, y = 0, TOP = 24, BOT = 278;
    var NAVY = [0, 28, 63], BLUE = [0, 36, 115], BRIGHT = [10, 88, 235], CYAN = [0, 220, 250], SOFT = [238, 243, 251], INK = [24, 36, 56], MUT = [104, 116, 136], LINE = [214, 222, 234];
    var fill = function (c) { doc.setFillColor(c[0], c[1], c[2]); }, ink = function (c) { doc.setTextColor(c[0], c[1], c[2]); }, draw = function (c) { doc.setDrawColor(c[0], c[1], c[2]); };
    var font = function (st, sz) { doc.setFont('helvetica', st); doc.setFontSize(sz); };
    var alpha = function (a) { try { doc.setGState(new doc.GState({ opacity: a })); } catch (e) {} };
    var imgOf = function (ph) { return ph ? imgs[ph.src || ph.id] : null; };
    var ratio = function (ph) { return ph && ph.w && ph.h ? ph.w / ph.h : 4 / 3; };
    function cover(data, r, x, yy, w, h) {
      var iw = w, ih = w / r; if (ih < h) { ih = h; iw = h * r; }
      try { doc.saveGraphicsState(); doc.rect(x, yy, w, h, null); doc.clip(); doc.discardPath(); doc.addImage(data, 'JPEG', x + (w - iw) / 2, yy + (h - ih) / 2, iw, ih); doc.restoreGraphicsState(); }
      catch (e) { try { doc.restoreGraphicsState(); } catch (x2) {} var cw = w, ch = w / r; if (ch > h) { ch = h; cw = h * r; } doc.addImage(data, 'JPEG', x + (w - cw) / 2, yy + (h - ch) / 2, cw, ch); }
    }
    function contain(data, r, x, yy, w, h) { var cw = w, ch = w / r; if (ch > h) { ch = h; cw = h * r; } try { doc.addImage(data, 'JPEG', x + (w - cw) / 2, yy + (h - ch) / 2, cw, ch); } catch (e) {} }
    function newPage() { doc.addPage(); y = TOP + 4; }
    function ensure(h) { if (y + h > BOT) newPage(); }

    /* Portada */
    var hero = BRAND, HH = 158;
    fill(NAVY); doc.rect(0, 0, W, H, 'F');
    if (imgOf(hero)) { cover(imgOf(hero), ratio(hero), 0, 0, W, HH); alpha(.35); fill(NAVY); doc.rect(0, 0, W, HH, 'F'); alpha(1); }
    alpha(.85); fill(NAVY); doc.rect(0, HH - 34, W, 34, 'F'); alpha(1);
    fill(CYAN); doc.rect(0, HH, W, 1.6, 'F');
    try { doc.addImage(LOGO, 'PNG', M, 14, 40, 11.6); } catch (e) { font('bold', 18); ink([255, 255, 255]); doc.text('omnicon', M, 22); }
    alpha(.9); fill([255, 255, 255]); doc.roundedRect(W - M - 52, 14, 52, 9, 4.5, 4.5, 'F'); alpha(1);
    font('bold', 8.4); ink(NAVY); doc.text('IN-D100.F01  ·  #' + i.n + (draft ? '  ·  BORRADOR' : ''), W - M - 26, 19.8, { align: 'center' });
    font('bold', 9); ink(CYAN); doc.text('INFORME DE SERVICIO', M, HH - 22, { charSpace: .8 });
    font('normal', 10); ink([210, 222, 238]); doc.text((f.city || 'Santiago de Cali') + ', ' + pdfDate(i.at), M, HH - 14);
    var ty = HH + 20; font('bold', 22); ink([255, 255, 255]);
    doc.splitTextToSize(p.name, CW).slice(0, 3).forEach(function (ln) { doc.text(ln, M, ty); ty += 9.5; });
    font('normal', 12.5); ink([183, 198, 218]); doc.text(doc.splitTextToSize(p.clientName + '  ·  ' + (f.plant || 'Sin planta') + (f.city ? ', ' + f.city : ''), CW)[0], M, ty + 2); ty += 14;
    var facts = [['Centro de costos', p.code], ['Inicio', pdfDate(f.d1) + (f.h1 ? '  ' + f.h1 : '')], ['Finalización', pdfDate(f.d2) + (f.h2 ? '  ' + f.h2 : '')], ['Solicitado por', f.req || '—'], ['Ingeniero', i.by], ['Figuras', String(i.photos.length)]];
    var FW = (CW - 8) / 3;
    facts.forEach(function (fc, k) {
      var fx = M + (k % 3) * (FW + 4), fy = ty + Math.floor(k / 3) * 20;
      alpha(.08); fill([255, 255, 255]); doc.roundedRect(fx, fy, FW, 16, 2.5, 2.5, 'F'); alpha(1);
      fill(CYAN); doc.rect(fx, fy + 3, .9, 10, 'F');
      font('bold', 6.8); ink(CYAN); doc.text(fc[0].toUpperCase(), fx + 4, fy + 6, { charSpace: .3 });
      font('bold', 9.6); ink([255, 255, 255]); doc.text(doc.splitTextToSize(String(fc[1]), FW - 6)[0], fx + 4, fy + 12);
    });
    font('normal', 7.8); ink([111, 134, 163]); doc.text('Omnicon S.A.S.  ·  Smart Manufacturing  ·  Automation  ·  Consultoría', M, H - 12);

    /* Contenido */
    newPage();
    var num = 0;
    function sec(t) {
      ensure(20); num++;
      fill(BRIGHT); doc.roundedRect(M, y, 9, 9, 2, 2, 'F'); font('bold', 9); ink([255, 255, 255]); doc.text((num < 10 ? '0' : '') + num, M + 4.5, y + 6.1, { align: 'center' });
      font('bold', 12.5); ink(NAVY); doc.text(t, M + 13, y + 6.6);
      draw(LINE); doc.setLineWidth(.3); doc.line(M + 13 + doc.getTextWidth(t) + 4, y + 4.5, W - M, y + 4.5);
      y += 14;
    }
    function text(s, x, w, lh) {
      x = x || M; w = w || CW; lh = lh || 5; var L = lines(s);
      font('normal', 9.8); ink(INK);
      if (!L.length) { ink(MUT); doc.text('Sin información.', x, y + 3.5); y += lh + 3; return; }
      var bul = L.length > 1;
      L.forEach(function (ln) {
        doc.splitTextToSize(ln, w - (bul ? 6 : 0)).forEach(function (row, j) {
          ensure(lh); if (bul && j === 0) { fill(CYAN); doc.circle(x + 1.6, y + 2.4, .9, 'F'); }
          ink(INK); doc.text(row, x + (bul ? 6 : 0), y + 3.6); y += lh;
        });
        y += bul ? 1.2 : 0;
      });
      y += 4;
    }
    function textH(s, w) { var n = 0, L = lines(s); font('normal', 9.6); L.forEach(function (ln) { n += doc.splitTextToSize(ln, w - (L.length > 1 ? 6 : 0)).length; }); return Math.max(1, n) * 4.8 + (L.length > 1 ? L.length * 1.2 : 0); }
    function card(title, s, x, w, h, head, body, tc, bc) {
      num++; var HB = 11;
      fill(body); doc.roundedRect(x, y, w, h, 3, 3, 'F');
      fill(head); doc.roundedRect(x, y, w, HB, 3, 3, 'F'); doc.rect(x, y + HB - 3, w, 3, 'F');
      alpha(.25); fill([255, 255, 255]); doc.roundedRect(x + 4, y + 2.6, 9, 5.8, 1.6, 1.6, 'F'); alpha(1);
      font('bold', 8.4); ink(tc); doc.text((num < 10 ? '0' : '') + num, x + 8.5, y + 6.9, { align: 'center' });
      font('bold', 10.5); doc.text(title, x + 16, y + 7.3);
      var yy = y + HB + 6, L = lines(s), bul = L.length > 1; font('normal', 9.6);
      if (!L.length) { ink(MUT); doc.text('Sin información.', x + 6, yy); return; }
      L.forEach(function (ln) { doc.splitTextToSize(ln, w - 12 - (bul ? 6 : 0)).forEach(function (row, k) { if (bul && k === 0) { fill(CYAN); doc.circle(x + 7.6, yy - 1.2, .9, 'F'); } ink(bc); doc.text(row, x + 6 + (bul ? 6 : 0), yy); yy += 4.8; }); yy += bul ? 1.2 : 0; });
    }

    /* Resumen */
    font('bold', 15); ink(NAVY); doc.text('Resumen del servicio', M, y + 4); y += 9;
    font('normal', 9.6); ink(MUT); doc.text(doc.splitTextToSize('Asunto: ' + (f.subj || 'Informe del servicio de ingeniería'), CW)[0], M, y + 2); y += 8;
    var RF = [['Servicio', p.name], ['Cliente', p.clientName], ['Planta', (f.plant || '—') + (f.city ? ' · ' + f.city : '')], ['Solicitado por', f.req || '—'], ['Inicio', pdfDate(f.d1) + (f.h1 ? '  ' + f.h1 : '')], ['Finalización', pdfDate(f.d2) + (f.h2 ? '  ' + f.h2 : '')], ['Centro de costos', p.code], ['Ingeniero', i.by + ' · ' + i.role]];
    var RW = (CW - 5) / 2;
    RF.forEach(function (r, k) {
      var rx = M + (k % 2) * (RW + 5), ry = y + Math.floor(k / 2) * 15;
      fill(SOFT); doc.roundedRect(rx, ry, RW, 12.5, 2, 2, 'F');
      font('bold', 6.8); ink(MUT); doc.text(r[0].toUpperCase(), rx + 4, ry + 4.6, { charSpace: .3 });
      font('bold', 9.4); ink(INK); doc.text(doc.splitTextToSize(String(r[1]), RW - 8)[0], rx + 4, ry + 10);
    });
    y += Math.ceil(RF.length / 2) * 15 + 8;

    sec('Antecedentes y descripción de la situación'); text(f.bg);
    sec('Descripción del sistema');
    var half = (CW - 6) / 2, ys = y, ts = { theme: 'striped', styles: { font: 'helvetica', fontSize: 8.8, textColor: INK, cellPadding: 2.2 }, headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: SOFT } };
    function sysTbl(head, R, x) { var o = { startY: ys, margin: { left: x, right: W - x - half }, tableWidth: half, head: [head], body: R.length ? R.map(function (r) { return [r.n, r.v]; }) : [['Sin registros', '']] }; for (var k in ts) o[k] = ts[k]; doc.autoTable(o); return doc.lastAutoTable.finalY; }
    var ya = sysTbl(['Programa', 'Versión'], i.prog, M), yb = sysTbl(['Equipo', 'Firmware'], i.eq, M + half + 6);
    y = Math.max(ya, yb) + 6; if (f.sysd) text(f.sysd);

    sec('Actividades realizadas'); text(f.acts);
    if (i.photos.length) {
      var odd = i.photos.length % 2 === 1, firstH = odd ? Math.min(112, CW / ratio(i.photos[0]) + 2) : Math.min(82, (CW - 6) / 2 / ratio(i.photos[0]) + 2);
      ensure(firstH + 32); font('bold', 10.5); ink(BLUE); doc.text('Registro fotográfico', M, y + 4); font('normal', 8.4); ink(MUT); doc.text(i.photos.length + (i.photos.length === 1 ? ' figura' : ' figuras'), W - M, y + 4, { align: 'right' }); y += 9;
      var frame = function (ph, k, x, w, h) {
        fill(SOFT); doc.roundedRect(x, y, w, h + 14, 2.5, 2.5, 'F');
        fill([255, 255, 255]); doc.rect(x + 2, y + 2, w - 4, h - 2, 'F'); var d = imgOf(ph); if (d) contain(d, ratio(ph), x + 2, y + 2, w - 4, h - 2);
        fill(BRIGHT); doc.roundedRect(x + 3, y + h + 2.4, 6.5, 5.4, 1.4, 1.4, 'F'); font('bold', 7.6); ink([255, 255, 255]); doc.text(String(k + 1), x + 6.25, y + h + 6.1, { align: 'center' });
        font('normal', 8.2); ink(INK); doc.splitTextToSize('Figura ' + (k + 1) + (ph.cap ? '. ' + ph.cap : '.'), w - 16).slice(0, 2).forEach(function (row, j) { doc.text(row, x + 12, y + h + 6.1 + j * 3.8); });
      };
      var k = 0;
      if (odd) { var hh = firstH; ensure(hh + 18); frame(i.photos[0], 0, M, CW, hh); y += hh + 19; k = 1; }
      var GW = (CW - 6) / 2;
      for (; k < i.photos.length; k += 2) {
        var GH = Math.min(82, Math.max(GW / ratio(i.photos[k]) + 2, i.photos[k + 1] ? GW / ratio(i.photos[k + 1]) + 2 : 0));
        ensure(GH + 18);
        frame(i.photos[k], k, M, GW, GH);
        if (i.photos[k + 1]) frame(i.photos[k + 1], k + 1, M + GW + 6, GW, GH);
        y += GH + 19;
      }
    }
    sec('Pruebas realizadas'); text(f.tests);
    var hw = (CW - 6) / 2, hd = textH(f.diag, hw - 12) + 22, hs = textH(f.sol, hw - 12) + 22, hc = Math.max(hd, hs);
    var W1 = [255, 255, 255];
    if (hc < 130) {
      ensure(hc + 4);
      card('Diagnóstico', f.diag, M, hw, hc, [196, 144, 0], [255, 246, 228], W1, INK);
      card('Solución', f.sol, M + hw + 6, hw, hc, [63, 143, 58], [232, 247, 238], W1, INK);
      y += hc + 8;
    } else { sec('Diagnóstico'); text(f.diag); sec('Solución'); text(f.sol); }
    var ho = textH(f.obs, CW - 12) + 22;
    ensure(Math.min(ho, 130) + 4); card('Observaciones y conclusiones', f.obs, M, CW, ho, [0, 20, 46], [0, 40, 90], CYAN, W1); y += ho + 8;
    if (f.imp) { var hi = textH(f.imp, CW - 12) + 22; ensure(Math.min(hi, 130) + 4); card('Oportunidades de mejora', f.imp, M, CW, hi, BRIGHT, [238, 243, 251], W1, INK); y += hi + 8; }

    /* Firma: foto, nombre y cargo del ingeniero */
    ensure(44);
    font('normal', 9.6); ink(MUT); doc.text('Cordialmente,', M, y + 4); y += 9;
    var sy = y, cx = M + 11.5, cy = sy + 15, r = 10.5, sp = imgs.__sig;
    if (sp) { try { doc.saveGraphicsState(); doc.circle(cx, cy, r, null); doc.clip(); doc.discardPath(); doc.addImage(sp, 'JPEG', cx - r, cy - r, 2 * r, 2 * r); doc.restoreGraphicsState(); } catch (e) { try { doc.restoreGraphicsState(); } catch (x3) {} } }
    else { fill(NAVY); doc.circle(cx, cy, r, 'F'); font('bold', 11); ink([255, 255, 255]); doc.text(initials(i.by), cx, cy + 1.6, { align: 'center' }); }
    draw(CYAN); doc.setLineWidth(.8); doc.circle(cx, cy, r + .6, 'S'); doc.setLineWidth(.3);
    font('bold', 11.5); ink(NAVY); doc.text(i.by, M + 27, sy + 9.5);
    font('normal', 9.2); ink(INK); doc.text(i.role, M + 27, sy + 14.8);
    font('normal', 9); doc.text('Omnicon S.A.S.', M + 27, sy + 19.6); font('normal', 8); ink(MUT); doc.text(pdfDate(i.at), M + 27, sy + 24.2);
    y = sy + 14;
    var RC = recips(p, i);
    if (RC.length && !draft) {
      var sx = M + CW / 2 + 4, sw = CW / 2 - 4, last = i.sent[i.sent.length - 1], show = RC.slice(0, 3), sh = 12 + show.length * 9.4 + (RC.length > 3 ? 4.5 : 0) + 6, tp = sy;
      fill(SOFT); doc.roundedRect(sx, tp, sw, sh, 3, 3, 'F');
      font('bold', 6.8); ink(MUT); doc.text('ENVIADO AL CLIENTE', sx + 5, tp + 6.5, { charSpace: .3 });
      var ry = tp + 12.5;
      show.forEach(function (rc) {
        font('bold', 9.4); ink(NAVY); doc.text(doc.splitTextToSize(rc.n || rc.e, sw - 10)[0], sx + 5, ry);
        if (rc.n) { font('normal', 8.2); ink(INK); doc.text(doc.splitTextToSize(rc.r ? rc.r + ' · ' + rc.e : rc.e, sw - 10)[0], sx + 5, ry + 4.2); }
        ry += 9.4;
      });
      if (RC.length > 3) { font('normal', 8); ink(MUT); doc.text('y ' + (RC.length - 3) + ' más', sx + 5, ry); ry += 4.5; }
      font('normal', 7.6); ink(MUT); doc.text(pdfDate(last.at) + ' ' + (last.tm || '') + ' · por ' + last.by, sx + 5, ry + 1.5);
    }

    /* Encabezado y pie, salvo la portada */
    var n = doc.internal.getNumberOfPages();
    for (var pg = 2; pg <= n; pg++) {
      doc.setPage(pg);
      fill(NAVY); doc.rect(0, 0, W, 14, 'F'); fill(CYAN); doc.rect(0, 14, W, .8, 'F');
      try { doc.addImage(LOGO, 'PNG', M, 3.6, 24, 7); } catch (e) {}
      font('normal', 8); ink([200, 214, 232]); doc.text('Informe de servicio #' + i.n + '  ·  ' + p.code + (draft ? '  ·  BORRADOR' : ''), W - M, 8.8, { align: 'right' });
      draw(LINE); doc.setLineWidth(.3); doc.line(M, 285, W - M, 285);
      font('normal', 7.4); ink(MUT); doc.text('IN-D100.F01 · Generado en Kairos · ' + p.clientName, M, 290); doc.text((pg - 1) + ' / ' + (n - 1), W - M, 290, { align: 'right' });
    }
    return doc;
  }
  function isrPdf(p, i, draft) {
    if (!DL) { savePdf(null); return; }
    toast('Generando PDF…');
    photoData(i.photos.concat([BRAND]), function (m) {
      if (sigPhoto(i.by)) m.__sig = sigPhoto(i.by);
      try { savePdf(buildIsrPdf(p, i, draft, m), 'Informe-servicio_' + p.code + '_' + i.n + (draft ? '_borrador' : '') + '.pdf'); } catch (e) { toast('No se pudo generar el PDF'); if (window.console) console.error(e); }
    });
  }

  /* ---------- Hojas ---------- */
  var LAYER = null;
  function sheet(title, sub, body, foot, full) {
    return '<div class="sheet-bg" data-act="bgclose"><div class="sheet' + (full ? ' full' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="sheet-h"><div><b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div><button class="x" data-act="close" aria-label="Cerrar">' + ic('i-x') + '</button></div><div class="sheet-b">' + body + '</div>' + (foot ? '<div class="sheet-f">' + foot + '</div>' : '') + '</div></div>';
  }
  function layer(fn) { LAYER = fn; rerenderLayer(); document.body.style.overflow = fn ? 'hidden' : ''; }
  function rerenderLayer() { $('layer').innerHTML = LAYER ? LAYER() : ''; paintPhotos(); }
  function closeLayer() { layer(null); }

  /* ---------- Programas y equipos: elegir del catálogo del servicio, o "Otro" (queda guardado en el servicio) ---------- */
  var SYS = null, SYSL = { prog: ['Programa', 'Versión', 'programas'], eq: ['Equipo', 'Firmware', 'equipos'] };
  function sysItems() {
    var L = (S.cat && S.cat[SYS.tipo]) || [], q = norm(SYS.q);
    return L.filter(function (x) { return !q || norm(x.n).indexOf(q) >= 0 || x.v.some(function (v) { return norm(v).indexOf(q) >= 0; }); }).sort(function (a, b) { return a.n.localeCompare(b.n); });
  }
  function sysListHtml() {
    var L = sysItems(), used = D[SYS.tipo].map(function (r) { return r.n.toLowerCase(); }), lb = SYSL[SYS.tipo];
    return (L.length ? L.map(function (x) {
      var u = used.indexOf(x.n.toLowerCase()) >= 0 && SYS.idx < 0;
      return '<button type="button" class="pick' + (u ? ' used' : '') + '" data-act="syspick" data-v="' + esc(x.n) + '"><span><b>' + esc(x.n) + '</b><small>' + (x.v.length ? lb[1] + ': ' + esc(x.v.join(' · ')) : 'Sin ' + lb[1].toLowerCase() + ' registrada') + '</small></span>' + (u ? '<em>Ya agregado</em>' : ic('i-chev')) + '</button>';
    }).join('') : '<p class="hint" style="padding:8px 2px">No hay ' + lb[2] + ' que coincidan' + (SYS.q ? ' con «' + esc(SYS.q) + '»' : '') + '.</p>') +
      '<button type="button" class="pick otro" data-act="sysotro">' + ic('i-plus') + '<span><b>Otro ' + lb[0].toLowerCase() + (SYS.q ? ': «' + esc(SYS.q) + '»' : '') + '</b><small>Se guarda en este servicio para reusarlo</small></span></button>';
  }
  function sysSheet() {
    var lb = SYSL[SYS.tipo], body, foot = '';
    if (SYS.otro) {
      body = '<div class="field"><label for="sysnn">Nombre del ' + lb[0].toLowerCase() + '</label><input class="f" id="sysnn" value="' + esc(SYS.nn) + '" autocomplete="off"></div>' +
        '<div class="field"><label for="sysnv">' + lb[1] + '</label><input class="f" id="sysnv" value="' + esc(SYS.nv) + '" autocomplete="off"></div>' +
        '<span class="hint">Queda guardado en el servicio y aparecerá en la lista la próxima vez.</span>' + (SYS.err ? '<span class="err">' + esc(SYS.err) + '</span>' : '');
      foot = '<button class="btn" data-act="sysback">Atrás</button><button class="btn primary" data-act="sysok">Agregar y guardar</button>';
      return sheet('Otro ' + lb[0].toLowerCase(), S.cur.nombre, body, foot);
    }
    if (SYS.pick) {
      var it = ((S.cat && S.cat[SYS.tipo]) || []).filter(function (x) { return x.n === SYS.pick; })[0] || { n: SYS.pick, v: [] };
      body = '<div class="pp-sys"><b>' + esc(it.n) + '</b><span class="hint">Elige la ' + lb[1].toLowerCase() + ' instalada</span></div>' +
        '<div class="vchips">' + it.v.map(function (v) { return '<button type="button" class="vchip' + (SYS.ver === v && !SYS.ov ? ' on' : '') + '" data-act="sysver" data-v="' + esc(v) + '">' + esc(v) + '</button>'; }).join('') + '</div>' +
        '<div class="field"><label for="sysov">Otra ' + lb[1].toLowerCase() + '</label><input class="f" id="sysov" value="' + esc(SYS.ov) + '" placeholder="Escríbela si no está en la lista" autocomplete="off"></div>';
      foot = (SYS.idx >= 0 && !SYS.fromList ? '<button class="btn" data-act="close">Cancelar</button>' : '<button class="btn" data-act="sysback">Atrás</button>') + '<button class="btn primary" data-act="sysok">' + (SYS.idx >= 0 ? 'Guardar' : 'Agregar') + '</button>';
      return sheet(SYS.idx >= 0 ? 'Cambiar ' + lb[0].toLowerCase() : 'Agregar ' + lb[0].toLowerCase(), S.cur.nombre, body, foot);
    }
    body = '<div class="search">' + ic('i-search') + '<input class="f" id="sysq" type="search" placeholder="Buscar ' + lb[0].toLowerCase() + ' o ' + lb[1].toLowerCase() + '" value="' + esc(SYS.q) + '" autocomplete="off" aria-label="Buscar"></div>' +
      '<span class="hint">' + lb[2].charAt(0).toUpperCase() + lb[2].slice(1) + ' usados en este servicio</span><div class="picks" id="sysList">' + sysListHtml() + '</div>';
    return sheet('Agregar ' + lb[0].toLowerCase(), S.cur.nombre, body, '');
  }
  function sysSave() {
    var tipo = SYS.tipo, n = SYS.otro ? tx(SYS.nn) : SYS.pick, v = SYS.otro ? tx(SYS.nv) : tx(SYS.ov) || SYS.ver || '';
    if (!n) { SYS.err = 'Escribe el nombre.'; return rerenderLayer(); }
    var row = { n: n, v: v };
    if (SYS.idx >= 0) D[tipo][SYS.idx] = row; else D[tipo].push(row);
    saveDraft(true); closeLayer(); render();
    var nuevo = SYS.otro || (v && !((((S.cat && S.cat[tipo]) || []).filter(function (x) { return x.n === n; })[0] || { v: [] }).v.indexOf(v) >= 0));
    if (nuevo) API.agregarCatalogo(S.cur.ceco, tipo, row).then(function (c) { S.cat = c; toast('Guardado en el servicio para reusarlo'); }, function () { toast('Se agregó al informe; no se pudo guardar en el servicio'); });
  }

  function viewSheet(n) {
    var i = S.infs.filter(function (x) { return x.n === n; })[0], p = P(S.cur);
    return sheet('Informe de servicio #' + i.n, fd(i.at) + ' · ' + i.by, isrDoc(p, i, false),
      (DLst !== 'none' ? '<button class="btn primary" data-act="pdf" data-v="' + n + '">' + ic('i-pdf') + 'Descargar PDF</button>' : '') + (canWrite(S.cur) ? '<button class="btn" data-act="resend" data-v="' + n + '">' + ic('i-send') + 'Reenviar</button>' : ''), true);
  }
  function previewSheet() {
    return sheet('Vista previa · borrador', 'Así lo recibe el cliente. Revisa antes de emitir.', isrDoc(P(S.cur), asInforme(D), true),
      '<button class="btn" data-act="close">Seguir editando</button>' + (DLst !== 'none' ? '<button class="btn" data-act="pdfdraft"' + (missReq() >= 0 ? ' disabled title="Completa los datos obligatorios para descargar el PDF"' : '') + '>' + ic('i-pdf') + 'PDF borrador</button>' : ''), true);
  }
  var SEND = null;
  function sendInit(mode, n) {
    var plant = mode === 'new' ? D.f.plant : (S.infs.filter(function (x) { return x.n === n; })[0] || { f: {} }).f.plant, sel = {};
    S.cur.contactos.forEach(function (c) { if (c.recibeInformes && (!c.planta || c.planta === plant)) sel[c.id] = true; });
    SEND = { mode: mode, n: n, sel: sel, extra: '', err: '', busy: false, plant: plant };
  }
  function sendSheet() {
    var o = SEND, cs = S.cur.contactos, num = o.mode === 'new' ? (S.infs.length ? S.infs[S.infs.length - 1].n + 1 : 1) : o.n;
    return sheet(o.mode === 'new' ? 'Emitir y enviar el informe #' + num : 'Reenviar el informe #' + num, S.cur.ceco + ' · ' + (o.plant || 'sin planta'),
      (o.mode === 'new' ? '<div class="banner">' + ic('i-alert') + '<div>Al emitir, el informe queda en el histórico a tu nombre y no se puede cambiar.</div></div>' : '') +
      '<span class="lb">Destinatarios del cliente</span>' + cs.map(function (c) { return '<label class="rcp"><input type="checkbox" data-to="' + c.id + '"' + (o.sel[c.id] ? ' checked' : '') + '><span><b>' + esc(c.nombre) + '</b><small>' + esc(c.cargo) + (c.planta ? ' · ' + esc(c.planta) : ' · General') + '</small><small>' + esc(c.correo) + '</small></span></label>'; }).join('') +
      '<div class="field"><label for="mx">Otros correos (separados por coma)</label><input class="f" id="mx" type="email" multiple placeholder="nombre@empresa.com" value="' + esc(o.extra) + '"></div>' +
      (o.err ? '<span class="err">' + esc(o.err) + '</span>' : '') + '<span class="hint">El correo con el PDF lo envía Kairos (servidor). Queda registrado quién lo envió, a quién y cuándo. Envío simulado en este prototipo.</span>',
      '<button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="sendgo"' + (o.busy ? ' disabled' : '') + '>' + ic('i-send') + (o.busy ? 'Enviando…' : o.mode === 'new' ? 'Emitir y enviar' : 'Enviar') + '</button>');
  }
  function sendGo() {
    var o = SEND, to = S.cur.contactos.filter(function (c) { return o.sel[c.id]; }).map(function (c) { return { n: c.nombre, r: c.cargo, em: c.correo }; });
    var mx = $('mx'); o.extra = mx ? mx.value : o.extra;
    var bad = [];
    String(o.extra).split(',').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (em) { if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) to.push({ n: '', em: em }); else bad.push(em); });
    if (bad.length) { o.err = 'Revisa estos correos: ' + bad.join(', '); return rerenderLayer(); }
    if (!to.length) { o.err = 'Elige al menos un destinatario.'; return rerenderLayer(); }
    if (navigator.onLine === false) { o.err = 'Sin conexión. El borrador queda guardado en el celular; emítelo cuando vuelvas a tener señal.'; return rerenderLayer(); }
    o.busy = true; o.err = ''; rerenderLayer();
    var env = { at: TODAY, tm: hm(), by: S.me.nombre, to: to }, ceco = S.cur.ceco;
    var step = o.mode === 'new' ? API.emitirInforme(ceco, (function () { var x = asInforme(D); delete x.n; return x; })()).then(function (inf) { return inf.n; }) : Promise.resolve(o.n);
    step.then(function (n) { return API.enviarInforme(ceco, n, env).then(function () { return n; }); }).then(function (n) {
      if (o.mode === 'new') { store.set(dKey(ceco), null); D = null; }
      return Promise.all([API.listInformes(ceco), API.getServicio(ceco)]).then(function (r) {
        S.infs = r[0].map(fixInf); S.cur = r[1]; S.svcs = S.svcs.map(function (s) { return s.ceco === ceco ? r[1] : s; });
        toast('Informe #' + n + ' ' + (o.mode === 'new' ? 'emitido y enviado' : 'enviado') + ' a ' + to.length + (to.length === 1 ? ' destinatario' : ' destinatarios'));
        if (o.mode === 'new') { S.tab = 'inf'; location.hash = 's-' + ceco; layer(function () { return viewSheet(n); }); } else { layer(function () { return viewSheet(n); }); render(); }
      });
    }).catch(function (e) { o.busy = false; o.err = 'Kairos no respondió (' + e.message + '). El borrador sigue guardado.'; rerenderLayer(); });
  }
  function menuSheet() {
    return sheet(S.me.nombre, S.me.cargo + ' · ' + S.me.correo,
      '<button class="menu-i" data-act="apisheet">' + ic('i-plug') + '<span><b>Conexión con Kairos</b><br><span class="hint">API ' + esc(API.version) + ' · contrato y últimas llamadas</span></span></button>' +
      '<button class="menu-i" data-act="reset">' + ic('i-reset') + '<span><b>Restablecer datos de ejemplo</b><br><span class="hint">Borra informes emitidos y borradores de esta demo</span></span></button>' +
      '<button class="menu-i" data-act="logout">' + ic('i-out') + '<span><b>Cambiar de usuario</b><br><span class="hint">Simula otra cuenta de Entra ID</span></span></button>');
  }
  function apiSheet() {
    var EP = [['GET', '/me', 'Persona de Entra ID'], ['GET', '/servicios?asignado=me', 'Servicios donde soy líder o integrante'], ['GET', '/servicios/{ceco}', 'Caracterización completa'], ['GET', '/servicios/{ceco}/informes', 'Histórico'], ['POST', '/servicios/{ceco}/informes', 'Emitir (el servidor asigna el consecutivo)'], ['POST', '/servicios/{ceco}/informes/{n}/envios', 'Registrar envío y mandar el correo'], ['POST', '/fotos', 'Subir fotos (almacenamiento del servidor)']];
    return sheet('Conexión con Kairos', 'API ' + API.version,
      '<div class="banner warn">' + ic('i-plug') + '<div>Hoy la app habla con una API simulada dentro de la página. En producción se cambia por el backend de Kairos con el mismo contrato, sin tocar las pantallas.</div></div>' +
      '<span class="sec-t">Contrato</span><div class="ep">' + EP.map(function (e) { return '<div><code><b>' + e[0] + '</b> ' + esc(e[1]) + '</code><span class="hint">' + e[2] + '</span></div>'; }).join('') + '</div>' +
      '<span class="sec-t">Últimas llamadas</span><div class="log">' + (API.log.length ? API.log.slice(0, 14).map(function (l) { return '<div><span class="m">' + l.m + '</span><span class="p">' + esc(l.p) + (l.ok ? '' : ' · ' + esc(l.err)) + '</span><span class="t">' + l.ms + ' ms</span></div>'; }).join('') : '<span class="hint">Sin llamadas.</span>') + '</div>');
  }
  API.onCall = function () { if (LAYER === apiSheet) rerenderLayer(); };

  /* ---------- Eventos ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var a = t.dataset.act, v = t.dataset.v;
    if (a === 'bgclose') { if (e.target === t) closeLayer(); return; }
    switch (a) {
      case 'login': API.me(v).then(function (p) { S.me = p; store.set('kis.me', p.id); S.svcs = []; go('inicio'); }); break;
      case 'logout': closeLayer(); S.me = null; store.set('kis.me', null); S.svcs = []; S.cur = null; PEOPLE = null; location.hash = ''; route(); break;
      case 'menu': layer(menuSheet); break;
      case 'apisheet': layer(apiSheet); break;
      case 'reset': closeLayer(); API.reset().then(function () { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('kis.draft.') === 0) store.set(k, null); }); S.svcs = []; S.cur = null; toast('Datos de ejemplo restablecidos'); go('inicio'); }); break;
      case 'close': closeLayer(); break;
      case 'back':
        if (S.view === 'edit') { if (REC.on) recStop(true); saveDraft(true); go('s-' + S.cur.ceco); } else go('inicio'); break;
      case 'filter': S.filter = v; render(); break;
      case 'open': go('s-' + v); break;
      case 'tab': go((v === 'car' ? 'c-' : 's-') + S.cur.ceco); break;
      case 'view': layer(function () { return viewSheet(+v); }); break;
      case 'pdf': isrPdf(P(S.cur), S.infs.filter(function (x) { return x.n === +v; })[0], false); break;
      case 'pdfdraft': if (missReq() >= 0) { toast('Completa los datos obligatorios antes de descargar el PDF'); break; } isrPdf(P(S.cur), asInforme(D), true); break;
      case 'preview': layer(previewSheet); break;
      case 'resend': sendInit('resend', +v); layer(sendSheet); break;
      case 'emit':
        var miss = missReq();
        if (miss >= 0) { D.step = 4; render(); toast('Completa los datos obligatorios antes de emitir'); break; }
        sendInit('new'); layer(sendSheet); break;
      case 'sendgo': sendGo(); break;
      case 'step': D.step = +v; saveDraft(true); render(); window.scrollTo(0, 0); break;
      case 'sysadd': SYS = { tipo: v, q: '', pick: null, idx: -1, ver: '', ov: '', otro: false, nn: '', nv: '' }; layer(sysSheet); setTimeout(function () { var q = $('sysq'); if (q && window.innerWidth > 700) q.focus(); }, 50); break;
      case 'sysedit': var se = v.split(':'), sr = D[se[0]][+se[1]], known = ((S.cat && S.cat[se[0]]) || []).filter(function (x) { return x.n === sr.n; })[0];
        SYS = { tipo: se[0], q: '', pick: sr.n, idx: +se[1], ver: known && known.v.indexOf(sr.v) >= 0 ? sr.v : '', ov: known && known.v.indexOf(sr.v) >= 0 ? '' : sr.v, otro: false, nn: '', nv: '' }; layer(sysSheet); break;
      case 'syspick': SYS.pick = v; SYS.fromList = true; SYS.ver = ''; SYS.ov = ''; var ki = (S.cat[SYS.tipo].filter(function (x) { return x.n === v; })[0] || { v: [] }).v; if (ki.length === 1) SYS.ver = ki[0]; rerenderLayer(); break;
      case 'sysver': SYS.ver = v; SYS.ov = ''; rerenderLayer(); break;
      case 'sysotro': SYS.otro = true; SYS.nn = SYS.q; SYS.err = ''; rerenderLayer(); setTimeout(function () { var x = $(SYS.nn ? 'sysnv' : 'sysnn'); if (x) x.focus(); }, 50); break;
      case 'sysback': SYS.pick = null; SYS.otro = false; SYS.err = ''; rerenderLayer(); break;
      case 'sysok': sysSave(); break;
      case 'sysrm': var kk = v.split(':'); D[kk[0]].splice(+kk[1], 1); saveDraft(); render(); break;
      case 'phrm': D.photos = D.photos.filter(function (x) { return x.id !== v; }); saveDraft(); render(); break;
      case 'discard': layer(function () { return sheet('¿Descartar el borrador?', '', '<p>Se pierden los textos y las fotos de este borrador. No se puede deshacer.</p>', '<button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="discardgo" style="background:var(--err-ink);border-color:var(--err-ink)">Descartar</button>'); }); break;
      case 'mic': case 'dictar': recStart(a === 'dictar' ? null : v); break;
      case 'recstop': recStop(false); break;
      case 'reccancel': recStop(true); break;
      case 'notaint': interpretar(v); break;
      case 'notadel': D.notes = (D.notes || []).filter(function (x) { return x.id !== v; }); Object.keys(D.sug || {}).forEach(function (q) { D.sug[q] = sugsOf(q).filter(function (x) { return x.nota !== v; }); if (!D.sug[q].length) delete D.sug[q]; }); saveDraft(true); render(); break;
      case 'sugusar': case 'sugadd': case 'sugno':
        var sp = v.split('|'), fk = sp[0], sl = sugsOf(fk), sg = sl.filter(function (x) { return x.id === sp[1]; })[0]; if (!sg) break;
        if (a !== 'sugno') D.f[fk] = a === 'sugadd' && tx(D.f[fk]) ? D.f[fk].replace(/\s+$/, '') + '\n' + sg.text : sg.text;
        D.sug[fk] = sl.filter(function (x) { return x !== sg; }); if (!D.sug[fk].length) delete D.sug[fk];
        saveDraft(true); render(); if (a !== 'sugno') toast('Sugerencia aplicada · revísala y ajústala si hace falta'); break;
      case 'ahora': D.f[v] = hm(); saveDraft(); render(); break;
      case 'discardgo': store.set(dKey(S.cur.ceco), null); D = null; closeLayer(); toast('Borrador descartado'); go('s-' + S.cur.ceco); break;
    }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (SYS && LAYER === sysSheet) {
      if (t.id === 'sysq') { SYS.q = t.value; var sl = $('sysList'); if (sl) sl.innerHTML = sysListHtml(); return; }
      if (t.id === 'sysnn') { SYS.nn = t.value; return; } if (t.id === 'sysnv') { SYS.nv = t.value; return; }
      if (t.id === 'sysov') { SYS.ov = t.value; var on = document.querySelector('.vchip.on'); if (on && t.value) on.classList.remove('on'); return; }
    }
    if (t.id === 'q') { S.q = t.value; var pos = t.selectionStart; render(); var q = $('q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (x) {} } return; }
    if (!D) return;
    if (t.dataset.f) { D.f[t.dataset.f] = t.value; saveDraft(); var fw = t.closest('.field'); if (fw) { fw.classList.toggle('f-ok', !!tx(t.value)); fw.classList.toggle('f-empty', !tx(t.value)); } }
    else if (t.dataset.sys) { var k = t.dataset.sys.split(':'); D[k[0]][+k[1]][k[2]] = t.value; saveDraft(); }
    else if (t.dataset.cap) { D.photos.forEach(function (p) { if (p.id === t.dataset.cap) p.cap = t.value; }); saveDraft(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.to && SEND) { SEND.sel[t.dataset.to] = t.checked; return; }
    if (t.id === 'mx' && SEND) { SEND.extra = t.value; return; }
    if (D && t.dataset.hora) {
      var hk = t.dataset.hora.split(':'), cur = String(D.f[hk[0]] || ''), hh = cur.slice(0, 2), mm = cur.slice(3, 5);
      if (hk[1] === 'h') hh = t.value; else mm = t.value;
      if (hh && !mm) mm = '00';
      D.f[hk[0]] = hh ? hh + ':' + mm : ''; saveDraft(); render(); return;
    }
    if (D && t.dataset.f === 'plant') { D.f.plant = t.value; var s = S.cur.sitios.filter(function (x) { return x.planta === t.value; })[0]; if (s) D.f.city = s.ciudad; saveDraft(); render(); return; }
    if (D && t.dataset.photo) {
      var files = Array.prototype.slice.call(t.files || []).slice(0, ISR_MAX - D.photos.length); if (!files.length) return;
      toast('Procesando ' + files.length + (files.length === 1 ? ' foto…' : ' fotos…'));
      var left = files.length;
      files.forEach(function (fl) { compress(fl, function (data, w, h) { if (data) { var id = 'ph-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); photoPut(id, data); D.photos.push({ id: id, w: w, h: h, cap: '' }); } if (!--left) { saveDraft(true); render(); toast(files.length + (files.length === 1 ? ' foto agregada' : ' fotos agregadas')); } }); });
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && LAYER) closeLayer(); });
  function net() { var on = navigator.onLine !== false, n = $('net'); if (n) n.hidden = on; if (!on) toast('Sin conexión: sigue escribiendo, el borrador se guarda en el celular'); }
  window.addEventListener('online', net); window.addEventListener('offline', net);

  /* ---------- Arranque ---------- */
  var mid = store.get('kis.me');
  if (mid) API.me(mid).then(function (p) { S.me = p; route(); }, function () { route(); }); else route();
})();
