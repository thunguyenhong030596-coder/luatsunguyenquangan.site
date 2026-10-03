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
  dangCho.set(id, { itemId: extra.itemId, nhan });
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
const NHAN = { paid: "Đã thanh toán", pending: "Chờ duyệt", stale: "Khách nhắn thêm", sending: "Đang gửi…", scanning: "Đang quét lại…", sent: "Đã gửi", skipped: "Đã bỏ qua" };

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

function ve() {
  veTrangThai();
  const canXuLy = (i) => ["pending", "stale", "sending", "scanning", "paid"].includes(i.status);
  const moi = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
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
      <div class="top">${anh(it)}<div class="ten"><b>${esc(it.contact)}</b><div class="sub">${truoc(it.updatedAt || it.createdAt)}${it.imageCount ? ` · gửi ${it.imageCount} ảnh` : ""}</div></div><span class="chip ${tt ? "paid" : it.status}">${nhan}</span></div>
      ${(it.theirMsgs || []).map((m) => `<div class="them">${esc(m)}</div>`).join("")}
      ${it.note && !tt ? `<div class="warn">${esc(it.note)}</div>` : ""}
      ${it.status === "sent"
        ? `<div class="sent">${esc(it.sentText || it.draft)}</div>`
        : tt
        ? `<div class="hint">Khách đã thanh toán — anh tự trả lời trực tiếp.</div>
      <div class="row"><a class="btn send" href="${linkHoiThoai(it)}" target="_blank" rel="noopener">Mở hội thoại để trả lời</a></div>`
        : `<textarea data-id="${esc(it._id)}" ${khoa ? "disabled" : ""}>${esc(it.draft)}</textarea>
      <div class="row">
        <button class="send" data-act="send" ${khoa || it.status === "stale" || !it.draft ? "disabled" : ""}>${demNguoc[it._id] ? `Huỷ (${demNguoc[it._id].con})` : "Gửi tin này"}</button>
      </div>
      <div class="row">
        <button data-act="refine" ${khoa ? "disabled" : ""}>✏️ Sửa theo góp ý</button>
        <button data-act="rescan" ${khoa ? "disabled" : ""}>🔄 Quét lại</button>
      </div>
      <div class="refine" hidden><input placeholder="Góp ý, vd: ngắn hơn, bỏ phần phí"><button data-act="refineGo">Gửi góp ý</button></div>`}
      <div class="row small">
        <button data-act="paid" class="${tt ? "on" : ""}">${tt ? "✓ Đã thanh toán (bấm để bỏ)" : "💰 Khách đã thanh toán"}</button>${it.status !== "sent" ? `<button data-act="skip">Xong / Bỏ qua</button>` : ""}
      </div>
    </div>`;
  };
  const muc = (tieuDe, ds) => (ds.length ? `<h2>${tieuDe} (${ds.length})</h2>` + ds.map(the).join("") : "");
  box.innerHTML =
    (choDuyet.length || khachTT.length
      ? muc("Chờ duyệt — chưa thanh toán", choDuyet) + muc("Khách đã thanh toán — anh tự trả lời", khachTT)
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
  if (act === "rescan") return lenh("rescan", { itemId: id }, "Đang quét lại");
  if (act === "skip") return lenh("skip", { itemId: id }, "Bỏ qua");
  if (act === "paid") return doiThanhToan(id);
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
