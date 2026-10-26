import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase} from './db.mjs';
import {handleAuth,sessionUser} from './auth.mjs';
import {handleApi} from '../server/api.mjs';

let db=null;
if(process.env.DATABASE_URL){try{db=await openDatabase(process.env.DATABASE_URL);}catch(error){console.error('PostgreSQL is unavailable; storefront preview only:',error.message);}}
else console.error('DATABASE_URL is not configured; storefront preview only.');
const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
const index=fileURLToPath(new URL('../storefront/index.html',import.meta.url));
const env={DB:db,RENDER_AUTH:true,ADMIN_USER_IDS:process.env.ADMIN_USER_IDS||'',STRIPE_SECRET_KEY:process.env.STRIPE_SECRET_KEY||'',STRIPE_WEBHOOK_SECRET:process.env.STRIPE_WEBHOOK_SECRET||'',OPENAI_API_KEY:process.env.OPENAI_API_KEY||'',OPENAI_MODEL:process.env.OPENAI_MODEL||''};
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon'};
const port=Number(process.env.PORT||4174);
http.createServer(async(req,res)=>{
 try{
  const host=req.headers.host;if(!host||/[\s\\/]/.test(host)){res.writeHead(400);res.end();return;}
  const origin=process.env.RENDER_EXTERNAL_URL||`${process.env.NODE_ENV==='production'?'https':'http'}://${host}`;
  const url=new URL(req.url,origin);
  if(url.pathname==='/health'){let ready=false;if(db){try{await db.health();ready=true;}catch(error){console.error('PostgreSQL health check failed:',error.message);}}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({status:ready?'ok':'degraded',databaseReady:ready}));return;}
  if(url.pathname.startsWith('/api/')){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>110000){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
   const body=chunks.length?Buffer.concat(chunks):undefined;
   const headers=new Headers(req.headers);headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');
   const request=new Request(new URL(url.pathname+url.search,origin),{method:req.method,headers,...(body?{body}:{} )});
   let response=url.pathname.startsWith('/api/auth/')&&!db?new Response(JSON.stringify({error:'Account database is not connected yet.'}),{status:503,headers:{'Content-Type':'application/json'}}):await handleAuth(request,db);
   if(!response){const user=db?await sessionUser(request,db):null;if(user){headers.set('oai-authenticated-user-id',user.id);headers.set('oai-authenticated-user-email',user.email);}response=await handleApi(new Request(new URL(url.pathname+url.search,origin),{method:req.method,headers,...(body?{body}:{} )}),env);}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  const pathname=decodeURIComponent(url.pathname);
  if(pathname==='/'){res.writeHead(200,{'Content-Type':mime['.html'],'X-Content-Type-Options':'nosniff'});fs.createReadStream(index).pipe(res);return;}
  const file=path.resolve(publicRoot,'.'+pathname),relative=path.relative(publicRoot,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);
 }catch(error){console.error('Request failed:',error.message);res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":"The request could not be completed."}');}
}).listen(port,'0.0.0.0',()=>console.log(`Hair Beauty Store Render server listening on ${port}`));
