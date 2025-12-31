// ============================================
// CONFIGURACIÓN INICIAL
// ============================================
const TOTAL_CARDS = 75;
const CARD_PRICE = 300;
const BINGO_DATE_STRING = 'December 23, 2024 20:00:00';
const BINGO_DATE = new Date(BINGO_DATE_STRING).getTime();

// Variables globales
let selectedCards = JSON.parse(localStorage.getItem('omega_selected_cards')) || [];
let liveData = {};
let timerInterval;
let adminClicks = 0;
let isStoreOpen = true;
let currentSala = 'BINGO_TRADICIONAL';
let auth = null;
let db = null;

// ============================================
// INICIALIZACIÓN DE FIREBASE
// ============================================
function initializeFirebase() {
    // Tu configuración Firebase se carga desde firebase-config.js
    // Esta función se llama desde firebase-config.js
    auth = firebase.auth();
    db = firebase.firestore();
    startRealtimeSync();
}

// ============================================
// MANEJO DE ESTADO DE LA TIENDA
// ============================================
function checkStoreStatus() {
    db.collection('config').doc('general').onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            isStoreOpen = data.isStoreOpen !== false;
            updateStoreUI();
        }
    });
}

function updateStoreUI() {
    const maintenanceOverlay = document.getElementById('maintenanceOverlay');
    const maintenanceBtn = document.getElementById('maintenanceBtn');
    const storeStatusText = document.getElementById('storeStatusText');
    const maintenanceToggle = document.getElementById('maintenanceToggle');
    
    if (isStoreOpen) {
        maintenanceOverlay.classList.add('hidden');
        if (maintenanceBtn) maintenanceBtn.innerHTML = '<i class="fas fa-power-off mr-2"></i> Cerrar Página';
        if (storeStatusText) storeStatusText.textContent = 'Estado: Abierta al público';
        if (storeStatusText) storeStatusText.className = 'text-lg font-bold text-green-600';
        if (maintenanceToggle) maintenanceToggle.checked = false;
    } else {
        maintenanceOverlay.classList.remove('hidden');
        if (maintenanceBtn) maintenanceBtn.innerHTML = '<i class="fas fa-power-on mr-2"></i> Abrir Página';
        if (storeStatusText) storeStatusText.textContent = 'Estado: Cerrada (solo admin)';
        if (storeStatusText) storeStatusText.className = 'text-lg font-bold text-red-600';
        if (maintenanceToggle) maintenanceToggle.checked = true;
    }
}

function toggleMaintenance() {
    const newState = !isStoreOpen;
    db.collection('config').doc('general').set({
        isStoreOpen: newState,
        lastUpdated: new Date().toISOString(),
        updatedBy: auth.currentUser ? auth.currentUser.email : 'system'
    }, { merge: true })
    .then(() => {
        console.log(`Tienda ${newState ? 'abierta' : 'cerrada'}`);
    })
    .catch((error) => {
        console.error('Error al cambiar estado:', error);
        alert('Error al cambiar el estado de la tienda');
    });
}

// ============================================
// FUNCIONES DE INICIALIZACIÓN
// ============================================
window.onload = () => {
    // Inicializar Firebase
    initializeFirebase();
    
    // Configurar fecha del bingo
    document.getElementById('bingoDateDisplay').textContent = formatDate(BINGO_DATE);
    
    // Inicializar temporizador
    startBingoTimer();
    
    // Verificar estado de la tienda
    checkStoreStatus();
    
    // Configurar event listeners
    setupEventListeners();
    
    // Inicializar selección local
    updateSelectedCount();
    
    // Inicializar copy functionality
    initializeCopyButtons();
};

function setupEventListeners() {
    // File upload
    document.getElementById('payFile').addEventListener('change', function(e) {
        if (this.files[0]) {
            document.getElementById('fileNameDisplay').textContent = this.files[0].name;
        }
    });
    
    // Form submission
    document.getElementById('paymentForm').addEventListener('submit', function(e) {
        e.preventDefault();
        submitPayment();
    });
    
    // Copy buttons
    document.querySelectorAll('.copyable').forEach(button => {
        button.addEventListener('click', function() {
            const text = this.getAttribute('data-text');
            copyToClipboard(text);
        });
    });
}

