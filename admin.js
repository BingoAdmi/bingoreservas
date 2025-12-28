// admin.js - Panel de Administración para Bingo Carabobo

import { 
    db, 
    collection, 
    getDocs, 
    query, 
    where, 
    orderBy,
    updateDoc,
    doc,
    deleteDoc,
    serverTimestamp
} from './firebase-config.js';

// Elementos del DOM
const loginContainer = document.getElementById('loginContainer');
const adminContainer = document.getElementById('adminContainer');
const loginAdminBtn = document.getElementById('loginAdminBtn');
const logoutBtn = document.getElementById('logoutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const reservationsTableBody = document.getElementById('reservationsTableBody');

// Variables globales
let allReservations = [];
let currentReservations = [];
let currentPage = 1;
const itemsPerPage = 10;

// =============================================
// CONFIGURACIÓN DE ACCESO
// =============================================

// Credenciales de administrador - ¡CAMBIA ESTOS VALORES!
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'bingo123' // Cambia esta contraseña
};

// Verificar si hay sesión activa
function checkSession() {
    const isLoggedIn = localStorage.getItem('adminLoggedIn');
    if (isLoggedIn === 'true') {
        loginContainer.style.display = 'none';
        adminContainer.style.display = 'block';
        loadReservations();
        startAutoRefresh();
    }
}

// Login
loginAdminBtn.addEventListener('click', () => {
    const username = document.getElementById('adminUser').value;
    const password = document.getElementById('adminPass').value;
    
    if (username === ADMIN_CREDENTIALS.username && 
        password === ADMIN_CREDENTIALS.password) {
        
        localStorage.setItem('adminLoggedIn', 'true');
        loginContainer.style.display = 'none';
        adminContainer.style.display = 'block';
        loadReservations();
        startAutoRefresh();
        
    } else {
        alert('Credenciales incorrectas. Usuario: admin | Contraseña: bingo123');
    }
});

// Logout
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('adminLoggedIn');
    loginContainer.style.display = 'flex';
    adminContainer.style.display = 'none';
    stopAutoRefresh();
});

// =============================================
// CARGA Y GESTIÓN DE RESERVAS
// =============================================

// Cargar reservas desde Firebase
async function loadReservations() {
    try {
        reservationsTableBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="11">
                    <div class="loading-spinner">
                        <i class="fas fa-spinner fa-spin"></i> Cargando reservas...
                    </div>
                </td>
            </tr>
        `;
        
        const q = query(collection(db, "reservas"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        
        allReservations = [];
        querySnapshot.forEach((docSnapshot) => {
            const reservation = {
                id: docSnapshot.id,
                ...docSnapshot.data()
            };
            allReservations.push(reservation);
        });
        
        updateStats();
        applyFilters();
        updateLastUpdateTime();
        
    } catch (error) {
        console.error("Error cargando reservas:", error);
        reservationsTableBody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; color: #e74c3c; padding: 40px;">
                    <i class="fas fa-exclamation-triangle"></i> Error cargando reservas
                </td>
            </tr>
        `;
    }
}

// Actualizar estadísticas
function updateStats() {
    document.getElementById('totalReservas').textContent = allReservations.length;
    
    const pendientes = allReservations.filter(r => r.estado === 'pendiente').length;
    const confirmadas = allReservations.filter(r => r.estado === 'confirmado').length;
    const canceladas = allReservations.filter(r => r.estado === 'cancelado').length;
    
    document.getElementById('pendientesReservas').textContent = pendientes;
    document.getElementById('confirmadasReservas').textContent = confirmadas;
    document.getElementById('canceladasReservas').textContent = canceladas;
}

