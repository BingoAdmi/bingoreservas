// ==========================================================
// ============== PANEL DE ADMINISTRACIÓN (CORREGIDO) =======
// ==========================================================

function renderAdminPendingList() {
    db.collection('reservasPendientes').where('status', '==', 'PENDING_CONFIRMATION').onSnapshot(snap => {
        const div = document.getElementById('pendingCardsList');
        if (!div) return;
        div.innerHTML = '';
        document.getElementById('pendingCount').textContent = snap.size;
        
        snap.forEach(doc => {
            const d = doc.data();
            // Usamos plantillas de Bootstrap para que los botones sean grandes y fáciles de clickear
            div.innerHTML += `
                <div class="card mb-3 border-start border-4 border-warning shadow-sm">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="fw-bold mb-0">${d.name}</h6>
                            <span class="badge bg-light text-dark border">${d.phone}</span>
                        </div>
                        <p class="small mb-1 text-muted">Ref: <span class="fw-bold text-dark">${d.reference}</span> | Total: <span class="text-success fw-bold">Bs. ${d.totalAmount}</span></p>
                        <p class="small mb-3">Tablas: <span class="badge bg-purple-soft text-purple">${d.cards.join(', ')}</span></p>
                        
                        <div class="d-grid gap-2">
                            <a href="${d.proofURL}" target="_blank" class="btn btn-sm btn-outline-primary fw-bold">👁️ VER COMPROBANTE</a>
                            <div class="d-flex gap-2">
                                <button onclick="confirmSale('${doc.id}')" class="btn btn-success flex-grow-1 fw-bold">APROBAR</button>
                                <button onclick="rejectSale('${doc.id}')" class="btn btn-danger flex-grow-1 fw-bold">RECHAZAR</button>
                            </div>
                        </div>
                    </div>
                </div>`;
        });
    });
}

function renderAdminSoldList() {
    db.collection('ventasConfirmadas').orderBy('saleDate', 'desc').limit(50).onSnapshot(snap => {
        const tbody = document.getElementById('soldPlayersTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        document.getElementById('soldCount').textContent = snap.size;
        
        snap.forEach(doc => {
            const d = doc.data();
            tbody.innerHTML += `
                <tr class="align-middle">
                    <td class="small fw-bold">${d.name}</td>
                    <td class="small text-muted">${d.phone}</td>
                    <td><span class="badge bg-success">${d.cards.join(', ')}</span></td>
                    <td class="text-end">
                        <button onclick="deleteSale('${doc.id}')" class="btn btn-sm btn-outline-danger border-0">
                            <i class="bi bi-trash"></i> Eliminar
                        </button>
                    </td>
                </tr>`;
        });
    });
}

// FUNCIONES DE ACCIÓN (Asegúrate de que 'db' y 'batch' funcionen correctamente)
function confirmSale(id) {
    if(!confirm("¿Confirmar este pago y marcar tablas como VENDIDAS?")) return;

    db.collection('reservasPendientes').doc(id).get().then(doc => {
        if (!doc.exists) return alert("La reserva ya no existe.");
        const d = doc.data();
        const batch = db.batch();

        batch.set(db.collection('ventasConfirmadas').doc(), {
            name: d.name,
            phone: d.phone,
            cards: d.cards,
            saleDate: firebase.firestore.FieldValue.serverTimestamp()
        });

        batch.delete(db.collection('reservasPendientes').doc(id));

        batch.commit().then(() => {
            alert("✅ Venta confirmada exitosamente.");
        }).catch(e => alert("Error: " + e.message));
    });
}

function rejectSale(id) {
    if(confirm("¿Rechazar este pago? Las tablas se liberarán inmediatamente.")) {
        db.collection('reservasPendientes').doc(id).delete()
        .then(() => alert("❌ Reserva rechazada y eliminada."))
        .catch(e => alert("Error: " + e.message));
    }
}

function deleteSale(id) {
    if(confirm("¿Eliminar esta venta confirmada? Las tablas volverán a estar disponibles.")) {
        db.collection('ventasConfirmadas').doc(id).delete()
        .then(() => alert("🗑️ Venta eliminada."))
        .catch(e => alert("Error: " + e.message));
    }
}