function initializeCopyButtons() {
    const copyButtons = document.querySelectorAll('.copyable');
    copyButtons.forEach(button => {
        button.addEventListener('click', function() {
            const text = this.getAttribute('data-text');
            copyToClipboard(text);
            
            // Feedback visual
            const originalText = this.innerHTML;
            this.innerHTML = '<i class="fas fa-check mr-2"></i> Copiado!';
            setTimeout(() => {
                this.innerHTML = originalText;
            }, 2000);
        });
    });
}

// ============================================
// FUNCIONES DE SINCRONIZACIÓN EN TIEMPO REAL
// ============================================
function startRealtimeSync() {
    // Escuchar ventas confirmadas
    db.collection('ventasConfirmadas').onSnapshot((snap) => {
        snap.docChanges().forEach((change) => {
            const d = change.doc.data();
            (d.cards || []).forEach(c => {
                if (change.type === 'removed') {
                    delete liveData[c];
                } else {
                    liveData[c] = { status: 'sold', ...d };
                }
            });
        });
        updateUI();
        if (auth.currentUser) {
            renderAdminSoldList();
            updateAdminStats();
        }
    });

    // Escuchar reservas pendientes
    db.collection('reservasPendientes').onSnapshot((snap) => {
        snap.docChanges().forEach((change) => {
            const d = change.doc.data();
            const docId = change.doc.id;
            
            (d.cards || []).forEach(c => {
                const isSold = liveData[c]?.status === 'sold';
                if (change.type === 'removed') {
                    if (!isSold) delete liveData[c];
                } else {
                    if (!isSold) liveData[c] = { status: 'reserved', reservationId: docId, ...d };
                }
            });
        });
        updateUI();
        if (auth.currentUser) renderAdminPendingList();
    });
    
    // Estado de autenticación
    auth.onAuthStateChanged((user) => {
        if (user) {
            // Usuario autenticado
            if (document.getElementById('adminPanel').classList.contains('hidden') === false) {
                document.getElementById('adminLogin').classList.add('hidden');
                document.getElementById('adminDashboard').classList.remove('hidden');
            }
        }
    });
}

// ============================================
// FUNCIONES DE LA INTERFAZ
// ============================================
function updateUI() {
    let sold = 0;
    for (let i = 1; i <= TOTAL_CARDS; i++) {
        if (liveData[i]?.status === 'sold') sold++;
    }
    document.getElementById('availableCount').textContent = TOTAL_CARDS - sold;
    
    const selectionModal = document.getElementById('cardSelectionModal');
    if (selectionModal && selectionModal.style.display === 'flex') {
        renderGrid();
    }
}

function renderGrid() {
    const container = document.getElementById('cardListContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (let i = 1; i <= TOTAL_CARDS; i++) {
        const status = getStatus(i);
        const card = document.createElement('div');
        card.className = `card-item ${status}`;
        card.textContent = i;
        card.onclick = () => handleCardClick(i, status);
        
        container.appendChild(card);
    }
}

function getStatus(cardNumber) {
    if (liveData[cardNumber]?.status === 'sold') return 'sold';
    if (liveData[cardNumber]?.status === 'reserved') return 'reserved';
    if (selectedCards.includes(cardNumber)) return 'selected';
    return 'available';
}

function handleCardClick(cardNumber, status) {
    if (status === 'sold' || status === 'reserved') {
        alert(`Esta tabla ya está ${status === 'sold' ? 'vendida' : 'reservada'}`);
        return;
    }
    
    const index = selectedCards.indexOf(cardNumber);
    if (index > -1) {
        selectedCards.splice(index, 1);
    } else {
        selectedCards.push(cardNumber);
    }
    
    saveLocalSelection();
    updateSelectedCount();
    renderGrid();
}

function saveLocalSelection() {
    localStorage.setItem('omega_selected_cards', JSON.stringify(selectedCards));
}

function updateSelectedCount() {
    const count = selectedCards.length;
    document.getElementById('selectedCount').textContent = count;
    document.getElementById('totalCostDisplay').textContent = `Bs. ${(count * CARD_PRICE).toFixed(2)}`;
    
    const continueBtn = document.getElementById('continueBtn');
    if (count > 0) {
        continueBtn.disabled = false;
    } else {
        continueBtn.disabled = true;
    }
}

// ============================================
// MODALES
// ============================================
function showCardSelectionModal() {
    hideAllModals();
    document.getElementById('cardSelectionModal').style.display = 'flex';
    renderGrid();
    updateSelectedCount();
}

