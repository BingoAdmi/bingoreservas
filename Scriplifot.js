// Importar las funciones necesarias de los SDKs de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
// Si fuéramos a usar autenticación real para el admin:
// import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// --- TU CONFIGURACIÓN DE FIREBASE VA AQUÍ ---
// REEMPLAZA ESTO CON LOS DATOS REALES DE TU PROYECTO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDOCE_TU_API_KEY_REAL_AQUI",
  authDomain: "tu-proyecto-ludos.firebaseapp.com",
  projectId: "tu-proyecto-ludos",
  storageBucket: "tu-proyecto-ludos.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
// Inicializar Firestore (Base de datos en tiempo real)
export const db = getFirestore(app);
// export const auth = getAuth(app); // Para futuro uso
