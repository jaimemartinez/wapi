// Especificación OpenAPI 3.0 de la API. Se sirve como JSON en /openapi.json y
// como Swagger UI navegable en /docs (UI cargada por CDN, sin dependencias).
export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'wapi — WhatsApp API propia',
    version: '0.1.0',
    description:
      'API REST sobre una implementación propia del protocolo WhatsApp multi-device. '
      + 'Mensajería en construcción; llamadas: detección y rechazo (sin audio).',
  },
  servers: [{ url: 'http://127.0.0.1:4000' }],
  components: {
    securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
  },
  security: [{ ApiKey: [] }],
  paths: {
    '/health': {
      get: { summary: 'Health check', security: [], responses: { 200: { description: 'OK' } } },
    },
    '/sessions': {
      get: { summary: 'Listar sesiones', responses: { 200: { description: 'Lista de sesiones' } } },
      post: {
        summary: 'Crear/arrancar una sesión',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['id'], properties: { id: { type: 'string', example: 'demo' } } } } },
        },
        responses: { 201: { description: 'Sesión creada' } },
      },
    },
    '/sessions/{id}': {
      get: { summary: 'Estado de una sesión', parameters: [pathId()], responses: { 200: { description: 'Estado' }, 404: { description: 'No existe' } } },
      delete: { summary: 'Eliminar sesión y credenciales', parameters: [pathId()], responses: { 200: { description: 'Eliminada' } } },
    },
    '/sessions/{id}/qr': {
      get: { summary: 'QR pendiente de escanear', parameters: [pathId()], responses: { 200: { description: 'QR' }, 409: { description: 'Sin QR' } } },
    },
    '/sessions/{id}/logout': {
      post: { summary: 'Cerrar conexión (conserva credenciales)', parameters: [pathId()], responses: { 200: { description: 'Cerrada' } } },
    },
    '/sessions/{id}/messages': {
      get: { summary: 'Listar mensajes entrantes descifrados', parameters: [pathId()], responses: { 200: { description: 'Mensajes' } } },
      post: {
        summary: 'Enviar mensaje de texto',
        parameters: [pathId()],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['to', 'text'], properties: { to: { type: 'string', example: '34600123456' }, text: { type: 'string', example: 'hola' } } } } },
        },
        responses: { 200: { description: 'Enviado' }, 409: { description: 'No conectada' } },
      },
    },
    '/sessions/{id}/media': {
      post: {
        summary: 'Enviar media (imagen/audio/documento/vídeo/sticker)',
        parameters: [pathId()],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['to', 'type', 'base64'], properties: { to: { type: 'string', example: '34600123456' }, type: { type: 'string', example: 'image' }, base64: { type: 'string' }, caption: { type: 'string' }, mimetype: { type: 'string' }, fileName: { type: 'string' }, ptt: { type: 'boolean' } } } } },
        },
        responses: { 200: { description: 'Enviado' } },
      },
    },
    '/sessions/{id}/messages/{msgId}/media': {
      get: { summary: 'Descargar media de un mensaje (base64)', parameters: [pathId(), { name: 'msgId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Media' } } },
    },
    '/sessions/{id}/read': {
      post: {
        summary: 'Marcar mensajes como leídos',
        parameters: [pathId()],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['from', 'ids'], properties: { from: { type: 'string', example: '34600123456@s.whatsapp.net' }, ids: { type: 'array', items: { type: 'string' } }, type: { type: 'string', example: 'read' } } } } } },
        responses: { 200: { description: 'Marcado' } },
      },
    },
    '/sessions/{id}/chats': {
      get: { summary: 'Listar chats (del history sync)', parameters: [pathId()], responses: { 200: { description: 'Lista de chats' } } },
    },
    '/sessions/{id}/groups/{gid}': {
      get: { summary: 'Info de un grupo (participantes)', parameters: [pathId(), { name: 'gid', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Metadatos del grupo' } } },
    },
    '/sessions/{id}/groups/{gid}/messages': {
      post: {
        summary: 'Enviar texto a un grupo (sender keys)',
        parameters: [pathId(), { name: 'gid', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string', example: 'hola grupo' } } } } } },
        responses: { 200: { description: 'Enviado' } },
      },
    },
    '/sessions/{id}/calls': {
      get: { summary: 'Historial de llamadas detectadas', parameters: [pathId()], responses: { 200: { description: 'Lista de llamadas' } } },
    },
    '/sessions/{id}/calls/{callId}/reject': {
      post: {
        summary: 'Rechazar una llamada entrante',
        parameters: [pathId(), { name: 'callId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Rechazada' } },
      },
    },
  },
};

function pathId() {
  return { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
}

// Explorador de API propio (sin Swagger UI ni CDN de terceros). Lee
// /openapi.json en vivo y lo renderiza con estética dark + acento verde
// WhatsApp. Sin build: una sola página autocontenida. El JS embebido evita
// backticks/${} porque esta cadena ya es un template literal.
export const swaggerHtml = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>wapi · API</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#0F172A; --surface:#131C2E; --surface-2:#1A2438; --muted:#1F2A40;
    --border:#2A3650; --border-soft:#222D44;
    --fg:#F1F5F9; --fg-dim:#94A3B8; --fg-faint:#64748B;
    --accent:#22C55E; --accent-press:#16A34A; --accent-soft:rgba(34,197,94,.12);
    --get:#38BDF8; --post:#22C55E; --del:#EF4444; --put:#F59E0B;
    --danger:#EF4444; --radius:12px; --radius-sm:8px;
    --sans:'IBM Plex Sans',system-ui,sans-serif; --mono:'JetBrains Mono',ui-monospace,monospace;
    --shadow:0 8px 30px rgba(0,0,0,.35);
  }
  *{box-sizing:border-box}
  html,body{margin:0;height:100%}
  body{background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
  a{color:var(--accent);text-decoration:none}
  button{font-family:inherit;cursor:pointer}
  ::selection{background:var(--accent-soft)}
  /* Layout */
  .app{display:grid;grid-template-columns:300px 1fr;grid-template-rows:auto 1fr;height:100vh;min-height:0}
  header{grid-column:1/3;display:flex;align-items:center;gap:16px;padding:0 20px;height:60px;
    background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:20}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em}
  .brand .logo{width:30px;height:30px;border-radius:9px;background:linear-gradient(145deg,var(--accent),#0e8a43);
    display:grid;place-items:center;box-shadow:0 0 0 1px rgba(255,255,255,.06) inset}
  .brand small{display:block;font-weight:500;font-size:11px;color:var(--fg-dim);letter-spacing:.04em;text-transform:uppercase}
  .spacer{flex:1}
  .status{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--fg-dim);
    background:var(--muted);padding:6px 11px;border-radius:999px;border:1px solid var(--border-soft)}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--fg-faint);transition:background .3s}
  .dot.on{background:var(--accent);box-shadow:0 0 8px var(--accent)}
  .dot.off{background:var(--danger)}
  .key{display:flex;align-items:center;gap:6px;background:var(--muted);border:1px solid var(--border-soft);
    border-radius:var(--radius-sm);padding:0 10px;height:36px}
  .key input{background:none;border:0;color:var(--fg);font-family:var(--mono);font-size:12px;outline:none;width:150px}
  .key label{font-size:11px;color:var(--fg-faint);text-transform:uppercase;letter-spacing:.05em}
  .ghost{background:var(--muted);border:1px solid var(--border-soft);color:var(--fg-dim);
    border-radius:var(--radius-sm);height:36px;padding:0 13px;font-size:13px;transition:.15s}
  .ghost:hover{color:var(--fg);border-color:var(--border)}
  /* Sidebar */
  aside{background:var(--surface);border-right:1px solid var(--border);overflow-y:auto;padding:14px}
  .search{width:100%;background:var(--muted);border:1px solid var(--border-soft);border-radius:var(--radius-sm);
    color:var(--fg);padding:9px 12px;font-size:13px;outline:none;margin-bottom:14px;transition:.15s}
  .search:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
  .group{margin-bottom:6px}
  .group-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-faint);
    padding:10px 8px 6px}
  .ep{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:var(--radius-sm);cursor:pointer;
    transition:background .12s;border:1px solid transparent}
  .ep:hover{background:var(--surface-2)}
  .ep.active{background:var(--accent-soft);border-color:rgba(34,197,94,.25)}
  .ep .path{font-family:var(--mono);font-size:12.5px;color:var(--fg-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ep.active .path{color:var(--fg)}
  .verb{font-family:var(--mono);font-size:10px;font-weight:600;padding:3px 6px;border-radius:5px;min-width:48px;text-align:center;flex-shrink:0}
  .verb.GET{color:var(--get);background:rgba(56,189,248,.12)}
  .verb.POST{color:var(--post);background:var(--accent-soft)}
  .verb.DELETE{color:var(--del);background:rgba(239,68,68,.12)}
  .verb.PUT,.verb.PATCH{color:var(--put);background:rgba(245,158,11,.12)}
  /* Main */
  main{overflow-y:auto;padding:32px 36px;min-width:0}
  .wrap{max-width:860px;margin:0 auto}
  .empty{display:grid;place-items:center;height:100%;color:var(--fg-faint);text-align:center}
  .empty svg{opacity:.4;margin-bottom:14px}
  .route{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px}
  .route .verb{font-size:12px;padding:5px 10px;min-width:0}
  .route .url{font-family:var(--mono);font-size:16px;font-weight:500;color:var(--fg);word-break:break-all}
  h1{font-size:20px;margin:0 0 4px;letter-spacing:-.01em}
  .summary{color:var(--fg-dim);margin:0 0 24px;font-size:15px}
  .card{background:var(--surface);border:1px solid var(--border-soft);border-radius:var(--radius);padding:18px 20px;margin-bottom:18px}
  .card h2{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--fg-faint);margin:0 0 14px;font-weight:600}
  .field{margin-bottom:13px}
  .field:last-child{margin-bottom:0}
  .field label{display:block;font-size:12.5px;color:var(--fg-dim);margin-bottom:5px}
  .field label .req{color:var(--danger);margin-left:3px}
  .field label .loc{font-family:var(--mono);font-size:10px;color:var(--fg-faint);background:var(--muted);padding:1px 5px;border-radius:4px;margin-left:6px}
  .field input,.field textarea{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);
    color:var(--fg);padding:9px 12px;font-family:var(--mono);font-size:13px;outline:none;transition:.15s}
  .field input:focus,.field textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
  textarea{resize:vertical;min-height:120px;line-height:1.5}
  .send{background:var(--accent);color:#062611;border:0;border-radius:var(--radius-sm);font-weight:600;font-size:14px;
    padding:11px 22px;display:inline-flex;align-items:center;gap:8px;transition:.15s}
  .send:hover{background:var(--accent-press)}
  .send:active{transform:translateY(1px)}
  .send:disabled{opacity:.5;cursor:not-allowed}
  .resp-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}
  .pill{font-family:var(--mono);font-size:12px;font-weight:600;padding:4px 10px;border-radius:6px}
  .pill.ok{color:var(--accent);background:var(--accent-soft)}
  .pill.err{color:var(--danger);background:rgba(239,68,68,.12)}
  .ms{font-family:var(--mono);font-size:12px;color:var(--fg-faint)}
  pre{background:var(--bg);border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:16px;margin:0;
    overflow:auto;font-family:var(--mono);font-size:12.5px;line-height:1.6;max-height:420px}
  .menu-btn{display:none;background:var(--muted);border:1px solid var(--border-soft);color:var(--fg);
    width:36px;height:36px;border-radius:var(--radius-sm);place-items:center}
  @media (max-width:860px){
    .app{grid-template-columns:1fr}
    aside{position:fixed;top:60px;bottom:0;left:0;width:288px;z-index:30;transform:translateX(-100%);transition:transform .25s ease;box-shadow:var(--shadow)}
    aside.open{transform:none}
    .menu-btn{display:grid}
    .key{display:none}
    main{padding:22px 18px}
  }
  @media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
