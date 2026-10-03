// MiMo Remote — app điện thoại (3/10/2026, bản đăng nhập Google)
// Đọc/ghi Firestore qua REST bằng token đăng nhập Google. Chỉ tài khoản của An mới đọc/ghi được (Firestore rules).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const FB = {
  apiKey: "AIzaSyBiD6b8sTQrJdl7DVGxAkylz4XUpzDKBfw",
  authDomain: "mimo-remote-bvcl.firebaseapp.com",
  projectId: "mimo-remote-bvcl",
  appId: "1:834263999319:web:54f641b8ce4e2d8ff59412",
};
const EMAIL = "n.quangan1708@gmail.com";
const auth = getAuth(initializeApp(FB));
let USER = null;
localStorage.removeItem("mimoCfg"); // dọn cấu hình bản cũ (mã ghép đôi)

const $ = (s) => document.querySelector(s);

// ---------- Firestore REST ----------
const goc = () => `https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents/users/${USER.uid}`;
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: fields(v) } };
}
function fields(o) { const f = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) f[k] = enc(v); return f; }
function dec(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  if ("mapValue" in v) return toObj({ fields: v.mapValue.fields });
  return null;
}
function toObj(d) { const o = {}; for (const [k, v] of Object.entries(d.fields || {})) o[k] = dec(v); if (d.name) o._id = d.name.split("/").pop(); return o; }
async function api(url, opts = {}) {
  try {
    const tok = await USER.getIdToken();
    const r = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok } });
    const j = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data: j };
  } catch (e) { return { ok: false, status: 0, data: null }; }
}
const getDoc = async (p) => { const r = await api(goc() + (p ? "/" + p : "")); return r.ok ? toObj(r.data) : null; };
const list = async (c) => { const r = await api(`${goc()}/${c}?pageSize=300`); return r.ok ? (r.data.documents || []).map(toObj) : null; };
const patch = (p, o) => api(`${goc()}${p ? "/" + p : ""}?` + Object.keys(o).map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&"), { method: "PATCH", body: JSON.stringify({ fields: fields(o) }) });
const del = (p) => api(`${goc()}/${p}`, { method: "DELETE" });
const rid = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");

// ---------- Lệnh ----------
const dangCho = new Map(); // cmdId → {itemId, nhan}
async function lenh(type, extra = {}, nhan = "") {
  const id = rid();
  const r = await patch("cmds/" + id, { type, status: "pending", createdAt: Date.now(), ...extra });
  if (!r.ok) return toast("Không gửi được lệnh (mạng?) — thử lại", true);
  dangCho.set(id, { itemId: extra.itemId, nhan, loai: type });
  toast(nhan ? nhan + " — chờ máy tính…" : "Đã gửi lệnh, chờ máy tính…");
  ve();
}
async function theoDoiLenh() {
  for (const [id, info] of dangCho) {
    const d = await getDoc("cmds/" + id);
    if (!d || d.status === "pending" || d.status === "running") continue;
    dangCho.delete(id);
    toast((d.status === "done" ? "✅ " : "⚠️ ") + (d.result || d.status), d.status !== "done");
  }
}

// ---------- Giao diện ----------
let MAIN = null, ITEMS = [], PAID = new Set(), hienCu = false;
const daTT = (it) => PAID.has(it.threadId || it._id) || it.status === "paid";
const linkHoiThoai = (it) => `https://business.facebook.com/latest/inbox/all?selected_item_id=${encodeURIComponent(it.threadId || it._id)}&thread_type=${encodeURIComponent(it.threadType || "FB_MESSAGE")}`;
const chuCai = (t) => esc(String(t || "?").trim().split(/\s+/).pop().charAt(0).toUpperCase() || "?");
function anh(it) {
  return it.avatar
    ? `<img class="av" src="${esc(it.avatar)}" referrerpolicy="no-referrer" alt="" onerror="this.outerHTML='<span class=&quot;av chu&quot;>${chuCai(it.contact)}</span>'">`
    : `<span class="av chu">${chuCai(it.contact)}</span>`;
}
const suaTay = {}; // id → {base: tin nháp gốc, v: chữ đã sửa}
document.addEventListener("input", (e) => {
  const t = e.target.closest?.("textarea[data-id]");
  if (!t) return;
  const it = ITEMS.find((x) => x._id === t.dataset.id);
  suaTay[t.dataset.id] = { base: it ? it.draft : "", v: t.value };
});
function toast(t, loi) {
  const el = $("#toast");
  el.textContent = t;
  el.className = "show" + (loi ? " err" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.className = ""), 5000);
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function truoc(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "vừa xong";
  if (s < 3600) return Math.floor(s / 60) + " phút trước";
  if (s < 86400) return Math.floor(s / 3600) + " giờ trước";
  return Math.floor(s / 86400) + " ngày trước";
}
const NHAN = { new: "Chưa soạn", paid: "Đã thanh toán", pending: "Đã soạn nháp", stale: "Khách nhắn thêm", sending: "Đang gửi…", scanning: "Đang quét lại…", sent: "Đã gửi", skipped: "Đã bỏ qua" };

function veTrangThai() {
  const st = $("#status");
  if (!MAIN) return (st.innerHTML = `<span class="dot off"></span> Chưa kết nối được máy chủ`);
  const on = MAIN.lastSeen && Date.now() - MAIN.lastSeen < 3 * 60 * 1000;
  st.innerHTML = `<span class="dot ${on ? "on" : "off"}"></span> Máy tính ${on ? "đang chạy" : "OFFLINE — lần cuối " + (MAIN.lastSeen ? truoc(MAIN.lastSeen) : "chưa thấy")}
    ${MAIN.inboxOpen === false && on ? `<div class="warn">Trên máy chưa mở tab Hộp thư Business Suite</div>` : ""}
    ${MAIN.watcher ? `<div class="sub">${esc(MAIN.watcher)}</div>` : ""}
    ${MAIN.lastError ? `<div class="warn">${esc(MAIN.lastError)}</div>` : ""}`;
  $("#remoteOn").checked = !!MAIN.remoteOn;
}

// ---------- Tab "Bình luận nhóm" (tiện ích fb-mimo-assistant, đi qua máy tính) ----------
let TAB = localStorage.getItem("mimoTab") === "bl" ? "bl" : "inbox";
const CHON = new Map(); // slug → ten
let chiSoi = false;
const gio = (ms) => new Date(ms).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
const phutTxt = (p) => (p == null || p < 0 ? "không rõ" : p < 60 ? p + " phút trước" : p < 1440 ? Math.round(p / 60) + " giờ trước" : Math.round(p / 1440) + " ngày trước");
const MUC = { soi: "🔥", vua: "🙂", it: "💤" };
function doiTab(t) {
  TAB = t; localStorage.setItem("mimoTab", t);
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  $("#list").hidden = t !== "inbox"; $("#inboxBar").hidden = t !== "inbox"; $("#blView").hidden = t !== "bl";
  ve();
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => doiTab(b.dataset.tab)));