function hideCardSelectionModal() {
    document.getElementById('cardSelectionModal').style.display = 'none';
}

function preparePayment() {
    if (selectedCards.length === 0) {
        alert('Selecciona al menos una tabla');
        return;
    }
    
    // Verificar conflictos
    let conflicts = [];
    let validCards = [];
    
    selectedCards.forEach(card => {
        const status = getStatus(card);
        if (status === 'available' || status === 'selected') {
            validCards.push(card);
        } else {
            conflicts.push(card);
        }
    });
    
    if (conflicts.length > 0) {
        alert(`Las siguientes tablas ya no están disponibles: ${conflicts.join(', ')}`);
        selectedCards = validCards;
        saveLocalSelection();
        updateSelectedCount();
        renderGrid();
    }
    
    if (selectedCards.length === 0) {
        alert('Por favor selecciona tablas disponibles');
        return;
    }
    
    // Configurar modal de pago
    document.getElementById('payCardsList').textContent = selectedCards.join(', ');
    document.getElementById('payTotal').textContent = `Bs. ${(selectedCards.length * CARD_PRICE).toFixed(2)}`;
    
    // Resetear formulario
    document.getElementById('paymentForm').reset();
    document.getElementById('fileNameDisplay').textContent = '';
    document.getElementById('uploadStatus').classList.add('hidden');
    
    // Iniciar temporizador
    startPaymentTimer();
    
    // Mostrar modal
    hideCardSelectionModal();
    document.getElementById('paymentProcessModal').style.display = 'flex';
}

function hidePaymentModal() {
    document.getElementById('paymentProcessModal').style.display = 'none';
    clearInterval(timerInterval);
}

function hideAllModals() {
    document.getElementById('cardSelectionModal').style.display = 'none';
    document.getElementById('paymentProcessModal').style.display = 'none';
    document.getElementById('legalModal').style.display = 'none';
}

// ============================================
// TEMPORIZADOR DE PAGO
// ============================================
function startPaymentTimer() {
    const display = document.getElementById('paymentTimer');
    let timeLeft = 300; // 5 minutos en segundos
    
    clearInterval(timerInterval);
    
    function updateTimer() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        display.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            alert('Tiempo agotado. Las tablas han sido liberadas.');
            selectedCards = [];
            saveLocalSelection();
            hidePaymentModal();
        }
        
        timeLeft--;
    }
    
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
}

// ============================================
// PROCESO DE PAGO
// ============================================
async function submitPayment() {
    const YOUR_CLOUD_NAME = "dcenrp74j";
    const YOUR_UPLOAD_PRESET = "bingo_comprobantes";
    
    const name = document.getElementById('payName').value.trim();
    const phone = document.getElementById('payPhone').value.replace(/\D/g, '');
    const ref = document.getElementById('payRef').value.trim();
    const file = document.getElementById('payFile').files[0];
    const statusMsg = document.getElementById('uploadStatus');
    
    // Validaciones
    if (!name || name.length < 3) {
        showError('Por favor ingresa tu nombre completo');
        return;
    }
    
    if (phone.length < 10) {
        showError('Por favor ingresa un número de teléfono válido');
        return;
    }
    
    if (!ref || ref.length < 4) {
        showError('Por favor ingresa los últimos 4 dígitos de la referencia');
        return;
    }
    
    if (!file) {
        showError('Por favor sube el comprobante de pago');
        return;
    }
    
    // Verificar que las tablas aún estén disponibles
    for (const card of selectedCards) {
        const status = getStatus(card);
        if (status === 'sold' || status === 'reserved') {
            showError(`La tabla ${card} ya no está disponible. Por favor actualiza tu selección.`);
            return;
        }
    }
    
    statusMsg.textContent = 'Subiendo comprobante...';
    statusMsg.className = 'upload-status text-blue-600';
    statusMsg.classList.remove('hidden');
    
    try {
        // Subir imagen a Cloudinary
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', YOUR_UPLOAD_PRESET);
        formData.append('public_id', `bingo_${phone}_${Date.now()}`);
        
        const uploadUrl = `https://api.cloudinary.com/v1_1/${YOUR_CLOUD_NAME}/image/upload`;
        const response = await fetch(uploadUrl, { method: 'POST', body: formData });
        const data = await response.json();
        
        if (!response.ok || !data.secure_url) {
            throw new Error(data.error?.message || 'Error al subir la imagen');
        }
        
        const proofURL = data.secure_url;
        
        // Crear reserva en Firestore
        const reservationData = {
            name: name,
            phone: phone,
            reference: ref,
            proofURL: proofURL,
            cards: selectedCards,
            totalAmount: selectedCards.length * CARD_PRICE,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'PENDING_CONFIRMATION',
            sala: currentSala
        };
        
        await db.collection('reservasPendientes').add(reservationData);
        
        // Éxito
        statusMsg.textContent = '¡Reserva enviada con éxito! Serás contactado pronto para confirmación.';
        statusMsg.className = 'upload-status text-green-600';
        
        // Confetti celebration
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
        
        // Limpiar y cerrar
        setTimeout(() => {
            selectedCards = [];
            saveLocalSelection();
            hidePaymentModal();
            clearInterval(timerInterval);
            showCardSelectionModal();
        }, 3000);
        
    } catch (error) {
        console.error('Error en el proceso de pago:', error);
        showError(`Error: ${error.message}`);
    }
}

