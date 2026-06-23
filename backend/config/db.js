const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        console.log('Connecting to MongoDB...');
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`✅ MongoDB Connected Successfully: ${conn.connection.host}`);
        console.log(`📂 Database Name: ${conn.connection.db.databaseName}`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        // Delay exit so the HTTP server stays alive long enough for Render's
        // port scanner to detect it and surface this error in the deploy log
        // rather than showing the opaque "Port scan timeout" message.
        setTimeout(() => process.exit(1), 3000);
    }
};

module.exports = connectDB;
