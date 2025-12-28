// firebase-config.js
// CONFIGURACIÓN DE FIREBASE - REEMPLAZA CON TUS PROPIAS CREDENCIALES

// Importa los módulos de Firebase que necesitamos
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Configuración de Firebase - ¡REEMPLAZA ESTOS VALORES!
const firebaseConfig = {
    apiKey: "TU_API_KEY_AQUÍ",
    authDomain: "TU_PROYECTO.firebaseapp.com",
    projectId: "TU_PROYECTO",
    storageBucket: "TU_PROYECTO.appspot.com",
    messagingSenderId: "TU_SENDER_ID",
    appId: "TU_APP_ID",
    measurementId: "TU_MEASUREMENT_ID"
};

// Configuración de Cloudinary - ¡REEMPLAZA ESTOS VALORES!
const cloudinaryConfig = {
    cloudName: "TU_CLOUD_NAME",      // Ej: "mi-bingo"
    uploadPreset: "TU_UPLOAD_PRESET" // Ej: "bingoupload"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);

// Inicializa servicios
const db = getFirestore(app);
const storage = getStorage(app);

// Exporta las configuraciones y servicios
export { 
    app, 
    db, 
    storage, 
    collection, 
    addDoc, 
    serverTimestamp,
    ref, 
    uploadBytes, 
    getDownloadURL,
    cloudinaryConfig 
};