function veBL() {
  const box = $("#blView");
  const bl = MAIN && MAIN.bl;
  const mayOn = MAIN && MAIN.lastSeen && Date.now() - MAIN.lastSeen < 3 * 60 * 1000;
  const daGoi = (t) => [...dangCho.values()].some((x) => x.loai === t);
  let tt;
  if (!mayOn) tt = `<div class="warn">Máy tính offline — lệnh sẽ chạy khi máy bật lại (lệnh quá 10 phút thì bỏ).</div>`;
  else if (!bl || bl.offline) tt = `<div class="warn">Tiện ích bình luận không trả lời: trên máy chưa bật, hoặc chưa tải lại bản 1.6.0.</div>`;
  else {
    const dong = [];
    if (bl.chanDen && bl.chanDen > Date.now()) dong.push(`<div class="warn">⛔ MiMo đang tự khoá bình luận tới ${gio(bl.chanDen)}</div><div class="row"><button data-act="blBoKhoa" ${daGoi("bl_bokhoa") ? "disabled" : ""}>🔓 Bỏ khoá chống chặn (Facebook đã hết chặn)</button></div>`);
    dong.push(`<div class="big"><span class="dot ${bl.running ? "on" : "off"}"></span> ${bl.running
      ? (bl.choDen ? `Đang nghỉ — chạy tiếp lúc ${gio(bl.choDen)}` : "Đang chạy")
      : "Đang dừng"}${bl.running && bl.lap ? " · lặp cả ngày" : ""}</div>`);
    dong.push(`<div>Hôm nay: <b>${bl.daDang || 0}/${bl.tran || 90}</b> bình luận chính${bl.dotThemDaDang ? ` · +${bl.dotThemDaDang} ở đợt thêm` : ""}${bl.dotThemCon ? ` · đợt thêm còn ${bl.dotThemCon}` : ""}</div>`);
    if (bl.chon && bl.chon.length && bl.running) dong.push(`<div class="sub">Chỉ quét: ${bl.chon.map(esc).join(", ")}</div>`);
    if (bl.bao) dong.push(`<div class="sub">${esc(bl.bao)}${bl.baoAt ? ` <i>(${truoc(bl.baoAt)})</i>` : ""}</div>`);
    if (bl.log && bl.log.length) dong.push(`<div class="log">${bl.log.slice().reverse().slice(0, 8).map((g) => `${g.vong > 1 ? "[v" + g.vong + "] " : ""}${esc(g.ten)}: ${g.dang} BL${g.loi ? " · " + g.loi + " lỗi" : ""}`).join("\n")}</div>`);
    tt = dong.join("");
  }
  const lap = localStorage.getItem("mimoBlLap") !== "0";
  const ds = (MAIN && Array.isArray(MAIN.blGroups) ? MAIN.blGroups : []).slice()
    .sort((a, b) => (a.phut < 0 ? 1e9 : a.phut) - (b.phut < 0 ? 1e9 : b.phut));
  const hien = chiSoi ? ds.filter((g) => g.muc === "soi") : ds;
  const soSoi = ds.filter((g) => g.muc === "soi").length;
  box.innerHTML = `
    <div class="card">${tt}
      <label class="chk"><input type="checkbox" id="blLap" ${lap ? "checked" : ""}> Lặp lại cả ngày (nghỉ giữa vòng, đủ trần thì chạy đợt thêm)</label>
      <div class="row"><button class="send" data-act="blStart" ${daGoi("bl_start") ? "disabled" : ""}>▶ Chạy tất cả nhóm</button></div>
      <div class="row"><button data-act="blStop" ${daGoi("bl_stop") ? "disabled" : ""}>⏹ Dừng</button></div>
    </div>
    <div class="card">
      <b>Chọn nhóm để quét</b>
      <div class="sub">${MAIN && MAIN.blGroupsAt ? `Danh sách lúc ${gio(MAIN.blGroupsAt)} · ${ds.length} nhóm, ${soSoi} nhóm sôi nổi (hoạt động ≤ 60 phút)` : "Chưa có danh sách — bấm nút dưới để máy tính quét."}${MAIN && MAIN.blGroupsNote ? `<div class="warn">${esc(MAIN.blGroupsNote)}</div>` : ""}</div>
      <div class="row"><button data-act="blGroups" ${daGoi("bl_groups") ? "disabled" : ""}>🔎 Quét danh sách nhóm</button></div>
      ${ds.length ? `<div class="row small"><button data-act="blSoi">${chiSoi ? "Hiện tất cả nhóm" : "Chỉ hiện nhóm sôi nổi"}</button><button data-act="blChonSoi">Chọn hết nhóm sôi nổi</button><button data-act="blBoChon">Bỏ chọn</button></div>
      <div>${hien.map((g) => `<div class="grp"><label class="grpl"><input type="checkbox" data-slug="${esc(g.slug)}" data-ten="${esc(g.ten)}" ${CHON.has(g.slug) ? "checked" : ""}><span class="ten"><b>${MUC[g.muc] || ""} ${esc(g.ten)}</b><span class="sub">Hoạt động ${phutTxt(g.phut)}${g.daQuet ? ' · <span class="ok">đã quét hôm nay</span>' : ""}</span></span></label><button class="mini" data-act="blScan" data-slug="${esc(g.slug)}" data-ten="${esc(g.ten)}" ${daGoi("bl_scan") ? "disabled" : ""}>🔍 Quét &amp; soạn</button></div>`).join("") || `<div class="empty">Không có nhóm sôi nổi.</div>`}</div>
      <div class="row"><button class="send" data-act="blRunChon" ${CHON.size && !daGoi("bl_start") ? "" : "disabled"}>▶ Chạy ${CHON.size} nhóm đã chọn (tự đăng)</button></div>
      <div class="hint">"🔍 Quét &amp; soạn" ở từng nhóm: máy quét nhóm đó, soạn bình luận rồi chờ anh duyệt ở mục "Duyệt bình luận" bên dưới — chưa đăng gì cho tới khi anh bấm đăng.</div>` : ""}
    </div>
    ${veReview(bl, daGoi)}
    ${veRp(bl, daGoi)}
    ${bl && bl.chanLog && bl.chanLog.length ? `<div class="card"><b>📊 Các lần bị khoá gần đây</b><div class="log">${bl.chanLog.map((l) => `${new Date(l.at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}: ngày ${l.homNay} BL · 1 giờ ${l.motGio} BL — ${esc(l.lyDo)}`).join("\n")}</div></div>` : ""}`;
}
// Sửa tạm trên điện thoại (chờ máy tính xác nhận) — giữ lại khi màn hình vẽ lại
const SUA = {};
const suaKey = (loai, at, i) => `${loai}:${at}:${i}`;
function veReview(bl, daGoi) {
  const rv = bl && bl.review;
  if (!rv) return "";
  const ds = (rv.items || []).filter((r) => !r.skipped);
  const boQua = (rv.items || []).length - ds.length;
  const choDang = ds.filter((r) => !r.posted && !r.error);
  return `<div class="card"><b>📝 Duyệt bình luận — ${esc(rv.nhom || "nhóm")}</b>
    <div class="sub">Lúc ${gio(rv.at)}${rv.trangThai ? " · " + esc(rv.trangThai) : ""}${boQua ? ` · ${boQua} bài đã bình luận trước đó (bỏ qua)` : ""}</div>
    ${ds.length ? ds.map((r) => {
      const k = suaKey("rv", rv.at, r.i), o = SUA[k] || {};
      const duyet = o.approved ?? r.approved, cm = o.comment ?? r.comment;
      return `<div class="them"><b>${esc(r.author)}</b>${r.posted ? ' <span class="ok">✓ đã đăng</span>' : r.postFailed ? ' <span class="warn">✗ chưa đăng được</span>' : ""}
        <div class="sub" style="margin:4px 0">${esc((r.text || "").slice(0, 260))}${(r.text || "").length > 260 ? "…" : ""}</div>
        ${r.posted ? `<div class="sent">${esc(cm)}</div>` : r.error ? `<div class="warn">${esc(cm)}</div>` : `<textarea class="nho" data-rv="${r.i}" data-at="${rv.at}">${esc(cm)}</textarea>
        <label class="chk"><input type="checkbox" data-rvd="${r.i}" data-at="${rv.at}" ${duyet ? "checked" : ""}> Duyệt đăng bình luận này</label>`}</div>`;
    }).join("") : `<div class="empty">Chưa có bình luận nào.</div>`}
    ${choDang.length ? `<div class="row"><button class="send" data-act="blRvPost" ${daGoi("bl_review_post") || rv.dangDang ? "disabled" : ""}>✅ Đăng các bình luận đã duyệt</button></div>
    <div class="row"><button data-act="blRvAll" ${daGoi("bl_review_all") || rv.dangDang ? "disabled" : ""}>⚡ Duyệt tất cả &amp; gửi</button></div>` : ""}
  </div>`;
}
function veRp(bl, daGoi) {
  const rp = bl && bl.rp;
  const ds = rp ? rp.items || [] : [];
  const can = ds.filter((x) => x.loai === "can_tra_loi");
  const inbox = ds.filter((x) => x.loai === "xem_inbox");
  const at = rp ? rp.baoAt || 0 : 0;
  return `<div class="card"><b>💬 Phản hồi khách (trả lời / tag page trong 48 giờ)</b>
    ${rp && rp.bao ? `<div class="sub">${esc(rp.bao)}${rp.baoAt ? ` <i>(${truoc(rp.baoAt)})</i>` : ""}</div>` : `<div class="sub">Máy đọc các lượt khách trả lời / tag page, soạn nháp trả lời. Anh duyệt xong mới đăng.</div>`}
    <div class="row">${rp && rp.running
      ? `<button data-act="blRpStop" ${daGoi("bl_rp_stop") ? "disabled" : ""}>⏹ Dừng phản hồi khách</button>`
      : `<button class="send" data-act="blRpStart" ${daGoi("bl_rp_start") ? "disabled" : ""}>💬 Quét & soạn phản hồi khách</button>`}</div>
    ${can.map((it) => {
      const k = suaKey("rp", it.href, it.i), o = SUA[k] || {};
      const duyet = o.duyet ?? it.duyet, rep = o.reply ?? it.reply;
      return `<div class="them"><b>${esc(it.ten)}</b> <a href="${esc(it.href)}" target="_blank" rel="noopener">mở ↗</a>${it.daDang ? ' <span class="ok">✓ đã đăng</span>' : ""}${it.loiDang ? ` <span class="warn">✗ ${esc(it.loiDang)}</span>` : ""}
        ${it.goc ? `<div class="sub" style="margin:4px 0">Bình luận của page: ${esc(it.goc.slice(0, 160))}</div>` : ""}
        <div style="margin:4px 0">“${esc(it.khach)}”</div>
        ${it.daDang ? `<div class="sent">${esc(rep)}</div>` : `<textarea class="nho" data-rp="${it.i}" data-href="${esc(it.href)}">${esc(rep)}</textarea>
        <label class="chk"><input type="checkbox" data-rpd="${it.i}" data-href="${esc(it.href)}" ${duyet ? "checked" : ""}> Duyệt đăng trả lời này</label>`}</div>`;
    }).join("")}
    ${can.some((x) => !x.daDang) && !(rp && rp.running) ? `<div class="row"><button class="send" data-act="blRpPost" ${daGoi("bl_rp_post") ? "disabled" : ""}>✅ Đăng các trả lời đã duyệt</button></div>` : ""}
    ${inbox.length ? `<div class="sub" style="margin-top:10px">📥 Khách báo đã nhắn tin — xem hộp thư: ${inbox.map((x) => esc(x.ten)).join(", ")}</div>` : ""}
  </div>`;
}
document.addEventListener("change", (e) => {
  const c = e.target;
  if (c.dataset && c.dataset.rv !== undefined) {
    const k = suaKey("rv", +c.dataset.at, +c.dataset.rv); SUA[k] = { ...(SUA[k] || {}), comment: c.value };
    return lenh("bl_review_set", { i: +c.dataset.rv, comment: c.value }, "Lưu bình luận");
  }
  if (c.dataset && c.dataset.rvd !== undefined) {
    const k = suaKey("rv", +c.dataset.at, +c.dataset.rvd); SUA[k] = { ...(SUA[k] || {}), approved: c.checked };
    const ta = document.querySelector(`textarea[data-rv="${c.dataset.rvd}"]`);
    return lenh("bl_review_set", { i: +c.dataset.rvd, approved: c.checked, ...(ta ? { comment: ta.value } : {}) }, c.checked ? "Duyệt" : "Bỏ duyệt");
  }
  if (c.dataset && c.dataset.rp !== undefined) {
    const k = suaKey("rp", c.dataset.href, +c.dataset.rp); SUA[k] = { ...(SUA[k] || {}), reply: c.value };
    return lenh("bl_rp_set", { i: +c.dataset.rp, reply: c.value }, "Lưu trả lời");
  }
  if (c.dataset && c.dataset.rpd !== undefined) {
    const k = suaKey("rp", c.dataset.href, +c.dataset.rpd); SUA[k] = { ...(SUA[k] || {}), duyet: c.checked };
    const ta = document.querySelector(`textarea[data-rp="${c.dataset.rpd}"]`);
    return lenh("bl_rp_set", { i: +c.dataset.rpd, duyet: c.checked, ...(ta ? { reply: ta.value } : {}) }, c.checked ? "Duyệt" : "Bỏ duyệt");
  }
  if (c.id === "blLap") return localStorage.setItem("mimoBlLap", c.checked ? "1" : "0");
  if (c.dataset && c.dataset.slug) {
    if (c.checked) CHON.set(c.dataset.slug, c.dataset.ten); else CHON.delete(c.dataset.slug);
    const b = document.querySelector('[data-act="blRunChon"]');
    if (b) { b.textContent = `▶ Chạy ${CHON.size} nhóm đã chọn (tự đăng)`; b.disabled = !CHON.size; }
  }
});

