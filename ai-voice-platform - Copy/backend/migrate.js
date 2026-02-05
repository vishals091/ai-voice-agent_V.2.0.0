/**
 * migrate.js - Run migrations against Neon PostgreSQL
 * 
 * Place this file in your backend folder and run:
 *   cd backend
 *   node migrate.js
 */

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in .env file');
    console.log('\n📝 Make sure your .env file has:');
    console.log('   DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require');
    process.exit(1);
  }
  
  console.log('🔌 Connecting to Neon PostgreSQL...');
  console.log('   URL:', databaseUrl.replace(/:[^:@]+@/, ':****@')); // Hide password
  
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      console.log('\n📁 Make sure migrations/001_initial_schema.sql exists');
      process.exit(1);
    }
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Loaded migration file (' + Math.round(sql.length / 1024) + ' KB)\n');
    
    // Run migration
    console.log('🚀 Running migration...');
    console.log('   This may take a minute...\n');
    
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!\n');
    
    // Verify tables created
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('📋 Tables created (' + result.rows.length + '):');
    result.rows.forEach(row => {
      console.log('   ✓', row.table_name);
    });
    
    // Check extensions
    const extResult = await client.query(`
      SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'vector', 'pg_trgm')
    `);
    
    console.log('\n🔧 Extensions enabled:');
    extResult.rows.forEach(row => {
      console.log('   ✓', row.extname);
    });
    
    console.log('\n🎉 Database is ready to use!');
    
  } catch (error) {
    console.error('\n❌ Migration failed!');
    console.error('   Error:', error.message);
    
    if (error.message.includes('extension "vector"')) {
      console.log('\n💡 Fix: Enable pgvector extension in Neon:');
      console.log('   1. Go to console.neon.tech');
      console.log('   2. Select your project → Settings → Extensions');
      console.log('   3. Enable "vector" extension');
      console.log('   4. Run this script again');
    }
    
    if (error.message.includes('already exists')) {
      console.log('\n💡 Tables already exist. To reset:');
      console.log('   1. Go to Neon SQL Editor');
      console.log('   2. Run: DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      console.log('   3. Run this script again');
    }
    
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();