/**
 * Tapfolio Firebase configuration
 * --------------------------------
 * Replace every YOUR_* value with the values from:
 *   Firebase console > Project settings > Your apps > Web app
 *
 * Until you do this, Tapfolio automatically runs in local Demo Mode so the
 * interface still works. See README.md for the full setup guide.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyDg7MrAwkJtYpvTbrEaywRp28mz87Ve3Vg",
  authDomain: "tapfolio-f8c17.firebaseapp.com",
  projectId: "tapfolio-f8c17",
  storageBucket: "tapfolio-f8c17.firebasestorage.app",
  messagingSenderId: "273343259483",
  appId: "1:273343259483:web:7c59725cbe0dc53c28707e",
  measurementId: "G-H9JWFH8SRH"
};

const placeholderKeys = ["apiKey", "authDomain", "projectId", "messagingSenderId", "appId"];

export const isFirebaseConfigured = placeholderKeys.every((key) => {
  const value = String(firebaseConfig[key] || "").trim();
  return value.length > 0 && !value.startsWith("YOUR_");
});
