  /* =========================================================
    CONFIG
    ========================================================= */
  const STATUSES = {
    new:       { label:'New lead',      color:'#94a3b8' },
    contacted: { label:'Contacted',     color:'#3b82f6' },
    meeting:   { label:'Meeting set',   color:'#a855f7' },
    proposal:  { label:'Proposal sent', color:'#f59e0b' },
    won:       { label:'Client won',    color:'#10b981' },
    lost:      { label:'Lost',          color:'#ef4444' },
  };
  const ORDER   = Object.keys(STATUSES);
  const LS_KEY  = 'devdesk.leads.v1';
  const LS_CENTER = 'devdesk.center.v1';

  /* =========================================================
    STATE
    ========================================================= */
  const state = {
    leads: [],
    center: { lat: 51.5074, lng: -0.1278 },  // fallback until geolocation resolves
    filters: new Set(ORDER),
    q: '',
    adding: false,
    selectedId: null,
  };

  /* =========================================================
    HELPERS
    ========================================================= */
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => 'b_' + Math.random().toString(36).slice(2, 9);

  function haversine(a, b) {
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fmtDist(m) {
    if (!isFinite(m)) return '';
    return m < 950 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1) + ' km';
  }
  function toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* =========================================================
    PERSISTENCE
    ========================================================= */
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) state.leads = JSON.parse(raw) || [];
      const c = localStorage.getItem(LS_CENTER);
      if (c) state.center = JSON.parse(c);
    } catch (e) { console.warn('load failed', e); }
  }
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state.leads));
      localStorage.setItem(LS_CENTER, JSON.stringify(state.center));
    } catch (e) { console.warn('save failed', e); }
  }

  /* =========================================================
    MAP
    ========================================================= */
  const map = L.map('map', { zoomControl: true, worldCopyJump: true })
    .setView([state.center.lat, state.center.lng], 14);

  // Using Carto tiles (requires the API key you provided)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_4uhy_1_2b204349610d71026788e8d4', {
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
  }).addTo(map);

  let meMarker = null;
  function renderMe() {
    const ic = L.divIcon({ className: 'pin-wrap', html: '<span class="pin me"></span>', iconSize: [20,20], iconAnchor: [10,10] });
    if (meMarker) meMarker.setLatLng([state.center.lat, state.center.lng]);
    else meMarker = L.marker([state.center.lat, state.center.lng], { icon: ic, zIndexOffset: -100 }).addTo(map).bindPopup('You are here');
  }

  function pinIcon(color) {
    return L.divIcon({
      className: 'pin-wrap',
      html: `<span class="pin" style="--c:${color}"></span>`,
      iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20]
    });
  }

  const markers = new Map();

  function renderMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers.clear();
    for (const lead of visibleLeads()) {
      const s = STATUSES[lead.status] || STATUSES.new;
      const m = L.marker([lead.lat, lead.lng], { icon: pinIcon(s.color), title: lead.name })
        .addTo(map)
        .bindPopup(popupHtml(lead), { maxWidth: 290 });
      m.on('click', () => selectLead(lead.id, false));
      markers.set(lead.id, m);
    }
  }

  function popupHtml(l) {
    const s = STATUSES[l.status] || STATUSES.new;
    return `<div class="pop">
      <div class="pop-h"><span class="dot" style="background:${s.color}"></span><strong>${esc(l.name)}</strong></div>
      ${l.category || l.address ? `<div class="pop-sub">${esc([l.category, l.address].filter(Boolean).join(' · '))}</div>` : ''}
      <div class="pop-status" style="--c:${s.color}">${s.label}${l.progress ? ' · ' + l.progress + '%' : ''}</div>
      <div class="bar"><i style="width:${l.progress || 0}%;background:${s.color}"></i></div>
      <div class="pop-actions">
        <button onclick="editLead('${l.id}')">Edit</button>
        <button onclick="copyPitch('${l.id}')">Copy pitch</button>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}" target="_blank" rel="noopener">Directions</a>
      </div>
    </div>`;
  }

  /* =========================================================
    FILTERING
    ========================================================= */
  function visibleLeads() {
    const q = state.q.trim().toLowerCase();
    return state.leads
      .filter(l => state.filters.has(l.status))
      .filter(l => !q || `${l.name} ${l.category || ''} ${l.address || ''} ${l.notes || ''}`.toLowerCase().includes(q))
      .sort((a, b) => haversine(state.center, a) - haversine(state.center, b));
  }

  /* =========================================================
    RENDER
    ========================================================= */
  function renderStats() {
    const total = state.leads.length;
    const wonLeads = state.leads.filter(l => l.status === 'won');
    const won = wonLeads.length;
    const pipe = state.leads.filter(l => ['contacted','meeting','proposal'].includes(l.status)).length;
    
    // Potential: Only count leads that are NOT won and NOT lost
    const potentialValue = state.leads
      .filter(l => !['won', 'lost'].includes(l.status))
      .reduce((s, l) => s + (Number(l.value) || 0), 0);
      
    // Earned: Total value of won clients
    const earnedValue = wonLeads
      .reduce((s, l) => s + (Number(l.value) || 0), 0);

    // Helper to format money nicely in Pesos
    const fmt = (num) => {
      if (num >= 1000000) return '₱' + (num/1000000).toFixed(1).replace('.0','') + 'M';
      if (num >= 1000) return '₱' + (num/1000).toFixed(1).replace('.0','') + 'k';
      return '₱' + num;
    };

    $('stats').innerHTML = `
      <div class="stat"><b>${total}</b>businesses</div>
      <div class="stat"><b>${pipe}</b>in pipeline</div>
      <div class="stat"><b>${won}</b>won</div>
      <div class="stat" title="Unearned Pipeline Value"><b>${fmt(potentialValue)}</b>potential</div>
      <div class="stat" title="Actual Revenue Won"><b>${fmt(earnedValue)}</b>earned</div>`;
  }

  function renderChips() {
    $('chips').innerHTML = ORDER.map(k => {
      const s = STATUSES[k];
      return `<button type="button" class="chip ${state.filters.has(k) ? 'on' : ''}" data-status="${k}">
        <i style="background:${s.color}"></i>${s.label}</button>`;
    }).join('');
  }

  function renderList() {
    const list = $('list');
    const leads = visibleLeads();

    if (!leads.length) {
      list.innerHTML = `<div class="empty">
        ${state.leads.length
          ? 'No businesses match your filters.'
          : `<b>No businesses yet.</b><br>Hit <b>🔎 Discover nearby</b> to pull real businesses around you from OpenStreetMap, or <b>➕ Add business</b> manually.`}
      </div>`;
      return;
    }

    list.innerHTML = leads.map(l => {
      const s = STATUSES[l.status] || STATUSES.new;
      const d = haversine(state.center, l);
      return `<div class="lead ${l.id === state.selectedId ? 'sel' : ''}" data-id="${l.id}">
        <div class="lead-top">
          <span class="dot" style="background:${s.color}"></span>
          <strong>${esc(l.name)}</strong>
          <span class="dist">${fmtDist(d)}</span>
        </div>
        <div class="lead-sub">${esc([l.category, l.address].filter(Boolean).join(' · ') || '—')}</div>
        <div class="bar"><i style="width:${l.progress || 0}%;background:${s.color}"></i></div>
        <div class="lead-foot">
          <select class="mini" onchange="setStatus('${l.id}', this.value); event.stopPropagation();">
            ${ORDER.map(k => `<option value="${k}" ${k === l.status ? 'selected' : ''}>${STATUSES[k].label}</option>`).join('')}
          </select>
          <span class="pct">${l.progress || 0}%${l.value ? ' · ₱' + Number(l.value).toLocaleString() : ''}</span>
        </div>
      </div>`;
    }).join('');
  }

  function renderAll() {
    renderStats();
    renderChips();
    renderList();
    renderMarkers();
    renderMe();
  }

  /* =========================================================
    INTERACTION
    ========================================================= */
  function selectLead(id, fly = true) {
    state.selectedId = id;
    renderList();
    const lead = state.leads.find(l => l.id === id);
    if (!lead) return;
    if (fly) map.flyTo([lead.lat, lead.lng], Math.max(map.getZoom(), 16), { duration: .5 });
    const m = markers.get(id);
    if (m) m.openPopup();
  }

  function setStatus(id, status) {
    const l = state.leads.find(x => x.id === id);
    if (!l) return;
    l.status = status;
    l.updatedAt = Date.now();
    const suggested = { new: 0, contacted: 25, meeting: 50, proposal: 75, won: 100, lost: l.progress || 0 }[status];
    if (typeof suggested === 'number') l.progress = suggested;
    save(); renderAll();
    toast(`"${l.name}" → ${STATUSES[status].label}`);
  }

  /* --- pitch message generator --- */
  function pitchText(l) {
    const cat = (l.category || 'business').toLowerCase();
    return `Hi ${l.name} team,

  I'm a freelance developer working with local ${cat}s in the area. I noticed you're nearby and wanted to reach out — I help businesses like yours with fast, modern websites, online booking, and simple internal tools.

  A few things I can do for you:
  • A modern, mobile-friendly website that actually brings in customers
  • Online booking / contact forms wired to your email or WhatsApp
  • Fixing a slow or broken site, or adding new features
  • Simple automations that save you hours a week

  Would you be open to a 15-minute call this week? Happy to share examples of similar projects.

  Best regards,
  [Your name]
  [Your phone] · [Your email] · [Your portfolio link]`;
  }

  function copyPitch(id) {
    const l = state.leads.find(x => x.id === id);
    if (!l) return;
    const text = pitchText(l);
    navigator.clipboard?.writeText(text)
      .then(() => toast('Pitch copied — paste it into an email or DM'))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove(); toast('Pitch copied');
      });
  }
  window.copyPitch = copyPitch;

  /* =========================================================
    MODAL
    ========================================================= */
  function fillStatusSelect() {
    $('f-status').innerHTML = ORDER.map(k => `<option value="${k}">${STATUSES[k].label}</option>`).join('');
  }

  function openModal(lead = null, latlng = null) {
    fillStatusSelect();
    $('modalTitle').textContent = lead ? 'Edit business' : 'Add business';
    $('btnDelete').style.display = lead ? '' : 'none';

    $('f-id').value      = lead?.id || '';
    $('f-name').value    = lead?.name || '';
    $('f-cat').value     = lead?.category || '';
    $('f-addr').value    = lead?.address || '';
    $('f-phone').value   = lead?.phone || '';
    $('f-email').value   = lead?.email || '';
    $('f-site').value    = lead?.website || '';
    $('f-status').value  = lead?.status || 'new';
    $('f-value').value   = lead?.value ?? 5000;
    $('f-progress').value= lead?.progress ?? 0;
    $('f-notes').value   = lead?.notes || '';
    $('f-lat').value     = latlng?.lat ?? lead?.lat ?? state.center.lat;
    $('f-lng').value     = latlng?.lng ?? lead?.lng ?? state.center.lng;
    $('progLabel').textContent = ($('f-progress').value) + '%';

    $('modal').classList.add('open');
    setTimeout(() => $('f-name').focus(), 60);
  }
  function closeModal() { $('modal').classList.remove('open'); }

  function editLead(id) {
    const lead = state.leads.find(l => l.id === id);
    if (lead) openModal(lead);
  }
  window.editLead = editLead;
  window.setStatus = setStatus;

  $('form').addEventListener('submit', e => {
    e.preventDefault();
    const id = $('f-id').value;
    const payload = {
      name:     $('f-name').value.trim(),
      category: $('f-cat').value.trim(),
      address:  $('f-addr').value.trim(),
      phone:    $('f-phone').value.trim(),
      email:    $('f-email').value.trim(),
      website:  $('f-site').value.trim(),
      status:   $('f-status').value,
      value:    $('f-value').value ? Number($('f-value').value) : 5000,
      progress: Number($('f-progress').value),
      notes:    $('f-notes').value.trim(),
      lat:      Number($('f-lat').value),
      lng:      Number($('f-lng').value),
      updatedAt: Date.now(),
    };
    if (!payload.name) return;

    if (id) {
      const i = state.leads.findIndex(l => l.id === id);
      state.leads[i] = { ...state.leads[i], ...payload };
    } else {
      state.leads.push({ id: uid(), createdAt: Date.now(), ...payload });
    }
    save(); closeModal(); renderAll();
    toast(id ? 'Business updated' : 'Business added');
  });

  $('btnDelete').addEventListener('click', () => {
    const id = $('f-id').value;
    if (!id) return;
    if (!confirm('Delete this business from your list?')) return;
    state.leads = state.leads.filter(l => l.id !== id);
    save(); closeModal(); renderAll(); toast('Deleted');
  });

  $('btnCancel').addEventListener('click', closeModal);
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); setAdding(false); } });
  $('f-progress').addEventListener('input', e => $('progLabel').textContent = e.target.value + '%');

  /* =========================================================
    ADD-BY-CLICK ON MAP
    ========================================================= */
  function setAdding(on) {
    state.adding = on;
    $('mapWrap').classList.toggle('adding', on);
    $('hint').classList.toggle('show', on);
    $('btnAdd').textContent = on ? '✖ Cancel' : '➕ Add business';
  }
  map.on('click', e => {
    if (!state.adding) return;
    setAdding(false);
    openModal(null, e.latlng);
  });

  /* =========================================================
    LIST EVENTS
    ========================================================= */
  $('list').addEventListener('click', e => {
    const card = e.target.closest('.lead');
    if (!card) return;
    if (e.target.closest('select')) return;
    selectLead(card.dataset.id, true);
  });

  $('chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const k = chip.dataset.status;
    state.filters.has(k) ? state.filters.delete(k) : state.filters.add(k);
    if (!state.filters.size) ORDER.forEach(s => state.filters.add(s)); // never empty
    renderChips(); renderList(); renderMarkers();
  });

  $('search').addEventListener('input', e => {
    state.q = e.target.value;
    renderList(); renderMarkers();
  });

  /* =========================================================
    GEOLOCATION
    ========================================================= */
  function locate(silent = false) {
    if (!navigator.geolocation) { if (!silent) toast('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        save();
        map.flyTo([state.center.lat, state.center.lng], 15, { duration: .8 });
        renderAll();
        if (!silent) toast('Centered on your location');
      },
      err => { if (!silent) toast('Could not get your location: ' + err.message); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  /* =========================================================
    DISCOVER NEARBY BUSINESSES (OpenStreetMap / Overpass)
    ========================================================= */
  async function discover() {
    const btn = $('btnDiscover');
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Searching…';

    const { lat, lng } = state.center;
    const R = 900; // metres
    const query = `[out:json][timeout:25];
  (
    node["shop"](around:${R},${lat},${lng});
    node["office"](around:${R},${lat},${lng});
    node["craft"](around:${R},${lat},${lng});
    node["amenity"~"^(cafe|restaurant|bar|pub|bank|pharmacy|dentist|doctors|veterinary|car_repair|hairdresser|beauty|fast_food|bakery)$"](around:${R},${lat},${lng});
  );
  out body 120;`;

    try {
      // List of Overpass API servers to try
      const servers = [
        'https://overpass-api.de/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.private.coffee/api/interpreter'
      ];

      let res = null;
      let success = false;

      // Loop through servers until one works
      for (const url of servers) {
        try {
          res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(query)
          });
          
          if (res.ok) {
            success = true;
            break; // Success! Break out of the loop.
          }
        } catch (err) {
          console.warn(`Server ${url} failed, trying next...`);
        }
      }

      if (!success) throw new Error('All Overpass servers are currently busy.');
      
      const data = await res.json();

      const existingOsm = new Set(state.leads.map(l => l.osmId).filter(Boolean));
      const existingName = new Set(state.leads.map(l => (l.name || '').toLowerCase().trim()));

      let added = 0;
      for (const el of (data.elements || [])) {
        const t = el.tags || {};
        const name = (t.name || '').trim();
        if (!name) continue;
        if (existingOsm.has(el.id) || existingName.has(name.toLowerCase())) continue;

        const category = (t.shop || t.amenity || t.office || t.craft || 'business').replace(/_/g, ' ');
        const address = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ')
          || [t['addr:city'], t['addr:postcode']].filter(Boolean).join(' ');

        state.leads.push({
          id: uid(),
          osmId: el.id,
          name,
          category,
          address,
          phone: t.phone || t['contact:phone'] || '',
          email: t.email || t['contact:email'] || '',
          website: t.website || t['contact:website'] || '',
          status: 'new',
          progress: 0,
          value: 5000,
          notes: '',
          lat: el.lat ?? el.center?.lat,
          lng: el.lon ?? el.center?.lon,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        existingName.add(name.toLowerCase());
        added++;
      }

      save(); renderAll();
      toast(added
        ? `Found ${added} new business${added === 1 ? '' : 'es'} within ${R} m`
        : 'No new businesses found here — try moving the map or adding manually');

      if (!added && !state.leads.length) {
        console.info('Overpass returned', data.elements?.length, 'elements');
      }
    } catch (err) {
      console.error(err);
      toast('Discovery failed (Overpass may be busy). Try again in a moment.');
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  /* =========================================================
    IMPORT / EXPORT
    ========================================================= */
  $('btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ leads: state.leads, center: state.center }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `devdesk-leads-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Exported ' + state.leads.length + ' businesses');
  });

  $('btnImport').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const leads = Array.isArray(parsed) ? parsed : parsed.leads;
          if (!Array.isArray(leads)) throw new Error('Invalid file');
          const byId = new Map(state.leads.map(l => [l.id, l]));
          leads.forEach(l => { if (l && l.id && l.name) byId.set(l.id, { ...byId.get(l.id), ...l }); });
          state.leads = [...byId.values()];
          if (parsed.center) state.center = parsed.center;
          save(); renderAll();
          toast(`Imported — you now have ${state.leads.length} businesses`);
        } catch (e) {
          toast('Import failed: not a valid DevDesk export');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });

  /* =========================================================
    WIRE UP & BOOT
    ========================================================= */
  $('btnAdd').addEventListener('click', () => {
    if (state.adding) { setAdding(false); return; }
    setAdding(true);
  });
  $('btnLocate').addEventListener('click', () => locate(false));
  $('btnDiscover').addEventListener('click', discover);

  load();
  renderAll();
  locate(true);           // silently center on the user on first load
  setTimeout(() => map.invalidateSize(), 200);
  window.addEventListener('resize', () => map.invalidateSize());