// ==========================================================
// ============== SECCIÓN DE CONFIGURACIÓN DEL BINGO ==============
// ==========================================================
const TOTAL_CARDS = 75;
const CARD_PRICE = 100;
const RESERVATION_TIME = 5 * 60 * 1000; // 5 minutos

// 🚨 EDITA ESTA CADENA PARA FIJAR LA HORA DEL PRÓXIMO BINGO 🚨
const BINGO_DATE_STRING = 'December 30, 2025 20:00:00'; 
const BINGO_DATE = new Date(BINGO_DATE_STRING).getTime(); 

// ==========================================================
// ============== FIN DE CONFIGURACIÓN DEL BINGO ==============
// ==========================================================

let selectedCards = JSON.parse(localStorage.getItem('omega_selected_cards')) || [];
let liveData = {};
let previewCard = null;
let timerInterval;
let adminClicks = 0;

// ================== INICIALIZACIÓN ==================
window.onload = () => {
    // Muestra la fecha del bingo
    document.getElementById('bingoDateDisplay').textContent = new Date(BINGO_DATE).toLocaleDateString('es-ES', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    });

    startRealtimeSync();
    startBingoTimer();
    
    const pendingTimer = localStorage.getItem('omega_payment_start');
    if (pendingTimer && selectedCards.length > 0) {
         startPaymentTimer(); 
    }

    document.getElementById('payFile').addEventListener('change', function(e) {
        if(this.files[0]) document.getElementById('fileNameDisplay').textContent = this.files[0].name;
    });
};

function saveLocalSelection() {
    localStorage.setItem('omega_selected_cards', JSON.stringify(selectedCards));
}

// ----------------------------------------------------
// =========== SINCRONIZACIÓN Y LIVE DATA ==========
// ----------------------------------------------------

function startRealtimeSync() {
    db.collection('ventasConfirmadas').onSnapshot(snap => {
        snap.docChanges().forEach(change => {
            const d = change.doc.data();
            (d.cards || []).forEach(c => {
                if(change.type === 'removed') delete liveData[c];
                else liveData[c] = { status: 'sold', ...d };
            });
        });
        updateUI();
        if(auth.currentUser) renderAdminSoldList();
    });

    db.collection('reservasPendientes').onSnapshot(snap => {
        snap.docChanges().forEach(change => {
            const d = change.doc.data();
            const docId = change.doc.id; 
            
            (d.cards || []).forEach(c => {
                const isSold = liveData[c]?.status === 'sold';
                if(change.type === 'removed') {
                    if (!isSold) delete liveData[c];
                } else {
                    if(!isSold) liveData[c] = { status: 'reserved', reservationId: docId, ...d };
                }
            });
        });
        updateUI(); 
        if(auth.currentUser) renderAdminPendingList();
    });

    auth.onAuthStateChanged(u => {
        if(u) {
            document.getElementById('clientContent').classList.add('d-none');
            document.getElementById('adminPanel').classList.remove('d-none');
            document.getElementById('adminLogin').classList.add('d-none');
            document.getElementById('adminDashboard').classList.remove('d-none');
        } else {
            document.getElementById('clientContent').classList.remove('d-none');
            document.getElementById('adminPanel').classList.add('d-none');
        }
    });
}

function updateUI() {
    let sold = 0;
    for(let i=1; i<=TOTAL_CARDS; i++) {
        if(liveData[i]?.status === 'sold') sold++;
    }
    document.getElementById('availableCount').textContent = TOTAL_CARDS - sold;
    
    // Si el modal de selección está abierto, refrescar rejilla
    const selectionModal = document.getElementById('cardSelectionModal');
    if(selectionModal && !selectionModal.classList.contains('d-none')) {
        renderGrid();
    }
}

// ----------------------------------------------------
// =========== MANEJO DE MODALES (BOOTSTRAP) ==========
// ----------------------------------------------------

function showCardSelectionModal() {
    closeAllModals();
    const modal = document.getElementById('cardSelectionModal');
    modal.classList.remove('d-none');
    modal.classList.add('d-flex'); 
    renderGrid();
    updateTotal();
}

function hideCardSelectionModal() {
    const modal = document.getElementById('cardSelectionModal');
    modal.classList.add('d-none');
    modal.classList.remove('d-flex');
}

