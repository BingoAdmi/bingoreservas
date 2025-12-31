import { db } from './firebase-config.js';
// Importar funciones de Firestore para leer datos
import { doc, onSnapshot, collection, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // =========================================
    // 1. LÓGICA DEL PANEL DE ADMINISTRADOR OCULTO
    // =========================================
    const secretTrigger = document.getElementById('secretAdminTrigger');
    const adminModal = document.getElementById('adminModal');
    const closeModalBtn = document.querySelector('.close-modal');

    let clickCount = 0;
    let clickTimer;

    secretTrigger.addEventListener('click', () => {
        clickCount++;
        console.log(`Clicks: ${clickCount}`); // Para depurar

        clearTimeout(clickTimer);

        if (clickCount === 11) {
            // ¡ABRIR PANEL!
            adminModal.classList.add('active');
            // Efecto de sonido opcional aquí
            clickCount = 0; // Reiniciar
        } else {
            // Si pasan 2 segundos sin click, se reinicia el contador
            clickTimer = setTimeout(() => {
                clickCount = 0;
                console.log('Contador de clicks reiniciado');
            }, 2000);
        }
    });

    closeModalBtn.addEventListener('click', () => {
        adminModal.classList.remove('active');
    });

    // Cerrar modal si se hace click fuera del contenido
    adminModal.addEventListener('click', (e) => {
        if (e.target === adminModal) {
            adminModal.classList.remove('active');
        }
    });


    // =========================================
    // 2. SIMULACIÓN DE DATOS EN TIEMPO REAL
    // =========================================
    // NOTA: Para que esto sea 100% real, debes crear una colección en Firestore
    // llamada 'stats' y un documento llamado 'general'.
    // Este código INTENTA conectarse, si no lo logra, usará datos simulados.

    const playersOnlineEl = document.getElementById('totalPlayersOnline');
    const prizePaidEl = document.getElementById('totalPrizePaid');

    try {
        // Intentar conexión real a Firestore (Requiere haber configurado firebase-config.js)
        // Escuchar cambios en el documento 'stats/general'
        onSnapshot(doc(db, "stats", "general"), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                playersOnlineEl.innerText = data.onlineCount || '45';
                // Formatear moneda
                prizePaidEl.innerText = new Intl.NumberFormat('es-VE').format(data.dailyPaid || 15000);
            } else {
                 // Si el documento no existe aún, mostrar simulación
                 simulateRealTimeData();
            }
        }, (error) => {
             console.warn("No se pudo conectar a Firestore (¿Falta config?):", error);
             simulateRealTimeData(); // Fallback a simulación
        });

    } catch (e) {
        console.warn("Error inicializando Firestore, usando datos simulados.");
        simulateRealTimeData();
    }


    // Función de respaldo para simular actividad si Firebase no está listo
    function simulateRealTimeData() {
        let basePlayers = 40;
        let basePrize = 12500;

        setInterval(() => {
            // Variación aleatoria de jugadores (+/- 5)
            const currentPlayers = basePlayers + Math.floor(Math.random() * 10) - 5;
            playersOnlineEl.innerText = currentPlayers;

            // Actualizar contadores de salas individuales (Simulado)
            document.getElementById('basicRoomLive').innerText = Math.floor(currentPlayers * 0.5);
            document.getElementById('proRoomLive').innerText = Math.floor(currentPlayers * 0.3);
            document.getElementById('eliteRoomLive').innerText = Math.floor(currentPlayers * 0.2);

            // Simular que el premio pagado sube de vez en cuando
            if(Math.random() > 0.7) {
                basePrize += [1000, 1500, 4000][Math.floor(Math.random()*3)];
                 prizePaidEl.innerText = new Intl.NumberFormat('es-VE').format(basePrize);
                 // Efecto visual de "flash" cuando sube el premio
                 prizePaidEl.style.color = '#fff';
                 setTimeout(() => prizePaidEl.style.color = '', 500);
            }

        }, 3000); // Actualizar cada 3 segundos
    }


    // =========================================
    // 3. CARGAR GANADORES (PLACEHOLDER)
    // =========================================
    // Aquí es donde conectarías a una colección 'winners' en Firebase en el futuro.
    const winnersFeed = document.getElementById('winnersFeed');

    // Simulación de carga de datos
    setTimeout(() => {
        winnersFeed.innerHTML = `
            <div class="winner-card" style="border-color: var(--neon-blue)">
                <h4 style="color: var(--neon-blue)">@Pedro_Ludo23</h4>
                <p>Ganó <strong>1.000 Bs</strong> en Sala Bronce</p>
                <small style="color: var(--text-gray)">Hace 10 min</small>
            </div>
             <div class="winner-card" style="border-color: #ffd700">
                <h4 style="color: #ffd700">@LaJefa_Caracas</h4>
                <p>Ganó <strong>4.000 Bs</strong> en Sala Diamante</p>
                <small style="color: var(--text-gray)">Hace 25 min</small>
            </div>
             <div class="winner-card" style="border-color: var(--neon-purple)">
                <h4 style="color: var(--neon-purple)">@GamerVen_X</h4>
                <p>Ganó <strong>1.500 Bs</strong> en Sala Oro</p>
                <small style="color: var(--text-gray)">Hace 45 min</small>
            </div>
        `;
    }, 2000); // Simula 2 segundos de carga
});
