import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zshihpvmtvwsbwrjpugy.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.error('Error: VITE_SUPABASE_ANON_KEY environment variable is required to inspect database.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectDatabase() {
  console.log('=== DATABASE INSPECTION ===\n');
  
  // 1. List all tables
  const { data: tables, error: tablesError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_type', 'BASE TABLE');
  
  if (tablesError) {
    console.error('Error fetching tables:', tablesError);
    return;
  }
  
  console.log('TABLES:');
  tables?.forEach(t => console.log(`  - ${t.table_name}`));
  console.log('');
  
  // 2. For each table, get column info and row count
  for (const table of tables || []) {
    const tableName = table.table_name;
    
    // Get columns
    const { data: columns, error: colError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_schema', 'public')
      .eq('table_name', tableName)
      .order('ordinal_position');
    
    console.log(`\n--- ${tableName.toUpperCase()} ---`);
    console.log('Columns:');
    columns?.forEach(c => {
      console.log(`  ${c.column_name}: ${c.data_type} ${c.is_nullable === 'NO' ? 'NOT NULL' : ''} ${c.column_default ? `DEFAULT ${c.column_default}` : ''}`);
    });
    
    // Get row count
    const { count, error: countError } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (!countError) {
      console.log(`Row count: ${count}`);
    }
    
    // Sample data (first 3 rows)
    const { data: sample, error: sampleError } = await supabase
      .from(tableName)
      .select('*')
      .limit(3);
    
    if (!sampleError && sample && sample.length > 0) {
      console.log('Sample rows:');
      sample.forEach((row, i) => {
        console.log(`  Row ${i+1}:`, JSON.stringify(row, null, 2).replace(/\n/g, '\n    '));
      });
    }
  }
  
  // 3. Check RLS status
  console.log('\n=== RLS STATUS ===');
  const { data: rls, error: rlsError } = await supabase
    .from('pg_tables')
    .select('tablename, rowsecurity')
    .eq('schemaname', 'public');
  
  if (!rlsError && rls) {
    rls.forEach(r => {
      console.log(`  ${r.tablename}: RLS ${r.rowsecurity ? 'ENABLED' : 'DISABLED'}`);
    });
  }
  
  // 4. Check policies
  console.log('\n=== POLICIES ===');
  const { data: policies, error: polError } = await supabase
    .from('pg_policies')
    .select('tablename, policyname, permissive, roles, cmd, qual')
    .eq('schemaname', 'public');
  
  if (!polError && policies) {
    policies.forEach(p => {
      console.log(`  ${p.tablename}.${p.policyname}: ${p.cmd} ${p.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'} roles=${p.roles} qual=${p.qual}`);
    });
  } else {
    console.log('  No policies found');
  }
  
  // 5. Check indexes
  console.log('\n=== INDEXES ===');
  const { data: indexes, error: idxError } = await supabase
    .from('pg_indexes')
    .select('tablename, indexname, indexdef')
    .eq('schemaname', 'public');
  
  if (!idxError && indexes) {
    indexes.forEach(i => {
      console.log(`  ${i.tablename}.${i.indexname}: ${i.indexdef}`);
    });
  }
  
  // 6. Check extensions
  console.log('\n=== EXTENSIONS ===');
  const { data: exts, error: extError } = await supabase
    .from('pg_extension')
    .select('extname')
    .order('extname');
  
  if (!extError && exts) {
    exts.forEach(e => console.log(`  - ${e.extname}`));
  }
}

inspectDatabase().catch(console.error);
