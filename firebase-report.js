const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: "https://customer-2-88220-default-rtdb.firebaseio.com"
});

async function getProductionData() {
  const db = admin.database();
  const snapshot = await db.ref('Sensor/perday').once('value');
  return {
    count: snapshot.child('count').val() || 0,
    timestamp: snapshot.child('timestamp').val() || Date.now()
  };
}

async function sendReport() {
  try {
    const { count, timestamp } = await getProductionData();
    const date = new Date(timestamp * 1000).toLocaleString();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `"Production Alert" <${process.env.SENDER_EMAIL}>`,
      to: process.env.BOSS_EMAIL,
      subject: `Production Count: ${count} | ${date}`,
      html: `
        <h2>Production Snapshot</h2>
        <p><strong>Count:</strong> ${count}</p>
        <p><strong>Last Updated:</strong> ${date}</p>
        <p><em>Generated at: ${new Date().toLocaleString()}</em></p>
      `
    });

    console.log(`✅ Report sent | Count: ${count} | ${date}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

sendReport();
