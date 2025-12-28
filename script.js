// script.js
// LÓGICA PRINCIPAL DEL SITIO WEB DE RESERVAS

// Importa las funciones de Firebase
import { 
    db, 
    collection, 
    addDoc, 
    serverTimestamp,
    storage,
    ref,
    uploadBytes,
    getDownloadURL,
    cloudinaryConfig 
} from './firebase-config.js';

// Elementos del DOM
const reservationForm = document.getElementById('reservationForm');
const submitBtn = document.getElementById('submitBtn');
const confirmationModal = document.getElementById('confirmationModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const closeModalSpan = document.querySelector('.close-modal');
const modalDetails = document.getElementById('modalDetails');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('comprobante');
const uploadPreview = document.getElementById('uploadPreview');

// Variables globales
let selectedFile = null;
let imageUrl = null;

// =============================================
// FUNCIONES DE CLOUDINARY (PARA IMÁGENES)
// =============================================

// Función para subir imagen a Cloudinary
async function uploadToCloudinary(file) {
    // Si no hay archivo, retorna null
    if (!file) return null;
    
    // Cloudinary necesita FormData
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);
    formData.append('cloud_name', cloudinaryConfig.cloudName);
    
    try {
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );
        
        if (!response.ok) {
            throw new Error('Error subiendo a Cloudinary');
        }
        
        const data = await response.json();
        return data.secure_url; // URL de la imagen subida
        
    } catch (error) {
        console.error('Error Cloudinary:', error);
        
        // Fallback: Subir a Firebase Storage si Cloudinary falla
        return await uploadToFirebaseStorage(file);
    }
}

