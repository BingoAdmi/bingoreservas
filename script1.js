    // ==========================================================
        // ============== SECCIÓN DE CONFIGURACIÓN DEL BINGO ==============
        // ==========================================================
        const TOTAL_CARDS = 75;
        const CARD_PRICE = 100;
        const RESERVATION_TIME = 5 * 60 * 1000; // 5 minutos
        
        // 🚨 EDITA ESTA CADENA PARA FIJAR LA HORA DEL PRÓXIMO BINGO 🚨
        // Formato: Mes Día, Año Hora:Minuto:Segundo
        // Ejemplo: 'November 30, 2025 20:30:00' (30 Nov 2025, 8:30 PM)
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
            // Muestra la fecha del bingo al cargar la página
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
        // =========== SINCRONIZACIÓN Y LIVE DATA (AJUSTADO) ==========
        // ----------------------------------------------------

        function startRealtimeSync() {
            // Sincronizar ventas confirmadas (Estado 'sold' - VERDE)
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

            // Sincronizar reservas pendientes (Estado 'reserved' - NARANJA)
            db.collection('reservasPendientes').onSnapshot(snap => {
                snap.docChanges().forEach(change => {
                    const d = change.doc.data();
                    const docId = change.doc.id; 
                    
                    (d.cards || []).forEach(c => {
                        const isSold = liveData[c]?.status === 'sold';

                        if(change.type === 'removed') {
                            // Limpiar liveData solo si no ha sido vendida
                            if (!isSold) {
                                delete liveData[c];
                            }
                        } else {
                            // Marcar como 'reserved' solo si NO está ya 'sold'
                            if(!isSold) {
                                liveData[c] = { status: 'reserved', reservationId: docId, ...d };
                            }
                        }
                    });
                });
                updateUI(); // 🚨 Ejecutar UI update para todos los clientes en tiempo real
                if(auth.currentUser) renderAdminPendingList();
            });

            auth.onAuthStateChanged(u => {
                if(u) {
                    document.getElementById('clientContent').classList.add('hidden');
                    document.getElementById('adminPanel').classList.remove('hidden');
                    document.getElementById('adminLogin').classList.add('hidden');
                    document.getElementById('adminDashboard').classList.remove('hidden');
                    renderAdminPendingList();
                    renderAdminSoldList();
                } else {
                    document.getElementById('clientContent').classList.remove('hidden');
                    document.getElementById('adminPanel').classList.add('hidden');
                }
            });
        }

        // FUNCIÓN DE ACTUALIZACIÓN DE LA UI
        function updateUI() {
            let sold = 0;
            for(let i=1; i<=TOTAL_CARDS; i++) {
                if(liveData[i]?.status === 'sold') sold++;
            }
            document.getElementById('availableCount').textContent = TOTAL_CARDS - sold;
            
            // 🚨 CRÍTICO: Asegura que la cuadrícula se renderice si el modal está abierto para ver el color naranja
            const selectionModal = document.getElementById('cardSelectionModal');
            if(selectionModal && selectionModal.style.display === 'flex') {
                renderGrid();
            }

            // Revisar conflictos si el modal de pago está abierto
            if(document.getElementById('paymentProcessModal').style.display === 'flex') {
                checkPaymentConflicts();
            }
        }

        function checkPaymentConflicts() {
            let conflicts = [];
            let newSelection = [];
            
            selectedCards.forEach(card => {
                const status = getStatus(card);
                // Si el estado es 'sold' o 'reserved' (por otro jugador), hay conflicto.
                if (status === 'sold' || status === 'reserved') {
                    conflicts.push(card);
                } else {
                    newSelection.push(card);
                }
            });

            if (conflicts.length > 0) {
                alert(`⚠️ ¡ATENCIÓN! El número(s) ${conflicts.join(', ')} acaba de ser comprado/reservado por otro jugador. Estos números han sido retirados de tu lista.`);
                
                selectedCards = newSelection;
                saveLocalSelection();

                if (selectedCards.length === 0) {
                    hidePaymentModal(); 
                    localStorage.removeItem('omega_payment_start'); 
                } else {
                    document.getElementById('payCardsList').textContent = selectedCards.join(', ');
                    document.getElementById('payTotal').textContent = `Bs. ${(selectedCards.length * CARD_PRICE).toFixed(2)}`;
                }
            }
        }

        function showCardSelectionModal() {
            document.getElementById('cardPreviewModal').style.display = 'none';
            document.getElementById('paymentProcessModal').style.display = 'none';
            document.getElementById('legalModal').style.display = 'none'; // AÑADIDO: Ocultar modal legal
            const modal = document.getElementById('cardSelectionModal');
            modal.style.display = 'flex'; 
            renderGrid();
            updateTotal();
            if(selectedCards.length > 0 && localStorage.getItem('omega_payment_start')) {
                startPaymentTimer();
            } else {
                clearInterval(timerInterval);
            }
        }

        function hideCardSelectionModal() {
            document.getElementById('cardSelectionModal').style.display = 'none';
        }

        /**
         * @param {number} n - Número de tarjeta
         * @returns {string} - Estado de la tarjeta ('sold', 'reserved', 'selected', 'available')
         */
        function getStatus(n) {
            // 1. Prioridad: VENDIDA (Verde)
            if(liveData[n]?.status === 'sold') return 'sold';
            
            // 2. Prioridad: RESERVADA (Naranja)
            if(liveData[n]?.status === 'reserved') return 'reserved';
            
            // 3. Prioridad: SELECCIONADA (Amarilla - SOLO para el usuario actual)
            if(selectedCards.includes(n)) return 'selected'; 
            
            // 4. Último: DISPONIBLE (Morado)
            return 'available';
        }

        function renderGrid() {
            const container = document.getElementById('cardListContainer');
            container.innerHTML = '';
            for(let i=1; i<=TOTAL_CARDS; i++) {
                const st = getStatus(i);
                let tag = 'VER';
                if(st === 'sold') tag = 'VENDIDA';
                if(st === 'reserved') tag = 'OCUPADA'; 
                if(st === 'selected') tag = 'TUYA'; 

                const div = document.createElement('div');
                div.className = `card-item-container status-${st}`;
                
                div.innerHTML = `
                    <div class="bingo-ball" onclick="handleBallClick(${i}, '${st}')">${i}</div>
                    <span class="ver-tag" onclick="event.stopPropagation(); openPreview(${i})">${tag}</span>
                `;
                container.appendChild(div);
            }
        }
        
        function handleBallClick(n, st) {
            if(st === 'sold' || st === 'reserved') {
                openPreview(n);
            } else {
                if(selectedCards.includes(n)) selectedCards = selectedCards.filter(x => x !== n);
                else {
                    if (liveData[n]?.status === 'sold' || liveData[n]?.status === 'reserved') {
                         openPreview(n);
                         return;
                    }
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

        function openPreview(n) {
            previewCard = n;
            const st = getStatus(n);
            const d = liveData[n];
            const btn = document.getElementById('btnPreviewAction');
            const txt = document.getElementById('previewStatusText');
            
            document.getElementById('previewNum').textContent = n;
            document.getElementById('previewImgContainer').innerHTML = `<img src="./tablas/tabla_${n}.png" class="bingo-card-image" onerror="this.src='https://placehold.co/300?text=Tabla+${n}'">`;
            
            if(st === 'sold') {
                txt.textContent = `❌ VENDIDA. (${d.name || 'Otro jugador'})`;
                txt.className = "text-red-600 font-bold mb-4";
                btn.style.display = 'none';
            } else if(st === 'reserved') {
                txt.textContent = `⏳ OCUPADA. (${d.name || 'Otro jugador'}) Esperando confirmación de pago.`;
                txt.className = "text-orange-500 font-bold mb-4";
                btn.style.display = 'none';
            } else {
                const isSel = selectedCards.includes(n);
                txt.textContent = isSel ? "¿Ya no quieres esta tabla?" : "¿Te gusta esta tabla?";
                txt.className = "text-gray-700 font-bold mb-4";
                btn.style.display = 'block';
                btn.textContent = isSel ? "QUITAR DE MI LISTA" : "AGREGAR A MI LISTA";
                btn.className = isSel ? "flex-1 py-2 bg-red-500 text-white font-bold rounded-lg" : "flex-1 py-2 bg-green-500 text-white font-bold rounded-lg";
                btn.onclick = () => {
                    if(isSel) selectedCards = selectedCards.filter(x => x !== n);
                    else selectedCards.push(n);
                    
                    saveLocalSelection();
                    updateTotal();
                    closePreview();
                    showCardSelectionModal();
                };
            }
            
            document.getElementById('cardSelectionModal').style.display = 'none';
            document.getElementById('cardPreviewModal').style.display = 'flex';
        }

        function closePreview() {
            document.getElementById('cardPreviewModal').style.display = 'none';
            showCardSelectionModal();
        }

        // ================== CLIENTE: PAGO ==================
        function preparePayment() {
            if(selectedCards.length === 0) return alert("Selecciona al menos una tabla");
            
            const cardsToCheck = [...selectedCards];
            let conflictDuringSelection = false;
            for (const card of cardsToCheck) {
                if (liveData[card] && (liveData[card].status === 'sold' || liveData[card].status === 'reserved')) {
                    selectedCards = selectedCards.filter(x => x !== card);
                    conflictDuringSelection = true;
                }
            }
            if (conflictDuringSelection) {
                 saveLocalSelection();
                 updateTotal();
                 alert("⚠️ Una o más de tus tablas fueron reservadas o vendidas mientras seleccionabas. Han sido eliminadas de tu lista.");
            }

            if (selectedCards.length === 0) {
                 hideCardSelectionModal();
                 return; 
            }
            
            document.getElementById('payName').value = '';
            document.getElementById('payPhone').value = '';
            document.getElementById('payRef').value = '';
            document.getElementById('fileNameDisplay').textContent = '';

            if (!localStorage.getItem('omega_payment_start')) {
                localStorage.setItem('omega_payment_start', Date.now());
            }

            hideCardSelectionModal();
            document.getElementById('paymentProcessModal').style.display = 'flex';
            
            document.getElementById('payCardsList').textContent = selectedCards.join(', ');
            document.getElementById('payTotal').textContent = `Bs. ${(selectedCards.length * CARD_PRICE).toFixed(2)}`;
            
            startPaymentTimer();
        }

        function startPaymentTimer() {
            const display = document.getElementById('paymentTimer');
            clearInterval(timerInterval);
            
            const startTime = parseInt(localStorage.getItem('omega_payment_start'));
            if (!startTime) return; 

            timerInterval = setInterval(() => {
                const now = Date.now();
                const elapsedSeconds = Math.floor((now - startTime) / 1000);
                const totalDuration = 300; // 5 minutos
                let remaining = totalDuration - elapsedSeconds;

                if (remaining < 0) remaining = 0;

                const m = Math.floor(remaining / 60);
                const s = remaining % 60;
                display.textContent = `0${m}:${s<10?'0'+s:s}`;

                if(remaining <= 0) {
                    clearInterval(timerInterval);
                    alert("Lo siento, su tiempo de compra se ha agotado. Las tablas han sido liberadas.");
                    
                    localStorage.removeItem('omega_payment_start');
                    selectedCards = []; 
                    localStorage.removeItem('omega_selected_cards');
                    
                    hidePaymentModal();
                    updateUI();
                }
            }, 1000);
        }

        function hidePaymentModal() {
            document.getElementById('paymentProcessModal').style.display = 'none';
            showCardSelectionModal();
        }

        async function submitPayment() {
            const YOUR_CLOUD_NAME = "dwhsdurag"; 
            const YOUR_UPLOAD_PRESET = "bingo_comprobantes"; 
            
            const name = document.getElementById('payName').value;
            const phone = document.getElementById('payPhone').value.replace(/\D/g,'');
            const ref = document.getElementById('payRef').value;
            const file = document.getElementById('payFile').files[0];
            const statusMsg = document.getElementById('uploadStatus');

            if(!name || phone.length < 10 || !ref || !file) {
                statusMsg.textContent = "Datos incompletos o teléfono inválido.";
                statusMsg.className = "text-center text-sm mt-2 font-bold text-red-600 block";
                return;
            }

            // 1. **VERIFICACIÓN FINAL (Doble Check)**
            for (const card of selectedCards) {
                if (liveData[card] && liveData[card].status === 'sold') {
                    statusMsg.textContent = `Error: La tabla N° ${card} fue VENDIDA. Reinicia tu selección.`;
                    statusMsg.className = "text-center text-sm mt-2 font-bold text-red-600 block";
                    return;
                }
            }


            statusMsg.textContent = "Subiendo comprobante... ⏳";
            statusMsg.className = "text-center text-sm mt-2 font-bold text-blue-600 block";

            try {
                // 2. Subida a Cloudinary
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', YOUR_UPLOAD_PRESET);
                formData.append('public_id', `${phone}_${Date.now()}`); 
                const uploadUrl = `https://api.cloudinary.com/v1_1/${YOUR_CLOUD_NAME}/image/upload`;

                const response = await fetch(uploadUrl, { method: 'POST', body: formData });
                const data = await response.json();
                const url = data.secure_url; 
                
                if (!response.ok || !url) throw new Error(data.error ? data.error.message : response.statusText);

                // 3. Crear reserva pendiente (ACTIVA el estado 'reserved' para todos)
                const newDocRef = await db.collection('reservasPendientes').add({ 
                    name: name,
                    phone: phone,
                    reference: ref,
                    proofURL: url, 
                    cards: selectedCards,
                    totalAmount: selectedCards.length * CARD_PRICE,
                    timestamp: Date.now(),
                    status: 'PENDING_CONFIRMATION'
                });

                // 4. Actualización Inmediata Local (para la vista del jugador que espera)
                // Esto garantiza que el jugador local vea el naranja de inmediato.
                selectedCards.forEach(c => {
                    liveData[c] = { 
                        status: 'reserved', 
                        reservationId: newDocRef.id, 
                        name: name, 
                        phone: phone 
                    };
                });
                
                // 5. Limpieza Local
                statusMsg.textContent = "¡Enviado! 🎉";
                confetti({ particleCount: 100, spread: 70 });
                
                selectedCards = [];
                localStorage.removeItem('omega_selected_cards');
                localStorage.removeItem('omega_payment_start');
                clearInterval(timerInterval);

                
                setTimeout(() => {
                    hidePaymentModal();
                    alert("Tu pago ha sido enviado. Espera la confirmación del administrador. Las tablas han sido reservadas (OCUPADAS).");
                }, 1500);

            } catch(e) {
                console.error("Error al subir:", e);
                statusMsg.textContent = `Error: ${e.message || 'Fallo de red/Cloudinary.'}`;
                statusMsg.className = "text-center text-sm mt-2 font-bold text-red-600 block";
            }
        }

        // ================== CONSULTAS ==================
        async function searchCardByPhone() {
            const p = document.getElementById('searchPhoneInput').value.replace(/\D/g,'');
            if(p.length < 10) return alert("Teléfono inválido");
            const div = document.getElementById('searchResultArea');
            const content = document.getElementById('resultContent');
            div.classList.remove('hidden');
            content.innerHTML = 'Buscando...';
            
            let found = [];
            const soldSnap = await db.collection('ventasConfirmadas').where('phone', '==', p).get();
            soldSnap.forEach(doc => { doc.data().cards.forEach(c => found.push({n:c, st:'VENDIDA', col:'green'})); });
            const pendSnap = await db.collection('reservasPendientes').where('phone', '==', p).get();
            pendSnap.forEach(doc => { doc.data().cards.forEach(c => found.push({n:c, st:'EN REVISIÓN', col:'orange'})); });

            content.innerHTML = '';
            if(found.length === 0) content.innerHTML = '<p>No se encontraron tablas asociadas a este teléfono.</p>';
            else {
                document.getElementById('resultTitle').textContent = `Jugador: ${p}`;
                const uniqueCards = [...new Set(found.map(f => f.n))].map(n => {
                    const status = found.filter(f => f.n === n).map(f => f.st).includes('VENDIDA') ? 'VENDIDA' : 'EN REVISIÓN';
                    const col = status === 'VENDIDA' ? 'green' : 'orange';
                    return { n, st: status, col };
                });

                uniqueCards.forEach(f => {
                    content.innerHTML += `<div class="bg-${f.col}-100 border border-${f.col}-500 p-2 rounded"><span class="text-2xl font-black text-${f.col}-700">${f.n}</span><br><span class="text-xs font-bold text-${f.col}-800">${f.st}</span></div>`;
                });
            }
        }


        function searchCard() {
            const n = parseInt(document.getElementById('cardNumberInput').value);
            if(!n) return;
            const div = document.getElementById('searchResultArea');
            const content = document.getElementById('resultContent');
            div.classList.remove('hidden');
            const d = liveData[n];
            const st = d ? (d.status === 'sold' ? 'VENDIDA' : 'RESERVADA') : 'DISPONIBLE';
            const col = d ? (d.status === 'sold' ? 'green' : 'orange') : 'purple';
            document.getElementById('resultTitle').textContent = `Tabla #${n}`;
            content.innerHTML = `<div class="text-center"><img src="./tablas/tabla_${n}.png" class="bingo-card-image w-48 mx-auto mb-2" onerror="this.src='https://placehold.co/200?text=${n}'"><p class="font-bold text-${col}-600 text-xl">${st}</p>${d && d.name ? `<p class="text-sm text-gray-600">Jugador: ${d.name}</p>` : ''}<a href="./tablas/tabla_${n}.png" download class="inline-block mt-2 bg-purple-600 text-white px-4 py-1 rounded">Descargar</a></div>`;
        }

function showToast(message) {
    const toast = document.getElementById("toast-notification");
    const toastMessage = document.getElementById("toast-message");

    toastMessage.textContent = message;
    toast.classList.remove("toast-hidden");
    toast.classList.add("show");

    // Ocultar automáticamente después de 3 segundos
    setTimeout(() => {
        toast.classList.remove("show");
        // Ocultar completamente después de la transición CSS
        setTimeout(() => {
            toast.classList.add("toast-hidden");
        }, 500); 
    }, 3000);
}

        function copyToClipboard(txt) {
    // Usamos el método moderno para entornos seguros (Cloudflare, localhost)
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(txt)
            .then(() => {
                showToast("¡" + txt + " copiado!");
            })
            .catch(err => {
                // Fallback si falla el método moderno
                fallbackCopy(txt);
            });
    } else {
        // Método de respaldo para IPs privadas/HTTP (entorno de pruebas local)
        fallbackCopy(txt);
    }
}

function fallbackCopy(txt) {
    const textArea = document.createElement("textarea");
    textArea.value = txt;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showToast("¡" + txt + " copiado! (Método alterno)");
    } catch (err) {
        console.error('Error al copiar', err);
        alert("Error: No se pudo copiar automáticamente.");
    }
    document.body.removeChild(textArea);
}



        // ================== ADMIN ACCESO Y RENDER ==================
        document.getElementById('footer-logo').addEventListener('click', () => {
            adminClicks++;
            if(adminClicks >= 6) {
                document.getElementById('clientContent').classList.add('hidden');
                document.getElementById('adminPanel').classList.remove('hidden');
                if(auth.currentUser) {
                    document.getElementById('adminLogin').classList.add('hidden');
                    document.getElementById('adminDashboard').classList.remove('hidden');
                }
                adminClicks = 0;
            }
        });

        function adminLogin() {
            const e = document.getElementById('adminEmail').value;
            const p = document.getElementById('adminPassword').value;
            auth.signInWithEmailAndPassword(e, p).then(() => {
                document.getElementById('adminLogin').classList.add('hidden');
                document.getElementById('adminDashboard').classList.remove('hidden');
                renderAdminPendingList(); renderAdminSoldList();
            }).catch(err => document.getElementById('adminLoginError').textContent = err.message);
        }

        function adminLogout() { auth.signOut().then(() => location.reload()); }

        function renderAdminPendingList() {
            db.collection('reservasPendientes').where('status', '==', 'PENDING_CONFIRMATION').onSnapshot(snap => {
                const div = document.getElementById('pendingCardsList');
                div.innerHTML = '';
                document.getElementById('pendingCount').textContent = snap.size;
                snap.forEach(doc => {
                    const d = doc.data();
                    div.innerHTML += `<div class="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-400"><div class="flex justify-between mb-2"><span class="font-bold text-gray-800">${d.name}</span><span class="text-sm bg-gray-200 px-2 rounded">${d.phone}</span></div><p class="text-sm text-gray-600 mb-1">Ref: <b>${d.reference}</b> | Bs. ${d.totalAmount}</p><p class="text-sm mb-2">Tablas: <b class="text-purple-600">${d.cards.join(', ')}</b></p><a href="${d.proofURL}" target="_blank" class="block text-center bg-blue-50 text-blue-600 py-1 rounded text-sm font-bold mb-3 border border-blue-200">Ver Comprobante</a><div class="flex gap-2"><button onclick="confirmSale('${doc.id}')" class="flex-1 bg-green-500 text-white py-2 rounded font-bold hover:bg-green-600">APROBAR</button><button onclick="rejectSale('${doc.id}')" class="flex-1 bg-red-500 text-white py-2 rounded font-bold hover:bg-red-600">RECHAZAR</button></div></div>`;
                });
            });
        }

        function renderAdminSoldList() {
            db.collection('ventasConfirmadas').orderBy('saleDate', 'desc').limit(50).onSnapshot(snap => {
                const tbody = document.getElementById('soldPlayersTableBody');
                tbody.innerHTML = '';
                document.getElementById('soldCount').textContent = snap.size;
                snap.forEach(doc => {
                    const d = doc.data();
                    tbody.innerHTML += `<tr class="border-b hover:bg-gray-50"><td class="p-3 font-bold">${d.name}</td><td class="p-3 text-xs">${d.phone}</td><td class="p-3 text-green-600 font-bold text-xs break-all">${d.cards.join(',')}</td><td class="p-3"><button onclick="deleteSale('${doc.id}')" class="text-red-500 text-xs underline">Eliminar</button></td></tr>`;
                });
            });
        }

        // ----------------------------------------------------------------------------------
        // =========== ADMIN: CONFIRMACIÓN DE VENTA (CORRECCIÓN DE INTEGRIDAD CRÍTICA) ==========
        // ----------------------------------------------------------------------------------
        function confirmSale(id) {
            if(!confirm("¿Confirmar pago y vender tablas? Esto verificará la disponibilidad final.")) return;

            db.collection('reservasPendientes').doc(id).get().then(doc => {
                if (!doc.exists) return alert("Error: La reserva ya no existe.");
                const d = doc.data();
                
                let conflict = false;
                let cardsToSell = [];

                // 🚨 VALIDACIÓN DE INTEGRIDAD: Verifica si el número ya está 'sold' o 'reserved' por OTRO.
                d.cards.forEach(cardNum => {
                    const currentStatus = liveData[cardNum]?.status;
                    const currentReservationId = liveData[cardNum]?.reservationId;

                    if (currentStatus === 'sold') {
                        // El número ya está vendido. EXCLUIR.
                        conflict = true;
                    } else if (currentStatus === 'reserved' && currentReservationId !== id) {
                        // El número está reservado por OTRA RESERVA. EXCLUIR.
                        conflict = true;
                    } else {
                        // El número está disponible O está reservado por ESTA MISMA reserva que se está confirmando. INCLUIR.
                        cardsToSell.push(cardNum);
                    }
                });
                
                if (conflict) {
                    alert(`⛔ ERROR: Algunas tablas ya están Vendidas o Reservadas. Solo se confirmarán: ${cardsToSell.join(', ')}.`);
                }

                if (cardsToSell.length === 0) {
                    alert("🚫 Ninguna tabla disponible para venta.");
                }
                
                const batch = db.batch();
                
                if (cardsToSell.length > 0) {
                    batch.set(db.collection('ventasConfirmadas').doc(), {
                        name: d.name,
                        phone: d.phone,
                        cards: cardsToSell,
                        saleDate: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                
                batch.delete(db.collection('reservasPendientes').doc(id));
                
                batch.commit().then(() => {
                    alert(cardsToSell.length > 0 ? `Venta confirmada: ${cardsToSell.join(', ')}.` : "Reserva eliminada.");
                }).catch(e => {
                    console.error("Error:", e);
                    alert("Error al confirmar venta.");
                });
            });
        }

        function rejectSale(id) {
            if(confirm("¿Rechazar y liberar tablas?")) {
                db.collection('reservasPendientes').doc(id).delete().then(() => {
                    alert("Reserva rechazada.");
                }).catch(e => console.error("Error:", e));
            }
        }
        
        function deleteSale(id) {
            if(confirm("¿Eliminar venta?")) {
                db.collection('ventasConfirmadas').doc(id).delete().then(() => {
                    alert("Venta eliminada.");
                }).catch(e => console.error("Error:", e));
            }
        }
        
        function downloadSoldList() {
            db.collection('ventasConfirmadas').get().then(snap => {
                let csv = "Nombre,Telefono,Tablas\n";
                snap.forEach(doc => {
                    const d = doc.data();
                    csv += `${d.name || ''},${d.phone || ''},"${(d.cards || []).join(';')}"\n`;
                });
                const blob = new Blob([csv],{type:'text/csv'});
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'ventas_omega.csv';
                a.click();
            });
        }

        // ----------------------------------------------------
        // =========== RELOJ DE CUENTA REGRESIVA (MEJORADO) ==========
        // ----------------------------------------------------
        function startBingoTimer() {
            const countdownDisplay = document.getElementById('countdownTimer');

            const timerFunction = () => {
                const now = new Date().getTime();
                const dist = BINGO_DATE - now;

                if (dist < 0) {
                    countdownDisplay.textContent = "¡JUEGO EN VIVO! 🎉";
                    return;
                }

                // Cálculo de días, horas, minutos y segundos
                const oneSecond = 1000;
                const oneMinute = oneSecond * 60;
                const oneHour = oneMinute * 60;
                const oneDay = oneHour * 24;

                const days = Math.floor(dist / oneDay);
                const hours = Math.floor((dist % oneDay) / oneHour);
                const minutes = Math.floor((dist % oneHour) / oneMinute);
                const seconds = Math.floor((dist % oneMinute) / oneSecond);

                // Formateo con ceros iniciales
                const dDisplay = days > 0 ? `${days}D ` : '';
                const hDisplay = String(hours).padStart(2, '0');
                const mDisplay = String(minutes).padStart(2, '0');
                const sDisplay = String(seconds).padStart(2, '0');

                // Muestra: [Días] HH:MM:SS
                countdownDisplay.textContent = `${dDisplay}${hDisplay}:${mDisplay}:${sDisplay}`;
            };

            // Ejecuta la función inmediatamente y luego cada segundo (en vivo)
            timerFunction();
            setInterval(timerFunction, 1000);
        }

        // ==========================================================
        // ============== AÑADIDO: FUNCIONES DE MODAL LEGAL ==============
        // ==========================================================

        const legalContent = {
            // COMENTARIO: Asegúrate de reemplazar "[Nombre de tu Página de Bingo]" y "[Fecha Actual]"
            terms: `
                <h2 class="text-xl font-bold text-gray-900 mb-3">Términos y Condiciones del Servicio OMEGA Bingo</h2>
                <p class="text-xs text-gray-500 mb-4">Última actualización: 30/11/25</p>
                
                <h3 class="font-bold text-lg text-purple-700 mt-4 mb-2">1. Aceptación de los Términos</h3>
                <p>Al acceder y utilizar los servicios de OMEGA Bingo, usted acepta estar sujeto a estos Términos y Condiciones, así como a nuestra Política de Privacidad.</p>
                
                <h3 class="font-bold text-lg text-purple-700 mt-4 mb-2">2. Uso de la Cuenta y Seguridad</h3>
                <p>Usted es responsable de mantener la confidencialidad de su contraseña y de todas las actividades que ocurran bajo su cuenta. Se compromete a notificarnos inmediatamente sobre cualquier uso no autorizado de su cuenta.</p>
                
                <h3 class="font-bold text-lg text-purple-700 mt-4 mb-2">3. Jurisdicción y Uso Legal (Venezuela / EEUU)</h3>
                <ul class="list-disc list-inside space-y-1 ml-4">
                    <li><strong>Juegos de Azar:</strong> Al participar, usted declara que cumple con la mayoría de edad legal para participar en juegos de azar en su jurisdicción. Es su responsabilidad asegurarse de que la participación en bingos en línea es legal en su lugar de residencia, tanto en Venezuela como en Estados Unidos, o cualquier otra ubicación.</li>
                    <li><strong>Riesgo:</strong> La participación es bajo su propio riesgo. OMEGA Bingo no se hace responsable por cualquier pérdida incurrida.</li>
                </ul>
                
                <h3 class="font-bold text-lg text-purple-700 mt-4 mb-2">4. Verificación y Documentación del Cliente</h3>
                <p>Para garantizar la integridad del juego y la seguridad de las transacciones, podemos solicitar documentación adicional (como comprobantes de pago o identificación) para verificar su identidad y sus reservas. Esta información será tratada de acuerdo con nuestra Política de Privacidad.</p>

                <h3 class="font-bold text-lg text-purple-700 mt-4 mb-2">5. Uso del Código y Licencia</h3>
                <p>El código fuente y los elementos de diseño (imágenes, logos, etc.) de esta plataforma son propiedad privada de OMEGA Bingo Masson© o sus licenciatarios. El acceso a este sistema está estrictamente limitado al uso como cliente para la compra de tablas. Queda terminantemente prohibida la copia, reproducción, distribución, ingeniería inversa o cualquier uso no autorizado del código privado de la página web sin el consentimiento expreso y por escrito de los propietarios de OMEGA Bingo.</p>
                
                <h3 class="font-bold text-lg text-purple-700 mt-4 mb-2">6. Limitación de Responsabilidad</h3>
                <p>OMEGA Bingo no se hace responsable de las pérdidas o daños que surjan de la falta de medidas de seguridad adecuadas en los dispositivos del usuario, o de fallos técnicos fuera de nuestro control razonable, incluyendo interrupciones en el servicio de Internet, fallos de red o errores de pago móvil de terceros.</p>
                `,
            privacy: `
                <h2 class="text-xl font-bold text-gray-900 mb-3">Política de Privacidad de OMEGA Bingo</h2>
                <p class="text-xs text-gray-500 mb-4">Última actualización: 30/11/25</p>
                
                <h3 class="font-bold text-lg text-purple-700 mt-4 mb-2">1. Información que Recopilamos</h3>
                <p>Recopilamos información que usted nos proporciona directamente al registrarse, reservar números y realizar pagos. Esto puede incluir su nombre, dirección de correo electrónico, número de teléfono, detalles de pago y los documentos de verificación (como comprobantes de pago) que nos envíe.</p>
                
                <h3 class="font-bold text-lg text-purple-700 mt-4 mb-2">2. Uso de la Información y Cumplimiento Legal</h3>
                <ul class="list-disc list-inside space-y-1 ml-4">
                    <li>Procesar sus reservas y pagos.</li>
                    <li>Verificar su identidad y elegibilidad para jugar.</li>
                    <li>Comunicarnos con usted sobre el estado de su cuenta y premios.</li>
                    <li>Cumplir con nuestras obligaciones legales y reglamentarias, especialmente las relacionadas con la prevención de fraude y el juego responsable, en las jurisdicciones aplicables (incluyendo Venezuela y EEUU).</li>
                </ul>

                <h3 class="font-bold text-lg text-purple-700 mt-4 mb-2">3. Almacenamiento y Seguridad de los Datos (Clave de Confianza)</h3>
                <p>La seguridad de su información personal es nuestra prioridad. Implementamos medidas de seguridad técnicas y organizativas robustas para proteger los datos contra el acceso no autorizado, la alteración, la divulgación o la destrucción.</p>
                <ul class="list-disc list-inside space-y-1 ml-4">
                    <li><strong>Alojamiento Seguro:</strong> Todos los datos y documentos de verificación (comprobantes de pago) se almacenan en servidores seguros operados por proveedores de servicios certificados que cumplen con estándares de seguridad reconocidos internacionalmente (por ejemplo, ISO 27001). Utilizamos servicios como Firebase/Firestore y Cloudinary (para comprobantes) que manejan la información de acuerdo a estándares globales.</li>
                    <li><strong>Cifrado:</strong> Utilizamos el cifrado de datos (SSL/TLS) para proteger la transmisión de datos entre su navegador y nuestros servidores. Los datos almacenados también están sujetos a medidas de cifrado en reposo cuando es posible.</li>
                    <li><strong>Acceso Restringido:</strong> El acceso a la información personal identificable está estrictamente limitado al personal autorizado de OMEGA Bingo que requiere acceso para realizar sus funciones laborales.</li>
                    <li><strong>Gestión de Documentos:</strong> Los comprobantes de clientes se almacenan en un sistema de gestión de documentos seguro e interno (Cloudinary privado) y nunca en servicios de alojamiento de archivos públicos o genéricos como MediaFire, Google Drive personal o Dropbox personal.</li>
                </ul>
                
                <h3 class="font-bold text-lg text-purple-700 mt-4 mb-2">4. Retención de Datos</h3>
                <p>Retenemos su información personal solo durante el tiempo necesario para cumplir con los fines para los que fue recopilada, incluyendo cualquier período de retención legal o reglamentario requerido por las autoridades de licencias de juego y fiscales.</p>
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
            } else {
                return;
            }
            
            modal.style.display = 'flex';
        }

        function hideLegalModal() {
            document.getElementById('legalModal').style.display = 'none';
        }