function ve() {
  veTrangThai();
  if (TAB === "bl") return veBL();
  const canXuLy = (i) => ["new", "pending", "stale", "sending", "scanning", "paid"].includes(i.status);
  const moi = (a, b) => (b.lastAtMs || b.updatedAt || 0) - (a.lastAtMs || a.updatedAt || 0);
  const choDuyet = ITEMS.filter((i) => canXuLy(i) && !daTT(i)).sort(moi);
  const khachTT = ITEMS.filter((i) => canXuLy(i) && daTT(i)).sort(moi);
  const cu = ITEMS.filter((i) => !canXuLy(i)).sort(moi);
  const box = $("#list");
  const the = (it) => {
    const daGoi = [...dangCho.values()].some((x) => x.itemId === it._id);
    const khoa = daGoi || ["sending", "scanning"].includes(it.status) || demNguoc[it._id];
    const tt = daTT(it);
    const nhan = tt ? "Đã thanh toán" : NHAN[it.status] || esc(it.status);
    return `<div class="card ${it.status} ${tt ? "tt" : ""}" data-id="${esc(it._id)}">
      <div class="top">${anh(it)}<div class="ten"><b>${esc(it.contact)}</b><div class="sub">Khách nhắn: ${it.lastAt ? esc(it.lastAt) : truoc(it.updatedAt || it.createdAt)}${it.imageCount ? ` · gửi ${it.imageCount} ảnh` : ""}</div></div><span class="chip ${tt ? "paid" : it.status}">${nhan}</span></div>
      ${it.myLast ? `<div class="me"><span class="lbl">Anh đã nhắn:</span> ${esc(it.myLast.length > 260 ? it.myLast.slice(0, 260) + "…" : it.myLast)}</div>` : ""}
      ${(it.theirMsgs || []).length ? `<div class="lbl2">Khách nhắn sau đó (${it.theirMsgs.length} tin):</div>` : ""}
      ${(it.theirMsgs || []).map((m, i) => `<div class="them"><span class="so">${i + 1}</span>${esc(m)}</div>`).join("")}
      ${it.note && !tt ? `<div class="warn">${esc(it.note)}</div>` : ""}
      ${it.status === "sent"
        ? `<div class="sent">${esc(it.sentText || it.draft)}</div>`
        : tt
        ? `<div class="hint">Khách đã thanh toán — anh tự trả lời trực tiếp.</div>
      <div class="row"><a class="btn send" href="${linkHoiThoai(it)}" target="_blank" rel="noopener">Mở hội thoại để trả lời</a></div>`
        : !it.draft && it.status !== "scanning"
        ? `<div class="row"><button class="send" data-act="rescan" ${khoa ? "disabled" : ""}>✍️ Soạn tin</button></div>`
        : `<textarea data-id="${esc(it._id)}" ${khoa ? "disabled" : ""}>${esc(it.draft)}</textarea>
      <div class="row">
        <button class="send" data-act="send" ${khoa || it.status === "stale" || !it.draft ? "disabled" : ""}>${demNguoc[it._id] ? `Huỷ (${demNguoc[it._id].con})` : "Gửi tin này"}</button>
      </div>
      <div class="row">
        <button data-act="refine" ${khoa ? "disabled" : ""}>✏️ Sửa theo góp ý</button>
        <button data-act="rescan" ${khoa ? "disabled" : ""}>🔄 Soạn lại</button>
      </div>
      <div class="refine" hidden><input placeholder="Góp ý, vd: ngắn hơn, bỏ phần phí"><button data-act="refineGo">Gửi góp ý</button></div>`}
      <div class="row small">
        <button data-act="paid" class="${tt ? "on" : ""}">${tt ? "✓ Đã thanh toán (bấm để bỏ)" : "💰 Khách đã thanh toán"}</button>${it.status !== "sent" ? `<button data-act="skip">Xong / Bỏ qua</button>` : ""}
      </div>
    </div>`;
  };
  const chuaSoan = choDuyet.filter((i) => i.status === "new").length;
  const thanhCongCu = `<div class="row tools"><button data-act="readAll">🔎 Quét tin chưa trả lời</button><button data-act="draftAll" ${chuaSoan ? "" : "disabled"}>✍️ Soạn tất cả (${chuaSoan})</button></div>`;
  const muc = (tieuDe, ds) => (ds.length ? `<h2>${tieuDe} (${ds.length})</h2>` + ds.map(the).join("") : "");
  box.innerHTML = thanhCongCu +
    (choDuyet.length || khachTT.length
      ? muc("Khách chưa thanh toán", choDuyet) + muc("Khách đã thanh toán — anh tự trả lời", khachTT)
      : `<div class="empty">Không có tin nào chờ xử lý.</div>`) +
    (cu.length ? `<button id="toggleOld" class="link">${hienCu ? "Ẩn" : "Xem"} ${cu.length} tin đã xử lý</button>` + (hienCu ? cu.map(the).join("") : "") : "");
  // Giữ chữ An đã sửa tay, trừ khi máy tính vừa đổi tin nháp (sửa theo góp ý / quét lại)
  box.querySelectorAll("textarea[data-id]").forEach((t) => {
    const it = ITEMS.find((x) => x._id === t.dataset.id);
    const n = suaTay[t.dataset.id];
    if (n && it && n.base === it.draft && !t.disabled) t.value = n.v;
    else delete suaTay[t.dataset.id];
  });
  $("#toggleOld")?.addEventListener("click", () => { hienCu = !hienCu; ve(); });
}