// Aplicar filtros
function applyFilters() {
    const statusFilter = document.getElementById('filterStatus').value;
    const dateFilter = document.getElementById('filterDate').value;
    const searchFilter = document.getElementById('searchInput').value.toLowerCase();
    
    currentReservations = allReservations.filter(reservation => {
        // Filtro por estado
        if (statusFilter !== 'todos' && reservation.estado !== statusFilter) {
            return false;
        }
        
        // Filtro por fecha
        if (dateFilter && reservation.fecha !== dateFilter) {
            return false;
        }
        
        // Filtro por búsqueda
        if (searchFilter) {
            const searchText = `${reservation.nombre} ${reservation.email} ${reservation.telefono}`.toLowerCase();
            if (!searchText.includes(searchFilter)) {
                return false;
            }
        }
        
        return true;
    });
    
    currentPage = 1;
    renderTable();
}

// Renderizar tabla
function renderTable() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageReservations = currentReservations.slice(startIndex, endIndex);
    
    if (pageReservations.length === 0) {
        reservationsTableBody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; padding: 40px; color: #7f8c8d;">
                    <i class="fas fa-inbox"></i> No hay reservas para mostrar
                </td>
            </tr>
        `;
        return;
    }
    
    let tableHTML = '';
    
    pageReservations.forEach(reservation => {
        const fechaReserva = new Date(reservation.fechaReserva).toLocaleDateString('es-ES');
        const fechaEvento = new Date(reservation.fecha).toLocaleDateString('es-ES');
        
        let estadoClass = '';
        let estadoText = '';
        
        switch(reservation.estado) {
            case 'pendiente':
                estadoClass = 'status-pendiente';
                estadoText = 'Pendiente';
                break;
            case 'confirmado':
                estadoClass = 'status-confirmado';
                estadoText = 'Confirmado';
                break;
            case 'cancelado':
                estadoClass = 'status-cancelado';
                estadoText = 'Cancelado';
                break;
        }
        
        tableHTML += `
            <tr>
                <td>${reservation.id.substring(0, 8)}...</td>
                <td>${fechaReserva}</td>
                <td><strong>${reservation.nombre}</strong></td>
                <td>
                    <div>${reservation.email}</div>
                    <div class="small-text">${reservation.telefono}</div>
                </td>
                <td>${fechaEvento} ${reservation.hora}</td>
                <td>${reservation.personas}</td>
                <td>${getMesaText(reservation.mesa)}</td>
                <td><strong>$${reservation.total?.toFixed(2) || '0.00'}</strong></td>
                <td>
                    ${reservation.comprobanteUrl ? 
                        `<a href="${reservation.comprobanteUrl}" target="_blank" class="btn-action btn-view">
                            <i class="fas fa-eye"></i> Ver
                        </a>` : 
                        '<span class="small-text">No subido</span>'
                    }
                </td>
                <td><span class="status-badge ${estadoClass}">${estadoText}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action btn-view" onclick="showReservationDetails('${reservation.id}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${reservation.estado !== 'confirmado' ? 
                            `<button class="btn-action btn-confirm" onclick="confirmReservation('${reservation.id}')">
                                <i class="fas fa-check"></i>
                            </button>` : ''
                        }
                        ${reservation.estado !== 'cancelado' ? 
                            `<button class="btn-action btn-cancel" onclick="cancelReservation('${reservation.id}')">
                                <i class="fas fa-times"></i>
                            </button>` : ''
                        }
                        <button class="btn-action btn-delete" onclick="deleteReservation('${reservation.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    reservationsTableBody.innerHTML = tableHTML;
    updatePagination();
}

// Funciones auxiliares
function getMesaText(tipoMesa) {
    switch(tipoMesa) {
        case 'standard': return 'Estándar';
        case 'vip': return 'VIP';
        case 'privada': return 'Privada';
        default: return tipoMesa;
    }
}

// Actualizar paginación
function updatePagination() {
    const totalPages = Math.ceil(currentReservations.length / itemsPerPage);
    document.getElementById('pageInfo').textContent = `Página ${currentPage} de ${totalPages}`;
    
    document.getElementById('prevBtn').disabled = currentPage === 1;
    document.getElementById('nextBtn').disabled = currentPage === totalPages;
}

