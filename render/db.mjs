import fs from 'node:fs/promises';
import pg from 'pg';

export async function openDatabase(connectionString){
 if(!connectionString)throw new Error('DATABASE_URL is required.');
 const pool=new pg.Pool({connectionString,max:5,connectionTimeoutMillis:10000});
 await pool.query(await fs.readFile(new URL('./schema.sql',import.meta.url),'utf8'));
 const translate=sql=>{let n=0;return sql.replace(/^INSERT OR IGNORE INTO /i,'INSERT INTO ').replace(/\?/g,()=>`$${++n}`)+( /^INSERT OR IGNORE INTO /i.test(sql)?' ON CONFLICT DO NOTHING':'');};
 const prepare=sql=>{let values=[];const query=translate(sql);return {bind(...args){values=args;return this;},async first(){return (await pool.query(query,values)).rows[0]||null;},async all(){return {results:(await pool.query(query,values)).rows};},async run(){return {meta:{changes:(await pool.query(query,values)).rowCount}};},_query:query,get _values(){return values;}};};
 return {prepare,async batch(statements){const client=await pool.connect();try{await client.query('BEGIN');const result=[];for(const statement of statements)result.push({meta:{changes:(await client.query(statement._query,statement._values)).rowCount}});await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}},async health(){await pool.query('SELECT 1');},async close(){await pool.end();},pool};
}
