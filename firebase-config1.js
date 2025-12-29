// 🚨 TU CONFIGURACIÓN DE FIREBASE 🚨
        const firebaseConfig = {
             apiKey: "AIzaSyABUyIEpsAFAJMWAhPXbURFBbyRITj79xM",
             authDomain: "bingoreservas.firebaseapp.com",
             databaseURL: "https://bingoreservas-default-rtdb.firebaseio.com",
             projectId: "bingoreservas",
             storageBucket: "bingoreservas.firebasestorage.app",
             messagingSenderId: "198500053040",
             appId: "1:198500053040:web:865b757df05fe4c5c07df5"
        };
        
        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();
        const auth = firebase.auth();