function showError(message) {
    const statusMsg = document.getElementById('uploadStatus');
    statusMsg.textContent = message;
    statusMsg.className = 'upload-status text-red-600';
    statusMsg.classList.remove('hidden');
}

// ============================================
// CONSULTAS
// ============================================
async function searchCardByPhone() {
    const phone = document.getElementById('searchPhoneInput').value.replace(/\D/g, '');
    
    if (phone.length < 10) {
        alert('Por favor ingresa un número de teléfono válido');
        return;
    }
    
    const resultArea = document.getElementById('searchResultArea');
    const resultContent = document.getElementById('resultContent');
    const resultTitle = document.getElementById('resultTitle');
    const resultStatus = document.getElementById('resultStatus');
    
    resultArea.classList.remove('hidden');
    resultContent.innerHTML = '<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-purple-600"></i><p class="mt-4">Buscando reservas...</p></div>';
    
    try {
        // Buscar en reservas pendientes
        const pendingQuery = await db.collection('reservasPendientes')
            .where('phone', '==', phone)
            .get();
        
        // Buscar en ventas confirmadas
        const soldQuery = await db.collection('ventasConfirmadas')
            .where('phone', '==', phone)
            .get();
        
        let allCards = [];
        
        pendingQuery.forEach(doc => {
            const data = doc.data();
            data.cards.forEach(card => {
                allCards.push({
                    number: card,
                    status: 'PENDIENTE',
                    reservationId: doc.id,
                    data: data
                });
            });
        });
        
        soldQuery.forEach(doc => {
            const data = doc.data();
            data.cards.forEach(card => {
                allCards.push({
                    number: card,
                    status: 'VENDIDA',
                    saleId: doc.id,
                    data: data
                });
            });
        });
        
        if (allCards.length === 0) {
            resultTitle.textContent = `Teléfono: ${phone}`;
            resultContent.innerHTML = '<p class="text-center text-gray-600 py-10">No se encontraron reservas para este número de teléfono.</p>';
            resultStatus.textContent = '';
            return;
        }
        
        resultTitle.textContent = `Reservas para: ${phone}`;
        resultContent.innerHTML = '';
        
        allCards.forEach(card => {
            const cardDiv = document.createElement('div');
            cardDiv.className = `card-result ${card.status.toLowerCase()}`;
            cardDiv.innerHTML = `
                <div class="text-center">
                    <div class="text-2xl font-bold ${card.status === 'VENDIDA' ? 'text-green-600' : 'text-yellow-600'}">${card.number}</div>
                    <div class="status-badge ${card.status === 'VENDIDA' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                        ${card.status}
                    </div>
                    ${card.data.name ? `<p class="text-sm mt-2">Nombre: ${card.data.name}</p>` : ''}
                </div>
            `;
            resultContent.appendChild(cardDiv);
        });
        
        resultStatus.textContent = `Total: ${allCards.length} tabla(s)`;
        
    } catch (error) {
        console.error('Error en la búsqueda:', error);
        resultContent.innerHTML = '<p class="text-center text-red-600 py-10">Error al buscar reservas. Por favor intenta nuevamente.</p>';
    }
}

