// ======================
// 1. ENVIRONMENT CHECKS
// ======================
console.log("=== ENVIRONMENT VARIABLES ===");
console.log(Object.keys(process.env).filter(k => k.includes('FIREBASE') || k.includes('GMAIL')));

// Throw clear error if missing secrets
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ MISSING: FIREBASE_SERVICE_ACCOUNT");
  process.exit(1);
}
if (!process.env.GMAIL_APP_PASSWORD) {
  console.error("❌ MISSING: GMAIL_APP_PASSWORD");
  process.exit(1);
}

// ======================
// 2. FIREBASE SETUP
// ======================
let serviceAccount;
try {
  console.log("\n=== FIREBASE CONFIG ===");
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  console.log("✅ Valid JSON:", {
    project_id: serviceAccount.project_id,
    client_email: serviceAccount.client_email
  });
} catch (err) {
  console.error("❌ Invalid Firebase JSON:", err.message);
  process.exit(1);
}

try {
  const admin = require('firebase-admin');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com"
  });
  console.log("🔥 Firebase initialized");
} catch (err) {
  console.error("❌ Firebase init failed:", err.message);
  process.exit(1);
}

// ======================
// 3. TEST EMAIL SENDING
// ======================
async function sendTestEmail() {
  try {
    const nodemailer = require('nodemailer');
    console.log("\n=== TEST EMAIL CONFIG ===");
    console.log("From:", process.env.SENDER_EMAIL);
    console.log("To:", process.env.BOSS_EMAIL);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    await transporter.verify();
    console.log("✅ Transporter verified");

    const info = await transporter.sendMail({
      from: `"Production Bot" <${process.env.SENDER_EMAIL}>`,
      to: process.env.BOSS_EMAIL,
      subject: "Test Email",
      html: `<h1>Hai</h1><p>This is a simple test message.</p>`
    });

    console.log("📧 Email sent:", info.response);
    console.log("📨 Message ID:", info.messageId);

  } catch (err) {
    console.error("❌ Email sending failed:", err.message);
    process.exit(1);
  }
}

// ======================
// 4. MAIN EXECUTION
// ======================
(async () => {
  try {
    await sendTestEmail();
    console.log("✅ Script completed successfully");
  } catch (err) {
    console.error("❌ Script crashed:", err);
    process.exit(1);
  }
})();