// Función alternativa para Firebase Storage
async function uploadToFirebaseStorage(file) {
    try {
        const storageRef = ref(storage, `comprobantes/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(snapshot.ref);
        return downloadUrl;
    } catch (error) {
        console.error('Error Firebase Storage:', error);
        return null;
    }
}

// =============================================
// MANEJO DE SUBIDA DE ARCHIVOS
// =============================================

// Evento para el área de subida
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

// Evento para arrastrar y soltar
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#e63946';
    uploadArea.style.backgroundColor = 'rgba(230, 57, 70, 0.1)';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '#ccc';
    uploadArea.style.backgroundColor = 'transparent';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#ccc';
    uploadArea.style.backgroundColor = 'transparent';
    
    if (e.dataTransfer.files.length) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

// Evento para selección de archivo
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFileSelect(e.target.files[0]);
    }
});

// Función para manejar el archivo seleccionado
function handleFileSelect(file) {
    // Validar tipo de archivo
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
        alert('Por favor, sube solo imágenes (JPEG, PNG, GIF) o PDF.');
        return;
    }
    
    // Validar tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('El archivo es demasiado grande. Máximo 5MB.');
        return;
    }
    
    selectedFile = file;
    
    // Mostrar previsualización si es imagen
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadPreview.innerHTML = `
                <p><strong>Archivo seleccionado:</strong> ${file.name}</p>
                <img src="${e.target.result}" alt="Vista previa">
                <button class="btn-remove" id="removeFileBtn">
                    <i class="fas fa-trash"></i> Eliminar
                </button>
            `;
            uploadPreview.style.display = 'block';
            
            // Evento para eliminar archivo
            document.getElementById('removeFileBtn').addEventListener('click', (e) => {
                e.preventDefault();
                selectedFile = null;
                fileInput.value = '';
                uploadPreview.style.display = 'none';
                uploadPreview.innerHTML = '';
            });
        };
        reader.readAsDataURL(file);
    } else {
        // Para PDFs
        uploadPreview.innerHTML = `
            <p><strong>Archivo seleccionado:</strong> ${file.name}</p>
            <button class="btn-remove" id="removeFileBtn">
                <i class="fas fa-trash"></i> Eliminar
            </button>
        `;
        uploadPreview.style.display = 'block';
        
        document.getElementById('removeFileBtn').addEventListener('click', (e) => {
            e.preventDefault();
            selectedFile = null;
            fileInput.value = '';
            uploadPreview.style.display = 'none';
            uploadPreview.innerHTML = '';
        });
    }
}

// =============================================
// MANEJO DEL FORMULARIO DE RESERVA
// =============================================

// Evento para enviar el formulario
reservationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Deshabilitar botón para evitar múltiples envíos
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    
    try {
        // 1. Subir imagen si hay archivo
        if (selectedFile) {
            imageUrl = await uploadToCloudinary(selectedFile);
        }
        
        // 2. Obtener datos del formulario
        const formData = {
            nombre: document.getElementById('nombre').value,
            email: document.getElementById('email').value,
            telefono: document.getElementById('telefono').value,
            fecha: document.getElementById('fecha').value,
            hora: document.getElementById('hora').value,
            personas: document.getElementById('personas').value,
            mesa: document.getElementById('mesa').value,
            comentarios: document.getElementById('comprobante').value,
            comprobanteUrl: imageUrl || null,
            fechaReserva: new Date().toISOString(),
            estado: 'pendiente',
            total: calcularTotal()
        };
        
        // 3. Guardar en Firebase Firestore
        const docRef = await addDoc(collection(db, "reservas"), {
            ...formData,
            timestamp: serverTimestamp()
        });
        
        console.log("Reserva guardada con ID: ", docRef.id);
        
        // 4. Mostrar confirmación
        showConfirmationModal(formData);
        
        // 5. Reiniciar formulario
        reservationForm.reset();
        selectedFile = null;
        uploadPreview.style.display = 'none';
        uploadPreview.innerHTML = '';
        
        // 6. Opcional: Enviar email de confirmación
        // await enviarEmailConfirmacion(formData);
        
    } catch (error) {
        console.error("Error al procesar la reserva:", error);
        alert("Hubo un error al procesar tu reserva. Por favor, intenta nuevamente.");
    } finally {
        // Rehabilitar botón
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Confirmar Reserva';
    }
});

// Función para calcular total
function calcularTotal() {
    const personas = parseInt(document.getElementById('personas').value);
    const tipoMesa = document.getElementById('mesa').value;
    
    let precioBase = 25; // Mesa estándar
    
    if (tipoMesa === 'vip') {
        precioBase = 40;
    } else if (tipoMesa === 'privada') {
        precioBase = 100;
    }
    
    return (precioBase * personas) + 5; // + $5 servicio
}

// Función para mostrar modal de confirmación
function showConfirmationModal(data) {
    // Formatear fecha
    const fechaFormateada = new Date(data.fecha).toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // Mostrar detalles en el modal
    modalDetails.innerHTML = `
        <p><strong>Nombre:</strong> ${data.nombre}</p>
        <p><strong>Fecha:</strong> ${fechaFormateada}</p>
        <p><strong>Hora:</strong> ${data.hora}</p>
        <p><strong>Personas:</strong> ${data.personas}</p>
        <p><strong>Mesa:</strong> ${data.mesa}</p>
        <p><strong>Total:</strong> $${data.total.toFixed(2)}</p>
        <p><strong>Código de reserva:</strong> ${generateReservationCode()}</p>
    `;
    
    // Mostrar modal
    confirmationModal.style.display = 'flex';
    
    // Desplazar al modal
    confirmationModal.scrollIntoView({ behavior: 'smooth' });
}

// Generar código de reserva aleatorio
function generateReservationCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'BINGO-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// =============================================
// MANEJO DEL MODAL
// =============================================

// Cerrar modal con botón
closeModalBtn.addEventListener('click', () => {
    confirmationModal.style.display = 'none';
});

// Cerrar modal con X
closeModalSpan.addEventListener('click', () => {
    confirmationModal.style.display = 'none';
});

// Cerrar modal al hacer clic fuera
window.addEventListener('click', (e) => {
    if (e.target === confirmationModal) {
        confirmationModal.style.display = 'none';
    }
});

// =============================================
// FUNCIONALIDADES ADICIONALES
// =============================================

// Validar que la fecha no sea en el pasado
const fechaInput = document.getElementById('fecha');
const hoy = new Date().toISOString().split('T')[0];
fechaInput.min = hoy;

// Cambiar precios según tipo de mesa
document.getElementById('mesa').addEventListener('change', actualizarPrecios);
document.getElementById('personas').addEventListener('change', actualizarPrecios);

function actualizarPrecios() {
    const personas = parseInt(document.getElementById('personas').value);
    const tipoMesa = document.getElementById('mesa').value;
    
    let precioBase = 25;
    let nombreMesa = "Mesa Estándar";
    
    if (tipoMesa === 'vip') {
        precioBase = 40;
        nombreMesa = "Mesa VIP";
    } else if (tipoMesa === 'privada') {
        precioBase = 100;
        nombreMesa = "Sala Privada";
    }
    
    const total = (precioBase * personas) + 5;
    
    // Actualizar resumen
    document.querySelector('.summary-item:nth-child(1) span:first-child').textContent = 
        `${nombreMesa} (${personas} ${personas === 1 ? 'persona' : 'personas'}):`;
    
    document.querySelector('.summary-item:nth-child(1) .price').textContent = 
        `$${(precioBase * personas).toFixed(2)}`;
    
    document.querySelector('.summary-item.total .price').textContent = 
        `$${total.toFixed(2)}`;
}

// Inicializar precios
actualizarPrecios();

// =============================================
// INICIALIZACIÓN
// =============================================
console.log('Sistema de reservas Bingo Carabobo inicializado');

// Nota: Para enviar emails reales, necesitarías un backend
// Puedes usar Firebase Cloud Functions o un servicio como SendGrid

// Función de ejemplo para enviar email (requiere backend)
async function enviarEmailConfirmacion(reserva) {
    // Esta función necesitaría implementarse en un backend
    console.log('Email de confirmación sería enviado a:', reserva.email);
}