async function searchCard() {
    const cardNumber = parseInt(document.getElementById('cardNumberInput').value);
    
    if (!cardNumber || cardNumber < 1 || cardNumber > TOTAL_CARDS) {
        alert('Por favor ingresa un número de tabla válido (1-75)');
        return;
    }
    
    const resultArea = document.getElementById('searchResultArea');
    const resultContent = document.getElementById('resultContent');
    const resultTitle = document.getElementById('resultTitle');
    const resultStatus = document.getElementById('resultStatus');
    
    resultArea.classList.remove('hidden');
    resultContent.innerHTML = '<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-purple-600"></i><p class="mt-4">Buscando tabla...</p></div>';
    
    try {
        // Buscar en todas las colecciones
        const status = getStatus(cardNumber);
        let cardData = null;
        
        if (liveData[cardNumber]) {
            cardData = liveData[cardNumber];
        }
        
        resultTitle.textContent = `Tabla #${cardNumber}`;
        resultContent.innerHTML = '';
        
        const cardDiv = document.createElement('div');
        cardDiv.className = 'text-center';
        
        // Mostrar imagen de la tabla
        cardDiv.innerHTML += `
            <img src="./tablas/tabla_${cardNumber}.png" 
                 onerror="this.src='https://placehold.co/300x200?text=Tabla+${cardNumber}'"
                 class="w-64 h-auto mx-auto mb-4 rounded-lg border-4 ${getStatusColor(status)}">
        `;
        
        // Mostrar estado
        const statusText = getStatusText(status);
        cardDiv.innerHTML += `
            <div class="text-xl font-bold ${getStatusTextColor(status)} mb-2">${statusText}</div>
        `;
        
        // Mostrar información adicional si está reservada o vendida
        if (cardData) {
            cardDiv.innerHTML += `
                <div class="bg-gray-100 p-4 rounded-lg mt-4">
                    <p class="font-bold">Información:</p>
                    <p>Nombre: ${cardData.name || 'No disponible'}</p>
                    <p>Teléfono: ${cardData.phone || 'No disponible'}</p>
                    ${cardData.reference ? `<p>Referencia: ${cardData.reference}</p>` : ''}
                </div>
            `;
        }
        
        resultContent.appendChild(cardDiv);
        resultStatus.textContent = '';
        
    } catch (error) {
        console.error('Error en la búsqueda:', error);
        resultContent.innerHTML = '<p class="text-center text-red-600 py-10">Error al buscar la tabla. Por favor intenta nuevamente.</p>';
    }
}

function getStatusText(status) {
    switch(status) {
        case 'available': return 'DISPONIBLE';
        case 'selected': return 'SELECCIONADA';
        case 'reserved': return 'RESERVADA';
        case 'sold': return 'VENDIDA';
        default: return 'DESCONOCIDO';
    }
}

function getStatusColor(status) {
    switch(status) {
        case 'available': return 'border-purple-500';
        case 'selected': return 'border-yellow-500';
        case 'reserved': return 'border-orange-500';
        case 'sold': return 'border-green-500';
        default: return 'border-gray-500';
    }
}

function getStatusTextColor(status) {
    switch(status) {
        case 'available': return 'text-purple-600';
        case 'selected': return 'text-yellow-600';
        case 'reserved': return 'text-orange-600';
        case 'sold': return 'text-green-600';
        default: return 'text-gray-600';
    }
}

function hideSearchResults() {
    document.getElementById('searchResultArea').classList.add('hidden');
}

// ============================================
// TEMPORIZADOR DEL BINGO
// ============================================
function startBingoTimer() {
    const countdownDisplay = document.getElementById('countdownTimer');
    
    function updateTimer() {
        const now = new Date().getTime();
        const dist = BINGO_DATE - now;
        
        if (dist < 0) {
            countdownDisplay.textContent = "¡EN VIVO AHORA!";
            countdownDisplay.className = "info-value text-green-400 animate-pulse";
            return;
        }
        
        const days = Math.floor(dist / (1000 * 60 * 60 * 24));
        const hours = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((dist % (1000 * 60)) / 1000);
        
        if (days > 0) {
            countdownDisplay.textContent = `${days}d ${hours}h ${minutes}m`;
        } else {
            countdownDisplay.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }
    
    updateTimer();
    setInterval(updateTimer, 1000);
}

// ============================================
// PANEL DE ADMINISTRACIÓN
// ============================================
function handleLogoClick() {
    adminClicks++;
    if (adminClicks >= 5) {
        showAdminPanel();
        adminClicks = 0;
    }
}

function showAdminPanel() {
    document.getElementById('clientContent').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    
    if (auth.currentUser) {
        document.getElementById('adminLogin').classList.add('hidden');
        document.getElementById('adminDashboard').classList.remove('hidden');
        loadAdminData();
    }
}

function adminLogin() {
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    const errorMsg = document.getElementById('adminLoginError');
    
    if (!email || !password) {
        errorMsg.textContent = 'Por favor ingresa correo y contraseña';
        errorMsg.classList.remove('hidden');
        return;
    }
    
    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            errorMsg.classList.add('hidden');
            document.getElementById('adminLogin').classList.add('hidden');
            document.getElementById('adminDashboard').classList.remove('hidden');
            loadAdminData();
        })
        .catch((error) => {
            errorMsg.textContent = 'Error: ' + error.message;
            errorMsg.classList.remove('hidden');
        });
}

