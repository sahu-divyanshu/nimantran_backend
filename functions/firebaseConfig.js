// Import the functions you need from the SDKs you need
const { initializeApp } = require("firebase/app");
// const { getAnalytics } = require("firebase/analytics");
const { getStorage } = require("firebase/storage");

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

// production
// const firebaseConfig = {
//   apiKey: "AIzaSyA4VWx183VtdLhZBwx6Ep1wSVZCNQyY9bM",
//   authDomain: "nimantran-902b6.firebaseapp.com",
//   projectId: "nimantran-902b6",
//   storageBucket: "nimantran-902b6.appspot.com",
//   messagingSenderId: "866399066086",
//   appId: "1:866399066086:web:a2f5578956544a776a6827",
//   measurementId: "G-JFKXGF4M84"
// };

const firebaseConfig = {
  apiKey: process.env.API_KEY,
  authDomain: process.env.AUTH_DOMAIN,
  projectId: process.env.PROJECT_ID,
  storageBucket: process.env.STORAGE_BUCKET,
  messagingSenderId: process.env.MESSAGING_SENDER_ID,
  appId: process.env.API_ID,
  measurementId: process.env.MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);
const firebaseStorage = getStorage(app);

module.exports = { app, firebaseStorage };