</head>
<body>
<div class="app">
  <header>
    <button class="menu-btn" id="menuBtn" aria-label="Abrir menú">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
    </button>
    <div class="brand">
      <span class="logo">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="#062611"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20z"/><path d="M9 7c.3 0 .5.2.7.6l.6 1.4c.1.3 0 .5-.1.7l-.5.6c-.1.1-.1.3 0 .5a6 6 0 0 0 2.7 2.6c.2.1.4.1.5 0l.6-.6c.2-.2.4-.2.7-.1l1.4.6c.3.1.5.4.5.7 0 1-.8 1.8-1.8 1.8A7.5 7.5 0 0 1 7.2 8.8C7.2 7.8 8 7 9 7z"/></svg>
      </span>
      <div>wapi<small>WhatsApp API</small></div>
    </div>
    <div class="spacer"></div>
    <div class="status"><span class="dot" id="dot"></span><span id="statusTxt">comprobando…</span></div>
    <div class="key"><label for="apiKey">key</label><input id="apiKey" placeholder="x-api-key (opcional)" autocomplete="off" spellcheck="false"></div>
    <a class="ghost" href="/openapi.json" target="_blank" rel="noopener">OpenAPI</a>
  </header>
  <aside id="aside">
    <input class="search" id="search" placeholder="Buscar endpoint…" aria-label="Buscar endpoint">
    <nav id="nav"></nav>
  </aside>
  <main>
    <div class="wrap" id="content">
      <div class="empty">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>
        <div>Selecciona un endpoint para empezar</div>
      </div>
    </div>
  </main>