function adminLogout() {
    auth.signOut()
        .then(() => {
            document.getElementById('clientContent').classList.remove('hidden');
            document.getElementById('adminPanel').classList.add('hidden');
            document.getElementById('adminLogin').classList.remove('hidden');
            document.getElementById('adminDashboard').classList.add('hidden');
        })
        .catch((error) => {
            console.error('Error al cerrar sesión:', error);
        });
}

function loadAdminData() {
    renderAdminPendingList();
    renderAdminSoldList();
    updateAdminStats();
}

function renderAdminPendingList() {
    const container = document.getElementById('pendingCardsList');
    if (!container) return;
    
    db.collection('reservasPendientes')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snap) => {
            container.innerHTML = '';
            document.getElementById('pendingCount').textContent = snap.size;
            
            if (snap.size === 0) {
                container.innerHTML = '<p class="text-center text-gray-500 py-10">No hay reservas pendientes</p>';
                return;
            }
            
            snap.forEach((doc) => {
                const data = doc.data();
                const item = document.createElement('div');
                item.className = 'pending-item';
                item.innerHTML = `
                    <div class="pending-header">
                        <div>
                            <h4 class="font-bold">${data.name}</h4>
                            <p class="text-sm text-gray-600">${data.phone}</p>
                        </div>
                        <div class="text-right">
                            <p class="font-bold text-green-600">Bs. ${data.totalAmount}</p>
                            <p class="text-xs text-gray-500">${formatFirestoreDate(data.timestamp)}</p>
                        </div>
                    </div>
                    <p class="text-sm">Tablas: <span class="font-bold">${data.cards.join(', ')}</span></p>
                    <p class="text-sm">Referencia: <span class="font-bold">${data.reference}</span></p>
                    <div class="pending-actions">
                        <button onclick="confirmSale('${doc.id}')" class="btn-approve">
                            <i class="fas fa-check mr-2"></i> APROBAR
                        </button>
                        <button onclick="rejectSale('${doc.id}')" class="btn-reject">
                            <i class="fas fa-times mr-2"></i> RECHAZAR
                        </button>
                    </div>
                `;
                container.appendChild(item);
            });
        });
}