function closeAllModals() {
    const modals = ['cardSelectionModal', 'cardPreviewModal', 'paymentProcessModal', 'legalModal'];
    modals.forEach(id => {
        const m = document.getElementById(id);
        if(m) {
            m.classList.add('d-none');
            m.classList.remove('d-flex');
        }
    });
}

// ----------------------------------------------------
// =========== RENDERIZADO DE TABLAS (GRID) ===========
// ----------------------------------------------------

function renderGrid() {
    const container = document.getElementById('cardListContainer');
    container.innerHTML = '';
    
    for(let i=1; i<=TOTAL_CARDS; i++) {
        const st = getStatus(i);
        let tag = 'VER';
        if(st === 'sold') tag = 'VENDIDA';
        if(st === 'reserved') tag = 'OCUPADA'; 
        if(st === 'selected') tag = 'TUYA'; 

        // Usamos columnas de Bootstrap: 2 columnas en móvil (col-6), 4 en PC (col-md-3)
        const colDiv = document.createElement('div');
        colDiv.className = `col-4 col-sm-3 col-md-2 text-center mb-3`;
        
        colDiv.innerHTML = `
            <div class="bingo-ball-container status-${st}">
                <div class="bingo-ball mb-1" onclick="handleBallClick(${i}, '${st}')">${i}</div>
                <span class="badge w-100 ${getTagClass(st)}" onclick="openPreview(${i})">${tag}</span>
            </div>
        `;
        container.appendChild(colDiv);
    }
}

function getTagClass(st) {
    if(st === 'sold') return 'bg-danger';
    if(st === 'reserved') return 'bg-warning text-dark';
    if(st === 'selected') return 'bg-success';
    return 'bg-primary';
}

function getStatus(n) {
    if(liveData[n]?.status === 'sold') return 'sold';
    if(liveData[n]?.status === 'reserved') return 'reserved';
    if(selectedCards.includes(n)) return 'selected'; 
    return 'available';
}

function handleBallClick(n, st) {
    if(st === 'sold' || st === 'reserved') {
        openPreview(n);
    } else {
        if(selectedCards.includes(n)) {
            selectedCards = selectedCards.filter(x => x !== n);
        } else {
            selectedCards.push(n);
        }
        saveLocalSelection(); 
        updateTotal();
        renderGrid(); 
    }
}

function updateTotal() {
    const tot = selectedCards.length * CARD_PRICE;
    document.getElementById('totalCostDisplay').textContent = `Bs. ${tot.toFixed(2)}`;
}

// ----------------------------------------------------
// =========== PREVIEW Y PAGO =========================
// ----------------------------------------------------

function openPreview(n) {
    previewCard = n;
    const st = getStatus(n);
    const d = liveData[n];
    const btn = document.getElementById('btnPreviewAction');
    const txt = document.getElementById('previewStatusText');
    
    document.getElementById('previewNum').textContent = n;
    document.getElementById('previewImgContainer').innerHTML = `<img src="./tablas/tabla_${n}.png" class="img-fluid rounded shadow-sm" style="max-height:250px" onerror="this.src='https://placehold.co/300?text=Tabla+${n}'">`;
    
    btn.className = "btn w-100 fw-bold";
    if(st === 'sold') {
        txt.innerHTML = `<span class="text-danger">❌ VENDIDA</span><br><small>${d.name || 'Otro jugador'}</small>`;
        btn.classList.add('d-none');
    } else if(st === 'reserved') {
        txt.innerHTML = `<span class="text-warning">⏳ OCUPADA</span><br><small>En espera de pago</small>`;
        btn.classList.add('d-none');
    } else {
        const isSel = selectedCards.includes(n);
        txt.textContent = isSel ? "¿Deseas quitarla?" : "¿Te gusta esta tabla?";
        btn.classList.remove('d-none');
        btn.textContent = isSel ? "QUITAR" : "AGREGAR";
        btn.classList.add(isSel ? 'btn-danger' : 'btn-success');
        btn.onclick = () => {
            handleBallClick(n, st);
            closePreview();
        };
    }
    
    document.getElementById('cardSelectionModal').classList.add('d-none');
    const previewModal = document.getElementById('cardPreviewModal');
    previewModal.classList.remove('d-none');
    previewModal.classList.add('d-flex');
}

function closePreview() {
    document.getElementById('cardPreviewModal').classList.add('d-none');
    document.getElementById('cardPreviewModal').classList.remove('d-flex');
    showCardSelectionModal();
}