</div>
<script>
(function(){
  var spec=null, current=null;
  var nav=document.getElementById('nav'), content=document.getElementById('content');
  var aside=document.getElementById('aside');
  document.getElementById('menuBtn').onclick=function(){aside.classList.toggle('open')};

  function esc(s){return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
  function groupOf(p){
    if(p.indexOf('/groups')>=0)return 'Grupos';
    if(p.indexOf('/media')>=0)return 'Media';
    if(p.indexOf('/messages')>=0||p.indexOf('/read')>=0)return 'Mensajes';
    if(p.indexOf('/chats')>=0)return 'Chats';
    if(p.indexOf('/calls')>=0)return 'Llamadas';
    if(p.indexOf('/sessions')>=0)return 'Sesiones';
    return 'General';
  }
  var GROUPS=['Sesiones','Mensajes','Media','Chats','Grupos','Llamadas','General'];

  function exampleFor(op){
    try{
      var sch=op.requestBody.content['application/json'].schema;
      var o={}; var props=sch.properties||{};
      Object.keys(props).forEach(function(k){
        var p=props[k];
        o[k]=p.example!==undefined?p.example:(p.type==='object'?{}:p.type==='boolean'?false:p.type==='integer'?0:'');
      });
      return JSON.stringify(o,null,2);
    }catch(e){return ''}
  }

  function pathParams(p){var m=p.match(/\\{([^}]+)\\}/g)||[];return m.map(function(x){return x.slice(1,-1)})}

  function render(){
    var q=(document.getElementById('search').value||'').toLowerCase();
    var byGroup={};
    Object.keys(spec.paths).forEach(function(path){
      Object.keys(spec.paths[path]).forEach(function(m){
        var op=spec.paths[path][m];
        var label=m.toUpperCase()+' '+path;
        if(q && label.toLowerCase().indexOf(q)<0 && (op.summary||'').toLowerCase().indexOf(q)<0)return;
        var g=groupOf(path);(byGroup[g]=byGroup[g]||[]).push({path:path,method:m.toUpperCase(),op:op});
      });
    });
    nav.innerHTML='';
    GROUPS.forEach(function(g){
      if(!byGroup[g])return;
      var div=document.createElement('div');div.className='group';
      div.innerHTML='<div class="group-title">'+g+'</div>';
      byGroup[g].forEach(function(e){
        var id=e.method+' '+e.path;
        var el=document.createElement('div');
        el.className='ep'+(current===id?' active':'');
        el.innerHTML='<span class="verb '+e.method+'">'+e.method+'</span><span class="path">'+esc(e.path)+'</span>';
        el.onclick=function(){current=id;aside.classList.remove('open');render();detail(e)};
        div.appendChild(el);
      });
      nav.appendChild(div);
    });
  }

  function detail(e){
    var op=e.op, pp=pathParams(e.path), hasBody=['POST','PUT','PATCH'].indexOf(e.method)>=0 && op.requestBody;
    var qp=(op.parameters||[]).filter(function(p){return p.in==='query'});
    var h='<div class="route"><span class="verb '+e.method+'">'+e.method+'</span><span class="url">'+esc(e.path)+'</span></div>';
    h+='<h1>'+esc(op.summary||e.path)+'</h1>';
    if(op.description)h+='<p class="summary">'+esc(op.description)+'</p>';
    if(pp.length||qp.length){
      h+='<div class="card"><h2>Parámetros</h2>';
      pp.forEach(function(n){h+='<div class="field"><label>'+esc(n)+'<span class="req">*</span><span class="loc">path</span></label><input data-pp="'+esc(n)+'" placeholder="'+esc(n)+'"></div>'});
      qp.forEach(function(p){h+='<div class="field"><label>'+esc(p.name)+'<span class="loc">query</span></label><input data-qp="'+esc(p.name)+'" placeholder="'+esc(p.name)+'"></div>'});
      h+='</div>';
    }
    if(hasBody){
      h+='<div class="card"><h2>Cuerpo (JSON)</h2><div class="field"><textarea id="body" spellcheck="false">'+esc(exampleFor(op))+'</textarea></div></div>';
    }
    h+='<button class="send" id="send"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>Enviar petición</button>';
    h+='<div id="resp" style="margin-top:22px"></div>';
    content.innerHTML='<div>'+h+'</div>';
    document.getElementById('send').onclick=function(){send(e)};
  }

  function send(e){
    var btn=document.getElementById('send');btn.disabled=true;
    var url=e.path;
    document.querySelectorAll('[data-pp]').forEach(function(i){url=url.replace('{'+i.getAttribute('data-pp')+'}',encodeURIComponent(i.value||''))});
    var qs=[];document.querySelectorAll('[data-qp]').forEach(function(i){if(i.value)qs.push(encodeURIComponent(i.getAttribute('data-qp'))+'='+encodeURIComponent(i.value))});
    if(qs.length)url+='?'+qs.join('&');
    var opt={method:e.method,headers:{}};
    var k=document.getElementById('apiKey').value;if(k)opt.headers['x-api-key']=k;
    var bodyEl=document.getElementById('body');
    if(bodyEl&&bodyEl.value.trim()){opt.headers['content-type']='application/json';opt.body=bodyEl.value}
    var t0=performance.now();
    fetch(url,opt).then(function(r){
      return r.text().then(function(txt){
        var ms=Math.round(performance.now()-t0);
        var pretty=txt;try{pretty=JSON.stringify(JSON.parse(txt),null,2)}catch(e){}
        var cls=r.ok?'ok':'err';
        document.getElementById('resp').innerHTML=
          '<div class="card"><div class="resp-head"><span class="pill '+cls+'">'+r.status+' '+esc(r.statusText)+'</span><span class="ms">'+ms+' ms</span><span class="ms">'+esc(e.method)+' '+esc(url)+'</span></div><pre>'+esc(pretty)+'</pre></div>';
      });
    }).catch(function(err){
      document.getElementById('resp').innerHTML='<div class="card"><span class="pill err">error de red</span><pre>'+esc(String(err))+'</pre></div>';
    }).finally(function(){btn.disabled=false});
  }

  function ping(){
    fetch('/health').then(function(r){return r.json()}).then(function(){
      document.getElementById('dot').className='dot on';document.getElementById('statusTxt').textContent='en línea';
    }).catch(function(){document.getElementById('dot').className='dot off';document.getElementById('statusTxt').textContent='sin conexión'});
  }

  document.getElementById('search').addEventListener('input',render);
  fetch('/openapi.json').then(function(r){return r.json()}).then(function(s){spec=s;render()});
  ping();setInterval(ping,15000);
})();
</script>
</body>
</html>`;