// =============================================
// ACCIONES SOBRE RESERVAS
// =============================================

// Función global para confirmar reserva
window.confirmReservation = async function(reservationId) {
    if (!confirm('¿Confirmar esta reserva?')) return;
    
    try {
        const reservationRef = doc(db, "reservas", reservationId);
        await updateDoc(reservationRef, {
            estado: 'confirmado',
            confirmadoAt: serverTimestamp()
        });
        
        alert('Reserva confirmada exitosamente');
        loadReservations();
        
        // Aquí podrías agregar el envío de email de confirmación
        // await sendConfirmationEmail(reservationId);
        
    } catch (error) {
        console.error("Error confirmando reserva:", error);
        alert('Error al confirmar la reserva');
    }
};

// Función global para cancelar reserva
window.cancelReservation = async function(reservationId) {
    if (!confirm('¿Cancelar esta reserva?')) return;
    
    try {
        const reservationRef = doc(db, "reservas", reservationId);
        await updateDoc(reservationRef, {
            estado: 'cancelado',
            canceladoAt: serverTimestamp()
        });
        
        alert('Reserva cancelada exitosamente');
        loadReservations();
        
    } catch (error) {
        console.error("Error cancelando reserva:", error);
        alert('Error al cancelar la reserva');
    }
};

// Función global para eliminar reserva
window.deleteReservation = async function(reservationId) {
    if (!confirm('¿Eliminar permanentemente esta reserva?')) return;
    
    try {
        await deleteDoc(doc(db, "reservas", reservationId));
        alert('Reserva eliminada exitosamente');
        loadReservations();
        
    } catch (error) {
        console.error("Error eliminando reserva:", error);
        alert('Error al eliminar la reserva');
    }
};

// Función global para ver detalles
window.showReservationDetails = function(reservationId) {
    const reservation = allReservations.find(r => r.id === reservationId);
    if (!reservation) return;
    
    const modalDetails = document.getElementById('modalDetailsContent');
    
    const fechaReserva = new Date(reservation.fechaReserva).toLocaleString('es-ES');
    const fechaEvento = new Date(reservation.fecha).toLocaleDateString('es-ES');
    
    modalDetails.innerHTML = `
        <div class="detail-item">
            <label><i class="fas fa-id-card"></i> ID Reserva</label>
            <p>${reservation.id}</p>
        </div>
        <div class="detail-item">
            <label><i class="fas fa-user"></i> Cliente</label>
            <p>${reservation.nombre}</p>
        </div>
        <div class="detail-item">
            <label><i class="fas fa-envelope"></i> Email</label>
            <p>${reservation.email}</p>
        </div>
        <div class="detail-item">
            <label><i class="fas fa-phone"></i> Teléfono</label>
            <p>${reservation.telefono}</p>
        </div>
        <div class="detail-item">
            <label><i class="fas fa-calendar-day"></i> Fecha del Evento</label>
            <p>${fechaEvento} a las ${reservation.hora}</p>
        </div>
        <div class="detail-item">
            <label><i class="fas fa-users"></i> Número de Personas</label>
            <p>${reservation.personas} personas</p>
        </div>
        <div class="detail-item">
            <label><i class="fas fa-chair"></i> Tipo de Mesa</label>
            <p>${getMesaText(reservation.mesa)}</p>
        </div>
        <div class="detail-item">
            <label><i class="fas fa-dollar-sign"></i> Total</label>
            <p>$${reservation.total?.toFixed(2) || '0.00'}</p>
        </div>
        <div class="detail-item">
            <label><i class="fas fa-comment"></i> Comentarios</label>
            <p>${reservation.comentarios || 'Sin comentarios'}</p>
        </div>
        <div class="detail-item">
            <label><i class="fas fa-file-invoice-dollar"></i> Comprobante</label>
            <p>
                ${reservation.comprobanteUrl ? 
                    `<a href="${reservation.comprobanteUrl}" target="_blank" style="color: #3498db;">
                        <i class="fas fa-external-link-alt"></i> Ver comprobante
                    </a>` : 
                    'No se subió comprobante'
                }
            </p>
        </div>
        <div class="detail-item">
            <label><i class="fas fa-calendar-plus"></i> Fecha de Reserva</label>
            <p>${fechaReserva}</p>
        </div>
        <div class="detail-item">
            <label><i class="fas fa-info-circle"></i> Estado Actual</label>
            <p>
                <span class="status-badge ${reservation.estado === 'pendiente' ? 'status-pendiente' : 
                                          reservation.estado === 'confirmado' ? 'status-confirmado' : 
                                          'status-cancelado'}">
                    ${reservation.estado === 'pendiente' ? 'Pendiente' : 
                     reservation.estado === 'confirmado' ? 'Confirmado' : 'Cancelado'}
                </span>
            </p>
        </div>
    `;
    
    document.getElementById('detailsModal').style.display = 'flex';
};