function renderAdminSoldList() {
    const tbody = document.getElementById('soldPlayersTableBody');
    if (!tbody) return;
    
    db.collection('ventasConfirmadas')
        .orderBy('saleDate', 'desc')
        .limit(50)
        .onSnapshot((snap) => {
            tbody.innerHTML = '';
            document.getElementById('soldCount').textContent = snap.size;
            
            snap.forEach((doc) => {
                const data = doc.data();
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="font-bold">${data.name || 'N/A'}</td>
                    <td>${data.phone || 'N/A'}</td>
                    <td><span class="font-bold text-green-600">${data.cards?.join(', ') || 'N/A'}</span></td>
                    <td>Bs. ${data.totalAmount || '0'}</td>
                    <td class="text-sm">${formatFirestoreDate(data.saleDate)}</td>
                    <td>
                        <button onclick="deleteSale('${doc.id}')" class="btn-delete">
                            <i class="fas fa-trash mr-1"></i> Eliminar
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        });
}

async function updateAdminStats() {
    try {
        // Contar tablas vendidas
        const soldSnap = await db.collection('ventasConfirmadas').get();
        let totalSold = 0;
        let totalRevenue = 0;
        
        soldSnap.forEach(doc => {
            const data = doc.data();
            totalSold += data.cards?.length || 0;
            totalRevenue += data.totalAmount || 0;
        });
        
        document.getElementById('totalSold').textContent = totalSold;
        document.getElementById('totalRevenue').textContent = `Bs. ${totalRevenue.toFixed(2)}`;
        
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
    }
}

async function confirmSale(reservationId) {
    if (!confirm('¿Confirmar venta de estas tablas?')) return;
    
    try {
        const doc = await db.collection('reservasPendientes').doc(reservationId).get();
        if (!doc.exists) {
            alert('La reserva ya no existe');
            return;
        }
        
        const data = doc.data();
        
        // Verificar que las tablas aún estén disponibles
        let availableCards = [];
        let conflicts = [];
        
        data.cards.forEach(card => {
            const status = liveData[card]?.status;
            if (status === 'sold' || status === 'reserved') {
                conflicts.push(card);
            } else {
                availableCards.push(card);
            }
        });
        
        if (conflicts.length > 0) {
            alert(`Algunas tablas ya no están disponibles: ${conflicts.join(', ')}. Solo se confirmarán: ${availableCards.join(', ')}`);
        }
        
        if (availableCards.length === 0) {
            alert('No hay tablas disponibles para confirmar');
            return;
        }
        
        // Mover a ventas confirmadas
        await db.collection('ventasConfirmadas').add({
            ...data,
            cards: availableCards,
            saleDate: firebase.firestore.FieldValue.serverTimestamp(),
            confirmedBy: auth.currentUser.email
        });
        
        // Eliminar reserva pendiente
        await db.collection('reservasPendientes').doc(reservationId).delete();
        
        alert(`Venta confirmada para tablas: ${availableCards.join(', ')}`);
        
    } catch (error) {
        console.error('Error al confirmar venta:', error);
        alert('Error al confirmar la venta');
    }
}

async function rejectSale(reservationId) {
    if (!confirm('¿Rechazar y liberar estas tablas?')) return;
    
    try {
        await db.collection('reservasPendientes').doc(reservationId).delete();
        alert('Reserva rechazada y tablas liberadas');
    } catch (error) {
        console.error('Error al rechazar reserva:', error);
        alert('Error al rechazar la reserva');
    }
}

async function deleteSale(saleId) {
    if (!confirm('¿Eliminar esta venta del historial?')) return;
    
    try {
        await db.collection('ventasConfirmadas').doc(saleId).delete();
        alert('Venta eliminada del historial');
    } catch (error) {
        console.error('Error al eliminar venta:', error);
        alert('Error al eliminar la venta');
    }
}

// ============================================
// FUNCIONES UTILITARIAS
// ============================================
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatFirestoreDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
        .then(() => {
            console.log('Texto copiado:', text);
        })
        .catch(err => {
            console.error('Error al copiar:', err);
        });
}

// ============================================
// MODALES LEGALES
// ============================================
const legalContent = {
    terms: `
        <h2 class="text-xl font-bold text-gray-900 mb-4">Términos y Condiciones</h2>
        <div class="space-y-4">
            <p>Estos términos y condiciones rigen el uso de la plataforma OMEGA BINGO.</p>
            <p>Al reservar tablas, aceptas nuestros términos y condiciones.</p>
            <p>El juego es para mayores de 18 años.</p>
        </div>
    `,
    privacy: `
        <h2 class="text-xl font-bold text-gray-900 mb-4">Política de Privacidad</h2>
        <div class="space-y-4">
            <p>Respetamos tu privacidad y protegemos tus datos personales.</p>
            <p>La información proporcionada solo se utiliza para procesar tus reservas.</p>
            <p>No compartimos tu información con terceros sin tu consentimiento.</p>
        </div>
    `
};

function showLegalModal(type) {
    const modal = document.getElementById('legalModal');
    const title = document.getElementById('legalModalTitle');
    const body = document.getElementById('legalModalBody');
    
    if (type === 'terms') {
        title.textContent = 'Términos y Condiciones';
        body.innerHTML = legalContent.terms;
    } else if (type === 'privacy') {
        title.textContent = 'Política de Privacidad';
        body.innerHTML = legalContent.privacy;
    }
    
    modal.style.display = 'flex';
}

function hideLegalModal() {
    document.getElementById('legalModal').style.display = 'none';
}

// ============================================
// INICIALIZACIÓN CUANDO FIREBASE ESTÁ LISTO
// ============================================
// Esta función debe ser llamada desde firebase-config.js
function onFirebaseReady() {
    auth = firebase.auth();
    db = firebase.firestore();
    startRealtimeSync();
    checkStoreStatus();
}
