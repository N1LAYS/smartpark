/* SmartPark - prototype logic
 * Everything is saved in the browser (localStorage), so no backend is needed for the demo.
 * Later you can replace the load()/save() helpers with Supabase calls.
 */
(function () {
  'use strict';

  var DEFAULT_CENTER = [28.7501, 77.1177]; // near DTU, Delhi (demo default)
  var COMMISSION = 0.15;                    // 15% platform commission
  var KEY_S = 'smartpark_spaces_v1';
  var KEY_B = 'smartpark_bookings_v1';

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
  function money(n) { return 'Rs ' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ''); }
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
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add('hidden'); }, 2600);
  }
  function typeLabel(t) { return { home: 'Home', office: 'Office', complex: 'Society / Complex' }[t] || t; }
  function vehLabel(v) { return { bike: 'Bike', car: 'Car', suv: 'SUV / Large' }[v] || v; }
  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /* ---------- demo data ---------- */
  function seedSpaces() {
    return [
      { id: 's1', title: 'Driveway near market', type: 'home', address: 'Sector 16 market lane, Rohini',
        lat: 28.7512, lng: 77.1205, vehicle: 'car', dim: '5m x 2.5m', price: 30, from: 7, to: 22,
        notes: 'Park in front of the green gate. Call owner on arrival.', owner: false, status: 'live', rating: 4.6 },
      { id: 's2', title: 'Office visitor slots (after 6 PM)', type: 'office', address: 'Tech Park, Bawana Road',
        lat: 28.7478, lng: 77.1139, vehicle: 'car', dim: '5m x 2.5m', price: 40, from: 10, to: 24,
        notes: 'Use Gate B. Security will scan your OTP.', owner: false, status: 'live', rating: 4.3 },
      { id: 's3', title: 'Green Valley Apartments - visitor slot', type: 'complex', address: 'Green Valley Apartments, Rohini',
        lat: 28.7539, lng: 77.1162, vehicle: 'car', dim: '5m x 2.5m', price: 50, from: 8, to: 20,
        notes: 'Society rule: show booking OTP at the gate.', owner: false, status: 'live', rating: 4.8,
        complex: { name: 'Green Valley Apartments', gate: 'Gate 2, Block C', slot: 'C-14',
          entry: 'Show booking OTP to the guard. Visitor register entry required.', approval: 'approved' } },
      { id: 's4', title: 'Bike spot near hospital', type: 'home', address: 'Near hospital road, Rohini',
        lat: 28.7466, lng: 77.1211, vehicle: 'bike', dim: '2m x 1m', price: 10, from: 6, to: 23,
        notes: 'Inside the lane on the left. Helmet lock available.', owner: false, status: 'live', rating: 4.1 },
      { id: 's5', title: 'Large vehicle space (SUV / van)', type: 'office', address: 'Warehouse yard, Bawana Road',
        lat: 28.7445, lng: 77.1098, vehicle: 'suv', dim: '7m x 3m', price: 70, from: 0, to: 24,
        notes: 'Open yard, CCTV. Enter from the main road.', owner: false, status: 'live', rating: 4.4 },
      { id: 's6', title: 'Sunrise Heights - resident slot', type: 'complex', address: 'Sunrise Heights, Sector 15',
        lat: 28.7561, lng: 77.1236, vehicle: 'car', dim: '5m x 2.5m', price: 45, from: 9, to: 21,
        notes: 'Pre-register vehicle number with management.', owner: false, status: 'live', rating: 4.5,
        complex: { name: 'Sunrise Heights', gate: 'Main gate, Tower A', slot: 'A-07',
          entry: 'Visitor pre-registration done automatically at booking.', approval: 'approved' } }
    ];
  }

  var spaces = load(KEY_S, null);
  if (!spaces) { spaces = seedSpaces(); save(KEY_S, spaces); }
  var bookings = load(KEY_B, []);

  var userPos = DEFAULT_CENTER.slice();
  var usingRealLocation = false;

  /* ---------- tabs ---------- */
  var me = null; // the logged-in user ({id, role, name, email, phone}) or null
  var ROLE_TABS = { driver: ['find', 'dash'], owner: ['owner', 'listings'] };
  var ALL_TABS = ['find', 'dash', 'owner', 'listings'];
  var tabButtons = document.querySelectorAll('.tab');
  function showTab(name) {
    // a driver can never open owner screens (and the other way round)
    if (!me || ROLE_TABS[me.role].indexOf(name) === -1) { return; }
    tabButtons.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === name); });
    ALL_TABS.forEach(function (t) {
      $('tab-' + t).classList.toggle('active', t === name);
    });
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

  /* ---------- driver map + list ---------- */
  var map = null, markerLayer = null, userMarker = null;

  function initMap() {
    if (typeof L === 'undefined') {
      $('map').innerHTML = '<p class="note" style="padding:16px">Map could not load (check your internet). The list still works.</p>';
      return;
    }
    map = L.map('map').setView(userPos, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }

  function getFiltered() {
    var v = $('f-vehicle').value, t = $('f-type').value;
    var maxP = parseFloat($('f-price').value);
    var list = spaces.filter(function (s) {
      if (s.status !== 'live') { return false; }
      if (v && s.vehicle !== v) { return false; }
      if (t && s.type !== t) { return false; }
      if (!isNaN(maxP) && s.price > maxP) { return false; }
      return true;
    }).map(function (s) {
      return { s: s, d: km(userPos, [s.lat, s.lng]) };
    });
    var sort = $('f-sort').value;
    list.sort(function (a, b) { return sort === 'price' ? a.s.price - b.s.price : a.d - b.d; });
    return list;
  }

  function renderFind() {
    var list = getFiltered();
    var box = $('results');
    if (!list.length) {
      box.innerHTML = '<div class="card">No parking spaces match your filters.</div>';
    } else {
      box.innerHTML = list.map(function (x) {
        var s = x.s;
        var cx = s.complex ? '<span class="badge warn">Society rules apply</span>' : '';
        return '<div class="card">' +
          '<h4>' + esc(s.title) + '</h4>' +
          '<div class="meta">' + esc(s.address) + '</div>' +
          '<div style="margin-top:6px"><span class="badge">' + esc(typeLabel(s.type)) + '</span>' +
          '<span class="badge">' + esc(vehLabel(s.vehicle)) + '</span>' + cx + '</div>' +
          '<div class="meta" style="margin-top:6px">' + x.d.toFixed(2) + ' km away &middot; Open ' +
          s.from + ':00 - ' + s.to + ':00' + (s.rating ? ' &middot; Rating ' + s.rating : '') + '</div>' +
          '<div class="row"><span class="price">' + money(s.price) + ' / hour</span>' +
          '<button class="btn primary small" data-book="' + esc(s.id) + '">View and book</button></div>' +
          '</div>';
      }).join('');
    }
    box.querySelectorAll('[data-book]').forEach(function (b) {
      b.addEventListener('click', function () { openBooking(b.getAttribute('data-book')); });
    });

    if (map && markerLayer) {
      markerLayer.clearLayers();
      list.forEach(function (x) {
        var s = x.s;
        var m = L.marker([s.lat, s.lng]).addTo(markerLayer);
        var pop = document.createElement('div');
        pop.innerHTML = '<strong>' + esc(s.title) + '</strong><br>' + money(s.price) + ' / hour<br>';
        var btn = document.createElement('button');
        btn.className = 'btn primary small';
        btn.textContent = 'View and book';
        btn.addEventListener('click', function () { openBooking(s.id); });
        pop.appendChild(btn);
        m.bindPopup(pop);
      });
      if (userMarker) { map.removeLayer(userMarker); }
      userMarker = L.circleMarker(userPos, { radius: 9, color: '#1565c0', fillColor: '#1565c0', fillOpacity: 0.8 })
        .addTo(map).bindPopup('You are here');
    }
  }

  function locate(callback) {
    if (!navigator.geolocation) { toast('Location not supported on this device'); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      callback([pos.coords.latitude, pos.coords.longitude]);
    }, function () {
      toast('Could not get location. Using the demo location.');
    }, { enableHighAccuracy: true, timeout: 8000 });
  }

  $('btn-locate').addEventListener('click', function () {
    locate(function (p) {
      userPos = p; usingRealLocation = true;
      $('loc-note').textContent = 'Showing spaces near your current location.';
      if (map) { map.setView(userPos, 14); }
      renderFind();
    });
  });
  ['f-vehicle', 'f-type', 'f-price', 'f-sort'].forEach(function (id) {
    $(id).addEventListener('input', renderFind);
  });
  $('loc-note').textContent = 'Showing demo spaces near DTU. Tap "Use my location" to search around you (works best in your own area after listing spaces there).';

  /* ---------- booking modal ---------- */
  function closeModal() { $('modal').classList.add('hidden'); }
  $('modal-close').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) { closeModal(); } });

  function findSpace(id) {
    for (var i = 0; i < spaces.length; i++) { if (spaces[i].id === id) { return spaces[i]; } }
    return null;
  }

  function openBooking(id) {
    var s = findSpace(id);
    if (!s || !me || me.role !== 'driver') { return; }
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
      '<p class="meta">' + esc(s.address) + '</p>' +
      '<p><span class="badge">' + esc(typeLabel(s.type)) + '</span><span class="badge">' + esc(vehLabel(s.vehicle)) + '</span>' +
      (s.dim ? '<span class="badge">' + esc(s.dim) + '</span>' : '') + '</p>' +
      '<p>' + esc(s.notes) + '</p>' + cx +
      '<p class="note">Open ' + s.from + ':00 to ' + s.to + ':00 &middot; ' + money(s.price) + ' / hour &middot; Free cancellation before start time</p>' +
      '<div class="grid">' +
      '<label>Date<input id="b-date" type="date" min="' + todayStr() + '" value="' + todayStr() + '"></label>' +
      '<label>Start time<input id="b-time" type="time" value="10:00"></label>' +
      '<label>Hours<select id="b-hours">' + [1, 2, 3, 4, 6, 8, 10, 12].map(function (h) {
        return '<option value="' + h + '">' + h + '</option>'; }).join('') + '</select></label>' +
      '<label>Vehicle number<input id="b-veh" maxlength="12" placeholder="DL01AB1234"></label>' +
      '</div>' +
      '<div class="bill" id="b-bill"></div>' +
      '<p class="err" id="b-err"></p>' +
      '<button class="btn primary" id="b-pay">Pay (demo) and confirm</button>';
    $('modal').classList.remove('hidden');

    function parse() {
      var date = $('b-date').value, time = $('b-time').value;
      var hrs = parseInt($('b-hours').value, 10);
      if (!date || !time) { return null; }
      var start = new Date(date + 'T' + time).getTime();
      if (isNaN(start)) { return null; }
      return { start: start, end: start + hrs * 3600000, hrs: hrs, date: date, time: time };
    }
    function updateBill() {
      var p = parse();
      if (!p) { $('b-bill').innerHTML = ''; return; }
      var total = p.hrs * s.price;
      var fee = total * COMMISSION;
      $('b-bill').innerHTML =
        '<div><span>' + p.hrs + ' hr x ' + money(s.price) + '</span><span>' + money(total) + '</span></div>' +
        '<div><span>Owner receives (85%)</span><span>' + money(total - fee) + '</span></div>' +
        '<div><span>SmartPark commission (15%)</span><span>' + money(fee) + '</span></div>' +
        '<div class="total"><span>You pay</span><span>' + money(total) + '</span></div>';
    }
    ['b-date', 'b-time', 'b-hours'].forEach(function (i) { $(i).addEventListener('input', updateBill); });
    updateBill();

    $('b-pay').addEventListener('click', function () {
      var p = parse();
      var err = $('b-err');
      err.textContent = '';
      if (!p) { err.textContent = 'Please choose a valid date and time.'; return; }
      if (p.start < Date.now()) { err.textContent = 'Start time is in the past.'; return; }
      var veh = $('b-veh').value.trim().toUpperCase();
      if (veh.length < 4) { err.textContent = 'Please enter your vehicle number.'; return; }

      // availability window (same day only)
      var sd = new Date(p.start), ed = new Date(p.end);
      var sameDay = sd.toDateString() === ed.toDateString() || (ed.getHours() === 0 && ed.getMinutes() === 0 && ed - sd < 86400000);
      var startH = sd.getHours() + sd.getMinutes() / 60;
      var endH = sameDay ? (ed.getHours() === 0 && ed.getMinutes() === 0 ? 24 : ed.getHours() + ed.getMinutes() / 60) : 99;
      if (startH < s.from || endH > s.to) {
        err.textContent = 'This space is only open ' + s.from + ':00 to ' + s.to + ':00 on the same day.';
        return;
      }
      // double-booking prevention
      var clash = bookings.some(function (b) {
        return b.spaceId === s.id && b.status !== 'cancelled' && p.start < b.end && p.end > b.start;
      });
      if (clash) { err.textContent = 'Sorry, that time slot is already booked. Try another time.'; return; }

      var total = p.hrs * s.price;
      var b = {
        id: 'b' + Date.now(), driverId: me.id, driverName: me.name, spaceId: s.id, spaceTitle: s.title, address: s.address,
        start: p.start, end: p.end, hours: p.hrs, vehicleNo: veh,
        total: total, fee: Math.round(total * COMMISSION * 100) / 100, ownerPayout: Math.round(total * (1 - COMMISSION) * 100) / 100,
        otp: String(Math.floor(1000 + Math.random() * 9000)), status: 'confirmed',
        slot: s.complex ? s.complex.slot : '', gate: s.complex ? s.complex.gate : ''
      };
      bookings.push(b);
      save(KEY_B, bookings);
      showConfirmation(b, s);
    });
  }

  function showConfirmation(b, s) {
    var dirUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(s.lat + ',' + s.lng);
    $('modal-body').innerHTML =
      '<h3>Booking confirmed</h3>' +
      '<p><strong>' + esc(s.title) + '</strong><br><span class="meta">' + esc(s.address) + '</span></p>' +
      '<div class="bill">' +
      '<div><span>From</span><span>' + esc(fmtTime(b.start)) + '</span></div>' +
      '<div><span>To</span><span>' + esc(fmtTime(b.end)) + '</span></div>' +
      '<div><span>Vehicle</span><span>' + esc(b.vehicleNo) + '</span></div>' +
      (b.slot ? '<div><span>Slot</span><span>' + esc(b.slot) + ' (' + esc(b.gate) + ')</span></div>' : '') +
      '<div class="total"><span>Paid (demo)</span><span>' + money(b.total) + '</span></div></div>' +
      '<p>Your check-in OTP:</p><div class="otp">' + esc(b.otp) + '</div>' +
      '<p class="note">Show this OTP to the owner or guard on arrival. You can also check in from My Bookings.</p>' +
      '<p><a class="btn secondary" href="' + dirUrl + '" target="_blank" rel="noopener">Get directions</a> ' +
      '<button class="btn primary" id="b-done">Done</button></p>';
    $('b-done').addEventListener('click', function () { closeModal(); showTab('dash'); });
    toast('Booking confirmed!');
  }

  /* ---------- owner: list a space ---------- */
  var ownerMap = null, ownerMarker = null, ownerPos = null;

  function initOwnerMap() {
    if (ownerMap || typeof L === 'undefined') { return; }
    ownerMap = L.map('owner-map').setView(me && me.lat != null ? [me.lat, me.lng] : DEFAULT_CENTER, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(ownerMap);
    ownerMap.on('click', function (e) { setOwnerPos([e.latlng.lat, e.latlng.lng]); });
  }
  function setOwnerPos(p) {
    ownerPos = p;
    if (ownerMap) {
      if (ownerMarker) { ownerMap.removeLayer(ownerMarker); }
      ownerMarker = L.marker(p).addTo(ownerMap);
      ownerMap.setView(p, 16);
    }
    $('o-coords').textContent = 'Location set: ' + p[0].toFixed(5) + ', ' + p[1].toFixed(5);
  }
  $('btn-owner-locate').addEventListener('click', function () { locate(setOwnerPos); });
  $('o-type').addEventListener('change', function () {
    $('complex-fields').classList.toggle('hidden', $('o-type').value !== 'complex');
  });

  $('owner-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!me || me.role !== 'owner') { return; }
    if (!ownerPos) { toast('Please pick a location on the map first'); return; }
    var from = parseInt($('o-from').value, 10), to = parseInt($('o-to').value, 10);
    if (isNaN(from) || isNaN(to) || to <= from) { toast('Available "until" hour must be after "from" hour'); return; }
    var type = $('o-type').value;
    var s = {
      id: 's' + Date.now(), title: $('o-title').value.trim(), type: type, address: $('o-address').value.trim(),
      lat: ownerPos[0], lng: ownerPos[1], vehicle: $('o-vehicle').value, dim: $('o-dim').value.trim(),
      price: parseFloat($('o-price').value), from: from, to: to, notes: $('o-notes').value.trim() || 'Contact owner on arrival.',
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
    $('owner-form').reset();
    $('complex-fields').classList.add('hidden');
    ownerPos = null;
    if (ownerMarker && ownerMap) { ownerMap.removeLayer(ownerMarker); ownerMarker = null; }
    $('o-coords').textContent = 'No location chosen yet.';
    toast(s.status === 'live' ? 'Listing published!' : 'Saved. It will go live after management approval.');
    renderFind();
    showTab('listings');
  });

  /* ---------- driver dashboard ---------- */
  function renderDriverDash() {
    if (!me || me.role !== 'driver') { return; }
    var mine = bookings.filter(function (b) { return b.driverId === me.id; })
      .sort(function (a, b) { return b.start - a.start; });
    $('my-bookings').innerHTML = mine.length ? mine.map(function (b) {
      var badge = { confirmed: 'ok', 'checked-in': 'ok', cancelled: 'bad' }[b.status] || '';
      var actions = '';
      if (b.status === 'confirmed') {
        actions = '<input id="otp-' + esc(b.id) + '" placeholder="Enter OTP" maxlength="4" style="width:100px"> ' +
          '<button class="btn secondary small" data-checkin="' + esc(b.id) + '">Check in</button> ' +
          '<button class="btn danger small" data-cancel="' + esc(b.id) + '">Cancel</button>';
      }
      return '<div class="card"><h4>' + esc(b.spaceTitle) + ' <span class="badge ' + badge + '">' + esc(b.status) + '</span></h4>' +
        '<div class="meta">' + esc(b.address) + '</div>' +
        '<div class="meta">' + esc(fmtTime(b.start)) + ' to ' + esc(fmtTime(b.end)) + ' &middot; ' + esc(b.vehicleNo) + ' &middot; ' + money(b.total) + '</div>' +
        (b.slot && b.status !== 'cancelled' ? '<div class="meta">Slot: ' + esc(b.slot) + ' (' + esc(b.gate) + ')</div>' : '') +
        (b.status === 'confirmed' ? '<div class="meta">Your OTP: <strong>' + esc(b.otp) + '</strong> (shown here for the demo)</div>' : '') +
        '<div class="row">' + actions + '</div></div>';
    }).join('') : '<p class="note">No bookings yet. Go to Find Parking to book a space.</p>';

    $('my-bookings').querySelectorAll('[data-checkin]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-checkin');
        var b = bookings.filter(function (x) { return x.id === id && x.driverId === me.id; })[0];
        if (!b) { return; }
        if ($('otp-' + id).value.trim() === b.otp) {
          b.status = 'checked-in'; save(KEY_B, bookings); toast('Checked in. Enjoy your parking!'); renderDriverDash();
        } else { toast('Wrong OTP'); }
      });
    });
    $('my-bookings').querySelectorAll('[data-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-cancel');
        var b = bookings.filter(function (x) { return x.id === id && x.driverId === me.id; })[0];
        if (b && window.confirm('Cancel this booking?')) {
          b.status = 'cancelled'; save(KEY_B, bookings); toast('Booking cancelled (demo refund issued)'); renderDriverDash(); renderFind();
        }
      });
    });
  }

  /* ---------- owner dashboard ---------- */
  function renderOwnerDash() {
    if (!me || me.role !== 'owner') { return; }
    // only the listings this owner created
    var myListings = spaces.filter(function (s) { return s.ownerId === me.id; });
    var myIds = myListings.map(function (s) { return s.id; });
    var received = bookings.filter(function (b) { return myIds.indexOf(b.spaceId) !== -1; });
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
        '<div class="meta">' + esc(s.address) + ' &middot; ' + money(s.price) + ' / hour &middot; ' + s.from + ':00 - ' + s.to + ':00</div>' +
        '<div class="row">' +
        (pending ? '<button class="btn secondary small" data-approve="' + esc(s.id) + '">Simulate management approval</button>' : '') +
        '<button class="btn danger small" data-remove="' + esc(s.id) + '">Remove listing</button></div></div>';
    }).join('') : '<p class="note">You have not listed any space yet. Use the List a Space tab.</p>';

    $('my-listings').querySelectorAll('[data-approve]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var s = findSpace(btn.getAttribute('data-approve'));
        if (s && s.ownerId === me.id) { s.status = 'live'; if (s.complex) { s.complex.approval = 'approved'; } save(KEY_S, spaces); toast('Approved. Listing is live.'); renderOwnerDash(); renderFind(); }
      });
    });
    $('my-listings').querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-remove');
        if (window.confirm('Remove this listing?')) {
          spaces = spaces.filter(function (s) { return !(s.id === id && s.ownerId === me.id); }); save(KEY_S, spaces); renderOwnerDash(); renderFind();
        }
      });
    });

    $('received').innerHTML = received.length ? received.map(function (b) {
      return '<div class="card"><h4>' + esc(b.spaceTitle) + ' <span class="badge">' + esc(b.status) + '</span></h4>' +
        '<div class="meta">' + esc(fmtTime(b.start)) + ' to ' + esc(fmtTime(b.end)) + ' &middot; Vehicle ' + esc(b.vehicleNo) +
        (b.driverName ? ' &middot; Driver ' + esc(b.driverName) : '') + '</div>' +
        '<div class="meta">You earn ' + money(b.ownerPayout) + ' (booking ' + money(b.total) + ')</div></div>';
    }).join('') : '<p class="note">No bookings received yet.</p>';
  }

  $('btn-reset').addEventListener('click', function () {
    if (window.confirm('This clears all your listings and bookings and restores the demo data. Continue?')) {
      spaces = seedSpaces(); bookings = [];
      save(KEY_S, spaces); save(KEY_B, bookings);
      renderFind(); renderDriverDash(); renderOwnerDash(); toast('Demo data restored');
    }
  });

  /* ---------- login screen: phone + OTP, then name + location (first time) ---------- */
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
    if (res.demo) {
      box.innerHTML = 'Demo mode: no SMS is sent. Your OTP is<b>' + esc(res.demoOtp) + '</b>';
      box.classList.remove('hidden');
    } else {
      box.classList.add('hidden');
    }
    $('otp-hint').textContent = res.demo ? '' : 'We sent a 6-digit code by SMS. It can take up to a minute to arrive.';
    $('a-otp').value = ''; $('o-err').textContent = '';
    showAuthStep('otp');
    startResendCountdown(res.resendIn);
    setTimeout(function () { $('a-otp').focus(); }, 300);
  }
  function busy(btn, on, label) {
    btn.disabled = on;
    if (label) { btn.dataset.label = btn.dataset.label || btn.textContent; btn.textContent = on ? label : btn.dataset.label; }
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
      busy(btn, false, true);
      if (!res.ok) { $('a-err').textContent = res.error; return; }
      showOtpStep(res);
    });
  });
  $('a-resend').addEventListener('click', function () {
    $('o-err').textContent = '';
    SmartAuth.requestOtp(authRole, authPhone).then(function (res) {
      if (!res.ok) { $('o-err').textContent = res.error; return; }
      showOtpStep(res);
      toast('New OTP sent');
    });
  });
  $('otp-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('a-verify');
    $('o-err').textContent = '';
    busy(btn, true, 'Checking...');
    SmartAuth.verifyOtp(authRole, authPhone, $('a-otp').value).then(function (res) {
      busy(btn, false, true);
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
    // start the map at the user's saved location
    if (me.lat != null && me.lng != null) {
      userPos = [me.lat, me.lng];
      $('loc-note').textContent = 'Showing spaces near ' + (me.area || 'your saved location') + '.';
      if (map) { map.setView(userPos, 14); }
    } else {
      $('loc-note').textContent = 'Showing demo spaces near DTU. Tap "Use my location" to search around you.';
    }
    renderFind();
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
    closeModal();
    $('nav').classList.add('hidden');
    $('userbar').classList.add('hidden');
    $('btn-reset').classList.add('hidden');
    // clear anything half-typed by the previous user
    $('owner-form').reset();
    $('complex-fields').classList.add('hidden');
    ownerPos = null;
    if (ownerMarker && ownerMap) { ownerMap.removeLayer(ownerMarker); ownerMarker = null; }
    $('o-coords').textContent = 'No location chosen yet.';
    $('my-bookings').innerHTML = ''; $('my-listings').innerHTML = ''; $('received').innerHTML = ''; $('earnings').innerHTML = '';
    userPos = DEFAULT_CENTER.slice();
    authRole = null; authPhone = '';
    lastStepIdx = 0;
    showAuthStep('pick');
    $('auth').classList.remove('hidden');
  }
  $('btn-logout').addEventListener('click', endSession);

  /* ---------- start ---------- */
  initMap();
  renderFind();
  var existing = SmartAuth.current();   // already logged in from an earlier visit?
  if (existing) { startSession(existing); }
})();