// Gửi có 5 giây để huỷ
const demNguoc = {};
function batDauGui(id) {
  if (demNguoc[id]) { clearInterval(demNguoc[id].t); delete demNguoc[id]; toast("Đã huỷ, chưa gửi gì"); return ve(); }
  const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  const text = card.querySelector("textarea").value.trim();
  if (!text) return toast("Tin trống", true);
  demNguoc[id] = { con: 5, text };
  demNguoc[id].t = setInterval(() => {
    const d = demNguoc[id];
    if (!d) return;
    d.con--;
    if (d.con <= 0) {
      clearInterval(d.t);
      delete demNguoc[id];
      lenh("send", { itemId: id, text: d.text }, "Đang gửi");
    }
    ve();
  }, 1000);
  ve();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const card = b.closest(".card");
  const id = card?.dataset.id;
  const act = b.dataset.act;
  if (act === "send") return batDauGui(id);
  if (act === "refine") { const r = card.querySelector(".refine"); r.hidden = !r.hidden; r.querySelector("input")?.focus(); return; }
  if (act === "refineGo") {
    const fb = card.querySelector(".refine input").value.trim();
    if (!fb) return toast("Gõ góp ý trước", true);
    return lenh("refine", { itemId: id, feedback: fb, text: card.querySelector("textarea").value }, "Đang sửa tin");
  }
  if (act === "rescan") return lenh("rescan", { itemId: id }, "Đang soạn tin");
  if (act === "readAll") return lenh("readAll", { max: 15 }, "Đang quét tin chưa trả lời");
  if (act === "draftAll") return lenh("draftAll", {}, "Đang soạn tất cả");
  if (act === "skip") return lenh("skip", { itemId: id }, "Bỏ qua");
  if (act === "paid") return doiThanhToan(id);
  const lap = localStorage.getItem("mimoBlLap") !== "0";
  if (act === "blStart") { if (!confirm("Cho máy tính chạy bình luận TẤT CẢ nhóm?")) return; return lenh("bl_start", { lap }, "Chạy tất cả nhóm"); }
  if (act === "blStop") return lenh("bl_stop", {}, "Dừng bình luận");
  if (act === "blGroups") return lenh("bl_groups", {}, "Quét danh sách nhóm");
  if (act === "blSoi") { chiSoi = !chiSoi; return ve(); }
  if (act === "blBoKhoa") { if (!confirm("Bỏ khoá chống chặn? Chỉ bấm khi chắc Facebook đã cho bình luận lại.")) return; return lenh("bl_bokhoa", {}, "Bỏ khoá"); }
  if (act === "blScan") return lenh("bl_scan", { slug: b.dataset.slug, ten: b.dataset.ten }, "Quét nhóm " + b.dataset.ten);
  if (act === "blRvPost") { if (!confirm("Đăng các bình luận đã duyệt?")) return; return lenh("bl_review_post", {}, "Đăng bình luận đã duyệt"); }
  if (act === "blRvAll") { if (!confirm("Duyệt TẤT CẢ bình luận trong danh sách và gửi luôn?")) return; return lenh("bl_review_all", {}, "Duyệt tất cả & gửi"); }
  if (act === "blRpStart") return lenh("bl_rp_start", {}, "Quét phản hồi khách");
  if (act === "blRpStop") return lenh("bl_rp_stop", {}, "Dừng phản hồi khách");
  if (act === "blRpPost") { if (!confirm("Đăng các trả lời đã duyệt?")) return; return lenh("bl_rp_post", {}, "Đăng trả lời đã duyệt"); }
  if (act === "blChonSoi") { (MAIN?.blGroups || []).filter((g) => g.muc === "soi").forEach((g) => CHON.set(g.slug, g.ten)); return ve(); }
  if (act === "blBoChon") { CHON.clear(); return ve(); }
  if (act === "blRunChon") {
    const chon = [...CHON].map(([slug, ten]) => ({ slug, ten }));
    if (!chon.length) return;
    if (!confirm(`Cho máy tính quét và bình luận ${chon.length} nhóm đã chọn?`)) return;
    return lenh("bl_start", { chon, lap }, `Chạy ${chon.length} nhóm`);
  }
});

