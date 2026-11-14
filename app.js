/* SmartPark - prototype logic
 * Everything is saved in the browser (localStorage), so no backend is needed for the demo.
 * Login uses a demo OTP (auth.js) and payment is a demo flow. No real SMS or money is involved.
 * Address search uses OpenStreetMap Nominatim (free, no API key).
 * Later you can replace the load()/save() helpers with Supabase calls.
 */
(function () {
  'use strict';

  var DEFAULT_CENTER = [28.7501, 77.1177];          // near DTU, Delhi (demo area)
  var DEFAULT_LABEL = 'DTU, Delhi (demo area)';
  var COMMISSION = 0.15;                            // 15% platform commission
  var KEY_S = 'smartpark_spaces_v1';
  var KEY_B = 'smartpark_bookings_v1';
  // Map tiles: OpenStreetMap first. If its tiles fail to load (blocked, offline file, etc.),
  // the map switches by itself to a second free provider. No API key is needed for either.
  var TILE_SOURCES = [
    { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      opts: { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors', referrerPolicy: 'origin' } },
    { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      opts: { maxZoom: 19, attribution: 'Tiles &copy; Esri' } }
  ];
  var HOURS = [1, 2, 3, 4, 6, 8, 10, 12];
  var METHODS = [
    { id: 'upi', name: 'UPI', sub: 'Pay with any UPI app', ico: 'UPI' },
    { id: 'card', name: 'Card', sub: 'Debit or credit card', ico: 'CC' },
    { id: 'netbanking', name: 'Net banking', sub: 'All major banks', ico: 'NB' },
    { id: 'wallet', name: 'Wallet', sub: 'Pay from wallet balance', ico: 'W' }
  ];

  /* ---------- tiny helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v || fallback; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage may be blocked */ }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '₹' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ''); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function km(a, b) { // haversine distance in km
    var R = 6371, toR = Math.PI / 180;
    var dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function fmtTime(ms) {
    return new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add('hidden'); }, 2800);
  }
  function typeLabel(t) { return { home: 'Home', office: 'Office', complex: 'Society / Complex' }[t] || t; }
  function vehLabel(v) { return { bike: 'Bike', car: 'Car', suv: 'SUV / Large' }[v] || v; }
  function shortName(n) { return String(n || '').split(',').slice(0, 3).map(function (x) { return x.trim(); }).join(', '); }
  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; }
    else { if (btn.dataset.label) { btn.textContent = btn.dataset.label; } btn.disabled = false; }
  }

  /* ---------- demo data (approximate locations) ---------- */
  function seedSpaces() {
    function cx(name, gate, slot, entry) { return { name: name, gate: gate, slot: slot, entry: entry, approval: 'approved' }; }
    return [
      { id: 's1', title: 'Driveway near market', type: 'home', address: 'Sector 16 market lane, Rohini',
        lat: 28.7512, lng: 77.1205, vehicle: 'car', dim: '5m x 2.5m', price: 30, from: 7, to: 22,
        notes: 'Park in front of the green gate. Call owner on arrival.', status: 'live', rating: 4.6 },
      { id: 's2', title: 'Office visitor slots (after 6 PM)', type: 'office', address: 'Tech Park, Bawana Road',
        lat: 28.7478, lng: 77.1139, vehicle: 'car', dim: '5m x 2.5m', price: 40, from: 10, to: 24,
        notes: 'Use Gate B. Security will scan your OTP.', status: 'live', rating: 4.3 },
      { id: 's3', title: 'Green Valley Apartments - visitor slot', type: 'complex', address: 'Green Valley Apartments, Rohini',
        lat: 28.7539, lng: 77.1162, vehicle: 'car', dim: '5m x 2.5m', price: 50, from: 8, to: 20,
        notes: 'Society rule: show booking OTP at the gate.', status: 'live', rating: 4.8,
        complex: cx('Green Valley Apartments', 'Gate 2, Block C', 'C-14', 'Show booking OTP to the guard. Visitor register entry required.') },
      { id: 's4', title: 'Bike spot near hospital', type: 'home', address: 'Near hospital road, Rohini',
        lat: 28.7466, lng: 77.1211, vehicle: 'bike', dim: '2m x 1m', price: 10, from: 6, to: 23,
        notes: 'Inside the lane on the left. Helmet lock available.', status: 'live', rating: 4.1 },
      { id: 's5', title: 'Large vehicle space (SUV / van)', type: 'office', address: 'Warehouse yard, Bawana Road',
        lat: 28.7445, lng: 77.1098, vehicle: 'suv', dim: '7m x 3m', price: 70, from: 0, to: 24,
        notes: 'Open yard, CCTV. Enter from the main road.', status: 'live', rating: 4.4 },
      { id: 's6', title: 'Sunrise Heights - resident slot', type: 'complex', address: 'Sunrise Heights, Sector 15, Rohini',
        lat: 28.7561, lng: 77.1236, vehicle: 'car', dim: '5m x 2.5m', price: 45, from: 9, to: 21,
        notes: 'Pre-register vehicle number with management.', status: 'live', rating: 4.5,
        complex: cx('Sunrise Heights', 'Main gate, Tower A', 'A-07', 'Visitor pre-registration done automatically at booking.') },
      { id: 's7', title: 'Parking bay near Connaught Place', type: 'office', address: 'Inner Circle, Connaught Place, New Delhi',
        lat: 28.6329, lng: 77.2195, vehicle: 'car', dim: '5m x 2.5m', price: 80, from: 9, to: 22,
        notes: 'Enter from the side lane. Show your OTP to the attendant.', status: 'live', rating: 4.5 },
      { id: 's8', title: 'Shop-front slot, Karol Bagh', type: 'office', address: 'Market road, Karol Bagh, New Delhi',
        lat: 28.6514, lng: 77.1907, vehicle: 'car', dim: '5m x 2.5m', price: 50, from: 8, to: 21,
        notes: 'Available when the shop is closed. Pay and park.', status: 'live', rating: 4.2 },
      { id: 's9', title: 'Driveway in Hauz Khas', type: 'home', address: 'Hauz Khas, New Delhi',
        lat: 28.5494, lng: 77.2001, vehicle: 'car', dim: '5.5m x 2.5m', price: 60, from: 7, to: 23,
        notes: 'Blue gate, house number on the pillar.', status: 'live', rating: 4.7 },
      { id: 's10', title: 'Society visitor slot, Saket', type: 'complex', address: 'Saket, New Delhi',
        lat: 28.5245, lng: 77.2066, vehicle: 'car', dim: '5m x 2.5m', price: 55, from: 8, to: 22,
        notes: 'Visitor parking behind Block B.', status: 'live', rating: 4.4,
        complex: cx('Saket residential society', 'Gate 1', 'V-03', 'Guard will verify your booking OTP.') },
      { id: 's11', title: 'Bike spot, Lajpat Nagar', type: 'home', address: 'Lajpat Nagar, New Delhi',
        lat: 28.5677, lng: 77.2433, vehicle: 'bike', dim: '2m x 1m', price: 15, from: 6, to: 23,
        notes: 'Covered spot inside the building lobby.', status: 'live', rating: 4.0 },
      { id: 's12', title: 'Metro-side driveway, Dwarka', type: 'home', address: 'Sector 10, Dwarka, New Delhi',
        lat: 28.5823, lng: 77.0500, vehicle: 'car', dim: '5m x 2.5m', price: 35, from: 6, to: 24,
        notes: 'Ten minutes walk to the metro station.', status: 'live', rating: 4.3 },
      { id: 's13', title: 'Office basement slot, Noida', type: 'office', address: 'Sector 18, Noida',
        lat: 28.5708, lng: 77.3260, vehicle: 'car', dim: '5m x 2.5m', price: 45, from: 9, to: 21,
        notes: 'Take the ramp on the left of the main entrance.', status: 'live', rating: 4.4 }
    ];
  }

  var spaces = load(KEY_S, null);
  if (!Array.isArray(spaces)) { spaces = []; }
  seedSpaces().forEach(function (seed) {            // add any demo spaces that are missing
    if (!findSpace(seed.id)) { spaces.push(seed); }
  });
  save(KEY_S, spaces);
  var bookings = load(KEY_B, []);
  if (!Array.isArray(bookings)) { bookings = []; }

  var userPos = DEFAULT_CENTER.slice();   // centre used for distance (your location or a searched place)
  var centerLabel = DEFAULT_LABEL;
  var centerIsCustom = false;             // true after a search or "Use my location"
  var me = null;                          // the logged-in user, or null
  var paying = false;                     // true while the demo payment is processing

  function findSpace(id) {
    for (var i = 0; i < spaces.length; i++) { if (spaces[i].id === id) { return spaces[i]; } }
    return null;
  }

  /* ---------- tabs ---------- */
  var ROLE_TABS = { driver: ['find', 'dash'], owner: ['owner', 'listings'] };
  var ALL_TABS = ['find', 'dash', 'owner', 'listings'];
  var tabButtons = document.querySelectorAll('.tab');
  function showTab(name) {
    // a driver can never open owner screens (and the other way round)
    if (!me || ROLE_TABS[me.role].indexOf(name) === -1) { return; }
    tabButtons.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === name); });
    ALL_TABS.forEach(function (t) { $('tab-' + t).classList.toggle('active', t === name); });
    window.scrollTo(0, 0);
    // Leaflet needs a size refresh when its container becomes visible
    setTimeout(function () {
      if (name === 'find' && map) { map.invalidateSize(); }
      if (name === 'owner') { initOwnerMap(); if (ownerMap) { ownerMap.invalidateSize(); } }
    }, 60);
    if (name === 'dash') { renderDriverDash(); }
    if (name === 'listings') { renderOwnerDash(); }
  }
  tabButtons.forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
  });

  /* ---------- maps ---------- */
  function makeMap(elId, center, zoom) {
    var m = L.map(elId).setView(center, zoom);
    var idx = 0, loaded = false, errors = 0;
    function addTiles() {
      var src = TILE_SOURCES[idx];
      var layer = L.tileLayer(src.url, src.opts);
      layer.on('tileload', function () { loaded = true; });
      layer.on('tileerror', function () {
        errors++;
        if (!loaded && errors >= 3 && idx < TILE_SOURCES.length - 1) {   // switch to the backup provider
          m.removeLayer(layer); idx++; errors = 0; addTiles();
        }
      });
      layer.addTo(m);
    }
    addTiles();
    return m;
  }
  function pinIcon(html) { return L.divIcon({ className: 'pin-wrap', html: html, iconSize: [0, 0] }); }

  var map = null, markerLayer = null, centerMarker = null, markers = {}, activeId = null;

  function initMap() {
    if (typeof L === 'undefined') {
      $('map').innerHTML = '<p class="note" style="padding:16px">The map could not load (check your internet). The list of spaces still works.</p>';
      return;
    }
    map = makeMap('map', userPos, 14);
    markerLayer = L.layerGroup().addTo(map);
  }

  /* ---------- address search (OpenStreetMap Nominatim) ---------- */
  var geoCache = {};
  function geocode(q) {
    var key = q.toLowerCase();
    if (geoCache[key]) { return Promise.resolve(geoCache[key]); }
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) { ctl.abort(); } }, 9000);
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=in&q=' + encodeURIComponent(q);
    return fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) { throw new Error('http ' + r.status); } return r.json(); })
      .then(function (rows) {
        clearTimeout(timer);
        var out = (rows || []).map(function (r) {
          return { name: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
        }).filter(function (p) { return isFinite(p.lat) && isFinite(p.lng); });
        geoCache[key] = out;
        return out;
      }, function (err) { clearTimeout(timer); throw err; });
  }

  function matchSpaces(q) {
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return spaces.filter(function (s) {
      if (s.status !== 'live') { return false; }
      var hay = (s.title + ' ' + s.address + ' ' + (s.complex ? s.complex.name : '')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    }).slice(0, 4);
  }

  var PIN_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  var lastPlaces = [], lastLocal = [], searchSeq = 0;

  function hideSuggest() { $('suggest').classList.add('hidden'); }
  function showSuggest(html) { $('suggest').innerHTML = html; $('suggest').classList.remove('hidden'); }

  function renderSuggest(q, places, local, failed) {
    var h = '';
    if (places.length) {
      h += '<h5>Places</h5>';
      places.forEach(function (p, i) {
        var parts = String(p.name).split(',');
        h += '<button type="button" class="suggest-item" data-place="' + i + '"><span class="si-icon">' + PIN_SVG + '</span>' +
          '<span class="si-text"><span>' + esc(parts[0]) + '</span><small>' + esc(parts.slice(1, 4).join(',').trim()) + '</small></span></button>';
      });
    }
    if (local.length) {
      h += '<h5>Parking spaces</h5>';
      local.forEach(function (s) {
        h += '<button type="button" class="suggest-item" data-space="' + esc(s.id) + '"><span class="si-icon park">P</span>' +
          '<span class="si-text"><span>' + esc(s.title) + '</span><small>' + esc(s.address) + ' &middot; ' + money(s.price) + '/hr</small></span></button>';
      });
    }
    if (!places.length && !local.length) {
      h = '<div class="empty">' + (failed
        ? 'Could not reach the address search. Check your internet and try again.'
        : 'No places found for &ldquo;' + esc(q) + '&rdquo;. Try a nearby landmark or area name.') + '</div>';
    } else if (failed) {
      h += '<div class="empty">Address search is offline. Showing matching parking spaces only.</div>';
    }
    showSuggest(h);
  }

  function runSearch() {
    var q = $('q').value.trim();
    if (q.length < 2) { toast('Type at least 2 letters to search'); return; }
    var seq = ++searchSeq;
    lastLocal = matchSpaces(q);
    lastPlaces = [];
    showSuggest('<div class="empty">Searching&hellip;</div>');
    $('q-go').disabled = true;
    geocode(q).then(function (places) { return { places: places, failed: false }; },
      function () { return { places: [], failed: true }; })
      .then(function (res) {
        if (seq !== searchSeq) { return; }
        $('q-go').disabled = false;
        lastPlaces = res.places;
        renderSuggest(q, res.places, lastLocal, res.failed);
        if (res.places.length) { applyPlace(res.places[0]); }       // jump to the best match straight away
      });
  }

  function setCenter(pos, label, custom) {
    userPos = pos; centerLabel = label; centerIsCustom = !!custom;
    $('loc-note').textContent = 'Showing spaces near ' + label;
    if (map) { map.setView(pos, 14); }
    renderFind();
  }
  function applyPlace(p) { setCenter([p.lat, p.lng], shortName(p.name), true); }

  function focusSpace(id) {
    var s = findSpace(id);
    if (!s) { return; }
    setCenter([s.lat, s.lng], s.title, true);
    $('q').value = s.title;
    setActive(id, true);
  }

  function homePos() {
    if (me && me.lat != null && me.lng != null) { return { pos: [me.lat, me.lng], label: me.area || 'your saved location' }; }
    return { pos: DEFAULT_CENTER.slice(), label: DEFAULT_LABEL };
  }
  function resetCenter() {
    var h = homePos();
    setCenter(h.pos, h.label, false);
  }

  $('search-form').addEventListener('submit', function (e) { e.preventDefault(); runSearch(); });
  $('q').addEventListener('input', function () { $('q-clear').classList.toggle('hidden', !$('q').value); });
  $('q-clear').addEventListener('click', function () {
    $('q').value = ''; $('q-clear').classList.add('hidden'); hideSuggest(); resetCenter(); $('q').focus();
  });
  $('suggest').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.suggest-item') : null;
    if (!b) { return; }
    if (b.hasAttribute('data-place')) {
      var p = lastPlaces[parseInt(b.getAttribute('data-place'), 10)];
      if (p) { applyPlace(p); $('q').value = shortName(p.name); }
    } else if (b.hasAttribute('data-space')) {
      focusSpace(b.getAttribute('data-space'));
    }
    hideSuggest();
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('.search-wrap')) { hideSuggest(); }
  });

  function locate(callback) {
    if (!navigator.geolocation) { toast('Location is not supported on this device'); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      callback([pos.coords.latitude, pos.coords.longitude]);
    }, function () {
      toast('Could not get your location. Allow location access or search an address instead.');
    }, { enableHighAccuracy: true, timeout: 8000 });
  }
  $('btn-locate').addEventListener('click', function () {
    locate(function (p) { $('q').value = ''; $('q-clear').classList.add('hidden'); setCenter(p, 'your current location', true); });
  });

  /* ---------- driver: results list + map pins ---------- */
  function getFiltered() {
    var v = $('f-vehicle').value, t = $('f-type').value;
    var maxP = parseFloat($('f-price').value);
    var radius = parseFloat($('f-radius').value);
    var list = spaces.filter(function (s) {
      if (s.status !== 'live') { return false; }
      if (v && s.vehicle !== v) { return false; }
      if (t && s.type !== t) { return false; }
      if (!isNaN(maxP) && s.price > maxP) { return false; }
      return true;
    }).map(function (s) {
      return { s: s, d: km(userPos, [s.lat, s.lng]) };
    }).filter(function (x) { return isNaN(radius) || x.d <= radius; });
    var sort = $('f-sort').value;
    list.sort(function (a, b) { return sort === 'price' ? a.s.price - b.s.price : a.d - b.d; });
    return list;
  }

  function cardHtml(x) {
    var s = x.s;
    var cxBadge = s.complex ? '<span class="badge warn">Society rules apply</span>' : '';
    return '<div class="card space-card' + (s.id === activeId ? ' active' : '') + '" data-id="' + esc(s.id) + '" tabindex="0">' +
      '<div class="row" style="margin-top:0;align-items:flex-start"><div><h4>' + esc(s.title) + '</h4>' +
      '<div class="meta">' + esc(s.address) + '</div></div>' +
      '<span class="price">' + money(s.price) + '<small>/hr</small></span></div>' +
      '<div style="margin-top:8px"><span class="badge">' + esc(typeLabel(s.type)) + '</span>' +
      '<span class="badge">' + esc(vehLabel(s.vehicle)) + '</span>' + cxBadge + '</div>' +
      '<div class="row"><span class="meta"><span class="dist">' + x.d.toFixed(1) + ' km</span> away &middot; Open ' +
      s.from + ':00&ndash;' + s.to + ':00' + (s.rating ? ' &middot; &#9733; ' + s.rating : '') + '</span>' +
      '<button class="btn primary small" data-book="' + esc(s.id) + '">View and book</button></div></div>';
  }

  function renderFind() {
    var list = getFiltered();
    var box = $('results');
    $('result-count').textContent = list.length
      ? list.length + (list.length === 1 ? ' space' : ' spaces') + ' near ' + centerLabel
      : '';
    box.innerHTML = list.length ? list.map(cardHtml).join('')
      : '<div class="card empty-card"><strong>No parking spaces match.</strong><br>Try a bigger distance, a higher price or a different area.</div>';

    if (map && markerLayer) {
      markerLayer.clearLayers();
      markers = {};
      list.forEach(function (x) {
        var s = x.s;
        var m = L.marker([s.lat, s.lng], { icon: pinIcon('<div class="pin' + (s.id === activeId ? ' active' : '') + '">' + money(s.price) + '</div>') }).addTo(markerLayer);
        var pop = document.createElement('div');
        pop.innerHTML = '<div class="pop-title">' + esc(s.title) + '</div><div class="pop-sub">' + money(s.price) + ' / hour &middot; ' + x.d.toFixed(1) + ' km</div>';
        var btn = document.createElement('button');
        btn.className = 'btn primary small';
        btn.textContent = 'View and book';
        btn.addEventListener('click', function () { openBooking(s.id); });
        pop.appendChild(btn);
        m.bindPopup(pop);
        m.on('click', function () { setActive(s.id, false); });
        markers[s.id] = m;
      });
      if (centerMarker) { map.removeLayer(centerMarker); }
      centerMarker = L.marker(userPos, { icon: pinIcon('<div class="here-dot"></div>'), interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(map);
    }
  }

  function setActive(id, pan) {
    activeId = id;
    document.querySelectorAll('#results .space-card').forEach(function (c) {
      var on = c.getAttribute('data-id') === id;
      c.classList.toggle('active', on);
      if (on) { try { c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* old browser */ } }
    });
    Object.keys(markers).forEach(function (k) {
      var el = markers[k].getElement && markers[k].getElement();
      var pin = el && el.querySelector('.pin');
      if (pin) { pin.classList.toggle('active', k === id); }
    });
    if (pan && map && markers[id]) {
      map.setView(markers[id].getLatLng(), Math.max(map.getZoom(), 15));
      markers[id].openPopup();
    }
  }

  $('results').addEventListener('click', function (e) {
    var book = e.target.closest ? e.target.closest('[data-book]') : null;
    if (book) { openBooking(book.getAttribute('data-book')); return; }
    var card = e.target.closest ? e.target.closest('.space-card') : null;
    if (card) { setActive(card.getAttribute('data-id'), true); }
  });
  $('results').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') { return; }
    var card = e.target.classList && e.target.classList.contains('space-card') ? e.target : null;
    if (card) { setActive(card.getAttribute('data-id'), true); }
  });
  ['f-vehicle', 'f-type', 'f-price', 'f-sort', 'f-radius'].forEach(function (id) {
    $(id).addEventListener('input', renderFind);
  });

  /* ---------- booking + demo payment modal ---------- */
  function closeModal() { if (paying) { return; } $('modal').classList.add('hidden'); }
  $('modal-close').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) { closeModal(); } });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(); hideSuggest(); }
  });

  function split(total) {
    var fee = round2(total * COMMISSION);
    return { total: total, fee: fee, payout: round2(total - fee) };
  }
  function billRows(hrs, price) {
    var c = split(hrs * price);
    return '<div><span>' + hrs + ' hr &times; ' + money(price) + '</span><span>' + money(c.total) + '</span></div>' +
      '<div><span>Owner receives (85%)</span><span>' + money(c.payout) + '</span></div>' +
      '<div><span>SmartPark commission (15%)</span><span>' + money(c.fee) + '</span></div>' +
      '<div class="total"><span>You pay</span><span>' + money(c.total) + '</span></div>';
  }

  // Next full hour inside the space's opening hours, so the demo always starts with valid values.
  function defaultStart(s) {
    var d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    var h = d.getHours();
    if (h < s.from) { d.setHours(s.from); }
    else if (h >= s.to) { d.setDate(d.getDate() + 1); d.setHours(s.from); }
    var hrs = Math.max(1, Math.min(2, s.to - d.getHours()));
    return { date: ymd(d), time: pad2(d.getHours()) + ':00', hours: hrs };
  }

  // Returns an error message, or '' when the slot is fine.
  function slotError(s, start, end) {
    if (start < Date.now()) { return 'The start time is in the past. Please pick a later time.'; }
    var sd = new Date(start), ed = new Date(end);
    var startH = sd.getHours() + sd.getMinutes() / 60;
    var sameDay = sd.toDateString() === ed.toDateString();
    var endsAtMidnight = ed.getHours() === 0 && ed.getMinutes() === 0 && (end - start) <= 24 * 3600000;
    var endH = sameDay ? ed.getHours() + ed.getMinutes() / 60 : (endsAtMidnight ? 24 : 99);
    if (startH < s.from || endH > s.to) {
      return 'This space is open ' + s.from + ':00 to ' + s.to + ':00 on the same day. Please pick a time inside that window.';
    }
    var clash = bookings.some(function (b) {
      return b.spaceId === s.id && b.status !== 'cancelled' && start < b.end && end > b.start;
    });
    if (clash) { return 'Sorry, that time is already booked. Please try another time.'; }
    return '';
  }

  function openBooking(id) {
    var s = findSpace(id);
    if (!s || !me || me.role !== 'driver') { return; }
    var def = defaultStart(s);
    var dist = km(userPos, [s.lat, s.lng]);
    var cx = '';
    if (s.complex) {
      cx = '<div class="bill"><strong>Society details</strong>' +
        '<div><span>Complex</span><span>' + esc(s.complex.name) + '</span></div>' +
        '<div><span>Entry</span><span>' + esc(s.complex.gate) + '</span></div>' +
        '<div><span>Visitor process</span><span>' + esc(s.complex.entry) + '</span></div>' +
        '<div><span>Exact slot</span><span>Shown after booking</span></div></div>';
    }
    $('modal-body').innerHTML =
      '<h3>' + esc(s.title) + '</h3>' +
      '<p class="meta" style="margin:0 0 8px;color:var(--muted)">' + esc(s.address) + ' &middot; ' + dist.toFixed(1) + ' km from ' + esc(centerLabel) + '</p>' +
      '<p style="margin:0 0 6px"><span class="badge">' + esc(typeLabel(s.type)) + '</span><span class="badge">' + esc(vehLabel(s.vehicle)) + '</span>' +
      (s.dim ? '<span class="badge">' + esc(s.dim) + '</span>' : '') + '</p>' +
      '<p style="margin:6px 0">' + esc(s.notes) + '</p>' + cx +
      '<p class="note">Open ' + s.from + ':00 to ' + s.to + ':00 &middot; ' + money(s.price) + ' / hour &middot; Free cancellation before the start time</p>' +
      '<div class="grid" style="gap:10px">' +
      '<label>Date<input id="b-date" type="date" min="' + ymd(new Date()) + '" value="' + def.date + '"></label>' +
      '<label>Start time<input id="b-time" type="time" value="' + def.time + '"></label>' +
      '<label>Hours<select id="b-hours">' + HOURS.map(function (h) {
        return '<option value="' + h + '"' + (h === def.hours ? ' selected' : '') + '>' + h + '</option>'; }).join('') + '</select></label>' +
      '<label>Vehicle number<input id="b-veh" maxlength="12" placeholder="DL01AB1234" autocomplete="off"></label>' +
      '</div>' +
      '<div class="bill" id="b-bill"></div>' +
      '<p class="err" id="b-err" role="alert"></p>' +
      '<button class="btn primary block" id="b-next">Continue to payment</button>';
    $('modal').classList.remove('hidden');

    function parse() {
      var date = $('b-date').value, time = $('b-time').value;
      var hrs = parseInt($('b-hours').value, 10);
      if (!date || !time) { return null; }
      var start = new Date(date + 'T' + time).getTime();
      if (isNaN(start)) { return null; }
      return { start: start, end: start + hrs * 3600000, hrs: hrs };
    }
    function updateBill() {
      var p = parse();
      $('b-bill').innerHTML = p ? billRows(p.hrs, s.price) : '';
    }
    ['b-date', 'b-time', 'b-hours'].forEach(function (i) { $(i).addEventListener('input', updateBill); });
    updateBill();

    $('b-next').addEventListener('click', function () {
      var p = parse();
      var err = $('b-err');
      err.textContent = '';
      if (!p) { err.textContent = 'Please choose a valid date and time.'; return; }
      var veh = $('b-veh').value.trim().toUpperCase();
      if (veh.length < 4) { err.textContent = 'Please enter your vehicle number.'; return; }
      var problem = slotError(s, p.start, p.end);
      if (problem) { err.textContent = problem; return; }
      showPayment(s, p, veh);
    });
  }

  function showPayment(s, p, veh) {
    var c = split(p.hrs * s.price);
    $('modal-body').innerHTML =
      '<h3>Complete payment</h3>' +
      '<p class="note" style="margin-top:0"><strong>' + esc(s.title) + '</strong><br>' + esc(fmtTime(p.start)) + ' to ' + esc(fmtTime(p.end)) + ' &middot; ' + esc(veh) + '</p>' +
      '<div class="demo-banner"><strong>Demo payment.</strong> No real money is charged. Pick any method and tap Pay.</div>' +
      '<div class="bill">' + billRows(p.hrs, s.price) + '</div>' +
      '<div class="methods" id="methods">' + METHODS.map(function (m, i) {
        return '<label class="method' + (i === 0 ? ' selected' : '') + '"><input type="radio" name="pm" value="' + m.id + '"' + (i === 0 ? ' checked' : '') + '>' +
          '<span class="m-ico">' + esc(m.ico) + '</span><span>' + esc(m.name) + '<small>' + esc(m.sub) + '</small></span></label>';
      }).join('') + '</div>' +
      '<button class="btn primary block" id="pay-now">Pay ' + money(c.total) + '</button>' +
      '<p style="text-align:center;margin:12px 0 0"><button type="button" class="linkbtn" id="pay-back">Back to details</button></p>';

    $('methods').addEventListener('change', function () {
      document.querySelectorAll('#methods .method').forEach(function (l) {
        l.classList.toggle('selected', l.querySelector('input').checked);
      });
    });
    $('pay-back').addEventListener('click', function () { openBooking(s.id); });
    $('pay-now').addEventListener('click', function () {
      var chosen = document.querySelector('#methods input:checked');
      var method = METHODS.filter(function (m) { return chosen && m.id === chosen.value; })[0] || METHODS[0];
      processPayment(s, p, veh, method);
    });
  }

  function processPayment(s, p, veh, method) {
    paying = true;
    $('modal-body').innerHTML =
      '<div class="center-box"><div class="spinner"></div>' +
      '<h3 style="margin:0 0 4px">Processing demo payment&hellip;</h3>' +
      '<p class="note">Paying with ' + esc(method.name) + '. Please do not close this window.</p></div>';
    setTimeout(function () {
      paying = false;
      var problem = slotError(s, p.start, p.end);     // check again: the slot may have been taken meanwhile
      if (problem) {
        $('modal-body').innerHTML = '<div class="center-box"><h3>Booking not completed</h3><p class="err">' + esc(problem) +
          '</p><p class="note">Your demo payment was not charged.</p><button class="btn primary" id="pay-retry">Choose another time</button></div>';
        $('pay-retry').addEventListener('click', function () { openBooking(s.id); });
        return;
      }
      var c = split(p.hrs * s.price);
      var b = {
        id: 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1000), driverId: me.id, driverName: me.name,
        spaceId: s.id, spaceTitle: s.title, address: s.address, lat: s.lat, lng: s.lng,
        start: p.start, end: p.end, hours: p.hrs, vehicleNo: veh,
        total: c.total, fee: c.fee, ownerPayout: c.payout,
        method: method.name, txn: 'SP' + Date.now().toString(36).toUpperCase().slice(-7) + Math.floor(Math.random() * 90 + 10),
        otp: String(Math.floor(1000 + Math.random() * 9000)), status: 'confirmed',
        slot: s.complex ? s.complex.slot : '', gate: s.complex ? s.complex.gate : ''
      };
      bookings.push(b);
      save(KEY_B, bookings);
      showConfirmation(b, s);
    }, 1700);
  }

  function showConfirmation(b, s) {
    var dirUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(s.lat + ',' + s.lng) +
      (centerIsCustom ? '&origin=' + encodeURIComponent(userPos[0] + ',' + userPos[1]) : '');
    $('modal-body').innerHTML =
      '<div class="center-box" style="padding-top:6px">' +
      '<svg class="check" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28"/><path d="M20 33l8 8 17-18"/></svg>' +
      '<h3 style="margin:0 0 2px">Booking confirmed</h3><p class="note" style="margin:0">Demo payment successful</p></div>' +
      '<p style="margin:10px 0 0"><strong>' + esc(s.title) + '</strong><br><span class="note">' + esc(s.address) + '</span></p>' +
      '<div class="bill">' +
      '<div><span>From</span><span>' + esc(fmtTime(b.start)) + '</span></div>' +
      '<div><span>To</span><span>' + esc(fmtTime(b.end)) + '</span></div>' +
      '<div><span>Vehicle</span><span>' + esc(b.vehicleNo) + '</span></div>' +
      (b.slot ? '<div><span>Slot</span><span>' + esc(b.slot) + ' (' + esc(b.gate) + ')</span></div>' : '') +
      '<div><span>Paid via ' + esc(b.method) + '</span><span>' + esc(b.txn) + '</span></div>' +
      '<div class="total"><span>Total paid (demo)</span><span>' + money(b.total) + '</span></div></div>' +
      '<p style="margin:8px 0 0">Your check-in OTP</p><div class="otp">' + esc(b.otp) + '</div>' +
      '<p class="note" style="text-align:center">Show this OTP to the owner or guard on arrival.</p>' +
      '<div class="modal-actions"><a class="btn secondary" href="' + dirUrl + '" target="_blank" rel="noopener">Get directions</a>' +
      '<button class="btn primary" id="b-done">View my bookings</button></div>';
    $('b-done').addEventListener('click', function () { closeModal(); showTab('dash'); });
    toast('Booking confirmed!');
  }

  /* ---------- owner: list a space ---------- */
  var ownerMap = null, ownerMarker = null, ownerPos = null;

  function initOwnerMap() {
    if (ownerMap || typeof L === 'undefined') { return; }
    ownerMap = makeMap('owner-map', me && me.lat != null ? [me.lat, me.lng] : DEFAULT_CENTER, 14);
    ownerMap.on('click', function (e) { setOwnerPos([e.latlng.lat, e.latlng.lng]); });
  }
  function setOwnerPos(p) {
    ownerPos = p;
    if (ownerMap) {
      if (ownerMarker) { ownerMap.removeLayer(ownerMarker); }
      ownerMarker = L.marker(p, { icon: pinIcon('<div class="pin">Your space</div>') }).addTo(ownerMap);
      ownerMap.setView(p, 16);
    }
    $('o-coords').textContent = 'Location set: ' + p[0].toFixed(5) + ', ' + p[1].toFixed(5);
  }
  $('btn-owner-locate').addEventListener('click', function () { locate(setOwnerPos); });

  function ownerSearch() {
    var q = $('o-q').value.trim();
    var msg = $('o-q-msg');
    if (q.length < 2) { msg.textContent = 'Type an address or landmark first.'; return; }
    msg.textContent = 'Searching...';
    geocode(q).then(function (places) {
      if (!places.length) { msg.textContent = 'No match found. Try a nearby landmark or area name, or click on the map.'; return; }
      var p = places[0];
      setOwnerPos([p.lat, p.lng]);
      if (!$('o-address').value.trim()) { $('o-address').value = shortName(p.name).slice(0, 100); }
      msg.textContent = 'Pin placed near ' + shortName(p.name) + '. Click the map to adjust it.';
    }, function () { msg.textContent = 'Could not reach the address search. Check your internet or click on the map.'; });
  }
  $('o-find').addEventListener('click', ownerSearch);
  $('o-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ownerSearch(); } });
  $('o-type').addEventListener('change', function () {
    $('complex-fields').classList.toggle('hidden', $('o-type').value !== 'complex');
  });

  $('owner-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!me || me.role !== 'owner') { return; }
    if (!ownerPos) { toast('Please pick a location on the map first'); return; }
    var from = parseInt($('o-from').value, 10), to = parseInt($('o-to').value, 10);
    var price = parseFloat($('o-price').value);
    if (isNaN(from) || isNaN(to) || to <= from) { toast('Available "until" hour must be after "from" hour'); return; }
    if (isNaN(price) || price <= 0) { toast('Please enter a price per hour'); return; }
    var type = $('o-type').value;
    var s = {
      id: 's' + Date.now().toString(36), title: $('o-title').value.trim(), type: type, address: $('o-address').value.trim(),
      lat: ownerPos[0], lng: ownerPos[1], vehicle: $('o-vehicle').value, dim: $('o-dim').value.trim(),
      price: price, from: from, to: to, notes: $('o-notes').value.trim() || 'Contact owner on arrival.',
      ownerId: me.id, ownerName: me.name, ownerPhone: me.phone, status: 'live', rating: 0
    };
    if (type === 'complex') {
      var approval = $('o-approval').value;
      s.complex = {
        name: $('o-complex').value.trim() || 'Complex', gate: $('o-gate').value.trim() || 'Main gate',
        slot: $('o-slot').value.trim() || '-', entry: $('o-entry').value.trim() || 'Show booking OTP at the gate.',
        approval: approval
      };
      // listing goes live only after management approval (as in the proposal)
      s.status = approval === 'approved' ? 'live' : 'pending';
    }
    spaces.push(s);
    save(KEY_S, spaces);
    resetOwnerForm();
    toast(s.status === 'live' ? 'Listing published!' : 'Saved. It will go live after management approval.');
    renderFind();
    showTab('listings');
  });

  function resetOwnerForm() {
    $('owner-form').reset();
    $('complex-fields').classList.add('hidden');
    ownerPos = null;
    if (ownerMarker && ownerMap) { ownerMap.removeLayer(ownerMarker); ownerMarker = null; }
    $('o-coords').textContent = 'No location chosen yet.';
    $('o-q-msg').textContent = '';
  }

  /* ---------- driver dashboard ---------- */
  function renderDriverDash() {
    if (!me || me.role !== 'driver') { return; }
    var mine = bookings.filter(function (b) { return b.driverId === me.id; })
      .sort(function (a, b) { return b.start - a.start; });
    $('my-bookings').innerHTML = mine.length ? mine.map(function (b) {
      var badge = { confirmed: 'ok', 'checked-in': 'ok', cancelled: 'bad' }[b.status] || '';
      var actions = '';
      if (b.status === 'confirmed') {
        actions = '<div class="otp-row"><input id="otp-' + esc(b.id) + '" placeholder="Enter OTP" maxlength="4" inputmode="numeric" aria-label="Check-in OTP"> ' +
          '<button class="btn secondary small" data-checkin="' + esc(b.id) + '">Check in</button></div>' +
          '<button class="btn danger small" data-cancel="' + esc(b.id) + '">Cancel</button>';
      }
      return '<div class="card"><h4>' + esc(b.spaceTitle) + ' <span class="badge ' + badge + '">' + esc(b.status) + '</span></h4>' +
        '<div class="meta">' + esc(b.address) + '</div>' +
        '<div class="meta">' + esc(fmtTime(b.start)) + ' to ' + esc(fmtTime(b.end)) + ' &middot; ' + esc(b.vehicleNo) + '</div>' +
        '<div class="meta">' + (b.status === 'cancelled' ? 'Refunded (demo) ' : 'Paid (demo) ') + money(b.total) +
        (b.method ? ' via ' + esc(b.method) : '') + (b.txn ? ' &middot; ' + esc(b.txn) : '') + '</div>' +
        (b.slot && b.status !== 'cancelled' ? '<div class="meta">Slot: ' + esc(b.slot) + ' (' + esc(b.gate) + ')</div>' : '') +
        (b.status === 'confirmed' ? '<div class="meta">Your OTP: <strong>' + esc(b.otp) + '</strong> (shown here for the demo)</div>' : '') +
        (actions ? '<div class="row">' + actions + '</div>' : '') + '</div>';
    }).join('') : '<div class="card empty-card">No bookings yet.<br>Go to <strong>Find Parking</strong> to book a space.</div>';

    $('my-bookings').querySelectorAll('[data-checkin]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-checkin');
        var b = bookings.filter(function (x) { return x.id === id && x.driverId === me.id; })[0];
        if (!b) { return; }
        if ($('otp-' + id).value.trim() === b.otp) {
          b.status = 'checked-in'; save(KEY_B, bookings); toast('Checked in. Enjoy your parking!'); renderDriverDash();
        } else { toast('Wrong OTP. Please try again.'); }
      });
    });
    $('my-bookings').querySelectorAll('[data-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-cancel');
        var b = bookings.filter(function (x) { return x.id === id && x.driverId === me.id; })[0];
        if (!b) { return; }
        if (Date.now() >= b.start) { toast('Free cancellation is only available before the start time.'); return; }
        if (window.confirm('Cancel this booking? (Demo refund)')) {
          b.status = 'cancelled'; save(KEY_B, bookings); toast('Booking cancelled. Demo refund issued.'); renderDriverDash(); renderFind();
        }
      });
    });
  }

  /* ---------- owner dashboard ---------- */
  function renderOwnerDash() {
    if (!me || me.role !== 'owner') { return; }
    var myListings = spaces.filter(function (s) { return s.ownerId === me.id; });   // only this owner's listings
    var myIds = myListings.map(function (s) { return s.id; });
    var received = bookings.filter(function (b) { return myIds.indexOf(b.spaceId) !== -1; })
      .sort(function (a, b) { return b.start - a.start; });
    var active = received.filter(function (b) { return b.status !== 'cancelled'; });
    var earned = active.reduce(function (sum, b) { return sum + b.ownerPayout; }, 0);
    var fees = active.reduce(function (sum, b) { return sum + b.fee; }, 0);

    $('earnings').innerHTML =
      '<div class="stat"><b>' + myListings.length + '</b><span>Your listings</span></div>' +
      '<div class="stat"><b>' + active.length + '</b><span>Bookings received</span></div>' +
      '<div class="stat"><b>' + money(earned) + '</b><span>Your earnings (85%)</span></div>' +
      '<div class="stat"><b>' + money(fees) + '</b><span>Platform commission (15%)</span></div>';

    $('my-listings').innerHTML = myListings.length ? myListings.map(function (s) {
      var pending = s.status === 'pending';
      return '<div class="card"><h4>' + esc(s.title) + ' <span class="badge ' + (pending ? 'warn' : 'ok') + '">' +
        (pending ? 'awaiting approval' : 'live') + '</span></h4>' +
        '<div class="meta">' + esc(s.address) + ' &middot; ' + money(s.price) + ' / hour &middot; ' + s.from + ':00&ndash;' + s.to + ':00</div>' +
        '<div class="row"><span>' +
        (pending ? '<button class="btn secondary small" data-approve="' + esc(s.id) + '">Simulate management approval</button>' : '') +
        '</span><button class="btn danger small" data-remove="' + esc(s.id) + '">Remove listing</button></div></div>';
    }).join('') : '<div class="card empty-card">You have not listed any space yet.<br>Use the <strong>List a Space</strong> tab.</div>';

    $('my-listings').querySelectorAll('[data-approve]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var s = findSpace(btn.getAttribute('data-approve'));
        if (s && s.ownerId === me.id) {
          s.status = 'live'; if (s.complex) { s.complex.approval = 'approved'; }
          save(KEY_S, spaces); toast('Approved. Listing is live.'); renderOwnerDash(); renderFind();
        }
      });
    });
    $('my-listings').querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-remove');
        if (window.confirm('Remove this listing?')) {
          spaces = spaces.filter(function (s) { return !(s.id === id && s.ownerId === me.id); });
          save(KEY_S, spaces); renderOwnerDash(); renderFind();
        }
      });
    });

    $('received').innerHTML = received.length ? received.map(function (b) {
      var badge = { confirmed: 'ok', 'checked-in': 'ok', cancelled: 'bad' }[b.status] || '';
      return '<div class="card"><h4>' + esc(b.spaceTitle) + ' <span class="badge ' + badge + '">' + esc(b.status) + '</span></h4>' +
        '<div class="meta">' + esc(fmtTime(b.start)) + ' to ' + esc(fmtTime(b.end)) + ' &middot; Vehicle ' + esc(b.vehicleNo) +
        (b.driverName ? ' &middot; Driver ' + esc(b.driverName) : '') + '</div>' +
        '<div class="meta">You earn ' + money(b.ownerPayout) + ' (booking ' + money(b.total) + ')</div></div>';
    }).join('') : '<div class="card empty-card">No bookings received yet.</div>';
  }

  $('btn-reset').addEventListener('click', function () {
    if (window.confirm('This clears all listings and bookings and restores the demo data. Continue?')) {
      spaces = seedSpaces(); bookings = [];
      save(KEY_S, spaces); save(KEY_B, bookings);
      activeId = null;
      renderFind(); renderDriverDash(); renderOwnerDash(); toast('Demo data restored');
    }
  });

  /* ---------- login screen: phone + demo OTP, then name + location (first time) ---------- */
  var authRole = null;      // 'driver' or 'owner'
  var authPhone = '';       // number the OTP was sent to
  var profilePos = null;    // GPS position picked on the profile step
  var resendTimer = null;
  var gateTimers = [];
  var AUTH_ORDER = ['pick', 'phone', 'otp', 'profile'];
  var ROAD_POS = { phone: 12, otp: 50, profile: 88 };   // where the car parks on the road tracker
  var lastStepIdx = 0;

  function stepEl(n) { return $('auth-' + n + (n === 'pick' ? '' : '-wrap')); }
  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Slide to another step; the little car on the road drives to the matching stop.
  function showAuthStep(step) {
    var idx = AUTH_ORDER.indexOf(step);
    AUTH_ORDER.forEach(function (n) { stepEl(n).classList.toggle('hidden', n !== step); });
    var el = stepEl(step);
    el.classList.remove('step-fwd', 'step-back');
    void el.offsetWidth;                                  // restart the animation
    el.classList.add(idx >= lastStepIdx ? 'step-fwd' : 'step-back');
    lastStepIdx = idx;

    var road = $('road');
    road.classList.toggle('hidden', step === 'pick');
    if (ROAD_POS[step] != null) { $('road-car').style.left = ROAD_POS[step] + '%'; }
    road.querySelectorAll('.road-stop').forEach(function (st) {
      var i = AUTH_ORDER.indexOf(st.getAttribute('data-s'));
      st.classList.toggle('done', i < idx);
      st.classList.toggle('here', i === idx);
    });
  }

  function startResendCountdown(sec) {
    var btn = $('a-resend');
    clearInterval(resendTimer);
    btn.disabled = true;
    var left = sec;
    function tick() {
      if (left <= 0) { clearInterval(resendTimer); btn.disabled = false; btn.textContent = 'Resend OTP'; return; }
      btn.textContent = 'Resend OTP in ' + left + 's'; left--;
    }
    tick();
    resendTimer = setInterval(tick, 1000);
  }
  function showOtpStep(res) {
    authPhone = res.phone;
    $('otp-phone').textContent = res.phone;
    var box = $('demo-otp');
    box.innerHTML = 'Demo mode: no SMS is sent. Your OTP is<b>' + esc(res.demoOtp) + '</b>' +
      '<button type="button" id="otp-fill">Fill it in for me</button>';
    box.classList.remove('hidden');
    $('otp-fill').addEventListener('click', function () { $('a-otp').value = res.demoOtp; $('a-otp').focus(); });
    $('a-otp').value = ''; $('o-err').textContent = '';
    showAuthStep('otp');
    startResendCountdown(res.resendIn);
    setTimeout(function () { $('a-otp').focus(); }, 300);
  }

  document.querySelectorAll('[data-pick]').forEach(function (b) {
    b.addEventListener('click', function () {
      authRole = b.getAttribute('data-pick');
      $('auth-title').textContent = authRole === 'driver' ? 'Driver - Find Parking' : 'Owner - List a Space';
      $('a-phone').value = ''; $('a-err').textContent = '';
      showAuthStep('phone');
      setTimeout(function () { $('a-phone').focus(); }, 300);
    });
  });
  $('auth-back').addEventListener('click', function () { authRole = null; showAuthStep('pick'); });
  $('otp-back').addEventListener('click', function () { clearInterval(resendTimer); showAuthStep('phone'); });

  $('phone-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('a-send');
    $('a-err').textContent = '';
    busy(btn, true, 'Sending OTP...');
    SmartAuth.requestOtp(authRole, $('a-phone').value).then(function (res) {
      busy(btn, false);
      if (!res.ok) { $('a-err').textContent = res.error; return; }
      showOtpStep(res);
    });
  });
  $('a-resend').addEventListener('click', function () {
    $('o-err').textContent = '';
    SmartAuth.requestOtp(authRole, authPhone).then(function (res) {
      if (!res.ok) { $('o-err').textContent = res.error; return; }
      showOtpStep(res);
      toast('New OTP generated');
    });
  });
  $('otp-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('a-verify');
    $('o-err').textContent = '';
    busy(btn, true, 'Checking...');
    SmartAuth.verifyOtp(authRole, authPhone, $('a-otp').value).then(function (res) {
      busy(btn, false);
      if (!res.ok) { $('o-err').textContent = res.error; return; }
      clearInterval(resendTimer);
      if (res.user.profileComplete) { enterApp(res.user); }   // returning user: straight in
      else { beginProfile(res.user); }                          // new user: name + location first
    });
  });

  // first-time profile: name + location
  $('p-locate').addEventListener('click', function () {
    locate(function (p) {
      profilePos = p;
      $('p-coords').textContent = 'GPS location added: ' + p[0].toFixed(4) + ', ' + p[1].toFixed(4);
    });
  });
  $('profile-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var res = SmartAuth.saveProfile({
      name: $('p-name').value, area: $('p-area').value,
      lat: profilePos ? profilePos[0] : null, lng: profilePos ? profilePos[1] : null
    });
    if (!res.ok) { $('p-err').textContent = res.error; return; }
    $('p-err').textContent = '';
    enterApp(res.user);
  });

  function beginProfile(user) {
    me = user;
    profilePos = null;
    $('p-name').value = ''; $('p-area').value = ''; $('p-err').textContent = '';
    $('p-coords').textContent = 'GPS location not added (optional, but it makes search and the map more accurate).';
    showAuthStep('profile');
    $('auth').classList.remove('hidden');
    setTimeout(function () { $('p-name').focus(); }, 300);
  }

  // Show the app (no animation). Used directly on page load when you are already logged in.
  function revealApp() {
    $('auth').classList.add('hidden');
    $('nav').classList.remove('hidden');
    $('userbar').classList.remove('hidden');
    $('btn-reset').classList.remove('hidden');
    $('user-label').innerHTML = esc(me.name) + '<span class="role-tag">' + (me.role === 'driver' ? 'Driver' : 'Owner') + '</span>';
    tabButtons.forEach(function (b) {
      b.classList.toggle('hidden', b.getAttribute('data-role') !== me.role);
    });
    $('q').value = ''; $('q-clear').classList.add('hidden'); hideSuggest();
    resetCenter();                                   // start the map at the user's saved location
    showTab(ROLE_TABS[me.role][0]);
  }

  // Entry transition: a parking barrier lifts, a car drives through, then the app fades in.
  function enterApp(user) {
    me = user;
    if (prefersReducedMotion()) { revealApp(); return; }
    var g = $('gate');
    gateTimers.forEach(clearTimeout); gateTimers = [];
    var first = (me.name || '').split(' ')[0] || 'there';
    $('gate-title').textContent = 'Welcome, ' + first + '!';
    $('gate-sub').textContent = me.role === 'driver' ? "Let's find you a spot." : "Let's put your space to work.";
    g.classList.remove('hidden', 'show', 'run', 'out');
    void g.offsetWidth;
    g.classList.add('show', 'run');
    gateTimers.push(setTimeout(revealApp, 450));                       // app is built behind the gate
    gateTimers.push(setTimeout(function () {
      g.classList.add('out');
      document.body.classList.remove('app-in'); void document.body.offsetWidth;
      document.body.classList.add('app-in');
    }, 2300));
    gateTimers.push(setTimeout(function () { g.classList.add('hidden'); g.classList.remove('show', 'run', 'out'); }, 2900));
  }

  // Page load with an existing session.
  function startSession(user) {
    me = user;
    if (!user.profileComplete) { beginProfile(user); } else { revealApp(); }
  }

  function endSession() {
    SmartAuth.logout();
    me = null;
    clearInterval(resendTimer);
    gateTimers.forEach(clearTimeout); gateTimers = [];
    $('gate').classList.add('hidden'); $('gate').classList.remove('show', 'run', 'out');
    document.body.classList.remove('app-in');
    ALL_TABS.forEach(function (t) { $('tab-' + t).classList.remove('active'); });
    paying = false; closeModal();
    $('nav').classList.add('hidden');
    $('userbar').classList.add('hidden');
    $('btn-reset').classList.add('hidden');
    resetOwnerForm();                                // clear anything half-typed by the previous user
    $('my-bookings').innerHTML = ''; $('my-listings').innerHTML = ''; $('received').innerHTML = ''; $('earnings').innerHTML = '';
    $('q').value = ''; hideSuggest(); activeId = null;
    userPos = DEFAULT_CENTER.slice(); centerLabel = DEFAULT_LABEL; centerIsCustom = false;
    authRole = null; authPhone = '';
    lastStepIdx = 0;
    showAuthStep('pick');
    $('auth').classList.remove('hidden');
  }
  $('btn-logout').addEventListener('click', endSession);

  /* ---------- start ---------- */
  initMap();
  $('loc-note').textContent = 'Showing spaces near ' + centerLabel;
  renderFind();
  var existing = SmartAuth.current();   // already logged in from an earlier visit?
  if (existing) { startSession(existing); }
})();
