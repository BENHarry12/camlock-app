/* ==================================================================
   CamLock Bridge — วิดเจ็ตใน ThingsBoard (controller script)

   ทำไมต้องมี: thingsboard.cloud ไม่ยอมให้หน้าเว็บจากโดเมนอื่น (github.io)
   เรียก REST API ตรง ๆ (CORS) แอปบน GitHub Pages จึงฝังแดชบอร์ดสาธารณะ
   ของ ThingsBoard ไว้ใน iframe ที่มองไม่เห็น วิดเจ็ตนี้ทำงานบนโดเมน
   thingsboard.cloud เอง จึงเรียก API ได้ แล้วส่งผลกลับให้แอปผ่าน postMessage

   แอป (github.io) ⇄ postMessage ⇄ วิดเจ็ตนี้ ──REST──> ThingsBoard ──MQTT──> ESP32

   ค่าที่ใช้ (widget settings): deviceId, username, password, allowedOrigins
   ผู้ดูแล (Tenant admin) เปิดแดชบอร์ดนี้ตรง ๆ จะเห็นฟอร์มใส่รหัสผ่าน
   ================================================================== */
self.onInit = function () {
  var ctx = self.ctx;
  var S = ctx.settings || {};
  var el = ctx.$container[0];
  var ALLOWED = String(S.allowedOrigins || 'https://benharry12.github.io').split(',').map(function (s) { return s.trim(); });
  var DEV = S.deviceId;
  var TKEYS = 'doorOpen,lockActive,alarm,returning,available,camCount,unlockCount,rssi,uptime,heap';
  var jwt = '', exp = 0, lastState = 'รอคำสั่ง';
  var embedded = window.parent !== window;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  async function login() {
    if (!S.username || !S.password) throw new Error('ยังไม่ได้ใส่รหัสผ่านของบัญชีแอปในวิดเจ็ต CamLock Bridge');
    var r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: S.username, password: S.password }) });
    if (!r.ok) throw new Error('บัญชีแอปเข้า ThingsBoard ไม่ได้ (' + r.status + ') ตรวจอีเมล/รหัสผ่านในวิดเจ็ต');
    var j = await r.json();
    jwt = j.token; exp = Date.now() + 60 * 60 * 1000;
  }
  async function tb(path, init, retry) {
    if (!jwt || Date.now() > exp) await login();
    init = init || {};
    var h = { 'Content-Type': 'application/json', 'X-Authorization': 'Bearer ' + jwt };
    var r = await fetch(path, { method: init.method || 'GET', headers: h, body: init.body });
    if (r.status === 401 && retry !== false) { jwt = ''; return tb(path, init, false); }
    return r;
  }

  async function handle(m) {
    if (!DEV) return { ok: false, msg: 'วิดเจ็ต CamLock Bridge ยังไม่ได้ตั้ง deviceId' };
    if (m.kind === 'status') {
      var rs = await Promise.all([
        tb('/api/plugins/telemetry/DEVICE/' + DEV + '/values/timeseries?keys=' + TKEYS),
        tb('/api/plugins/telemetry/DEVICE/' + DEV + '/values/attributes/CLIENT_SCOPE')]);
      if (!rs[0].ok || !rs[1].ok) return { ok: false, msg: 'ThingsBoard ตอบ ' + rs[0].status + '/' + rs[1].status + ' ตรวจสิทธิ์ของบัญชีแอป' };
      return { ok: true, timeseries: await rs[0].json(), attributes: await rs[1].json() };
    }
    if (m.kind === 'rpc') {
      if (typeof m.method !== 'string' || !/^[A-Za-z]{2,32}$/.test(m.method)) return { ok: false, msg: 'คำสั่งไม่ถูกต้อง' };
      var r = await tb('/api/plugins/rpc/twoway/' + DEV, { method: 'POST', body: JSON.stringify({ method: m.method, params: m.params || {}, timeout: 10000 }) });
      if (r.status === 408 || r.status === 504 || r.status === 409) return { ok: false, offline: true, msg: 'ตู้ไม่ตอบสนอง (ออฟไลน์หรือกำลังรีสตาร์ท) ลองใหม่อีกครั้ง' };
      var text = await r.text();
      if (!r.ok) return { ok: false, msg: 'ThingsBoard ตอบ ' + r.status + ': ' + text.slice(0, 120) };
      try { return JSON.parse(text); } catch (e) { return { ok: false, msg: 'ตู้ตอบกลับผิดรูปแบบ' }; }
    }
    return { ok: false, msg: 'ไม่รู้จักคำขอ' };
  }

  self._onMessage = async function (ev) {
    if (ALLOWED.indexOf(ev.origin) < 0) return;
    var m = ev.data;
    if (!m || m.camlock !== 1 || !m.id) return;
    var res;
    try { res = await handle(m); lastState = 'ล่าสุด: ' + (m.method || m.kind) + ' ' + (res && res.ok ? 'สำเร็จ' : 'ไม่สำเร็จ'); }
    catch (e) { res = { ok: false, msg: e.message || 'bridge error' }; lastState = res.msg; }
    ev.source.postMessage({ camlock: 1, id: m.id, res: res }, ev.origin);
    if (!embedded) render();
  };
  window.addEventListener('message', self._onMessage);
  if (embedded) ALLOWED.forEach(function (o) { try { window.parent.postMessage({ camlock: 1, ready: true }, o); } catch (e) {} });

  // ---------- หน้าตั้งค่า (เห็นเฉพาะผู้ดูแลที่เปิดแดชบอร์ดตรง ๆ) ----------
  var isTenant = ctx.currentUser && ctx.currentUser.authority === 'TENANT_ADMIN';
  function render() {
    var html = '<div style="font:14px/1.6 sans-serif;padding:12px;color:#0E1A20">' +
      '<b style="font-size:16px">CamLock Bridge</b><br>' +
      'ตัวเชื่อมแอป GitHub Pages ↔ ThingsBoard · อุปกรณ์ <code>' + esc(DEV) + '</code><br>' +
      'บัญชีแอป: <b>' + esc(S.username) + '</b> · รหัสผ่าน: <b>' + (S.password ? 'ตั้งแล้ว' : '<span style="color:#B4410F">ยังไม่ได้ตั้ง</span>') + '</b><br>' +
      '<span style="color:#4E6069">' + esc(lastState) + '</span>';
    if (isTenant && !embedded) {
      html += '<div style="margin-top:10px;padding:10px;background:#F4F8F9;border-radius:10px">' +
        'ใส่รหัสผ่านของ <b>' + esc(S.username) + '</b> แล้วกดบันทึก<br>' +
        '<input id="clPw" type="password" autocomplete="new-password" style="padding:6px;width:220px;margin:6px 6px 0 0">' +
        '<button id="clSave" style="padding:6px 12px">บันทึก</button> <button id="clTest" style="padding:6px 12px">ทดสอบ</button>' +
        '<div id="clMsg" style="margin-top:6px"></div></div>';
    }
    el.innerHTML = html + '</div>';
    if (isTenant && !embedded) {
      el.querySelector('#clSave').onclick = saveSettings;
      el.querySelector('#clTest').onclick = async function () {
        var msg = el.querySelector('#clMsg'); msg.textContent = 'กำลังทดสอบ…';
        try { jwt = ''; var r = await handle({ kind: 'rpc', method: 'getStatus' }); msg.textContent = r.ok ? 'ใช้ได้ ✓ ตู้ตอบ: ประตู' + (r.doorOpen ? 'เปิด' : 'ปิด') : r.msg; }
        catch (e) { msg.textContent = e.message; }
      };
    }
  }
  async function saveSettings() {
    var msg = el.querySelector('#clMsg');
    var pw = el.querySelector('#clPw').value;
    if (!pw) { msg.textContent = 'กรุณาใส่รหัสผ่าน'; return; }
    msg.textContent = 'กำลังบันทึก…';
    try {
      var H = { 'Content-Type': 'application/json', 'X-Authorization': 'Bearer ' + localStorage.getItem('jwt_token') };
      var dashId = S.dashboardId;
      var d = await (await fetch('/api/dashboard/' + dashId, { headers: H })).json();
      var w = d.configuration.widgets[S.widgetId];
      w.config.settings.password = pw;
      var r = await fetch('/api/dashboard', { method: 'POST', headers: H, body: JSON.stringify(d) });
      if (!r.ok) throw new Error('บันทึกไม่ได้ (' + r.status + ')');
      S.password = pw; jwt = '';
      msg.textContent = 'บันทึกแล้ว ✓ กด “ทดสอบ” เพื่อเช็คการเชื่อมต่อกับตู้';
      render(); el.querySelector('#clMsg').textContent = 'บันทึกแล้ว ✓ กด “ทดสอบ” เพื่อเช็คการเชื่อมต่อกับตู้';
    } catch (e) { msg.textContent = e.message; }
  }
  render();
};

self.onDestroy = function () {
  if (self._onMessage) window.removeEventListener('message', self._onMessage);
};