async function doiThanhToan(id) {
  const it = ITEMS.find((x) => x._id === id);
  if (!it) return;
  const khoa = it.threadId || it._id;
  if (daTT(it)) {
    if (!confirm("Bỏ đánh dấu đã thanh toán cho " + it.contact + "?")) return;
    const r = await del("paid/" + khoa);
    if (it.status === "paid") await patch("items/" + it._id, { status: "pending", updatedAt: Date.now() });
    if (!r.ok && r.status !== 404) return toast("Không lưu được (mạng?)", true);
    PAID.delete(khoa);
    toast("Đã bỏ đánh dấu thanh toán");
  } else {
    const r = await patch("paid/" + khoa, { contact: it.contact || "", threadId: khoa, at: Date.now() });
    if (!r.ok) return toast("Không lưu được (mạng?)", true);
    PAID.add(khoa);
    toast("Đã đánh dấu: " + it.contact + " đã thanh toán. Tin sau của khách này máy sẽ không soạn nháp.");
    lenh("outcome", { itemId: id, outcome: "paid" }, "Ghi thống kê đã CK"); // ghi vào thống kê chốt khách trên máy tính
  }
  ve();
}

$("#remoteOn").addEventListener("change", async (e) => {
  const on = e.target.checked;
  await patch("", { remoteOn: on });
  lenh("setRemote", { on }, on ? "Bật tự quét" : "Tắt tự quét");
});

