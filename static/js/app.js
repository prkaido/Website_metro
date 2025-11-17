(function(){
  // Encapsulado para no contaminar global
  const DEMO_USER = {user:'admin', pass:'1234'};
  const LS_KEY = 'metrologia_equipos_v1';
  let equipments = [];
  let editingId = null;

  const $ = id => document.getElementById(id);

  // Toggle: use remote API if true. Set window.USE_API = true in browser console to enable.
  const USE_API = !!window.USE_API;
  const API_BASE = (window.API_BASE || '') || '';

  function save(){localStorage.setItem(LS_KEY, JSON.stringify(equipments))}
  function load(){
    if(USE_API){
      loadFromApi();
      return;
    }
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      try{equipments = JSON.parse(raw)}catch(e){equipments=[]}
    } else {
      equipments = [
        {id:cryptoRandom(), name:'Multímetro Fluke 87V', serial:'FLU87-001', costCenter:'CC-001', location:'Planta 1', last:'2024-09-15', intervalDays:365, cert:'Cert-2024-045'},
        {id:cryptoRandom(), name:'Calibrador de presión XYZ', serial:'PRES-452', costCenter:'CC-010', location:'Laboratorio', last:'2025-05-01', intervalDays:180, cert:'Cert-2025-012'},
        {id:cryptoRandom(), name:'Generador de señales Agilent', serial:'GEN-900', costCenter:'CC-003', location:'Planta 2', last:'2023-10-20', intervalDays:720, cert:''}
      ];
      save();
    }
  }

  async function loadFromApi(){
    try{
      const res = await fetch((API_BASE||'') + '/api/v1/equipments', {headers:{'Authorization':'Bearer ' + (window.__TOKEN||'')}});
      if(!res.ok) throw new Error('error');
      const body = await res.json(); equipments = body.data || []; render();
    }catch(e){ console.error('loadFromApi',e); alert('No se pudieron cargar los equipos desde la API'); }
  }

  async function loginToApi(username,password){
    const res = await fetch((API_BASE||'') + '/api/v1/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username,password})});
    if(!res.ok) throw new Error('login failed');
    const body = await res.json(); window.__TOKEN = body.token; return body;
  }
  function cryptoRandom(){return Math.random().toString(36).slice(2,9)}

  function addEquipment(obj){
    if(USE_API){
      // POST to API
      fetch((API_BASE||'') + '/api/v1/equipments', {
        method:'POST', headers: {'Content-Type':'application/json', 'Authorization': 'Bearer ' + (window.__TOKEN||'')}, body: JSON.stringify(obj)
      }).then(r=>r.json()).then(()=> loadFromApi()).catch(e=> alert('Error al guardar en API'));
      return;
    }
    obj.id = cryptoRandom();
    obj.serial = obj.serial || '';
    obj.costCenter = obj.costCenter || '';
    obj.location = obj.location || '';
    obj.cert = obj.cert || '';
    equipments.push(obj); save(); render();
  }
  function updateEquipment(id, patch){
    if(USE_API){
      fetch((API_BASE||'') + '/api/v1/equipments/' + encodeURIComponent(id), {method:'PUT', headers:{'Content-Type':'application/json','Authorization':'Bearer ' + (window.__TOKEN||'')}, body: JSON.stringify(patch)}).then(()=> loadFromApi()).catch(e=> alert('Error al actualizar en API'));
      return;
    }
    const i = equipments.findIndex(e=>e.id===id);
    if(i>=0){equipments[i] = {...equipments[i], ...patch}; save(); render();}
  }
  function deleteEquipment(id){
    if(USE_API){
      fetch((API_BASE||'') + '/api/v1/equipments/' + encodeURIComponent(id), {method:'DELETE', headers:{'Authorization':'Bearer ' + (window.__TOKEN||'')}}).then(()=> loadFromApi()).catch(e=> alert('Error al eliminar en API'));
      return;
    }
    equipments = equipments.filter(e=>e.id!==id); save(); render();
  }

  function nextCalibrationDate(item){
    const last = new Date(item.last + 'T00:00:00');
    const next = new Date(last.getTime() + item.intervalDays*24*60*60*1000);
    return next;
  }
  function timeRemaining(next){
    const now = new Date();
    const diff = next - now; // ms
    if(isNaN(diff)) return {ms:0, text:'Fecha inválida', status:'over'};
    const days = Math.floor(diff / (24*60*60*1000));
    const hours = Math.floor((diff % (24*60*60*1000)) / (60*60*1000));
    const minutes = Math.floor((diff % (60*60*1000)) / (60*1000));
    const totalDays = diff / (24*60*60*1000);
    let text = '';
    if(diff<=0) text = `${Math.abs(days)} d. vencido`;
    else if(days>0) text = `${days} d ${hours} h`;
    else if(hours>0) text = `${hours} h ${minutes} m`;
    else text = `${minutes} m`;
    let status = 'ok';
    if(diff<=0) status='over';
    else if(totalDays <= 30) status='warn';
    return {ms:diff, text, status};
  }

  function escapeHtml(s){return (s||'').toString().replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}

  function render(){
    const table = $('equipTable');
    const q = $('search') ? ($('search').value||'').toLowerCase().trim() : '';
    let overCount = 0, soonCount = 0;
    if(!table){
      // no table on this page (e.g., add.html or index). update summary counters if present and return.
      equipments.forEach(item=>{
        if(q && !(item.name||'').toLowerCase().includes(q) && !(item.serial||'').toLowerCase().includes(q)) return;
        const rem = timeRemaining(nextCalibrationDate(item));
        if(rem.status==='over') overCount++; else if(rem.status==='warn') soonCount++;
      });
      if($('totalCount')) $('totalCount').textContent = equipments.length;
      if($('overCount')) $('overCount').textContent = overCount;
      if($('soonCount')) $('soonCount').textContent = soonCount;
      updateTopAlerts(overCount, soonCount);
      return;
    }
    const tbody = table.querySelector('tbody'); tbody.innerHTML = '';
    equipments.forEach(item=>{
      if(q && !(item.name||'').toLowerCase().includes(q) && !(item.serial||'').toLowerCase().includes(q)) return;
      const next = nextCalibrationDate(item); const rem = timeRemaining(next);
      if(rem.status==='over') overCount++; else if(rem.status==='warn') soonCount++;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.serial||'')}</td>
        <td>${escapeHtml(item.costCenter||'')}</td>
        <td>${escapeHtml(item.location||'')}</td>
        <td>${item.intervalDays}</td>
        <td class="muted">${item.last}</td>
        <td>${isNaN(next)?'--':next.toISOString().slice(0,10)}</td>
        <td>${item.cert?'<a href="'+escapeHtml(item.cert)+'" target="_blank">Ver</a>':'-'}</td>
        <td>${Math.ceil(rem.ms / (24*60*60*1000))}</td>
        <td><span class="status ${rem.status==='ok'?'ok':rem.status==='warn'?'warn':'over'}">${rem.status==='ok'?'OK':rem.status==='warn'?'Por vencer':'Vencido'}</span></td>
        <td class="actions">
          <button data-id="${item.id}" class="editBtn">Editar</button>
          <button data-id="${item.id}" class="delBtn">Eliminar</button>
        </td>`;
      tbody.appendChild(tr);
    });
    if($('totalCount')) $('totalCount').textContent = equipments.length;
    if($('overCount')) $('overCount').textContent = overCount;
    if($('soonCount')) $('soonCount').textContent = soonCount;
    updateTopAlerts(overCount, soonCount);
    // attach handlers delegated
    tbody.querySelectorAll('.editBtn').forEach(b=>b.addEventListener('click', e=>onEdit(e.target.dataset.id)));
    tbody.querySelectorAll('.delBtn').forEach(b=>b.addEventListener('click', e=>{ if(confirm('Eliminar equipo?')) deleteEquipment(e.target.dataset.id); }));
  }

  function updateTopAlerts(over, soon){
    const container = $('topAlerts'); container.innerHTML = '';
    if(over>0){ const pill = document.createElement('div'); pill.className='alert-pill'; pill.textContent = `${over} vencido${over>1?'s':''}`; pill.style.background = 'rgba(229,57,53,0.95)'; container.appendChild(pill); }
    if(soon>0){ const pill = document.createElement('div'); pill.className='alert-pill'; pill.textContent = `${soon} por vencer`; pill.style.background = 'rgba(255,152,0,0.95)'; container.appendChild(pill); }
  }

  function onLogin(){
    const usernameEl = $('username'); const passwordEl = $('password');
    const u = usernameEl ? usernameEl.value.trim() : '';
    const p = passwordEl ? passwordEl.value : '';
    if(USE_API){
      loginToApi(u,p).then(()=>{ sessionStorage.setItem('metrologia_logged','1'); loadPage('dashboard.html', true); }).catch(()=>{ alert('Usuario o contraseña incorrectos (API)'); });
      return;
    }
    if(u===DEMO_USER.user && p===DEMO_USER.pass){ sessionStorage.setItem('metrologia_logged','1'); showDashboard(); }
    else alert('Usuario o contraseña incorrectos (demo: admin / 1234)');
  }

  function onSaveEq(){
    const name = $('eqName').value.trim();
    const serial = $('eqSerial').value.trim();
    const costCenter = $('eqCost').value.trim();
    const location = $('eqLocation').value.trim();
    const last = $('lastCal').value;
    const intervalDays = parseInt($('interval').value,10);
    const cert = $('eqCert').value.trim();
    if(!name || !last || !intervalDays){alert('Complete al menos nombre, fecha de última calibración e intervalo'); return}
    if(editingId){ updateEquipment(editingId, {name, serial, costCenter, location, last, intervalDays, cert}); editingId = null; }
    else { addEquipment({name, serial, costCenter, location, last, intervalDays, cert}); }
    clearForm();
  }

  function onEdit(id){ const e = equipments.find(x=>x.id===id); if(!e) return; $('eqName').value = e.name; $('eqSerial').value = e.serial; $('eqCost').value = e.costCenter; $('eqLocation').value = e.location; $('lastCal').value = e.last; $('interval').value = e.intervalDays; $('eqCert').value = e.cert; editingId = id; window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}); }

  function clearForm(){ editingId=null; $('eqName').value=''; $('eqSerial').value=''; $('eqCost').value=''; $('eqLocation').value=''; $('lastCal').value=''; $('interval').value=365; $('eqCert').value=''; }

  function showDashboard(){
    const loginView = $('loginView'); const dashboardView = $('dashboardView');
    if(loginView && dashboardView){ loginView.style.display='none'; dashboardView.style.display=''; render(); }
    else { window.location.href = 'dashboard.html'; }
  }

  // CSV Export/Import
  function exportCsv(){
    if(!equipments.length){ alert('No hay equipos para exportar'); return; }
    const headers = ['name','serial','costCenter','location','intervalDays','last','cert'];
    const rows = equipments.map(e=>headers.map(h=>`"${(e[h]||'').toString().replaceAll('"','""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'equipos.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  function importCsv(file){
    const reader = new FileReader();
    reader.onload = function(e){
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if(!lines.length) return;
      const headers = lines.shift().split(',').map(h=>h.trim());
      const parsed = lines.map(l=>{
        // simple CSV parse (quotes)
        const cols = l.match(/(?:\"([^\"]*)\"|[^,]+)/g).map(c=>c.replace(/^\"|\"$/g,''));
        const obj = {};
        headers.forEach((h,i)=> obj[h]=cols[i]||'');
        return obj;
      });
      // map to internal shape
      parsed.forEach(p=> addEquipment({
        name:p.name||p.Nombre||'Sin nombre', serial:p.serial||'', costCenter:p.costCenter||'', location:p.location||'', last:p.last||'', intervalDays:parseInt(p.intervalDays||p.Periodicidad||365,10)||365, cert:p.cert||''
      }));
      alert('Importación completada');
    };
    reader.readAsText(file);
  }

  // Init
  (function init(){
    load();
    // --- SPA navigation helpers ---
    async function loadPage(url, replaceState){
      try{
        const res = await fetch(url, {cache:'no-store'});
        if(!res.ok) throw new Error('No se pudo cargar ' + url);
        const text = await res.text();
        // grab the <main id="mainContent"> content from the fetched HTML
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const newMain = doc.getElementById('mainContent');
        if(newMain){
          const main = document.getElementById('mainContent');
          if(main) main.replaceWith(newMain);
          else document.body.appendChild(newMain);
          // re-run bindings for new content
          rebindUI();
        }
        if(replaceState) history.replaceState({url}, '', url); else history.pushState({url}, '', url);
        setActiveSidebar(url);
      }catch(err){ console.error(err); window.location.href = url; }
    }

    function setActiveSidebar(url){
      const links = document.querySelectorAll('.side-link');
      links.forEach(a=>{
        a.classList.remove('active'); a.removeAttribute('aria-current');
        const href = a.getAttribute('href') || a.dataset.href || '';
        if(href && (url.endsWith(href) || location.pathname.endsWith(href) || location.href.includes(href))){
          a.classList.add('active'); a.setAttribute('aria-current','true');
        }
      });
    }

    function showAddCard(show){
      const card = $('addCard');
      if(!card) return;
      if(show){ card.style.display = ''; card.classList.add('visible'); card.classList.remove('hidden'); }
      else { card.style.display = 'none'; card.classList.remove('visible'); card.classList.add('hidden'); }
    }

    // Intercept internal link clicks for SPA behavior
    function hijackLinks(){
      document.querySelectorAll('a.side-link').forEach(a=>{
        if(a.dataset.bound) return; a.dataset.bound = '1';
        a.addEventListener('click', e=>{
          const href = a.getAttribute('href');
          if(!href || href.startsWith('http') || href.startsWith('#')) return;
          e.preventDefault(); loadPage(href);
        });
      });
    }

    // rebind UI after partial content swap
    function rebindUI(){
      // re-run render and bindings for elements that may be on the new page
      if($('search')) $('search').addEventListener('input', render);
      if($('saveEq')) $('saveEq').addEventListener('click', onSaveEq);
      if($('clearForm')) $('clearForm').addEventListener('click', clearForm);
      if($('exportCsv')) $('exportCsv').addEventListener('click', exportCsv);
      if($('importFile')) $('importFile').addEventListener('change', e=>{ if(e.target.files && e.target.files[0]) importCsv(e.target.files[0]); });
      // wire edit/delete buttons after render
      render();
      // show add card if current URL is add.html
      if(location.pathname.endsWith('add.html') || location.href.includes('add.html')) showAddCard(true); else showAddCard(false);
      hijackLinks();
    }

  // wire - safely bind only existing elements
  const loginBtn = $('loginBtn');
  const logoutBtn = $('logoutBtn');
  const saveEqBtn = $('saveEq');
  const clearFormBtn = $('clearForm');
  const searchInput = $('search');
  const exportBtn = $('exportCsv');
  const importFile = $('importFile');
  const passwordInput = $('password');
  const sideExportBtn = $('sideExport');
  if(loginBtn) loginBtn.addEventListener('click', onLogin);
    // modal and sidebar elements
    const recoverModal = $('recoverModal');
    const recoverEmail = $('recoverEmail');
    const closeRecover = $('closeRecover');
    const forgot = $('forgotLink');
    const recoverForm = $('recoverForm');
    const hamburgerBtn = $('hamburgerBtn');
    const sidebar = $('sidebar');
    let lastFocusedElement = null;
    let trapHandler = null;

    // toggle sidebar and update aria-expanded
    function toggleSidebar(open){
      if(typeof open === 'undefined') open = !sidebar.classList.contains('open');
      sidebar.classList.toggle('open', open);
      if(hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded', String(!!open));
    }

    // close on Escape: modal or sidebar
    document.addEventListener('keydown', e=>{
      if(e.key === 'Escape'){
        if(recoverModal && recoverModal.getAttribute('aria-hidden') === 'false'){
          closeRecoverModal();
        } else if(sidebar && sidebar.classList.contains('open')){
          toggleSidebar(false);
        }
      }
    });

    // click outside sidebar closes it
    document.addEventListener('click', e=>{
      if(sidebar && sidebar.classList.contains('open')){
        if(!sidebar.contains(e.target) && e.target !== hamburgerBtn){
          toggleSidebar(false);
        }
      }
    });

    // Focus trap implementation
    function trapFocus(modal){
      const focusable = 'a[href], area[href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"])';
      const nodes = Array.from(modal.querySelectorAll(focusable)).filter(n=>n.offsetWidth||n.offsetHeight||n.getClientRects().length);
      if(nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length-1];
      trapHandler = function(ev){
        if(ev.key !== 'Tab') return;
        if(ev.shiftKey){
          if(document.activeElement === first){ ev.preventDefault(); last.focus(); }
        } else {
          if(document.activeElement === last){ ev.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener('keydown', trapHandler);
    }
    function releaseTrap(){ if(trapHandler) document.removeEventListener('keydown', trapHandler); trapHandler = null; }

    // open recover modal with focus trap
    function openRecover(){
      if(!recoverModal) return;
      lastFocusedElement = document.activeElement;
      recoverModal.setAttribute('aria-hidden','false');
      recoverModal.classList.add('open');
      // mark other content as inert-ish
      document.querySelectorAll('main, header, aside, footer, #dashboard').forEach(el=>el && el.setAttribute('aria-hidden','true'));
      setTimeout(()=>{ if(recoverEmail) recoverEmail.focus(); },50);
      trapFocus(recoverModal);
    }
    function closeRecoverModal(){
      if(!recoverModal) return;
      recoverModal.setAttribute('aria-hidden','true');
      recoverModal.classList.remove('open');
      document.querySelectorAll('main, header, aside, footer, #dashboard').forEach(el=>el && el.removeAttribute('aria-hidden'));
      releaseTrap();
      if(lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
    }

  if(forgot) forgot.addEventListener('click', e=>{ e.preventDefault(); openRecover(); });
    if(closeRecover) closeRecover.addEventListener('click', e=>{ e.preventDefault(); closeRecoverModal(); });
    if(recoverForm){
      recoverForm.addEventListener('submit', e=>{
        e.preventDefault();
        const email = $('recoverEmail').value.trim();
        if(!email){ alert('Ingrese un correo válido'); return; }
        $('recoverMsg').textContent = 'Se ha enviado un enlace de recuperación a ' + email + ' (simulado).';
        setTimeout(()=>{ $('recoverMsg').textContent = ''; closeRecoverModal(); }, 1500);
      });
    }
  // sidebar toggle
  if(hamburgerBtn) hamburgerBtn.addEventListener('click', ()=>{ lastFocusedElement = document.activeElement; toggleSidebar(); });
    // sidebar links and SPA behaviour
    hijackLinks();
    const sideLinks = document.querySelectorAll('.side-link');
    sideLinks.forEach(b=> b.addEventListener('click', e=>{
      // some sidebar buttons don't have href (e.g., export), handle data-action if present
      const action = e.target.dataset ? e.target.dataset.action : undefined;
      if(action==='add'){ showAddCard(true); }
      if(action==='dashboard'){ if($('search')) $('search').value=''; /* render will run after load */ }
      if(action==='list'){ if($('search')) $('search').focus(); }
      const sb = $('sidebar'); if(sb) toggleSidebar(false);
    }));
    if(logoutBtn) logoutBtn.addEventListener('click', ()=>{ sessionStorage.removeItem('metrologia_logged'); window.location.href = 'index.html'; });
    if(saveEqBtn) saveEqBtn.addEventListener('click', onSaveEq);
    if(clearFormBtn) clearFormBtn.addEventListener('click', clearForm);
    if(searchInput) searchInput.addEventListener('input', render);
    if(exportBtn) exportBtn.addEventListener('click', exportCsv);
    if(sideExportBtn) sideExportBtn.addEventListener('click', exportCsv);
    if(importFile) importFile.addEventListener('change', e=>{ if(e.target.files && e.target.files[0]) importCsv(e.target.files[0]); });
    if(passwordInput) passwordInput.addEventListener('keydown', e=>{ if(e.key==='Enter') onLogin(); });
    // if user already logged in:
    const logged = sessionStorage.getItem('metrologia_logged');
    const isIndex = !!$('loginView');
    if(logged && isIndex) loadPage('dashboard.html', true);
    else if(logged && $('equipTable')) render();
    setActiveSidebar(location.pathname);
    hijackLinks();
    setInterval(render, 30*1000);
  })();

})();