// =============================================
// FUNCIONALIDADES ADICIONALES
// =============================================

// Exportar a CSV
document.getElementById('exportBtn').addEventListener('click', () => {
    exportToCSV();
});

function exportToCSV() {
    const headers = [
        'ID', 'Nombre', 'Email', 'Teléfono', 'Fecha Evento', 'Hora', 
        'Personas', 'Tipo Mesa', 'Total', 'Estado', 'Fecha Reserva'
    ];
    
    const csvRows = [
        headers.join(','),
        ...currentReservations.map(res => {
            const fechaEvento = new Date(res.fecha).toLocaleDateString('es-ES');
            const fechaReserva = new Date(res.fechaReserva).toLocaleDateString('es-ES');
            
            return [
                res.id.substring(0, 8),
                `"${res.nombre}"`,
                res.email,
                res.telefono,
                fechaEvento,
                res.hora,
                res.personas,
                getMesaText(res.mesa),
                res.total?.toFixed(2) || '0.00',
                res.estado,
                fechaReserva
            ].join(',');
        })
    ];
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    a.setAttribute('href', url);
    a.setAttribute('download', `reservas_bingo_${new Date().toISOString().split('T')[0]}.csv`);
    a.click();
    
    alert('Archivo CSV descargado');
}

// Actualización automática
let autoRefreshInterval;

function startAutoRefresh() {
    // Actualiza cada 30 segundos
    autoRefreshInterval = setInterval(() => {
        loadReservations();
    }, 30000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
}

// Actualizar última hora de actualización
function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('es-ES');
    document.getElementById('lastUpdate').textContent = 
        `Última actualización: ${timeString}`;
}

// Event Listeners
document.getElementById('filterStatus').addEventListener('change', applyFilters);
document.getElementById('filterDate').addEventListener('change', applyFilters);
document.getElementById('searchInput').addEventListener('input', applyFilters);
refreshBtn.addEventListener('click', loadReservations);

document.getElementById('prevBtn').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});

document.getElementById('nextBtn').addEventListener('click', () => {
    const totalPages = Math.ceil(currentReservations.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderTable();
    }
});

// Cerrar modal
document.querySelector('.close-modal').addEventListener('click', () => {
    document.getElementById('detailsModal').style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('detailsModal')) {
        document.getElementById('detailsModal').style.display = 'none';
    }
});

// =============================================
// INICIALIZACIÓN
// =============================================

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    
    // Configurar fecha mínima para filtro
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('filterDate').min = today;
    
    // Estilo para texto pequeño
    const style = document.createElement('style');
    style.textContent = `
        .small-text { font-size: 0.85rem; color: #666; }
    `;
    document.head.appendChild(style);
});

console.log('Panel de administración inicializado');