// ---------- Thông báo đẩy ----------
function b64u(s) {
  const p = "=".repeat((4 - (s.length % 4)) % 4);
  const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function batThongBao() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return toast("Trình duyệt này không hỗ trợ thông báo. Dùng Chrome trên Android.", true);
    if (!MAIN?.vapidPub) return toast("Máy tính chưa gửi khoá thông báo — chờ 1 phút rồi thử lại", true);
    const reg = await navigator.serviceWorker.ready;
    if ((await Notification.requestPermission()) !== "granted") return toast("Bạn chưa cho phép thông báo", true);
    let sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(MAIN.vapidPub) });
    const ep = sub.toJSON().endpoint;
    const h = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ep)))].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
    const r = await patch("subs/" + h, { endpoint: ep, createdAt: Date.now() });
    if (!r.ok) return toast("Lưu đăng ký thông báo lỗi", true);
    localStorage.setItem("mimoPush", "1");
    $("#bell").textContent = "🔔 Thông báo: đang bật";
    toast("Đã bật thông báo");
  } catch (e) {
    toast("Bật thông báo lỗi: " + e.message, true);
  }
}
$("#bell").addEventListener("click", batThongBao);

// ---------- Vòng cập nhật ----------
async function capNhat() {
  if (!USER) return;
  const [m, its, pd] = await Promise.all([getDoc(""), list("items"), list("paid")]);
  if (m) MAIN = m;
  if (its) ITEMS = its;
  if (pd) PAID = new Set(pd.map((p) => p.threadId || p._id));
  await theoDoiLenh();
  if (!document.querySelector("textarea:focus") && !document.querySelector(".refine:not([hidden]) input:focus")) ve();
  else veTrangThai();
}

