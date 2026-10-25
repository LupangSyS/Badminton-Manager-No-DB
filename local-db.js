// 💾 Local database — replaces Firebase. Everything is stored in THIS browser
// only (localStorage), so each person/group has their own separate data.
// It mimics the small part of the Firestore API the app uses
// (db.collection().doc().get/set/update/delete/onSnapshot) so the rest of the
// code didn't need to change.

(function () {
    const PREFIX = 'LOCALDB_';
    const listeners = {}; // collection name -> [callbacks]

    function readAll(col) {
        try { return JSON.parse(localStorage.getItem(PREFIX + col)) || {}; }
        catch (e) { return {}; }
    }

    function writeAll(col, obj) {
        try {
            localStorage.setItem(PREFIX + col, JSON.stringify(obj));
        } catch (e) {
            alert('❌ พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม (อาจเพราะรูปเยอะเกินไป) — ลองลบรูปหรือข้อมูลเก่าออก');
            throw e;
        }
        notify(col);
    }

    function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

    function makeDocSnap(id, data) {
        return { id: id, exists: data !== undefined, data: () => clone(data) };
    }

    function makeQuerySnap(col) {
        const all = readAll(col);
        const docs = Object.keys(all).map(id => makeDocSnap(id, all[id]));
        return { docs: docs, size: docs.length, empty: docs.length === 0, forEach: fn => docs.forEach(fn) };
    }

    function notify(col) {
        (listeners[col] || []).forEach(fn => fn());
    }

    // Other tabs of the same browser changed the data
    window.addEventListener('storage', e => {
        if (e.key && e.key.indexOf(PREFIX) === 0) notify(e.key.slice(PREFIX.length));
    });

    function subscribe(col, fn) {
        (listeners[col] = listeners[col] || []).push(fn);
        setTimeout(fn, 0); // fire once right away, like Firestore does
        return () => { listeners[col] = listeners[col].filter(f => f !== fn); };
    }

    function doc(col, id) {
        return {
            id: id,
            get: () => Promise.resolve(makeDocSnap(id, readAll(col)[id])),
            set: data => { const all = readAll(col); all[id] = clone(data); writeAll(col, all); return Promise.resolve(); },
            update: data => {
                const all = readAll(col);
                if (all[id] === undefined) return Promise.reject(new Error('Document not found: ' + id));
                all[id] = Object.assign({}, all[id], clone(data));
                writeAll(col, all);
                return Promise.resolve();
            },
            delete: () => { const all = readAll(col); delete all[id]; writeAll(col, all); return Promise.resolve(); },
            onSnapshot: cb => subscribe(col, () => cb(makeDocSnap(id, readAll(col)[id])))
        };
    }

    window.db = {
        collection: col => ({
            doc: id => doc(col, id),
            get: () => Promise.resolve(makeQuerySnap(col)),
            onSnapshot: cb => subscribe(col, () => cb(makeQuerySnap(col)))
        })
    };

    // 🛡️ Backup & protection --------------------------------------------
    // Ask the browser not to clear our data automatically when space is low.
    // (A manual "Clear site data" still erases it — use the backup file for that.)
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

    const BACKUP_KEYS = k => k.indexOf(PREFIX) === 0 || k === 'BADMINTON_MANAGER_V7_DATA';

    window.exportAllData = function () {
        const dump = {};
        Object.keys(localStorage).filter(BACKUP_KEYS).forEach(k => { dump[k] = localStorage.getItem(k); });
        const blob = new Blob([JSON.stringify({ app: 'badminton-manager', version: 1, data: dump })], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'badminton-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    window.importAllData = function () {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(reader.result);
                    if (parsed.app !== 'badminton-manager' || !parsed.data) throw new Error('bad file');
                    if (!confirm('การนำเข้าจะแทนที่ข้อมูลทั้งหมดในเบราว์เซอร์นี้ ต้องการดำเนินการต่อหรือไม่?')) return;
                    Object.keys(localStorage).filter(BACKUP_KEYS).forEach(k => localStorage.removeItem(k));
                    Object.keys(parsed.data).filter(BACKUP_KEYS).forEach(k => localStorage.setItem(k, parsed.data[k]));
                    alert('นำเข้าข้อมูลเรียบร้อยแล้ว');
                    location.reload();
                } catch (err) {
                    alert('ไม่สามารถนำเข้าได้ กรุณาเลือกไฟล์สำรองข้อมูลที่ถูกต้อง');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    // 📸 Photos: shrunk to a small picture and saved inside the browser
    window.storage = {
        ref: path => {
            let result = null;
            return {
                put: file => new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onerror = reject;
                    reader.onload = () => {
                        const img = new Image();
                        img.onerror = reject;
                        img.onload = () => {
                            const MAX = 256;
                            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                            const canvas = document.createElement('canvas');
                            canvas.width = Math.round(img.width * scale);
                            canvas.height = Math.round(img.height * scale);
                            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                            result = canvas.toDataURL('image/jpeg', 0.8);
                            resolve();
                        };
                        img.src = reader.result;
                    };
                    reader.readAsDataURL(file);
                }),
                getDownloadURL: () => Promise.resolve(result)
            };
        }
    };
})();