function preparePayment() {
    if(selectedCards.length === 0) return alert("Selecciona al menos una tabla");
    
    if (!localStorage.getItem('omega_payment_start')) {
        localStorage.setItem('omega_payment_start', Date.now());
    }

    closeAllModals();
    const payModal = document.getElementById('paymentProcessModal');
    payModal.classList.remove('d-none');
    payModal.classList.add('d-flex');
    
    document.getElementById('payCardsList').textContent = selectedCards.join(', ');
    document.getElementById('payTotal').textContent = `Bs. ${(selectedCards.length * CARD_PRICE).toFixed(2)}`;
    
    startPaymentTimer();
}

// (Mantenemos el resto de funciones: submitPayment, Admin, Timer, etc. exactamente igual ya que no dependen del diseño visual directo)

async function submitPayment() {
    const YOUR_CLOUD_NAME = "dwhsdurag"; 
    const YOUR_UPLOAD_PRESET = "bingo_comprobantes"; 
    
    const name = document.getElementById('payName').value;
    const phone = document.getElementById('payPhone').value.replace(/\D/g,'');
    const ref = document.getElementById('payRef').value;
    const file = document.getElementById('payFile').files[0];
    const statusMsg = document.getElementById('uploadStatus');

    if(!name || phone.length < 10 || !ref || !file) {
        statusMsg.textContent = "Datos incompletos.";
        statusMsg.classList.remove('d-none');
        return;
    }

    statusMsg.textContent = "Subiendo... ⏳";
    statusMsg.className = "text-center small mt-2 fw-bold text-primary";
    statusMsg.classList.remove('d-none');

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', YOUR_UPLOAD_PRESET);
        const uploadUrl = `https://api.cloudinary.com/v1_1/${YOUR_CLOUD_NAME}/image/upload`;

        const response = await fetch(uploadUrl, { method: 'POST', body: formData });
        const data = await response.json();
        
        await db.collection('reservasPendientes').add({ 
            name, phone, reference: ref, proofURL: data.secure_url, 
            cards: selectedCards, totalAmount: selectedCards.length * CARD_PRICE,
            timestamp: Date.now(), status: 'PENDING_CONFIRMATION'
        });

        confetti({ particleCount: 100, spread: 70 });
        selectedCards = [];
        localStorage.removeItem('omega_selected_cards');
        localStorage.removeItem('omega_payment_start');
        
        alert("¡Recibido! Espera la confirmación.");
        location.reload();
    } catch(e) {
        statusMsg.textContent = "Error al enviar.";
    }
}

// ... (El resto de tus funciones como searchCardByPhone, adminLogin, startBingoTimer, copyToClipboard se quedan igual) ...

function startPaymentTimer() {
    const display = document.getElementById('paymentTimer');
    clearInterval(timerInterval);
    const startTime = parseInt(localStorage.getItem('omega_payment_start'));
    if (!startTime) return; 

    timerInterval = setInterval(() => {
        const now = Date.now();
        const remaining = 300 - Math.floor((now - startTime) / 1000);
        if (remaining <= 0) {
            clearInterval(timerInterval);
            localStorage.clear();
            alert("Tiempo agotado.");
            location.reload();
        }
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        display.textContent = `${m}:${s < 10 ? '0' + s : s}`;
    }, 1000);
}

function showToast(message) {
    const toast = document.getElementById("toast-notification");
    document.getElementById("toast-message").textContent = message;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function copyToClipboard(txt) {
    navigator.clipboard.writeText(txt).then(() => showToast("Copiado: " + txt));
}

function startBingoTimer() {
    const countdownDisplay = document.getElementById('countdownTimer');
    setInterval(() => {
        const dist = BINGO_DATE - new Date().getTime();
        if (dist < 0) return countdownDisplay.textContent = "¡VIVO!";
        const h = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((dist % (1000 * 60)) / 1000);
        countdownDisplay.textContent = `${h}:${m}:${s}`;
    }, 1000);
}

// SECCIÓN LEGAL
function showLegalModal(type) {
    const modal = document.getElementById('legalModal');
    modal.classList.remove('d-none');
    modal.classList.add('d-flex');
}
function hideLegalModal() {
    document.getElementById('legalModal').classList.add('d-none');
}

// LOGO ADMIN TRICK
document.getElementById('footer-logo').addEventListener('click', () => {
    adminClicks++;
    if(adminClicks >= 6) {
        document.getElementById('clientContent').classList.add('d-none');
        document.getElementById('adminPanel').classList.remove('d-none');
    }
});