// ---------- Đăng nhập ----------
function manDangNhap(loi) {
  $("#status").textContent = "Chưa đăng nhập";
  $("#list").innerHTML = `<div class="empty">${loi ? `<div class="warn">${esc(loi)}</div><br>` : ""}Đăng nhập bằng tài khoản Google <b>${EMAIL}</b> (giống trên máy tính).<br><br><button id="login" class="send">Đăng nhập Google</button></div>`;
  $("#login").addEventListener("click", async () => {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ login_hint: EMAIL, prompt: "select_account" });
    try {
      await signInWithPopup(auth, p);
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return signInWithRedirect(auth, p);
      if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") manDangNhap("Đăng nhập lỗi: " + e.message);
    }
  });
}

let timer = null;
async function batDau() {
  doiTab(TAB);
  if (localStorage.getItem("mimoPush")) $("#bell").textContent = "🔔 Thông báo: đang bật";
  await capNhat();
  if (!timer) {
    timer = setInterval(() => document.visibilityState === "visible" && capNhat(), 8000);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && capNhat());
  }
}

(function start() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  getRedirectResult(auth).catch((e) => manDangNhap("Đăng nhập lỗi: " + e.message));
  onAuthStateChanged(auth, async (u) => {
    if (!u) { USER = null; return manDangNhap(); }
    if (String(u.email || "").toLowerCase() !== EMAIL) {
      await signOut(auth);
      return manDangNhap("Tài khoản " + u.email + " không được phép. Hãy chọn " + EMAIL + ".");
    }
    USER = u;
    $("#list").innerHTML = `<div class="empty">Đang tải…</div>`;
    batDau();
  });
})();
