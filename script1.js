/* Estilo Base */
body {
    font-family: 'Poppins', sans-serif;
    background-color: #f0f2f5 !important; /* Gris suave de fondo */
}

.fw-black { font-weight: 900; }

/* Para que la web se vea "encapsulada" */
@media (min-width: 768px) {
    .container {
        max-width: 900px; /* Ancho máximo similar a Bingo.es */
    }
}

/* Efectos de Hover */
.transform-hover {
    transition: transform 0.3s ease;
}
.transform-hover:hover {
    transform: scale(1.05);
}

/* Estilo para los Modales (Overlay) */
.modal-custom {
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7);
    z-index: 1050;
    overflow-y: auto;
    padding: 20px;
}

.cursor-pointer { cursor: pointer; }

/* Texto OMEGA */
.logo-text {
    letter-spacing: -2px;
}

/* Toast */
.toast-hidden {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2000;
    display: none;
}
