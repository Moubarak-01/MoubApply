/**
 * Database Cleanup Script
 * Run this to delete all old mislabeled jobs and re-ingest with correct seniority detection
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function cleanAndReingest() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Get Job model
        const Job = mongoose.model('Job');

        // Delete all existing jobs
        const deleteResult = await Job.deleteMany({});
        console.log(`🗑️ Deleted ${deleteResult.deletedCount} old jobs from database`);

        console.log('\n📊 Old jobs cleared! Now trigger fresh ingestion:');
        console.log('   1. Open your app');
        console.log('   2. Go to Admin/Settings');
        console.log('   3. Click "Refresh Jobs"');
        console.log('   OR');
        console.log('   4. Make a POST request to: http://localhost:5000/api/jobs/ingest');
        console.log('\n✨ New jobs will have correct seniority labels!\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

cleanAndReingest();
